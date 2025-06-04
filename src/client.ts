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
  ResponseDestination,
  UnavailableResponseDestination,
  RequestExactMigrationResponse,
  RequestExactMigrationParams,
  RequestExactDestination,
  DestinationSearch,
  RequestMigrationsResponse,
  RequestSingleDestinationSearchParams,
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

  public validateAddress(address: string): string | undefined {
    if (!isAddress(address)) return `${address} is not a valid address`;
    if (address !== checksumAddress(address)) return `${address} is not a checksummed address`;
  }

  public getV3Position(params: IUniswapPositionParams): Promise<PositionWithFees> {
    return getV3Position(this.chainConfigs[params.chainId], params);
  }

  public getV4Position(params: IUniswapPositionParams): Promise<PositionWithFees> {
    return getV4Position(this.chainConfigs[params.chainId], params);
  }

  public async requestMigration(params: RequestSingleDestinationSearchParams): Promise<RequestMigrationResponse> {
    const { destination, ...rest } = params;
    const { sourcePosition, destinations, unavailableDestinations } = await this.requestMigrations({
      ...rest,
      destinations: [destination],
    });
    return { sourcePosition, destinations: destinations[0], unavailableDestinations };
  }

  public async requestMigrations(params: RequestMigrationParams): Promise<RequestMigrationsResponse> {
    const unavailableDestinations: UnavailableResponseDestination[] = [];

    if (!this.isChainSupported(params.sourceChainId)) {
      throw new Error('source chain not supported');
    }

    if (params.tokenId === BigInt(0)) {
      throw new Error('tokenId is not valid');
    }

    if (params.sourceProtocol !== Protocol.UniswapV3 && params.sourceProtocol !== Protocol.UniswapV4) {
      throw new Error('sourceProtocol not supported');
    }

    const destinationOptions: RequestExactDestination[][] = this.enumerateDestinations(params.destinations).map(
      (dest) => {
        return dest
          .map((destOption) => {
            const reasons = this.unavailableReasons(destOption);
            if (reasons.length > 1) {
              unavailableDestinations.push({ destination: destOption, reasons });
            } else {
              return destOption;
            }
          })
          .filter((d: RequestExactDestination | undefined) => d !== undefined);
      }
    );

    const sourcePosition =
      params.sourceProtocol === Protocol.UniswapV3
        ? await this.getV3Position(params)
        : await this.getV4Position(params);

    const destinations = await Promise.all(
      destinationOptions.map(async (dest) => {
        return (
          await Promise.all(
            dest.map(async (option) => {
              try {
                return await this.handleMigration(params, sourcePosition, option);
              } catch (e) {
                unavailableDestinations.push({
                  destination: option,
                  reasons: [e instanceof Error ? e.message : 'unexpected error in handleMigration'],
                });
              }
              return;
            })
          )
        ).filter((d: ResponseDestination | undefined) => d !== undefined);
      })
    );

    return { sourcePosition, destinations, unavailableDestinations };
  }

  public async requestExactMigration(params: RequestExactMigrationParams): Promise<RequestExactMigrationResponse> {
    const { destination, ...rest } = params;
    const { sourcePosition, destinations, unavailableDestinations } = await this.requestMigrations({
      ...rest,
      destinations: [destination],
    });
    if (unavailableDestinations.length > 1) {
      throw new Error(`Specified destination not available:\n  - ${unavailableDestinations[0].reasons.join('\n  - ')}`);
    }
    return { sourcePosition, destination: destinations[0][0] };
  }

  public async requestExactMigrations(params: RequestExactMigrationParams[]): Promise<RequestExactMigrationResponse[]> {
    return Promise.all(params.map(async (param) => await this.requestExactMigration(param)));
  }

  private unavailableReasons(destination: RequestExactDestination): string[] {
    const reasons = [];

    if (!this.isChainSupported(destination.chainId)) reasons.push('chain not supported');

    if (destination.protocol !== Protocol.UniswapV3 && destination.protocol !== Protocol.UniswapV4) {
      reasons.push('destination protocol not supported');
    }

    if (destination.bridgeType === undefined) {
      destination.bridgeType = BridgeType.Across;
    } else if (destination.bridgeType !== BridgeType.Across) {
      reasons.push('bridge type not supported');
    }

    if (
      destination.migrationMethod &&
      ![MigrationMethod.SingleToken, MigrationMethod.DualToken].includes(destination.migrationMethod)
    ) {
      reasons.push('invalid migration method specified');
    }

    const address0Error = this.validateAddress(destination.token0);
    if (address0Error) reasons.push(address0Error);

    const address1Error = this.validateAddress(destination.token1);
    if (address1Error) reasons.push(address1Error);

    if (destination.token0.toLowerCase() >= destination.token1.toLowerCase()) {
      reasons.push('token0 and token1 must be distinct addresses in alphabetical order');
    }

    if (destination.token0.toLowerCase() >= destination.token1.toLowerCase()) {
      reasons.push('token0 and token1 must be distinct addresses in alphabetical order');
    }

    if (destination.tickLower > destination.tickUpper) {
      reasons.push('tickLower must be less than tickUpper');
    }

    // TODO: validate token bridgeability up front from across API

    return reasons;
  }

  private enumerateDestinations(search: DestinationSearch[]): RequestExactDestination[][] {
    return search.map((dest) => {
      const exactDestinations: RequestExactDestination[] = [];
      let bridgeTypes: BridgeType[];
      let migrationMethods: MigrationMethod[];

      if (dest.bridgeType) {
        bridgeTypes = [dest.bridgeType];
      } else {
        bridgeTypes = [BridgeType.Across];
      }

      if (dest.migrationMethod) {
        migrationMethods = [dest.migrationMethod];
      } else {
        migrationMethods = [MigrationMethod.SingleToken, MigrationMethod.DualToken];
      }

      for (const bridgeType of bridgeTypes) {
        for (const migrationMethod of migrationMethods) {
          exactDestinations.push({ ...dest, migrationMethod, bridgeType });
        }
      }
      return exactDestinations;
    });
  }

  private async handleMigration(
    params: RequestMigrationParams,
    sourcePosition: PositionWithFees,
    destination: RequestExactDestination
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
