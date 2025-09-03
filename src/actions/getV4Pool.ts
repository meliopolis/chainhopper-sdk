import { TickMath } from '@uniswap/v3-sdk';
import { type ChainConfig } from '../chains';
import { getTokens } from './getTokens';
import { Pool, type PoolKey } from '@uniswap/v4-sdk';
import JSBI from 'jsbi';
import type { MulticallReturnType } from 'viem';

type IPoolCallResult = [[bigint, number, number, number], bigint];

export const getV4Pool = async (chainConfig: ChainConfig, poolKey: PoolKey, sqrtPriceX96?: bigint): Promise<Pool> => {
  const tokens = await getTokens(chainConfig, [poolKey.currency0 as `0x${string}`, poolKey.currency1 as `0x${string}`]);
  const poolId = Pool.getPoolId(tokens[0], tokens[1], poolKey.fee, poolKey.tickSpacing, poolKey.hooks);
  const poolData = await fetchRawV4PoolData(chainConfig, poolId);
  if (!poolData || poolData.some((p) => p.status !== 'success')) {
    throw new Error('Failed to get pool data');
  }
  const poolDataResults = poolData.map((p) => p.result) as IPoolCallResult;
  const poolNotInitialized = poolDataResults[0][0] === 0n;
  const initializePool = poolNotInitialized && sqrtPriceX96 && sqrtPriceX96 > 0;

  let pool: Pool;

  if (initializePool) {
    const tickCurrent = TickMath.getTickAtSqrtRatio(JSBI.BigInt(sqrtPriceX96.toString()));
    pool = new Pool(
      tokens[0],
      tokens[1],
      poolKey.fee,
      poolKey.tickSpacing,
      poolKey.hooks,
      sqrtPriceX96.toString(),
      '0',
      tickCurrent
    );
  } else {
    if (poolNotInitialized) {
      throw new Error('Destination pool does not exist and no sqrtPriceX96 provided for initialization');
    }
    pool = new Pool(
      tokens[0],
      tokens[1],
      poolKey.fee,
      poolKey.tickSpacing,
      poolKey.hooks,
      poolDataResults[0][0].toString(), // sqrtPriceLimitX96
      poolDataResults[1].toString(), // liquidity
      poolDataResults[0][1] // tickCurrent
    );
  }

  return pool;
};

export const fetchRawV4PoolData = async (
  chainConfig: ChainConfig,
  poolId: string
): Promise<MulticallReturnType | undefined> => {
  return await chainConfig.publicClient?.multicall({
    contracts: [
      {
        ...chainConfig.v4StateViewContract,
        functionName: 'getSlot0',
        args: [poolId],
      },
      {
        ...chainConfig.v4StateViewContract,
        functionName: 'getLiquidity',
        args: [poolId],
      },
    ],
  });
};
