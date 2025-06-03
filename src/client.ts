import { configurePublicClients } from './utils/configurePublicClients';
import { chainConfigs } from './chains';
import { getV3Position } from './actions/getV3Position';
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
  PositionWithFees,
} from './types';
import { startUniswapV3Migration, settleUniswapV3Migration } from './actions';
import { getV4Position } from './actions/getV4Position';
import { startUniswapV4Migration } from './actions/startUniswapV4Migration';
import { settleUniswapV4Migration } from './actions/settleUniswapV4Migration';
import { isAddress, checksumAddress } from 'viem';
import { generateExecutionParams, generateSettlerExecutionParams } from './utils/helpers';

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

  public getV3Position(params: IUniswapPositionParams): Promise<PositionWithFees> {
    return getV3Position(this.chainConfigs[params.chainId], params);
  }

  public getV4Position(params: IUniswapPositionParams): Promise<PositionWithFees> {
    return getV4Position(this.chainConfigs[params.chainId], params);
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
    if (
      params.migrationMethod !== MigrationMethod.SingleToken &&
      params.migrationMethod !== MigrationMethod.DualToken
    ) {
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
    if (v3Position.liquidity === 0n && v3Position.feeAmount0 === 0n && v3Position.feeAmount1 === 0n) {
      throw new Error('Position has no liquidity or fees');
    }

    // start migration on source chain
    const { routes } = await startUniswapV3Migration({
      sourceChainConfig: this.chainConfigs[sourceChainId],
      destinationChainConfig: this.chainConfigs[destinationChainId],
      positionWithFees: v3Position,
      externalParams: params,
    });
    // settle migration on destination chain
    const returnResponse = {
      sourcePosition: v3Position,
      routes,
    };
    if (destinationProtocol === Protocol.UniswapV3) {
      const { destPosition, migratorMessage, settlerMessage, swapAmountInMilliBps } = await settleUniswapV3Migration({
        sourceChainConfig: this.chainConfigs[sourceChainId],
        destinationChainConfig: this.chainConfigs[destinationChainId],
        routes,
        externalParams: params as RequestV3toV3MigrationParams,
        owner: v3Position.owner,
      });
      return {
        ...returnResponse,
        destPosition,
        ...(params.debug
          ? {
              settlerExecutionParams: generateSettlerExecutionParams({
                sourceChainId,
                destChainId: destinationChainId,
                owner: v3Position.owner,
                destProtocol: destinationProtocol,
                routes,
                fillDeadline: Math.floor(Date.now() / 1000) + 60 * 60 * 24, // 1 day
                message: settlerMessage,
              }),
              swapAmountInMilliBps,
            }
          : {}),
        executionParams: generateExecutionParams({
          sourceChainId,
          owner: v3Position.owner,
          protocol: Protocol.UniswapV3,
          tokenId,
          message: migratorMessage,
        }),
      };
    } else if (destinationProtocol === Protocol.UniswapV4) {
      const { destPosition, migratorMessage, settlerMessage, swapAmountInMilliBps } = await settleUniswapV4Migration({
        sourceChainConfig: this.chainConfigs[sourceChainId],
        destinationChainConfig: this.chainConfigs[destinationChainId],
        routes,
        externalParams: params as RequestV3toV4MigrationParams,
        owner: v3Position.owner,
      });
      return {
        ...returnResponse,
        destPosition,
        ...(params.debug
          ? {
              settlerExecutionParams: generateSettlerExecutionParams({
                sourceChainId,
                destChainId: destinationChainId,
                owner: v3Position.owner,
                destProtocol: destinationProtocol,
                routes,
                fillDeadline: Math.floor(Date.now() / 1000) + 60 * 60 * 24, // 1 day
                message: settlerMessage,
              }),
              swapAmountInMilliBps,
            }
          : {}),
        executionParams: generateExecutionParams({
          sourceChainId,
          owner: v3Position.owner,
          protocol: Protocol.UniswapV3,
          tokenId,
          message: migratorMessage,
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
    if (v4Position.liquidity === 0n && v4Position.feeAmount0 === 0n && v4Position.feeAmount1 === 0n) {
      throw new Error('Position has no liquidity or fees');
    }

    // start migration on source chain
    const { routes } = await startUniswapV4Migration({
      sourceChainConfig: this.chainConfigs[sourceChainId],
      destinationChainConfig: this.chainConfigs[destinationChainId],
      positionWithFees: v4Position,
      externalParams: params,
    });

    // settle migration on destination chain
    const returnResponse = {
      sourcePosition: v4Position,
      routes,
    };
    if (destinationProtocol === Protocol.UniswapV3) {
      const { destPosition, migratorMessage, settlerMessage, swapAmountInMilliBps } = await settleUniswapV3Migration({
        sourceChainConfig: this.chainConfigs[sourceChainId],
        destinationChainConfig: this.chainConfigs[destinationChainId],
        routes,
        externalParams: params as RequestV4toV3MigrationParams,
        owner: v4Position.owner,
      });
      return {
        ...returnResponse,
        destPosition,
        ...(params.debug
          ? {
              settlerExecutionParams: generateSettlerExecutionParams({
                sourceChainId,
                destChainId: destinationChainId,
                owner: v4Position.owner,
                destProtocol: destinationProtocol,
                routes,
                fillDeadline: Math.floor(Date.now() / 1000) + 60 * 60 * 24, // 1 day
                message: settlerMessage,
              }),
              swapAmountInMilliBps,
            }
          : {}),
        executionParams: generateExecutionParams({
          sourceChainId,
          owner: v4Position.owner,
          protocol: Protocol.UniswapV4,
          tokenId,
          message: migratorMessage,
        }),
      };
    } else if (destinationProtocol === Protocol.UniswapV4) {
      const { destPosition, migratorMessage, settlerMessage, swapAmountInMilliBps } = await settleUniswapV4Migration({
        sourceChainConfig: this.chainConfigs[sourceChainId],
        destinationChainConfig: this.chainConfigs[destinationChainId],
        routes,
        externalParams: params as RequestV4toV4MigrationParams,
        owner: v4Position.owner,
      });
      return {
        ...returnResponse,
        destPosition,
        ...(params.debug
          ? {
              settlerExecutionParams: generateSettlerExecutionParams({
                sourceChainId,
                destChainId: destinationChainId,
                owner: v4Position.owner,
                destProtocol: destinationProtocol,
                routes,
                fillDeadline: Math.floor(Date.now() / 1000) + 60 * 60 * 24, // 1 day
                message: settlerMessage,
              }),
              swapAmountInMilliBps,
            }
          : {}),
        executionParams: generateExecutionParams({
          sourceChainId,
          owner: v4Position.owner,
          protocol: Protocol.UniswapV4,
          tokenId,
          message: migratorMessage,
        }),
      };
    } else {
      throw new Error('Destination protocol not supported');
    }
  }
}
