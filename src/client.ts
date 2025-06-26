import { configurePublicClients } from './utils/configurePublicClients';
import { chainConfigs } from './chains';
import { getV3Position } from './actions/getV3Position';
import { BridgeType, DEFAULT_SLIPPAGE_IN_BPS, MigrationMethod, Protocol } from './utils/constants';
import type { ChainConfig } from './chains';
import type {
  PositionWithFees,
  PathWithPosition,
  PathUnavailable,
  RequestMigrationParams,
  RequestMigrationsParams,
  RequestExactMigrationParams,
  ExactMigrationResponse,
  MigrationResponse,
  MigrationsResponse,
  ExactPath,
  UniswapV4Params,
  UniswapV3Params,
  RequestWithdrawalParams,
  WithdrawalExecutionParams,
  CheckMigrationIdResponse,
  AerodromeParams,
} from './types';
import { startUniswapV3Migration, settleUniswapV3Migration } from './actions';
import { getV4Position } from './actions/getV4Position';
import { startUniswapV4Migration } from './actions/startUniswapV4Migration';
import { settleUniswapV4Migration } from './actions/settleUniswapV4Migration';
import { isAddress, checksumAddress, zeroAddress } from 'viem';
import { generateExecutionParams, generateSettlerExecutionParams } from './utils/helpers';
import type {
  InternalDestinationWithExactPath,
  InternalDestinationWithPathFilter,
  IPositionParams,
} from './types/internal';
import { positionValue } from './utils/position';
import { withdraw } from './actions/withdraw';
import { getSettlementCacheEntry } from './actions/getSettlementCacheEntry';
import { getAerodromePosition } from './actions/getAerodromePosition';
import { startAerodromeMigration } from './actions/startAerodromeMigration';

const startFns = {
  [Protocol.UniswapV3]: startUniswapV3Migration,
  [Protocol.UniswapV4]: startUniswapV4Migration,
  [Protocol.Aerodrome]: startAerodromeMigration,
};

