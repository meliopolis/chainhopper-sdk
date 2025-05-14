import { configurePublicClients } from './utils/configurePublicClients';
import { chainConfigs } from './chains';
import { getV3Position, type IV3PositionWithUncollectedFees } from './actions/getV3Position';
import { BridgeType, MigrationMethod, Protocol } from './utils/constants';
import type { ChainConfig } from './chains';
import type {
  RequestMigrationParams,
  RequestV3MigrationParams,
  RequestV4MigrationParams,
  IUniswapPositionParams,
  RequestV3toV3MigrationParams,
  RequestV4toV3MigrationParams,
  RequestV3toV4MigrationParams,
  RequestV4toV4MigrationParams,
  RequestMigrationResponse,
  RequestMigrationErrorResponse,
} from './types';
import { startUniswapV3Migration, settleUniswapV3Migration } from './actions';
import { getV4Position, type IV4PositionWithUncollectedFees } from './actions/getV4Position';
import { startUniswapV4Migration } from './actions/startUniswapV4Migration';
import { settleUniswapV4Migration } from './actions/settleUniswapV4Migration';
import { isAddress, checksumAddress } from 'viem';
import { generateExecutionParams } from './utils/helpers';

export type ChainHopperClientOptions = {
  /**
   * The RPC URLs to use for fetching on-chain data. Defaults to public RPC URLs for the chains.
   */
  rpcUrls?: {
    [chainId: number]: string;
  };
};

export class ChainHopperClient {
  private static instance: ChainHopperClient | null = null;
  public readonly chainConfigs: Record<number, ChainConfig>;

  private constructor(args: ChainHopperClientOptions) {
    this.chainConfigs = configurePublicClients(chainConfigs, args.rpcUrls);
  }

  public static create(args: ChainHopperClientOptions): ChainHopperClient {
    if (this.instance === null) {
      this.instance = new ChainHopperClient(args);
    }
    return this.instance;
  }

  public isChainSupported(chainId: number): boolean {
    return chainConfigs[chainId] !== undefined;
  }

  public getSupportedChainIds(): number[] {
    return Object.values(chainConfigs).map((chainConfig) => chainConfig.chain.id);
  }

  public validateAddress(address: string): void {
    if (!isAddress(address)) throw new Error(`${address} is not a valid address`);
    if (address !== checksumAddress(address)) throw new Error(`${address} is not a checksummed address`);
  }

  public getV3Position(params: IUniswapPositionParams): Promise<IV3PositionWithUncollectedFees> {
    return getV3Position(this.chainConfigs[params.chainId], params);
  }

  public getV4Position(params: IUniswapPositionParams): Promise<IV4PositionWithUncollectedFees> {
    return getV4Position(this.chainConfigs[params.chainId], params);
  }

  public async requestMigrations(migrationsParams: RequestMigrationParams[]): Promise<Array<RequestMigrationResponse | RequestMigrationErrorResponse>> {
    return Promise.all(
      migrationsParams.map(async (migrationParams: RequestMigrationParams): Promise<RequestMigrationResponse | RequestMigrationErrorResponse> => {
        try {
          return await this.requestMigration(migrationParams);
        } catch (e) {
          const error = e instanceof Error ? e : new Error(`Unknown error: ${e}`);
          return { migrationParams, error };
        }
      })
    );
  }

  public async requestMigration(params: RequestMigrationParams): Promise<RequestMigrationResponse> {
    // make sure both chains are supported
    if (!this.isChainSupported(params.sourceChainId) || !this.isChainSupported(params.destinationChainId)) {
      throw new Error('chain not supported');
    }

    // make sure source protocol is supported
    if (params.sourceProtocol !== Protocol.UniswapV3 && params.sourceProtocol !== Protocol.UniswapV4) {
      throw new Error('source protocol not supported');
    }

    // make sure destination protocol is supported
    if (params.destinationProtocol !== Protocol.UniswapV3 && params.destinationProtocol !== Protocol.UniswapV4) {
      throw new Error('destination protocol not supported');
    }

    // make sure bridge type is supported
    if (params.bridgeType === undefined) {
      params.bridgeType = BridgeType.Across;
    } else if (params.bridgeType !== BridgeType.Across) {
      throw new Error('bridge type not supported');
    }

    // check migration method
    if (params.migrationMethod !== MigrationMethod.SingleToken && params.migrationMethod !== MigrationMethod.DualToken) {
      params.migrationMethod = MigrationMethod.SingleToken;
    }

    // make sure tokenId is valid
    if (params.tokenId === BigInt(0)) {
      throw new Error('tokenId is not valid');
    }

    // validate token addresses
    this.validateAddress(params.token0);
    this.validateAddress(params.token1);

    if (params.token0.toLowerCase() >= params.token1.toLowerCase()) {
      throw new Error('token0 and token1 must be distinct addresses in alphabetical order');
    }

    if (params.token0.toLowerCase() >= params.token1.toLowerCase()) {
      throw new Error('token0 and token1 must be distinct addresses in alphabetical order');
    }

    if (params.tickLower > params.tickUpper) {
      throw new Error('tickLower must be less than tickUpper');
    }

    if (params.sourceProtocol === Protocol.UniswapV3) {
      return await this.requestV3Migration(params);
    } else if (params.sourceProtocol === Protocol.UniswapV4) {
      return await this.requestV4Migration(params);
    } else {
      throw new Error('source protocol not supported');
    }
  }

