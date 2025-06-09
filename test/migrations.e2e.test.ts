import { test, describe, expect, beforeAll, mock, afterEach } from 'bun:test';
import { ChainHopperClient } from '../src/client';
import {
  Protocol,
  BridgeType,
  MigrationMethod,
  NATIVE_ETH_ADDRESS,
  DEFAULT_SLIPPAGE_IN_BPS,
} from '../src/utils/constants';
import type {
  PositionWithFees,
  ExactMigrationResponse,
  RequestExactMigration,
  RequestMigration,
} from '../src/types/sdk';
import { Position as V4Position, Pool as V4Pool } from '@uniswap/v4-sdk';
import { Position as V3Position, Pool as V3Pool } from '@uniswap/v3-sdk';
import { Quote } from '@across-protocol/app-sdk';
import { ModuleMocker } from './ModuleMocker';
import { zeroAddress } from 'viem';
import { Ether, Token } from '@uniswap/sdk-core';
import { TickMath } from '@uniswap/v3-sdk';
import { positionValue, toSDKPosition } from '../src/utils/position';

let client: ReturnType<typeof ChainHopperClient.create>;
const moduleMocker = new ModuleMocker();
const ownerAddress = '0x0000000000000000000000000000000000000001';

beforeAll(() => {
  const rpcUrls = {
    1: Bun.env.MAINNET_RPC_URL!,
    10: Bun.env.OPTIMISM_RPC_URL!,
    130: Bun.env.UNICHAIN_RPC_URL!,
    8453: Bun.env.BASE_RPC_URL!,
    42161: Bun.env.ARBITRUM_RPC_URL!,
  };

  client = ChainHopperClient.create({ rpcUrls });
});

afterEach(() => {
  moduleMocker.clear();
});

const validateMigrationResponse = (params: RequestExactMigration, result: ExactMigrationResponse): void => {
  const {
    sourcePosition,
    migration: { destination },
  } = params;

  // check correct output chain

  expect(result.sourcePosition.pool.chainId).toBe(sourcePosition.chainId);
  expect(result.destPosition.pool.chainId).toBe(destination.chainId);

  // check correct output protocol
  expect(result.destPosition.pool.protocol).toBe(destination.protocol);

  const position = result.destPosition;
  if (destination.token0 == NATIVE_ETH_ADDRESS) {
    expect(position.pool.token0.address === NATIVE_ETH_ADDRESS).toBe(true);
  } else {
    expect(position.pool.token0.address).toBe(destination.token0);
  }
  expect(position.pool.token1.address).toBe(destination.token1);

  // check correct output ticks
  expect(position.tickLower).toBe(destination.tickLower);
  expect(position.tickUpper).toBe(destination.tickUpper);

  // check correct output pool
  const pool: V4Pool = result.destPosition.pool as unknown as V4Pool;
  expect(pool.fee).toBe(destination.fee);
  if ('hooks' in destination) expect(pool.hooks).toBe(destination.hooks as string);
  if ('tickSpacing' in destination) expect(pool.tickSpacing).toBe(destination.tickSpacing as number);

  const amount0 = result.destPosition.amount0;
  const amount1 = result.destPosition.amount1;
  const amount0Min = result.destPosition.amount0Min ? result.destPosition.amount0Min : 0;
  const amount1Min = result.destPosition.amount1Min ? result.destPosition.amount1Min : 0;

  // check correct output amounts within slippage
  expect(amount0).toBeGreaterThanOrEqual(amount0Min);
  expect(amount1).toBeGreaterThanOrEqual(amount1Min);

  // check execution params
  const executionParams = result.destPosition.executionParams;
  expect(executionParams.functionName).toBe('safeTransferFrom');
  expect(executionParams.args[0]).toBe(result.sourcePosition.owner);
  expect(executionParams.args[1]).toBeDefined();
  expect(executionParams.args[2]).toBe(sourcePosition.tokenId);
  if (sourcePosition.protocol === Protocol.UniswapV3) {
    expect(executionParams.address).toBe(
      client.chainConfigs[sourcePosition.chainId].v3NftPositionManagerContract.address
    );
    expect(executionParams.args[1]).toBe(
      client.chainConfigs[sourcePosition.chainId].UniswapV3AcrossMigrator as `0x${string}`
    );
  } else {
    expect(executionParams.address).toBe(client.chainConfigs[sourcePosition.chainId].v4PositionManagerContract.address);
    expect(executionParams.args[1]).toBe(
      client.chainConfigs[sourcePosition.chainId].UniswapV4AcrossMigrator as `0x${string}`
    );
  }
};

