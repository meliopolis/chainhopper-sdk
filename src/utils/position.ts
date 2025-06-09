import { computePoolAddress, type Pool as UniswapSDKV3Pool, type Position as V3Position } from '@uniswap/v3-sdk';
import { Pool as UniswapSDKV4Pool, type Position as V4Position } from '@uniswap/v4-sdk';
import type { Position, PositionWithPath, v3Pool, v4Pool } from '../types/sdk';
import { NATIVE_ETH_ADDRESS, Protocol } from './constants';
import type { ChainConfig } from '../chains';

const Q192 = 2n ** 192n;

export const positionValue = (position: PositionWithPath, tokenUnits: 0 | 1, includeRefunds = false): bigint => {
  let { pool, amount0, amount1 } = position;

  let adjAmount0 = amount0;
  let adjAmount1 = amount1;
  if (includeRefunds) {
    position.amount0Refund && (adjAmount0 = amount0 + position.amount0Refund);
    position.amount1Refund && (adjAmount1 = amount1 + position.amount1Refund);
  }

  const P = pool.sqrtPriceX96! ** 2n;

  if (tokenUnits === 1) {
    const value0 = (adjAmount0 * P) / Q192;
    return adjAmount1 + value0;
  } else {
    const value1 = (adjAmount1 * Q192) / P;
    return adjAmount0 + value1;
  }
};

export const toSDKPool = (chainConfig: ChainConfig, pool: UniswapSDKV3Pool | UniswapSDKV4Pool): v3Pool | v4Pool => {
  const isV4Pool = 'hooks' in pool;
  const poolAddress = isV4Pool
    ? ('0x' as `0x${string}`)
    : computePoolAddress({
        factoryAddress: chainConfig.v3FactoryAddress,
        tokenA: pool.token0,
        tokenB: pool.token1,
        fee: pool.fee,
      });

  const poolId = isV4Pool
    ? UniswapSDKV4Pool.getPoolId(pool.token0, pool.token1, pool.fee, pool.tickSpacing, pool.hooks)
    : '0x';

  const sdkPool = {
    // protocol: isV4Pool ? Protocol.UniswapV4 : Protocol.UniswapV3,
    chainId: pool.chainId,
    token0: {
      chainId: pool.chainId,
      address: pool.token0.isNative ? NATIVE_ETH_ADDRESS : (pool.token0.wrapped.address as `0x${string}`),
      decimals: pool.token0.decimals,
      symbol: pool.token0.symbol,
      name: pool.token0.name,
    },
    token1: {
      chainId: pool.chainId,
      address: pool.token1.wrapped.address as `0x${string}`,
      decimals: pool.token1.decimals,
      symbol: pool.token1.symbol,
      name: pool.token1.name,
    },
    fee: pool.fee,
    sqrtPriceX96: BigInt(pool.sqrtRatioX96.toString()),
    liquidity: BigInt(pool.liquidity.toString()),
    tick: pool.tickCurrent,
    tickSpacing: pool.tickSpacing,
    ...(isV4Pool && { hooks: pool.hooks }),
  };
  if (isV4Pool) {
    return {
      protocol: Protocol.UniswapV4,
      ...sdkPool,
      poolId,
    } as v4Pool;
  } else {
    return {
      protocol: Protocol.UniswapV3,
      ...sdkPool,
      poolAddress,
    } as v3Pool;
  }
};

export const toSDKPosition = (
  chainConfig: ChainConfig,
  position: V3Position | V4Position,
  slippagePosition?: V3Position | V4Position,
  expectedRefund?: { amount0Refund: bigint; amount1Refund: bigint }
): Position => {
  const { pool, tickLower, tickUpper, liquidity, amount0, amount1 } = position;
  return {
    pool: toSDKPool(chainConfig, pool),
    tickLower,
    tickUpper,
    liquidity: BigInt(liquidity.toString()),
    amount0: BigInt(amount0.quotient.toString()),
    amount1: BigInt(amount1.quotient.toString()),
    ...(slippagePosition && {
      amount0Min: BigInt(slippagePosition.amount0.quotient.toString()),
      amount1Min: BigInt(slippagePosition.amount1.quotient.toString()),
    }),
    ...(expectedRefund || {}),
  };
};
