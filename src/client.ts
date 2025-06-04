import { configurePublicClients } from './utils/configurePublicClients';
import { chainConfigs } from './chains';
import { getV3Position } from './actions/getV3Position';
import { BridgeType, MigrationMethod, Protocol } from './utils/constants';
import type { ChainConfig } from './chains';
import type {
  RequestMigrationParams,
  IUniswapPositionParams,
  RequestMigrationResponse,
  PositionWithFees,
  RequestMigrationDestination,
  ResponseDestinationError,
  ResponseDestination,
} from './types';
import { startUniswapV3Migration, settleUniswapV3Migration } from './actions';
import { getV4Position } from './actions/getV4Position';
import { startUniswapV4Migration } from './actions/startUniswapV4Migration';
import { settleUniswapV4Migration } from './actions/settleUniswapV4Migration';
import { isAddress, checksumAddress } from 'viem';
import { generateExecutionParams, generateSettlerExecutionParams } from './utils/helpers';

const startFns = {
  [Protocol.UniswapV3]: startUniswapV3Migration,
  [Protocol.UniswapV4]: startUniswapV4Migration,
};

const settleFns = {
  [Protocol.UniswapV3]: {
    [Protocol.UniswapV3]: settleUniswapV3Migration,
    [Protocol.UniswapV4]: settleUniswapV4Migration,
  },
  [Protocol.UniswapV4]: {
    [Protocol.UniswapV3]: settleUniswapV3Migration,
    [Protocol.UniswapV4]: settleUniswapV4Migration,
  },
};

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

  public validateAddress(address: string): Error | undefined {
    if (!isAddress(address)) return new Error(`${address} is not a valid address`);
    if (address !== checksumAddress(address)) return new Error(`${address} is not a checksummed address`);
  }

  public getV3Position(params: IUniswapPositionParams): Promise<PositionWithFees> {
    return getV3Position(this.chainConfigs[params.chainId], params);
  }

  public getV4Position(params: IUniswapPositionParams): Promise<PositionWithFees> {
    return getV4Position(this.chainConfigs[params.chainId], params);
  }

  public async requestMigration(params: RequestMigrationParams): Promise<RequestMigrationResponse> {
    const errors: ResponseDestinationError[] = [];
    const validRequestDestinations: RequestMigrationDestination[] = [];

    if (!this.isChainSupported(params.sourceChainId)) {
      throw new Error('source chain not supported');
    }

    if (params.tokenId === BigInt(0)) {
      throw new Error('tokenId is not valid');
    }

    if (params.sourceProtocol !== Protocol.UniswapV3 && params.sourceProtocol !== Protocol.UniswapV4) {
      throw new Error('sourceProtocol not supported');
    }

    params.destinations.forEach((dest) => {
      const errs = this.validateDestination(dest);
      if (errors.length > 1) {
        errors.push({ destination: dest, errors: errs });
      } else {
        validRequestDestinations.push(dest);
      }
    });

    const sourcePosition =
      params.sourceProtocol === Protocol.UniswapV3
        ? await this.getV3Position(params)
        : await this.getV4Position(params);

    const destinations = (
      await Promise.all(
        validRequestDestinations.map(async (dest) => {
          try {
            return await this.handleMigration(params, sourcePosition, dest);
          } catch (e) {
            errors.push({ destination: dest, errors: [e instanceof Error ? e : new Error(String(e))] });
            return;
          }
        })
      )
    ).filter((d: ResponseDestination | undefined) => d !== undefined);

    return { sourcePosition, destinations, errors };
  }

  private validateDestination(destination: RequestMigrationDestination): Error[] {
    const errors = [];

    if (!this.isChainSupported(destination.chainId)) errors.push(new Error('chain not supported'));

    if (destination.protocol !== Protocol.UniswapV3 && destination.protocol !== Protocol.UniswapV4) {
      errors.push(new Error('destination protocol not supported'));
    }

    if (destination.bridgeType === undefined) {
      destination.bridgeType = BridgeType.Across;
    } else if (destination.bridgeType !== BridgeType.Across) {
      errors.push(new Error('bridge type not supported'));
    }

    if (
      destination.migrationMethod &&
      ![MigrationMethod.SingleToken, MigrationMethod.DualToken].includes(destination.migrationMethod)
    ) {
      errors.push(new Error('invalid migration method specified'));
    }

    const address0Error = this.validateAddress(destination.token0);
    if (address0Error) errors.push(address0Error);

    const address1Error = this.validateAddress(destination.token1);
    if (address1Error) errors.push(address1Error);

    if (destination.token0.toLowerCase() >= destination.token1.toLowerCase()) {
      errors.push(new Error('token0 and token1 must be distinct addresses in alphabetical order'));
    }

    if (destination.token0.toLowerCase() >= destination.token1.toLowerCase()) {
      errors.push(new Error('token0 and token1 must be distinct addresses in alphabetical order'));
    }

    if (destination.tickLower > destination.tickUpper) {
      errors.push(new Error('tickLower must be less than tickUpper'));
    }

    // TODO: validate token bridgeability up front from across API

    return errors;
  }

  private async handleMigration(
    params: RequestMigrationParams,
    sourcePosition: PositionWithFees,
    destination: RequestMigrationDestination
  ): Promise<ResponseDestination> {
    const sourceProtocol = params.sourceProtocol;
    const destProtocol = destination.protocol;
    const sourceChainId = sourcePosition.pool.chainId;
    const destChainId = destination.chainId;
    const tokenId = sourcePosition.tokenId;

    if (sourcePosition.liquidity === 0n && sourcePosition.feeAmount0 === 0n && sourcePosition.feeAmount1 === 0n) {
      throw new Error('Position has no liquidity or fees');
    }

    const { routes } = await startFns[sourceProtocol]({
      sourceChainConfig: this.chainConfigs[sourceChainId],
      destinationChainConfig: this.chainConfigs[destChainId],
      destination: destination,
      positionWithFees: sourcePosition,
      externalParams: params,
    });

    const settle = settleFns[sourceProtocol][destProtocol];

    const { destPosition, migratorMessage, settlerMessage, swapAmountInMilliBps } = await settle({
      sourceChainConfig: this.chainConfigs[sourceChainId],
      destinationChainConfig: this.chainConfigs[destChainId],
      routes,
      destination,
      externalParams: params,
      owner: sourcePosition.owner,
    });

    const baseReturn = {
      ...destPosition,
      ...destPosition.pool,
      routes,
      migrationMethod: destination.migrationMethod!,
      bridgeType: destination.bridgeType!,
      executionParams: generateExecutionParams({
        sourceChainId,
        owner: sourcePosition.owner,
        protocol: sourceProtocol,
        tokenId,
        message: migratorMessage,
      }),
    };

    if (!params.debug) return baseReturn;

    return {
      ...baseReturn,
      settlerExecutionParams: generateSettlerExecutionParams({
        sourceChainId,
        destChainId,
        owner: sourcePosition.owner,
        destProtocol: destProtocol,
        routes,
        fillDeadline: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
        message: settlerMessage,
      }),
      swapAmountInMilliBps,
    };
  }
}