describe('invalid migrations', () => {
  test('reject single token v3 migration with invalid bridge type', async () => {
    const params: RequestExactMigration = {
      sourcePosition: {
        chainId: 8453,
        tokenId: 104758n,
        protocol: Protocol.UniswapV3,
      },
      migration: {
        destination: {
          chainId: 130,
          protocol: Protocol.UniswapV4,
          token0: NATIVE_ETH_ADDRESS,
          token1: '0x532f27101965dd16442E59d40670FaF5eBB142E4',
          tickLower: 62200,
          tickUpper: 103800,
          fee: 10000,
          tickSpacing: 200,
          hooks: '0x0000000000000000000000000000000000000000',
        },
        exactPath: {
          bridgeType: 'nobridge' as BridgeType,
          migrationMethod: MigrationMethod.SingleToken,
          slippageInBps: DEFAULT_SLIPPAGE_IN_BPS,
        },
      },
    };
    try {
      await client.requestExactMigration(params);
    } catch (e) {
      expect(e.message.includes('Bridge type not supported'));
    }
  });

  test('reject dual token v3 migration with invalid bridge type', async () => {
    const params: RequestExactMigration = {
      sourcePosition: {
        chainId: 8453,
        tokenId: 104758n,
        protocol: Protocol.UniswapV3,
      },
      migration: {
        destination: {
          chainId: 130,
          protocol: Protocol.UniswapV4,
          token0: NATIVE_ETH_ADDRESS,
          token1: '0x532f27101965dd16442E59d40670FaF5eBB142E4',
          tickLower: 62200,
          tickUpper: 103800,
          fee: 10000,
          tickSpacing: 200,
          hooks: '0x0000000000000000000000000000000000000000',
        },
        exactPath: {
          bridgeType: 'nobridge' as BridgeType,
          migrationMethod: MigrationMethod.DualToken,
          slippageInBps: DEFAULT_SLIPPAGE_IN_BPS,
        },
      },
    };
    try {
      await client.requestExactMigration(params);
    } catch (e) {
      expect(e.message.includes('Bridge type not supported'));
    }
  });

  test('reject single token v4 migration with invalid bridge type', async () => {
    const params: RequestExactMigration = {
      sourcePosition: {
        chainId: 8453,
        tokenId: 104758n,
        protocol: Protocol.UniswapV4,
      },
      migration: {
        destination: {
          chainId: 130,
          protocol: Protocol.UniswapV4,
          token0: NATIVE_ETH_ADDRESS,
          token1: '0x532f27101965dd16442E59d40670FaF5eBB142E4',
          tickLower: 62200,
          tickUpper: 103800,
          fee: 10000,
          tickSpacing: 200,
          hooks: '0x0000000000000000000000000000000000000000',
        },
        exactPath: {
          bridgeType: 'nobridge' as BridgeType,
          migrationMethod: MigrationMethod.SingleToken,
          slippageInBps: DEFAULT_SLIPPAGE_IN_BPS,
        },
      },
    };
    try {
      await client.requestExactMigration(params);
    } catch (e) {
      expect(e.message.includes('Bridge type not supported'));
    }
  });

  test('reject dual token v4 migration with invalid bridge type', async () => {
    const params: RequestExactMigration = {
      sourcePosition: {
        chainId: 8453,
        tokenId: 104758n,
        protocol: Protocol.UniswapV4,
      },
      migration: {
        destination: {
          chainId: 130,
          protocol: Protocol.UniswapV4,
          token0: NATIVE_ETH_ADDRESS,
          token1: '0x532f27101965dd16442E59d40670FaF5eBB142E4',
          tickLower: 62200,
          tickUpper: 103800,
          fee: 10000,
          tickSpacing: 200,
          hooks: '0x0000000000000000000000000000000000000000',
        },
        exactPath: {
          bridgeType: 'nobridge' as BridgeType,
          migrationMethod: MigrationMethod.DualToken,
          slippageInBps: DEFAULT_SLIPPAGE_IN_BPS,
        },
      },
    };
    try {
      await client.requestExactMigration(params);
    } catch (e) {
      expect(e.message.includes('Bridge type not supported'));
    }
  });

  test('reject migration that are too large for across', async () => {
    const params: RequestExactMigration = {
      sourcePosition: {
        chainId: 8453,
        tokenId: 104758n,
        protocol: Protocol.UniswapV3,
      },
      migration: {
        destination: {
          chainId: 130,
          protocol: Protocol.UniswapV4,
          token0: NATIVE_ETH_ADDRESS,
          token1: client.chainConfigs[130].usdcAddress,
          tickLower: 62200,
          tickUpper: 103800,
          fee: 10000,
          tickSpacing: 200,
          hooks: '0x0000000000000000000000000000000000000000',
        },
        exactPath: {
          bridgeType: BridgeType.Across,
          migrationMethod: MigrationMethod.SingleToken,
          slippageInBps: DEFAULT_SLIPPAGE_IN_BPS,
        },
      },
    };
    await moduleMocker.mock('@across-protocol/app-sdk', () => ({
      AcrossClient: {
        create: mock(() => {
          return {
            getQuote: (): Promise<Quote> => {
              throw new Error("doesn't have enough funds to support this deposit");
            },
          };
        }),
      },
    }));
    expect(async () => await client.requestExactMigration(params)).toThrow(
      "doesn't have enough funds to support this deposit"
    );
  });

  test("reject migration where a token can't be found on the destination chain", async () => {
    const sourceChainId = 8453;
    const token0 = client.chainConfigs[sourceChainId].wethAddress;
    const token1 = client.chainConfigs[sourceChainId].usdcAddress;
    const fee = 500;

    await moduleMocker.mock('../src/actions/getV3Position.ts', () => ({
      getV3Position: mock(() => {
        const tickCurrent = 100;
        const liquidity = 1_000_000_000n;
        const pool = new V3Pool(
          new Token(sourceChainId, token0, 18, 'WETH'),
          new Token(sourceChainId, token1, 18, 'USDC'),
          fee,
          BigInt(TickMath.getSqrtRatioAtTick(tickCurrent).toString()).toString(),
          liquidity.toString(),
          tickCurrent
        );
        return {
          owner: ownerAddress,
          ...toSDKPosition(
            client.chainConfigs[8453],
            new V3Position({
              pool,
              liquidity: 1_000_000_000_000,
              tickLower: 10,
              tickUpper: 500,
            })
          ),
          feeAmount0: 0n,
          feeAmount1: 0n,
        };
      }),
    }));
    const params: RequestExactMigration = {
      sourcePosition: {
        chainId: 8453,
        tokenId: 104758n,
        protocol: Protocol.UniswapV3,
      },
      migration: {
        destination: {
          chainId: 130,
          protocol: Protocol.UniswapV4,
          token0: NATIVE_ETH_ADDRESS,
          token1: '0x532f27101965dd16442E59d40670FaF5eBB142E4', // this is the base address for BRETT bc it doesn't exist
          tickLower: 62200,
          tickUpper: 103800,
          fee: 10000,
          tickSpacing: 200,
          hooks: '0x0000000000000000000000000000000000000000',
        },
        exactPath: {
          bridgeType: BridgeType.Across,
          migrationMethod: MigrationMethod.SingleToken,
          slippageInBps: DEFAULT_SLIPPAGE_IN_BPS,
        },
      },
    };
    try {
      await client.requestExactMigration(params);
    } catch (e) {
      expect(e.message).toContain('Failed to get token');
    }
  });

  test("reject migration where a token can't be bridged", async () => {
    const params: RequestExactMigration = {
      sourcePosition: {
        chainId: 8453,
        tokenId: 104758n,
        protocol: Protocol.UniswapV3,
      },
      migration: {
        destination: {
          chainId: 130,
          protocol: Protocol.UniswapV4,
          token0: NATIVE_ETH_ADDRESS,
          token1: '0x532f27101965dd16442E59d40670FaF5eBB142E4', // this is the base address for BRETT bc it doesn't exist
          tickLower: 62200,
          tickUpper: 103800,
          fee: 10000,
          tickSpacing: 200,
          hooks: '0x0000000000000000000000000000000000000000',
        },
        exactPath: {
          bridgeType: BridgeType.Across,
          migrationMethod: MigrationMethod.DualToken,
          slippageInBps: DEFAULT_SLIPPAGE_IN_BPS,
        },
      },
    };
    await moduleMocker.mock('@across-protocol/app-sdk', () => ({
      AcrossClient: {
        create: mock(() => {
          return {
            getQuote: (): Promise<Quote> => {
              throw new Error('Unsupported token on given origin chain');
            },
          };
        }),
      },
    }));
    try {
      await client.requestExactMigration(params);
    } catch (e) {
      expect(e.message).toContain('Unsupported token on given origin chain');
    }
  });

  test('reject migration with an invalid token order', async () => {
    const params: RequestExactMigration = {
      sourcePosition: {
        chainId: 1,
        tokenId: 963499n,
        protocol: Protocol.UniswapV3,
      },
      migration: {
        destination: {
          chainId: 130,
          protocol: Protocol.UniswapV4,
          token0: '0x078D782b760474a361dDA0AF3839290b0EF57AD6',
          token1: NATIVE_ETH_ADDRESS,
          tickLower: -203450,
          tickUpper: -193130,
          fee: 500,
          tickSpacing: 10,
          hooks: '0x0000000000000000000000000000000000000000',
        },
        exactPath: {
          bridgeType: BridgeType.Across,
          migrationMethod: MigrationMethod.SingleToken,
          slippageInBps: DEFAULT_SLIPPAGE_IN_BPS,
        },
      },
    };
    try {
      await client.requestExactMigration(params);
    } catch (e) {
      expect(e.message).toContain('token0 and token1 must be distinct addresses in alphabetical order');
    }
  });

  test('reject migration with two of the same token', async () => {
    const params: RequestExactMigration = {
      sourcePosition: {
        chainId: 1,
        tokenId: 963499n,
        protocol: Protocol.UniswapV3,
      },
      migration: {
        destination: {
          chainId: 130,
          protocol: Protocol.UniswapV4,
          token0: '0x078D782b760474a361dDA0AF3839290b0EF57AD6',
          token1: '0x078D782b760474a361dDA0AF3839290b0EF57AD6',
          tickLower: -203450,
          tickUpper: -193130,
          fee: 500,
          tickSpacing: 10,
          hooks: '0x0000000000000000000000000000000000000000',
        },
        exactPath: {
          bridgeType: BridgeType.Across,
          migrationMethod: MigrationMethod.SingleToken,
          slippageInBps: DEFAULT_SLIPPAGE_IN_BPS,
        },
      },
    };
    try {
      await client.requestExactMigration(params);
    } catch (e) {
      expect(e.message).toContain('token0 and token1 must be distinct addresses in alphabetical order');
    }
  });

  test('reject migration to v3 requesting native token', async () => {
    const params: RequestExactMigration = {
      sourcePosition: {
        chainId: 130,
        tokenId: 1000n,
        protocol: Protocol.UniswapV4,
      },
      migration: {
        destination: {
          chainId: 8453,
          protocol: Protocol.UniswapV3,
          token0: NATIVE_ETH_ADDRESS,
          token1: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
          tickLower: -202230,
          tickUpper: -199380,
          fee: 500,
        },
        exactPath: {
          bridgeType: BridgeType.Across,
          migrationMethod: MigrationMethod.SingleToken,
          slippageInBps: DEFAULT_SLIPPAGE_IN_BPS,
        },
      },
    };
    expect(async () => await client.requestExactMigration(params)).toThrow('Native tokens not supported on Uniswap v3');
  });

  test('reject migration from v3 where neither token is weth', async () => {
    try {
      const params: RequestExactMigration = {
        sourcePosition: {
          chainId: 1,
          tokenId: 949124n,
          protocol: Protocol.UniswapV3,
        },
        migration: {
          destination: {
            chainId: 8453,
            protocol: Protocol.UniswapV4,
            token0: '0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34',
            token1: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
            tickLower: -276352,
            tickUpper: -276299,
            fee: 100,
            tickSpacing: 1,
            hooks: '0x0000000000000000000000000000000000000000',
          },
          exactPath: {
            bridgeType: BridgeType.Across,
            migrationMethod: MigrationMethod.DualToken,
            slippageInBps: DEFAULT_SLIPPAGE_IN_BPS,
          },
        },
      };
      await client.requestExactMigration(params);
    } catch (e) {
      expect(e.message).toContain('WETH not found in position');
    }
  });

  test('reject migration from v4 where neither token is weth or eth', async () => {
    const token0 = '0x078D782b760474a361dDA0AF3839290b0EF57AD6';
    const token1 = '0x588CE4F028D8e7B53B687865d6A67b3A54C75518';
    const fee = 500;
    const tickSpacing = 10;
    const hooks = '0x0000000000000000000000000000000000000000';

    await moduleMocker.mock('../src/actions/getV4Position.ts', () => ({
      getV4Position: mock(() => {
        const tickCurrent = 10;
        const liquidity = 1000n;
        const pool = new V4Pool(
          new Token(1, token0, 18, 'RANDOM1'),
          new Token(1, token1, 18, 'RANDOM2'),
          fee,
          tickSpacing,
          hooks,
          BigInt(TickMath.getSqrtRatioAtTick(tickCurrent).toString()).toString(),
          liquidity.toString(),
          tickCurrent
        );
        return {
          owner: ownerAddress,
          ...toSDKPosition(
            client.chainConfigs[130],
            new V4Position({
              pool,
              liquidity: liquidity.toString(),
              tickLower: 0,
              tickUpper: 100,
            })
          ),
          feeAmount0: 0n,
          feeAmount1: 0n,
        };
      }),
    }));
    const params: RequestExactMigration = {
      sourcePosition: {
        chainId: 8453,
        tokenId: 10249n,
        protocol: Protocol.UniswapV4,
      },
      migration: {
        destination: {
          chainId: 130,
          protocol: Protocol.UniswapV4,
          token0,
          token1,
          tickLower: -88700,
          tickUpper: 88700,
          fee,
          tickSpacing,
          hooks,
        },
        exactPath: {
          bridgeType: BridgeType.Across,
          migrationMethod: MigrationMethod.SingleToken,
          slippageInBps: DEFAULT_SLIPPAGE_IN_BPS,
        },
      },
    };
    expect(async () => await client.requestExactMigration(params)).toThrow('ETH/WETH not found in position');
  });
});

