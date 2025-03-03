import { type ChainConfig } from "../chains";
import { PoolContractABI } from "../abis/v3PoolContract";
import { computePoolAddress } from "@uniswap/v3-sdk";
import { getTokens } from "./getTokens";
import { Pool } from "@uniswap/v3-sdk";

type IPoolCallResult = [[bigint, number, number, number, number, number, boolean ], bigint];


export const getV3Pool = async (chainConfig: ChainConfig, token0: `0x${string}`, token1: `0x${string}`, feeTier: number) => {
  const tokens = await getTokens(chainConfig, [token0, token1]);
  const address = computePoolAddress({
    factoryAddress: chainConfig.v3FactoryAddress,
    tokenA: tokens[0],
    tokenB: tokens[1],
    fee: feeTier,
  });
  const poolContract = {
    address: address as `0x${string}`,
    abi: PoolContractABI,
  }
  const poolData = (await chainConfig.publicClient?.multicall({
    contracts: [
      {
        ...poolContract,
        functionName: 'slot0',
        args: []
      },
      {
        ...poolContract,
        functionName: 'liquidity',
        args: []
      },
    ]
  }))
  // check that all were successful
  if (poolData?.some((p) => p.status !== 'success')) {
    throw new Error('Failed to get pool data');
  }
  const poolDataResults = poolData?.map(p => p.result) as IPoolCallResult;
  return new Pool(
    tokens[0],
    tokens[1],
    feeTier,
    poolDataResults[0][0].toString(),
    poolDataResults[1].toString(),
    poolDataResults[0][1]
  );

}