  private async requestV3Migration(params: RequestV3MigrationParams): Promise<RequestMigrationResponse> {
    const { sourceChainId, destinationChainId, tokenId, destinationProtocol } = params;

    // get position details and estimate amount available to migrate
    const v3Position = await getV3Position(this.chainConfigs[sourceChainId], {
      chainId: sourceChainId,
      tokenId,
    });

    // make sure position has liquidity or fees
    if (
      BigInt(v3Position.position?.liquidity.toString() ?? '0') === BigInt(0) &&
      (v3Position.uncollectedFees?.amount0.toString() ?? '0') === '0' &&
      (v3Position.uncollectedFees?.amount1.toString() ?? '0') === '0'
    ) {
      throw new Error('Position has no liquidity or fees');
    }

    // start migration on source chain
    const { routes, migrationId } = await startUniswapV3Migration({
      sourceChainConfig: this.chainConfigs[sourceChainId],
      destinationChainConfig: this.chainConfigs[destinationChainId],
      positionWithUncollectedFees: v3Position,
      externalParams: params,
    });

    // settle migration on destination chain
    const returnResponse = {
      sourceProtocol: Protocol.UniswapV3,
      sourcePosition: v3Position,
      sourceTokenId: tokenId,
      destChainId: destinationChainId,
      routes,
    };
    if (destinationProtocol === Protocol.UniswapV3) {
      const v3Settlement = await settleUniswapV3Migration({
        destinationChainConfig: this.chainConfigs[destinationChainId],
        migrationId,
        routes,
        externalParams: params as RequestV3toV3MigrationParams,
        owner: v3Position.owner,
      });
      return {
        destProtocol: Protocol.UniswapV3,
        owner: v3Position.owner,
        sourceChainId,
        ...returnResponse,
        ...v3Settlement,
        executionParams: generateExecutionParams({
          sourceChainId,
          owner: v3Position.owner,
          protocol: Protocol.UniswapV3,
          tokenId,
          message: v3Settlement.migratorMessage,
        }),
      };
    } else if (destinationProtocol === Protocol.UniswapV4) {
      const v4Settlement = await settleUniswapV4Migration({
        destinationChainConfig: this.chainConfigs[destinationChainId],
        migrationId,
        routes,
        externalParams: params as RequestV3toV4MigrationParams,
        owner: v3Position.owner,
      });
      return {
        destProtocol: Protocol.UniswapV4,
        owner: v3Position.owner,
        sourceChainId,
        ...returnResponse,
        ...v4Settlement,
        executionParams: generateExecutionParams({
          sourceChainId,
          owner: v3Position.owner,
          protocol: Protocol.UniswapV3,
          tokenId,
          message: v4Settlement.migratorMessage,
        }),
      };
    } else {
      throw new Error('Destination protocol not supported');
    }
  }

  private async requestV4Migration(params: RequestV4MigrationParams): Promise<RequestMigrationResponse> {
    const { sourceChainId, destinationChainId, tokenId, destinationProtocol } = params;

    // get position details and estimate amount available to migrate
    const v4Position = await getV4Position(this.chainConfigs[sourceChainId], {
      chainId: sourceChainId,
      tokenId,
    });

    // make sure position has liquidity or fees
    if (
      BigInt(v4Position.position?.liquidity.toString() ?? '0') === BigInt(0) &&
      (v4Position.uncollectedFees?.amount0.toString() ?? '0') === '0' &&
      (v4Position.uncollectedFees?.amount1.toString() ?? '0') === '0'
    ) {
      throw new Error('Position has no liquidity or fees');
    }

    // start migration on source chain
    const { routes, migrationId } = await startUniswapV4Migration({
      sourceChainConfig: this.chainConfigs[sourceChainId],
      destinationChainConfig: this.chainConfigs[destinationChainId],
      positionWithUncollectedFees: v4Position,
      externalParams: params,
    });

    // settle migration on destination chain
    const returnResponse = {
      sourceProtocol: Protocol.UniswapV4,
      sourcePosition: v4Position,
      sourceTokenId: tokenId,
      destProtocol: destinationProtocol,
      destChainId: destinationChainId,
      routes,
    };
    if (destinationProtocol === Protocol.UniswapV3) {
      const v3Settlement = await settleUniswapV3Migration({
        destinationChainConfig: this.chainConfigs[destinationChainId],
        migrationId,
        routes,
        externalParams: params as RequestV4toV3MigrationParams,
        owner: v4Position.owner,
      });
      return {
        ...returnResponse,
        owner: v4Position.owner,
        sourceChainId,
        ...v3Settlement,
        executionParams: generateExecutionParams({
          sourceChainId,
          owner: v4Position.owner,
          protocol: Protocol.UniswapV4,
          tokenId,
          message: v3Settlement.migratorMessage,
        }),
      };
    } else if (destinationProtocol === Protocol.UniswapV4) {
      const v4Settlement = await settleUniswapV4Migration({
        destinationChainConfig: this.chainConfigs[destinationChainId],
        migrationId,
        routes,
        externalParams: params as RequestV4toV4MigrationParams,
        owner: v4Position.owner,
      });
      return {
        ...returnResponse,
        owner: v4Position.owner,
        sourceChainId,
        ...v4Settlement,
        executionParams: generateExecutionParams({
          sourceChainId,
          owner: v4Position.owner,
          protocol: Protocol.UniswapV4,
          tokenId,
          message: v4Settlement.migratorMessage,
        }),
      };
    } else {
      throw new Error('Destination protocol not supported');
    }
  }
}