describe('in-range v3→ migrations', () => {
  let v3ChainId: number;
  let v3TokenId: bigint;
  let v3Response: PositionWithFees;

  beforeAll(async () => {
    v3ChainId = 1;
    v3TokenId = 963499n; // https://app.uniswap.org/positions/v3/ethereum/963499
    v3Response = await client.getV3Position({
      chainId: v3ChainId,
      tokenId: v3TokenId,
    });
  });

  test('generate valid mainnet v3 → unichain v4 single-token migration', async () => {
    const params: RequestExactMigration = {
      sourcePosition: {
        chainId: v3ChainId,
        tokenId: v3TokenId,
        protocol: Protocol.UniswapV3,
      },
      migration: {
        destination: {
          chainId: 130,
          protocol: Protocol.UniswapV4,
          token0: NATIVE_ETH_ADDRESS,
          token1: '0x078D782b760474a361dDA0AF3839290b0EF57AD6',
          tickLower: -1 * v3Response.tickUpper,
          tickUpper: -1 * v3Response.tickLower,
          fee: v3Response.pool.fee,
          tickSpacing: v3Response.pool.tickSpacing,
          hooks: '0x0000000000000000000000000000000000000000',
        },
        exactPath: {
          bridgeType: BridgeType.Across,
          migrationMethod: MigrationMethod.SingleToken,
          slippageInBps: DEFAULT_SLIPPAGE_IN_BPS,
        },
      },
    };
    validateMigrationResponse(params, await client.requestExactMigration(params));
  });

  test('v3 → v4 single-token and dual-token migration with pathFilter returns ordered by position value desc', async () => {
    const params: RequestMigration = {
      sourcePosition: {
        chainId: v3ChainId,
        tokenId: v3TokenId,
        protocol: Protocol.UniswapV3,
      },
      migration: {
        destination: {
          chainId: 130,
          protocol: Protocol.UniswapV4,
          token0: NATIVE_ETH_ADDRESS,
          token1: '0x078D782b760474a361dDA0AF3839290b0EF57AD6',
          tickLower: -1 * v3Response.tickUpper,
          tickUpper: -1 * v3Response.tickLower,
          fee: v3Response.pool.fee,
          tickSpacing: v3Response.pool.tickSpacing,
          hooks: '0x0000000000000000000000000000000000000000',
        },
        pathFilter: {
          bridgeType: BridgeType.Across,
          slippageInBps: DEFAULT_SLIPPAGE_IN_BPS,
        },
      },
    };
    let response = await client.requestMigration(params);
    expect(response.destPositions.length).toBe(2);
    expect(positionValue(response.destPositions[0], 1, true)).toBeGreaterThan(
      positionValue(response.destPositions[1], 1, true)
    );
  });

  test('v3 → v3 single-token and dual-token migration with pathFilter returns ordered by position value desc', async () => {
    const params: RequestMigration = {
      sourcePosition: {
        chainId: v3ChainId,
        tokenId: v3TokenId,
        protocol: Protocol.UniswapV3,
      },
      migration: {
        destination: {
          chainId: 130,
          protocol: Protocol.UniswapV3,
          token0: '0x078D782b760474a361dDA0AF3839290b0EF57AD6',
          token1: '0x4200000000000000000000000000000000000006',
          tickLower: -1 * v3Response.tickUpper,
          tickUpper: -1 * v3Response.tickLower,
          fee: v3Response.pool.fee,
        },
        pathFilter: {
          bridgeType: BridgeType.Across,
          slippageInBps: DEFAULT_SLIPPAGE_IN_BPS,
        },
      },
    };
    let response = await client.requestMigration(params);
    expect(response.destPositions.length).toBe(2);
    expect(positionValue(response.destPositions[0], 1, true)).toBeGreaterThan(
      positionValue(response.destPositions[1], 1, true)
    );
  });

  test('generate valid mainnet v3 → unichain v4 dual-token migration', async () => {
    const params: RequestExactMigration = {
      sourcePosition: {
        chainId: v3ChainId,
        tokenId: v3TokenId,
        protocol: Protocol.UniswapV3,
      },
      migration: {
        destination: {
          chainId: 130,
          protocol: Protocol.UniswapV4,
          token0: NATIVE_ETH_ADDRESS,
          token1: '0x078D782b760474a361dDA0AF3839290b0EF57AD6',
          tickLower: -1 * v3Response.tickUpper,
          tickUpper: -1 * v3Response.tickLower,
          fee: v3Response.pool.fee,
          tickSpacing: v3Response.pool.tickSpacing,
          hooks: '0x0000000000000000000000000000000000000000',
        },
        exactPath: {
          bridgeType: BridgeType.Across,
          migrationMethod: MigrationMethod.DualToken,
          slippageInBps: DEFAULT_SLIPPAGE_IN_BPS,
        },
      },
    };
    validateMigrationResponse(params, await client.requestExactMigration(params));
  });

  test('generate valid mainnet v3 → unichain v3 single-token migration', async () => {
    const params: RequestExactMigration = {
      sourcePosition: {
        chainId: v3ChainId,
        tokenId: v3TokenId,
        protocol: Protocol.UniswapV3,
      },
      migration: {
        destination: {
          chainId: 130,
          protocol: Protocol.UniswapV3,
          token0: '0x078D782b760474a361dDA0AF3839290b0EF57AD6',
          token1: '0x4200000000000000000000000000000000000006',
          tickLower: v3Response.tickLower,
          tickUpper: v3Response.tickUpper,
          fee: v3Response.pool.fee,
        },
        exactPath: {
          bridgeType: BridgeType.Across,
          migrationMethod: MigrationMethod.SingleToken,
          slippageInBps: DEFAULT_SLIPPAGE_IN_BPS,
        },
      },
    };
    validateMigrationResponse(params, await client.requestExactMigration(params));
  });

  test('generate valid mainnet v3 → unichain v3 dual-token migration', async () => {
    const params: RequestExactMigration = {
      sourcePosition: {
        chainId: v3ChainId,
        tokenId: v3TokenId,
        protocol: Protocol.UniswapV3,
      },
      migration: {
        destination: {
          chainId: 130,
          protocol: Protocol.UniswapV3,
          token0: '0x078D782b760474a361dDA0AF3839290b0EF57AD6',
          token1: '0x4200000000000000000000000000000000000006',
          tickLower: v3Response.tickLower,
          tickUpper: v3Response.tickUpper,
          fee: v3Response.pool.fee,
        },
        exactPath: {
          bridgeType: BridgeType.Across,
          migrationMethod: MigrationMethod.DualToken,
          slippageInBps: DEFAULT_SLIPPAGE_IN_BPS,
        },
      },
    };
    validateMigrationResponse(params, await client.requestExactMigration(params));
  });

  test('generate valid base v3 → arbitrum v4 dual-token migration with (w)eth as token0', async () => {
    const params: RequestExactMigration = {
      sourcePosition: {
        chainId: 8453,
        tokenId: 2825070n,
        protocol: Protocol.UniswapV3,
      },
      migration: {
        destination: {
          chainId: 42161,
          protocol: Protocol.UniswapV4,
          token0: '0x0000000000000000000000000000000000000000',
          token1: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
          tickLower: -201230,
          tickUpper: -187780,
          fee: 500,
          tickSpacing: 10,
          hooks: '0x0000000000000000000000000000000000000000',
        },
        exactPath: {
          bridgeType: BridgeType.Across,
          migrationMethod: MigrationMethod.DualToken,
          slippageInBps: DEFAULT_SLIPPAGE_IN_BPS,
        },
      },
    };
    validateMigrationResponse(params, await client.requestExactMigration(params));
  });
});

