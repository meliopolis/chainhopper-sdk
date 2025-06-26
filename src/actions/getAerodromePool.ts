import { type ChainConfig } from '../chains';
import { TickMath } from '@uniswap/v3-sdk';
import { getTokens } from './getTokens';
import { Pool } from '@uniswap/v3-sdk';
import type { Token } from '@uniswap/sdk-core';
import JSBI from 'jsbi';
import type { Abi, MulticallReturnType } from 'viem';
import { AerodromeFactoryABI } from '../abis/AerodromeFactory';
import { AerodromePoolContractABI } from '@/abis/AerodromePoolContract';
import { tickSpacingToFee } from '@/utils/aerodrome';

type IPoolCallResult = [[bigint, number, number, number, number, number, boolean], bigint];

export const getAerodromePool = async (
  chainConfig: ChainConfig,
  token0: `0x${string}`,
  token1: `0x${string}`,
  tickSpacing: number,
  sqrtPriceX96?: bigint
): Promise<Pool> => {
  const tokens = await getTokens(chainConfig, [token0, token1]);
  if (tokens.some((t) => t.isNative)) {
    throw new Error('Native tokens not supported on Aerodrome');
  }
  const poolAddress = (await chainConfig.publicClient?.simulateContract({
    address: '0x5e7BB104d84c7CB9B682AaC2F3d509f5F406809A' as `0x${string}`,
    abi: AerodromeFactoryABI as Abi,
    functionName: 'getPool',
    args: [token0, token1, tickSpacing],
  })) as {
    result: `0x${string}`;
  };
  const poolContract = {
    address: poolAddress.result as `0x${string}`,
    abi: AerodromePoolContractABI,
  };

  const poolData = await fetchRawAerodromePoolData(chainConfig, poolContract);

  let poolNotInitialized;
  if (!poolData || poolData.some((p) => p.status !== 'success')) {
    poolNotInitialized = true;
  }

  const initializePool = poolNotInitialized && sqrtPriceX96 && sqrtPriceX96 > 0;

  let pool: Pool;

  if (initializePool) {
    const tickCurrent = TickMath.getTickAtSqrtRatio(JSBI.BigInt(sqrtPriceX96.toString()));
    pool = new Pool(
      tokens[0] as Token,
      tokens[1] as Token,
      tickSpacingToFee(tickSpacing),
      sqrtPriceX96.toString(),
      '0',
      tickCurrent
    );
  } else {
    if (poolNotInitialized)
      throw new Error('Destination pool does not exist and no sqrtPriceX96 provided for initialization');
    const poolDataResults = poolData!.map((p) => p.result) as IPoolCallResult;
    pool = new Pool(
      tokens[0] as Token,
      tokens[1] as Token,
      tickSpacingToFee(tickSpacing),
      poolDataResults[0][0].toString(),
      poolDataResults[1].toString(),
      poolDataResults[0][1]
    );
  }
  return pool;
};

export const fetchRawAerodromePoolData = async (
  chainConfig: ChainConfig,
  poolContract: { address: `0x${string}`; abi: typeof AerodromePoolContractABI }
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
