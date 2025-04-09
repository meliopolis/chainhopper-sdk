import { type ChainConfig } from '../chains';
import { getTokens } from './getTokens';
import { Pool, type PoolKey } from '@uniswap/v4-sdk';

type IPoolCallResult = [[bigint, number, number, number], bigint];

export const getV4Pool = async (chainConfig: ChainConfig, poolKey: PoolKey): Promise<Pool> => {
  const tokens = await getTokens(chainConfig, [poolKey.currency0 as `0x${string}`, poolKey.currency1 as `0x${string}`]);
  const poolId = Pool.getPoolId(tokens[0], tokens[1], poolKey.fee, poolKey.tickSpacing, poolKey.hooks);
  const poolData = await chainConfig.publicClient?.multicall({
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
  }); //as [bigint, number]; // [sqrtPriceX96, tickCurrent]

  if (!poolData || poolData.some((p) => p.status !== 'success')) {
    throw new Error('Failed to get pool data');
  }
  const poolDataResults = poolData.map((p) => p.result) as IPoolCallResult;
  return new Pool(
    tokens[0],
    tokens[1],
    poolKey.fee,
    poolKey.tickSpacing,
    poolKey.hooks,
    poolDataResults[0][0].toString(), // sqrtPriceLimitX96
    poolDataResults[1].toString(), // liquidity
    poolDataResults[0][1] // tickCurrent
  );
};