describe('in-range v4→ migrations', () => {
  let v4ChainId: number;
  let v4TokenId: bigint;
  let v4Response: PositionWithFees;
  let v4Pool: V4Pool;

  beforeAll(async () => {
    v4ChainId = 130;
    v4TokenId = 5000n; // https://app.uniswap.org/positions/v4/unichain/5000
    v4Response = await client.getV4Position({
      chainId: v4ChainId,
      tokenId: v4TokenId,
    });
    v4Pool = v4Response.pool as unknown as V4Pool;
  });

  test('generate valid unichain v4 → base v3 single-token migration', async () => {
    const params: RequestExactMigration = {
      sourcePosition: {
        chainId: v4ChainId,
        tokenId: v4TokenId,
        protocol: Protocol.UniswapV4,
      },
      migration: {
        destination: {
          chainId: 8453,
          protocol: Protocol.UniswapV3,
          token0: client.chainConfigs[8453].wethAddress,
          token1: client.chainConfigs[8453].usdcAddress,
          tickLower: v4Response.tickLower,
          tickUpper: v4Response.tickUpper,
          fee: v4Pool.fee,
        },
        exactPath: {
          bridgeType: BridgeType.Across,
          migrationMethod: MigrationMethod.SingleToken,
          slippageInBps: DEFAULT_SLIPPAGE_IN_BPS,
        },
      },
    };
    validateMigrationResponse(params, await client.requestExactMigration(params));
  });

  test('generate valid unichain v4 → base v3 dual-token migration', async () => {
    const params: RequestExactMigration = {
      sourcePosition: {
        chainId: v4ChainId,
        tokenId: v4TokenId,
        protocol: Protocol.UniswapV4,
      },
      migration: {
        destination: {
          chainId: 8453,
          protocol: Protocol.UniswapV3,
          token0: '0x4200000000000000000000000000000000000006',
          token1: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
          tickLower: v4Response.tickLower,
          tickUpper: v4Response.tickUpper,
          fee: v4Pool.fee,
        },
        exactPath: {
          bridgeType: BridgeType.Across,
          migrationMethod: MigrationMethod.DualToken,
          slippageInBps: DEFAULT_SLIPPAGE_IN_BPS,
        },
      },
    };
    validateMigrationResponse(params, await client.requestExactMigration(params));
  });

  test('reject unichain v4 → base v4 single-token migration with high slippage on destination swap', async () => {
    const params: RequestExactMigration = {
      sourcePosition: {
        chainId: v4ChainId,
        tokenId: v4TokenId,
        protocol: Protocol.UniswapV4,
      },
      migration: {
        destination: {
          chainId: 8453,
          protocol: Protocol.UniswapV4,
          token0: zeroAddress,
          token1: client.chainConfigs[8453].usdcAddress,
          tickLower: v4Response.tickLower,
          tickUpper: v4Response.tickUpper,
          fee: 10000,
          tickSpacing: 200,
          hooks: zeroAddress,
        },
        exactPath: {
          bridgeType: BridgeType.Across,
          migrationMethod: MigrationMethod.SingleToken,
          slippageInBps: 6,
        },
      },
    };
    expect(async () => await client.requestExactMigration(params)).toThrow('Price impact exceeds slippage');
  });

  test('generate valid unichain v4 → base v4 dual-token migration', async () => {
    const params: RequestExactMigration = {
      sourcePosition: {
        chainId: v4ChainId,
        tokenId: v4TokenId,
        protocol: Protocol.UniswapV4,
      },
      migration: {
        destination: {
          chainId: 8453,
          protocol: Protocol.UniswapV4,
          token0: zeroAddress,
          token1: client.chainConfigs[8453].usdcAddress,
          tickLower: v4Response.tickLower,
          tickUpper: v4Response.tickUpper,
          fee: v4Pool.fee,
          tickSpacing: v4Pool.tickSpacing,
          hooks: zeroAddress,
        },
        exactPath: {
          bridgeType: BridgeType.Across,
          migrationMethod: MigrationMethod.DualToken,
          slippageInBps: DEFAULT_SLIPPAGE_IN_BPS,
        },
      },
    };
    validateMigrationResponse(params, await client.requestExactMigration(params));
  });
});

