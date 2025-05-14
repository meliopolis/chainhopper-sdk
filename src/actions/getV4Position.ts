import { type Currency, CurrencyAmount } from '@uniswap/sdk-core';
import { Pool, Position, type PoolKey } from '@uniswap/v4-sdk';
import type { ChainConfig } from '../chains';
import type { IUniswapPositionParams } from '../types';
import { getV4Pool } from './getV4Pool';
import { encodePacked, keccak256, pad } from 'viem';
import { subIn256 } from '../utils/helpers';

export type IV4PositionWithUncollectedFees = {
  owner: `0x${string}`;
  position: Position;
  uncollectedFees: {
    amount0: CurrencyAmount<Currency>;
    amount1: CurrencyAmount<Currency>;
  };
};

type IPoolAndPositionCallResult = [PoolKey, bigint];

const extract24BitsAsSigned = (positionInfo: bigint, shift: bigint): number => {
  const bits = (positionInfo >> shift) & ((1n << 24n) - 1n);
  const isNegative = (bits & (1n << 23n)) !== 0n;
  return isNegative
    ? Number(bits | (BigInt(-1) << 24n))
    : Number(bits);
};

// ── 300ms ROLLING CACHE ───────────────────────────────────────────────────────
const v4PositionCache = new Map<string, Promise<IV4PositionWithUncollectedFees>>();

export const getV4Position = async (
  chainConfig: ChainConfig,
  params: IUniswapPositionParams
): Promise<IV4PositionWithUncollectedFees> => {
  const key = `${chainConfig.chainId}:${params.tokenId}`;
  if (v4PositionCache.has(key)) {
    return v4PositionCache.get(key)!;
  }

  const p = (async (): Promise<IV4PositionWithUncollectedFees> => {
    const { tokenId } = params;

    // 1) getPoolAndPositionInfo + getPositionLiquidity + ownerOf
    const raw = await chainConfig.publicClient!.multicall({
      contracts: [
        {
          ...chainConfig.v4PositionManagerContract,
          functionName: 'getPoolAndPositionInfo',
          args: [tokenId],
        },
        {
          ...chainConfig.v4PositionManagerContract,
          functionName: 'getPositionLiquidity',
          args: [tokenId],
        },
        {
          ...chainConfig.v4PositionManagerContract,
          functionName: 'ownerOf',
          args: [tokenId],
        },
      ],
    });
    const [[poolKey, packed], liquidity, owner] = raw.map(r => r.result) as [IPoolAndPositionCallResult, bigint, `0x${string}`];
    const tickLower = extract24BitsAsSigned(packed, 8n);
    const tickUpper = extract24BitsAsSigned(packed, 32n);

    // 2) fetch pool object
    const pool = await getV4Pool(chainConfig, poolKey);

    // 3) feeGrowthInside + positionInfo
    const poolId = Pool.getPoolId(pool.token0, pool.token1, pool.fee, pool.tickSpacing, pool.hooks);
    const positionId = keccak256(
      encodePacked(
        ['address', 'int24', 'int24', 'bytes32'],
        [
          chainConfig.v4PositionManagerContract.address as `0x${string}`,
          tickLower,
          tickUpper,
          pad(tokenId.toString(16) as `0x${string}`)
        ]
      )
    );
    const [[fee0X128, fee1X128], [_, last0, last1]] = (await chainConfig.publicClient!.multicall({
      contracts: [
        {
          ...chainConfig.v4StateViewContract,
          functionName: 'getFeeGrowthInside',
          args: [poolId, tickLower, tickUpper],
        },
        {
          ...chainConfig.v4StateViewContract,
          functionName: 'getPositionInfo',
          args: [poolId, positionId],
        },
      ],
    })).map(r => r.result) as [[bigint, bigint], [bigint, bigint, bigint]];

    // 4) compute uncollected fees
    const delta0 = subIn256(fee0X128, last0);
    const delta1 = subIn256(fee1X128, last1);
    const uncollected0 = (liquidity * delta0) / (1n << 128n);
    const uncollected1 = (liquidity * delta1) / (1n << 128n);

    return {
      owner,
      position: new Position({
        pool,
        liquidity: liquidity.toString(),
        tickLower,
        tickUpper,
      }),
      uncollectedFees: {
        amount0: CurrencyAmount.fromRawAmount(pool.token0, uncollected0.toString()),
        amount1: CurrencyAmount.fromRawAmount(pool.token1, uncollected1.toString()),
      },
    };
  })();

  v4PositionCache.set(key, p);
  setTimeout(() => v4PositionCache.delete(key), 300);
  return p;
};