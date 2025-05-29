import { type ChainConfig } from '../chains';
import { PoolContractABI } from '../abis/v3PoolContract';
import { computePoolAddress, TickMath } from '@uniswap/v3-sdk';
import { getTokens } from './getTokens';
import { Pool } from '@uniswap/v3-sdk';
import type { Token } from '@uniswap/sdk-core';
import JSBI from 'jsbi';
import type { MulticallReturnType } from 'viem';

type IPoolCallResult = [[bigint, number, number, number, number, number, boolean], bigint];

export const getV3Pool = async (
  chainConfig: ChainConfig,
  token0: `0x${string}`,
  token1: `0x${string}`,
  feeTier: number,
  sqrtPriceX96?: bigint
): Promise<Pool> => {
  const tokens = await getTokens(chainConfig, [token0, token1]);
  if (tokens.some((t) => t.isNative)) {
    throw new Error('Native tokens not supported on Uniswap v3');
  }
  const address = computePoolAddress({
    factoryAddress: chainConfig.v3FactoryAddress,
    tokenA: tokens[0] as Token,
    tokenB: tokens[1] as Token,
    fee: feeTier,
  });
  const poolContract = {
    address: address as `0x${string}`,
    abi: PoolContractABI,
  };

  const poolData = await fetchRawV3PoolData(chainConfig, poolContract);

  let poolNotInitialized;
  if (!poolData || poolData.some((p) => p.status !== 'success')) {
    poolNotInitialized = true;
  }

  const initializePool = poolNotInitialized && sqrtPriceX96 && sqrtPriceX96 > 0;

  let pool: Pool;

  if (initializePool) {
    const tickCurrent = TickMath.getTickAtSqrtRatio(JSBI.BigInt(sqrtPriceX96.toString()));
    pool = new Pool(tokens[0] as Token, tokens[1] as Token, feeTier, sqrtPriceX96.toString(), '0', tickCurrent);
  } else {
    if (poolNotInitialized)
      throw new Error('Destination pool does not exist and no sqrtPriceX96 provided for initialization');
    const poolDataResults = poolData!.map((p) => p.result) as IPoolCallResult;
    pool = new Pool(
      tokens[0] as Token,
      tokens[1] as Token,
      feeTier,
      poolDataResults[0][0].toString(),
      poolDataResults[1].toString(),
      poolDataResults[0][1]
    );
  }
  return pool;
};

export const fetchRawV3PoolData = async (
  chainConfig: ChainConfig,
  poolContract: { address: `0x${string}`; abi: typeof PoolContractABI }
): Promise<MulticallReturnType | undefined> => {
  return await chainConfig.publicClient?.multicall({
    contracts: [
      {
        ...poolContract,
        functionName: 'slot0',
        args: [],
      },
      {
        ...poolContract,
        functionName: 'liquidity',
        args: [],
      },
    ],
  });
};