describe('flipped token order between chains', () => {
  test('generate valid base v4 → unichain v3 dual-token migration', async () => {
    const params: RequestExactMigration = {
      sourcePosition: {
        chainId: 8453,
        tokenId: 17447n,
        protocol: Protocol.UniswapV4,
      },
      migration: {
        destination: {
          chainId: 130,
          protocol: Protocol.UniswapV3,
          token0: '0x078D782b760474a361dDA0AF3839290b0EF57AD6',
          token1: '0x4200000000000000000000000000000000000006',
          tickLower: 201320,
          tickUpper: 201870,
          fee: 500,
        },
        exactPath: {
          bridgeType: BridgeType.Across,
          migrationMethod: MigrationMethod.DualToken,
          slippageInBps: DEFAULT_SLIPPAGE_IN_BPS,
        },
      },
    };
    validateMigrationResponse(params, await client.requestExactMigration(params));
  });

  test('generate valid arbitrum v4 → unichain v4 dual-token migration', async () => {
    const params: RequestExactMigration = {
      sourcePosition: {
        chainId: 42161,
        tokenId: 4n,
        protocol: Protocol.UniswapV4,
      },
      migration: {
        destination: {
          chainId: 10,
          protocol: Protocol.UniswapV4,
          token0: NATIVE_ETH_ADDRESS,
          token1: '0x68f180fcCe6836688e9084f035309E29Bf0A2095',
          tickLower: -887220,
          tickUpper: 887220,
          fee: 3000,
          hooks: '0x0000000000000000000000000000000000000000',
          tickSpacing: 60,
        },
        exactPath: {
          bridgeType: BridgeType.Across,
          migrationMethod: MigrationMethod.DualToken,
          slippageInBps: DEFAULT_SLIPPAGE_IN_BPS,
        },
      },
    };
    validateMigrationResponse(params, await client.requestExactMigration(params));
  });
});