const settleFns = {
  [Protocol.UniswapV3]: {
    [Protocol.UniswapV3]: settleUniswapV3Migration,
    [Protocol.UniswapV4]: settleUniswapV4Migration,
    [Protocol.Aerodrome]: settleUniswapV3Migration, // TODO: implement Aerodrome migration
  },
  [Protocol.UniswapV4]: {
    [Protocol.UniswapV3]: settleUniswapV3Migration,
    [Protocol.UniswapV4]: settleUniswapV4Migration,
    [Protocol.Aerodrome]: settleUniswapV3Migration, // TODO: implement Aerodrome migration
  },
  [Protocol.Aerodrome]: {
    [Protocol.UniswapV3]: settleUniswapV3Migration,
    [Protocol.UniswapV4]: settleUniswapV4Migration,
    [Protocol.Aerodrome]: settleUniswapV3Migration, // TODO: implement Aerodrome migration
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

  public getV3Position(params: IPositionParams): Promise<PositionWithFees> {
    return getV3Position(this.chainConfigs[params.chainId], params);
  }

  public getV4Position(params: IPositionParams): Promise<PositionWithFees> {
    return getV4Position(this.chainConfigs[params.chainId], params);
  }

  public getAerodromePosition(params: IPositionParams): Promise<PositionWithFees> {
    return getAerodromePosition(this.chainConfigs[params.chainId], params);
  }

  public async requestMigration(params: RequestMigrationParams): Promise<MigrationResponse> {
    const { destination, path, ...rest } = params;
    const { sourcePosition, migrations, unavailableMigrations } = await this.requestMigrations({
      ...rest,
      migrations: [{ destination, path }],
    });
    return {
      sourcePosition,
      migrations: migrations[0],
      unavailableMigrations,
    };
  }

  public async requestMigrations(params: RequestMigrationsParams): Promise<MigrationsResponse> {
    const unavailableMigrations: PathUnavailable[] = [];

    if (!this.isChainSupported(params.sourcePosition.chainId)) {
      throw new Error('source chain not supported');
    }

    if (params.sourcePosition.tokenId === BigInt(0)) {
      throw new Error('tokenId is not valid');
    }

    if (
      params.sourcePosition.protocol !== Protocol.UniswapV3 &&
      params.sourcePosition.protocol !== Protocol.UniswapV4 &&
      params.sourcePosition.protocol !== Protocol.Aerodrome
    ) {
      throw new Error('sourceProtocol not supported');
    }

    const migrationOptions: InternalDestinationWithExactPath[][] = this.enumerateMigrations(params.migrations).map(
      (migrations: InternalDestinationWithExactPath[]) => {
        return migrations
          .map((migration: InternalDestinationWithExactPath) => {
            const reasons = this.unavailableReasons(migration);
            if (reasons.length > 0) {
              unavailableMigrations.push({
                destination: migration.destination,
                exactPath: migration.exactPath,
                reasons,
              });
            } else {
              return migration;
            }
          })
          .filter(
            (
              m:
                | {
                    destination: UniswapV3Params | UniswapV4Params | AerodromeParams;
                    exactPath: ExactPath;
                  }
                | undefined
            ) => m !== undefined
          );
      }
    );

    let sourcePosition: PositionWithFees;
    switch (params.sourcePosition.protocol) {
      case Protocol.UniswapV3:
        sourcePosition = await this.getV3Position(params.sourcePosition);
        break;
      case Protocol.UniswapV4:
        sourcePosition = await this.getV4Position(params.sourcePosition);
        break;
      case Protocol.Aerodrome:
        sourcePosition = await this.getAerodromePosition(params.sourcePosition);
        break;
      default:
        throw new Error('source protocol not supported');
    }

    const pathWithPositions = await Promise.all(
      migrationOptions.map(async (migrations) => {
        return (
          await Promise.all(
            migrations.map(async (migration: InternalDestinationWithExactPath) => {
              try {
                return await this.handleMigration(
                  {
                    ...params,
                    destination: migration.destination,
                    path: migration.exactPath,
                  },
                  sourcePosition,
                  migration
                );
              } catch (e) {
                unavailableMigrations.push({
                  ...migration,
                  reasons: [e instanceof Error ? e.message : 'unexpected error in handleMigration'],
                });
              }
              return;
            })
          )
        )
          .filter((p: PathWithPosition | undefined) => p !== undefined)
          .sort((a: PathWithPosition, b: PathWithPosition) => {
            return Number(positionValue(b, 1, false) - positionValue(a, 1, false));
          });
      })
    );

    return { sourcePosition, migrations: pathWithPositions, unavailableMigrations };
  }

  public async requestExactMigration(params: RequestExactMigrationParams): Promise<ExactMigrationResponse> {
    const { destination, exactPath, ...rest } = params;
    const { sourcePosition, migrations, unavailableMigrations } = await this.requestMigrations({
      ...rest,
      migrations: [{ destination, path: exactPath }],
    });
    if (unavailableMigrations.length > 0) {
      throw new Error(`Specified destination not available:\n  - ${unavailableMigrations[0].reasons.join('\n  - ')}`);
    }
    return { sourcePosition, migration: migrations[0][0] };
  }

  public async requestExactMigrations(params: RequestExactMigrationParams[]): Promise<ExactMigrationResponse[]> {
    return Promise.all(params.map(async (param) => await this.requestExactMigration(param)));
  }

  public checkMigrationId(chainId: number, params: RequestWithdrawalParams): Promise<CheckMigrationIdResponse> {
    return getSettlementCacheEntry(this.chainConfigs[chainId], params);
  }

  public requestWithdrawal(params: RequestWithdrawalParams): WithdrawalExecutionParams {
    return withdraw(params);
  }

  private unavailableReasons(migration: InternalDestinationWithExactPath): string[] {
    const reasons = [];
    const { destination, exactPath } = migration;

    if (!this.isChainSupported(destination.chainId)) reasons.push('chain not supported');

    if (destination.protocol !== Protocol.UniswapV3 && destination.protocol !== Protocol.UniswapV4) {
      reasons.push('destination protocol not supported');
    }

    if (exactPath.bridgeType === undefined) {
      exactPath.bridgeType = BridgeType.Across;
    } else if (exactPath.bridgeType !== BridgeType.Across) {
      reasons.push('bridge type not supported');
    }

    if (
      exactPath.migrationMethod &&
      ![MigrationMethod.SingleToken, MigrationMethod.DualToken].includes(exactPath.migrationMethod)
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

    const hasEthOrWeth = [destination.token0, destination.token1].some(
      (token) => token === zeroAddress || token === chainConfigs[destination.chainId].wethAddress
    );
    if (!hasEthOrWeth) reasons.push('destination must specify either ETH or WETH as one of token0 or token1');

    if (destination.token0.toLowerCase() >= destination.token1.toLowerCase()) {
      reasons.push('token0 and token1 must be distinct addresses in alphabetical order');
    }

    if (destination.tickLower > destination.tickUpper) {
      reasons.push('tickLower must be less than tickUpper');
    }

    // TODO: validate token bridgeability up front from across API

    return reasons;
  }

  private enumerateMigrations(requests: InternalDestinationWithPathFilter[]): InternalDestinationWithExactPath[][] {
    return requests.map(({ destination, path: pathFilter }) => {
      const exactMigrationRequests: {
        destination: UniswapV3Params | UniswapV4Params | AerodromeParams;
        exactPath: ExactPath;
      }[] = [];
      let bridgeTypes: BridgeType[];
      let migrationMethods: MigrationMethod[];

      if (pathFilter?.bridgeType) {
        bridgeTypes = [pathFilter.bridgeType];
      } else {
        bridgeTypes = [BridgeType.Across];
      }

      if (pathFilter?.migrationMethod) {
        migrationMethods = [pathFilter.migrationMethod];
      } else {
        migrationMethods = [MigrationMethod.SingleToken, MigrationMethod.DualToken];
      }

      for (const bridgeType of bridgeTypes) {
        for (const migrationMethod of migrationMethods) {
          exactMigrationRequests.push({
            destination,
            exactPath: {
              migrationMethod,
              bridgeType,
              slippageInBps: pathFilter?.slippageInBps || DEFAULT_SLIPPAGE_IN_BPS,
            },
          });
        }
      }
      return exactMigrationRequests;
    });
  }

  private async handleMigration(
    params: RequestMigrationParams,
    sourcePosition: PositionWithFees,
    migration: InternalDestinationWithExactPath
  ): Promise<PathWithPosition> {
    const { destination, exactPath } = migration;
    const sourceProtocol = params.sourcePosition.protocol;
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
      migration,
      positionWithFees: sourcePosition,
      externalParams: params,
    });

    const settle = settleFns[sourceProtocol][destProtocol];

    const { destPosition, migratorMessage, settlerMessage, swapAmountInMilliBps, senderFees, protocolFees } =
      await settle({
        sourceChainConfig: this.chainConfigs[sourceChainId],
        destinationChainConfig: this.chainConfigs[destChainId],
        routes,
        migration,
        externalParams: params,
        owner: sourcePosition.owner,
      });

    const baseReturn = {
      position: destPosition,
      exactPath,
      routes,
      executionParams: generateExecutionParams({
        sourceChainId,
        owner: sourcePosition.owner,
        protocol: sourceProtocol,
        tokenId,
        message: migratorMessage,
      }),
      migrationFees: {
        sender: senderFees,
        protocol: protocolFees,
        total: {
          bps: senderFees.bps + protocolFees.bps,
          amount0: senderFees.amount0 + protocolFees.amount0,
          amount1: senderFees.amount1 + protocolFees.amount1,
        },
      },
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