describe('out of range v3→ migrations', () => {
  let v3ChainId: number;
  let v3TokenId: bigint;
  let v3Response: PositionWithFees;

  beforeAll(async () => {
    v3ChainId = 1;
    v3TokenId = 893202n;
    v3Response = await client.getV3Position({
      chainId: v3ChainId,
      tokenId: v3TokenId,
    });
  });

  describe('single token', () => {
    describe('current price below requested range', () => {
      test('generate valid mainnet v3 → unichain v4 migration', async () => {
        const params: RequestExactMigration = {
          sourcePosition: {
            chainId: v3ChainId,
            tokenId: v3TokenId,
            protocol: Protocol.UniswapV3,
          },
          migration: {
            destination: {
              chainId: 130,
              protocol: Protocol.UniswapV4,
              token0: NATIVE_ETH_ADDRESS,
              token1: '0x927B51f251480a681271180DA4de28D44EC4AfB8',
              tickLower: -1 * v3Response.tickUpper,
              tickUpper: -1 * v3Response.tickLower,
              fee: v3Response.pool.fee,
              tickSpacing: v3Response.pool.tickSpacing,
              hooks: '0x0000000000000000000000000000000000000000',
            },
            exactPath: {
              bridgeType: BridgeType.Across,
              migrationMethod: MigrationMethod.SingleToken,
              slippageInBps: DEFAULT_SLIPPAGE_IN_BPS,
            },
          },
        };
        validateMigrationResponse(params, await client.requestExactMigration(params));
      });
    });
    describe('current price above requested range', () => {
      test('generate valid mainnet v3 → unichain v4 migration', async () => {
        const params: RequestExactMigration = {
          sourcePosition: {
            chainId: v3ChainId,
            tokenId: v3TokenId,
            protocol: Protocol.UniswapV3,
          },
          migration: {
            destination: {
              chainId: 130,
              protocol: Protocol.UniswapV4,
              token0: NATIVE_ETH_ADDRESS,
              token1: '0x927B51f251480a681271180DA4de28D44EC4AfB8',
              tickLower: -299990,
              tickUpper: -289990,
              fee: v3Response.pool.fee,
              tickSpacing: v3Response.pool.tickSpacing,
              hooks: '0x0000000000000000000000000000000000000000',
            },
            exactPath: {
              bridgeType: BridgeType.Across,
              migrationMethod: MigrationMethod.SingleToken,
              slippageInBps: DEFAULT_SLIPPAGE_IN_BPS,
            },
          },
        };
        validateMigrationResponse(params, await client.requestExactMigration(params));
      });
    });
  });

  describe('dual token', () => {
    test('mainnet v3 → unichain v4 migration throws unsupported token address', async () => {
      const params: RequestExactMigration = {
        sourcePosition: {
          chainId: v3ChainId,
          tokenId: v3TokenId,
          protocol: Protocol.UniswapV3,
        },
        migration: {
          destination: {
            chainId: 130,
            protocol: Protocol.UniswapV4,
            token0: NATIVE_ETH_ADDRESS,
            token1: '0x927B51f251480a681271180DA4de28D44EC4AfB8',
            tickLower: -1 * v3Response.tickUpper,
            tickUpper: -1 * v3Response.tickLower,
            fee: v3Response.pool.fee,
            tickSpacing: v3Response.pool.tickSpacing,
            hooks: '0x0000000000000000000000000000000000000000',
          },
          exactPath: {
            bridgeType: BridgeType.Across,
            migrationMethod: MigrationMethod.DualToken,
            slippageInBps: DEFAULT_SLIPPAGE_IN_BPS,
          },
        },
      };
      try {
        validateMigrationResponse(params, await client.requestExactMigration(params));
      } catch (e) {
        expect(e.message).toContain('Unsupported token address on given destination chain');
      }
    });
  });
});

describe('out of range v4→ migrations', () => {
  let v4ChainId: number;
  let v4TokenId: bigint;
  let v4Response: PositionWithFees;
  let v4Pool: V4Pool;

  beforeAll(async () => {
    v4ChainId = 130;
    v4TokenId = 64594n;
    v4Response = await client.getV4Position({
      chainId: v4ChainId,
      tokenId: v4TokenId,
    });
    v4Pool = v4Response.pool as unknown as V4Pool;
  });

  describe('single token', () => {
    describe('current price below requested range', () => {
      test('generate valid unichain v4 → base v4 migration', async () => {
        const sourceChainId = 130;
        // const token0 = NATIVE_ETH_ADDRESS;
        const token1 = client.chainConfigs[sourceChainId].usdcAddress;
        const fee = 500;
        const tickSpacing = 10;
        const hooks = '0x0000000000000000000000000000000000000000';

        await moduleMocker.mock('../src/actions/getV4Position.ts', () => ({
          getV4Position: mock(() => {
            const tickCurrent = 10;
            const liquidity = 1_000_000_000n;
            const pool = new V4Pool(
              Ether.onChain(sourceChainId),
              new Token(sourceChainId, token1, 18, 'USDC'),
              fee,
              tickSpacing,
              hooks,
              BigInt(TickMath.getSqrtRatioAtTick(tickCurrent).toString()).toString(),
              liquidity.toString(),
              tickCurrent
            );
            return {
              owner: ownerAddress,
              tokenId: v4TokenId,
              ...toSDKPosition(
                client.chainConfigs[130],
                new V4Position({
                  pool,
                  liquidity: 1_000_000_000_000_000_000,
                  tickLower: 50,
                  tickUpper: 100,
                })
              ),
              feeAmount0: 0n,
              feeAmount1: 0n,
            };
          }),
        }));
        const params: RequestExactMigration = {
          sourcePosition: {
            chainId: sourceChainId,
            tokenId: v4TokenId,
            protocol: Protocol.UniswapV4,
          },
          migration: {
            destination: {
              chainId: 8453,
              protocol: Protocol.UniswapV4,
              token0: NATIVE_ETH_ADDRESS,
              token1: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
              tickLower: -199230,
              tickUpper: -197230,
              fee: v4Pool.fee,
              tickSpacing: v4Pool.tickSpacing,
              hooks: '0x0000000000000000000000000000000000000000',
            },
            exactPath: {
              bridgeType: BridgeType.Across,
              migrationMethod: MigrationMethod.SingleToken,
              slippageInBps: DEFAULT_SLIPPAGE_IN_BPS,
            },
          },
        };
        validateMigrationResponse(params, await client.requestExactMigration(params));
      });
    });
    describe('current price above requested range', () => {
      test('generate valid unichain v4 → base v4 migration', async () => {
        const sourceChainId = 130;
        // const token0 = NATIVE_ETH_ADDRESS;
        const token1 = client.chainConfigs[sourceChainId].usdcAddress;
        const fee = 500;
        const tickSpacing = 10;
        const hooks = '0x0000000000000000000000000000000000000000';

        await moduleMocker.mock('../src/actions/getV4Position.ts', () => ({
          getV4Position: mock(() => {
            const tickCurrent = 100;
            const liquidity = 1_000_000_000n;
            const pool = new V4Pool(
              Ether.onChain(sourceChainId),
              new Token(sourceChainId, token1, 18, 'USDC'),
              fee,
              tickSpacing,
              hooks,
              BigInt(TickMath.getSqrtRatioAtTick(tickCurrent).toString()).toString(),
              liquidity.toString(),
              tickCurrent
            );
            return {
              owner: ownerAddress,
              tokenId: v4TokenId,
              ...toSDKPosition(
                client.chainConfigs[130],
                new V4Position({
                  pool,
                  liquidity: 1_000_000_000_000,
                  tickLower: 10,
                  tickUpper: 50,
                })
              ),
              feeAmount0: 0n,
              feeAmount1: 0n,
            };
          }),
        }));
        const params: RequestExactMigration = {
          sourcePosition: {
            chainId: 130,
            tokenId: v4TokenId,
            protocol: Protocol.UniswapV4,
          },
          migration: {
            destination: {
              chainId: 8453,
              protocol: Protocol.UniswapV4,
              token0: NATIVE_ETH_ADDRESS,
              token1: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
              tickLower: -206230,
              tickUpper: -202230,
              fee: v4Pool.fee,
              tickSpacing: v4Pool.tickSpacing,
              hooks: '0x0000000000000000000000000000000000000000',
            },
            exactPath: {
              bridgeType: BridgeType.Across,
              migrationMethod: MigrationMethod.SingleToken,
              slippageInBps: DEFAULT_SLIPPAGE_IN_BPS,
            },
          },
        };
        validateMigrationResponse(params, await client.requestExactMigration(params));
      });
    });
  });

  describe('dual token', () => {
    test('mainnet v4 → unichain v4 migration throws unsupported token address', async () => {
      const sourceChainId = 130;
      const token0 = client.chainConfigs[sourceChainId].wethAddress;
      const token1 = client.chainConfigs[sourceChainId].usdcAddress;
      const fee = 500;
      const tickSpacing = 10;
      const hooks = '0x0000000000000000000000000000000000000000';

      await moduleMocker.mock('../src/actions/getV4Position.ts', () => ({
        getV4Position: mock(() => {
          const tickCurrent = 100;
          const liquidity = 1_000_000_000n;
          const pool = new V4Pool(
            new Token(sourceChainId, token0, 18, 'WETH'),
            new Token(sourceChainId, token1, 18, 'USDC'),
            fee,
            tickSpacing,
            hooks,
            BigInt(TickMath.getSqrtRatioAtTick(tickCurrent).toString()).toString(),
            liquidity.toString(),
            tickCurrent
          );
          return {
            owner: ownerAddress,
            ...toSDKPosition(
              client.chainConfigs[130],
              new V4Position({
                pool,
                liquidity: 1_000_000_000,
                tickLower: 10,
                tickUpper: 500,
              })
            ),
            feeAmount0: 0n,
            feeAmount1: 0n,
          };
        }),
      }));
      const params: RequestExactMigration = {
        sourcePosition: {
          chainId: 130,
          tokenId: v4TokenId,
          protocol: Protocol.UniswapV4,
        },
        migration: {
          destination: {
            chainId: 8453,
            protocol: Protocol.UniswapV4,
            token0: NATIVE_ETH_ADDRESS,
            token1: '0x078D782b760474a361dDA0AF3839290b0EF57AD6',
            tickLower: -206230,
            tickUpper: -202230,
            fee: v4Pool.fee,
            tickSpacing: v4Pool.tickSpacing,
            hooks: '0x0000000000000000000000000000000000000000',
          },
          exactPath: {
            bridgeType: BridgeType.Across,
            migrationMethod: MigrationMethod.DualToken,
            slippageInBps: DEFAULT_SLIPPAGE_IN_BPS,
          },
        },
      };
      expect(async () => await client.requestExactMigration(params)).toThrow(
        'Unsupported token address on given destination chain'
      );
    });
  });
});

describe('pool creation:', () => {
  describe('v4 settler ', () => {
    const mockNoV4Pool = async (): Promise<void> => {
      await moduleMocker.mock('../src/actions/getV4Pool.ts', () => ({
        fetchRawV4PoolData: mock(async () => {
          return [
            { result: [0n, 0, 0, 0], status: 'success' },
            { result: 0n, status: 'success' },
          ];
        }),
      }));
    };

    test('does not create pool if no sqrtPriceX96 provided', async () => {
      mockNoV4Pool();
      const params: RequestExactMigration = {
        sourcePosition: {
          chainId: 1,
          tokenId: 891583n,
          protocol: Protocol.UniswapV3,
        },
        migration: {
          destination: {
            chainId: 42161,
            protocol: Protocol.UniswapV4,
            token0: NATIVE_ETH_ADDRESS,
            token1: '0x53691596d1BCe8CEa565b84d4915e69e03d9C99d',
            tickLower: -887220,
            tickUpper: 887220,
            fee: 10000,
            tickSpacing: 200,
            hooks: '0x0000000000000000000000000000000000000000',
          },
          exactPath: {
            bridgeType: BridgeType.Across,
            migrationMethod: MigrationMethod.DualToken,
            slippageInBps: DEFAULT_SLIPPAGE_IN_BPS,
          },
        },
      };
      expect(async () => await client.requestExactMigration(params)).toThrow(
        'Destination pool does not exist and no sqrtPriceX96 provided for initialization'
      );
    });

    test('single token migration does not create pool if swap needed', async () => {
      mockNoV4Pool();
      const params: RequestExactMigration = {
        sourcePosition: {
          chainId: 1,
          tokenId: 891583n,
          protocol: Protocol.UniswapV3,
        },
        migration: {
          destination: {
            chainId: 42161,
            protocol: Protocol.UniswapV4,
            token0: '0x53691596d1BCe8CEa565b84d4915e69e03d9C99d',
            token1: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
            tickLower: -887220,
            tickUpper: 887220,
            fee: 10000,
            tickSpacing: 200,
            hooks: '0x0000000000000000000000000000000000000000',
            sqrtPriceX96: 736087614829673861315061733n,
          },
          exactPath: {
            bridgeType: BridgeType.Across,
            migrationMethod: MigrationMethod.SingleToken,
            slippageInBps: DEFAULT_SLIPPAGE_IN_BPS,
          },
        },
      };
      expect(async () => await client.requestExactMigration(params)).toThrow(
        'No liquidity for required swap in destination pool'
      );
    });

    test('dual token migration creates pool if sqrtPriceX96 provided', async () => {
      mockNoV4Pool();
      const params: RequestExactMigration = {
        sourcePosition: {
          chainId: 1,
          tokenId: 891583n,
          protocol: Protocol.UniswapV3,
        },
        migration: {
          destination: {
            chainId: 42161,
            protocol: Protocol.UniswapV4,
            token0: '0x53691596d1BCe8CEa565b84d4915e69e03d9C99d',
            token1: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
            tickLower: -887200,
            tickUpper: 887200,
            fee: 10000,
            tickSpacing: 200,
            hooks: '0x0000000000000000000000000000000000000000',
            sqrtPriceX96: 736087614829673861315061733n,
          },
          exactPath: {
            bridgeType: BridgeType.Across,
            migrationMethod: MigrationMethod.DualToken,
            slippageInBps: DEFAULT_SLIPPAGE_IN_BPS,
          },
        },
      };
      const response = await client.requestExactMigration(params);
      expect(response.destPosition.pool.liquidity).toBe(0n);
      validateMigrationResponse(params, response);
    });

    test('single token migration creates pool if no swap is needed', async () => {
      mockNoV4Pool();
      const params: RequestExactMigration = {
        sourcePosition: {
          chainId: 1,
          tokenId: 891583n,
          protocol: Protocol.UniswapV3,
        },
        migration: {
          destination: {
            chainId: 42161,
            protocol: Protocol.UniswapV4,
            token0: NATIVE_ETH_ADDRESS,
            token1: '0x53691596d1BCe8CEa565b84d4915e69e03d9C99d',
            tickLower: 887000,
            tickUpper: 887200,
            fee: 10000,
            tickSpacing: 200,
            hooks: '0x0000000000000000000000000000000000000000',
            sqrtPriceX96: 736087614829673861315061733n,
          },
          exactPath: {
            bridgeType: BridgeType.Across,
            migrationMethod: MigrationMethod.SingleToken,
            slippageInBps: DEFAULT_SLIPPAGE_IN_BPS,
          },
        },
      };
      const response = await client.requestExactMigration(params);
      expect(response.destPosition.pool.liquidity).toBe(0n);
      validateMigrationResponse(params, response);
    });
  });

  const mockNoV3Pool = async (): Promise<void> => {
    await moduleMocker.mock('../src/actions/getV3Pool.ts', () => ({
      fetchRawV3PoolData: mock(async () => {
        return [{ status: 'failure' }, { status: 'failure' }];
      }),
    }));
  };

  describe('v3 settler ', () => {
    test('does not create pool if no sqrtPriceX96 provided', async () => {
      await mockNoV3Pool();
      const params: RequestExactMigration = {
        sourcePosition: {
          chainId: 1,
          tokenId: 891583n,
          protocol: Protocol.UniswapV3,
        },
        migration: {
          destination: {
            chainId: 42161,
            protocol: Protocol.UniswapV3,
            token0: '0x53691596d1BCe8CEa565b84d4915e69e03d9C99d',
            token1: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
            tickLower: -887220,
            tickUpper: 887220,
            fee: 500,
          },
          exactPath: {
            bridgeType: BridgeType.Across,
            migrationMethod: MigrationMethod.DualToken,
            slippageInBps: DEFAULT_SLIPPAGE_IN_BPS,
          },
        },
      };
      expect(async () => await client.requestExactMigration(params)).toThrow(
        'Destination pool does not exist and no sqrtPriceX96 provided for initialization'
      );
    });

    test('single token migration does not create pool if swap needed', async () => {
      await mockNoV3Pool();
      const params: RequestExactMigration = {
        sourcePosition: {
          chainId: 1,
          tokenId: 891583n,
          protocol: Protocol.UniswapV3,
        },
        migration: {
          destination: {
            chainId: 42161,
            protocol: Protocol.UniswapV3,
            token0: '0x53691596d1BCe8CEa565b84d4915e69e03d9C99d',
            token1: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
            tickLower: -887220,
            tickUpper: 887220,
            fee: 500,
            sqrtPriceX96: 736087614829673861315061733n,
          },
          exactPath: {
            bridgeType: BridgeType.Across,
            migrationMethod: MigrationMethod.SingleToken,
            slippageInBps: DEFAULT_SLIPPAGE_IN_BPS,
          },
        },
      };
      expect(async () => await client.requestExactMigration(params)).toThrow(
        'No liquidity for required swap in destination pool'
      );
    });

    test('dual token migration creates pool if sqrtPriceX96 provided', async () => {
      await mockNoV3Pool();
      const params: RequestExactMigration = {
        sourcePosition: {
          chainId: 1,
          tokenId: 891583n,
          protocol: Protocol.UniswapV3,
        },
        migration: {
          destination: {
            chainId: 42161,
            protocol: Protocol.UniswapV3,
            token0: '0x53691596d1BCe8CEa565b84d4915e69e03d9C99d',
            token1: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
            tickLower: -887200,
            tickUpper: 887200,
            fee: 500,
            sqrtPriceX96: 736087614829673861315061733n,
          },
          exactPath: {
            bridgeType: BridgeType.Across,
            migrationMethod: MigrationMethod.DualToken,
            slippageInBps: DEFAULT_SLIPPAGE_IN_BPS,
          },
        },
      };
      const response = await client.requestExactMigration(params);
      expect(response.destPosition.pool.liquidity).toBe(0n);
      validateMigrationResponse(params, response);
    });

    test('single token migration creates pool if no swap is needed', async () => {
      await mockNoV3Pool();
      const params: RequestExactMigration = {
        sourcePosition: {
          chainId: 1,
          tokenId: 891583n,
          protocol: Protocol.UniswapV3,
        },
        migration: {
          destination: {
            chainId: 42161,
            protocol: Protocol.UniswapV3,
            token0: '0x53691596d1BCe8CEa565b84d4915e69e03d9C99d',
            token1: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
            tickLower: -887200,
            tickUpper: -887000,
            fee: 500,
            sqrtPriceX96: 736087614829673861315061733n,
          },
          exactPath: {
            bridgeType: BridgeType.Across,
            migrationMethod: MigrationMethod.SingleToken,
            slippageInBps: DEFAULT_SLIPPAGE_IN_BPS,
          },
        },
      };
      const response = await client.requestExactMigration(params);
      expect(response.destPosition.pool.liquidity).toBe(0n);
      validateMigrationResponse(params, response);
    });
  });
});
