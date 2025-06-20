import { type Abi } from 'viem';
import { type ChainConfig } from '../chains';
import PoolContract from '@uniswap/v3-core/artifacts/contracts/UniswapV3Pool.sol/UniswapV3Pool.json';
import { computePoolAddress, Pool, Position } from '@uniswap/v3-sdk';
import { Token as UniswapSDKToken } from '@uniswap/sdk-core';
import { erc20Abi } from 'viem';
import type { PositionWithFees } from '../types';
import { toSDKPosition } from '../utils/position';
import type { IUniswapPositionParams } from '@/types/internal';
const MAX_UINT128: bigint = BigInt(2) ** BigInt(127);

type IPositionsCallResult = [
  bigint,
  string,
  string,
  string,
  number,
  number,
  number,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
];
type IPoolCallResult = [[bigint, number, number, number, number, number, boolean], bigint];
type ILPFeeCallResult = [bigint, bigint];

export type IV3PositionsCallType = {
  token0: `0x${string}`;
  token1: `0x${string}`;
  feeTier: number;
  tickLower: number;
  tickUpper: number;
  liquidity: bigint;
};

export const getV3Position = async (
  chainConfig: ChainConfig,
  params: IUniswapPositionParams
): Promise<PositionWithFees> => {
  const publicClient = chainConfig.publicClient;
  const positionManagerResult = await publicClient?.multicall({
    contracts: [
      {
        address: chainConfig.v3NftPositionManagerContract.address as `0x${string}`,
        abi: chainConfig.v3NftPositionManagerContract.abi,
        functionName: 'ownerOf',
        args: [params.tokenId],
      },
      {
        address: chainConfig.v3NftPositionManagerContract.address as `0x${string}`,
        abi: chainConfig.v3NftPositionManagerContract.abi,
        functionName: 'positions',
        args: [params.tokenId],
      },
    ],
    multicallAddress: chainConfig.multicallAddress,
  });

  const owner = positionManagerResult?.[0].result as `0x${string}`;
  const positionsCallResult = positionManagerResult?.[1].result as IPositionsCallResult;

  const positionsCallData = {
    token0: positionsCallResult[2],
    token1: positionsCallResult[3],
    feeTier: positionsCallResult[4],
    tickLower: positionsCallResult[5],
    tickUpper: positionsCallResult[6],
    liquidity: positionsCallResult[7],
  } as IV3PositionsCallType;

  const LPFeeData: ILPFeeCallResult = (
    await publicClient!.simulateContract({
      address: chainConfig.v3NftPositionManagerContract.address as `0x${string}`,
      abi: chainConfig.v3NftPositionManagerContract.abi,
      functionName: 'collect',
      args: [
        {
          tokenId: params.tokenId,
          recipient: owner,
          amount0Max: MAX_UINT128,
          amount1Max: MAX_UINT128,
        },
      ] as const,
      account: owner, // need to simulate the call as the owner
    })
  ).result as ILPFeeCallResult;

  // fetch pool data
  const poolAddress = computePoolAddress({
    factoryAddress: chainConfig.v3FactoryAddress as `0x${string}`,
    tokenA: new UniswapSDKToken(chainConfig.chain.id, positionsCallData.token0, 18), // only address is needed for computePoolAddress
    tokenB: new UniswapSDKToken(chainConfig.chain.id, positionsCallData.token1, 18), // only address is needed for computePoolAddress
    fee: positionsCallData.feeTier,
  });
  const poolContract = {
    address: poolAddress as `0x${string}`,
    abi: PoolContract.abi as Abi,
  };
  const poolCallResult = (
    await publicClient?.multicall({
      contracts: [
        {
          ...poolContract,
          functionName: 'slot0',
        },
        {
          ...poolContract,
          functionName: 'liquidity',
        },
      ],
      multicallAddress: chainConfig.multicallAddress,
    })
  )?.map((result) => result.result) as IPoolCallResult;

  const poolData = {
    sqrtPriceX96: poolCallResult[0][0],
    liquidity: poolCallResult[1],
    tick: poolCallResult[0][1],
  };

  // fetch tokens; could combine with pool data call to avoid an extra call
  const tokenList = [positionsCallData.token0, positionsCallData.token1] as `0x${string}`[];
  const tokenCalls = tokenList
    .map((tokenAddress) => {
      const tokenContract = {
        address: tokenAddress,
        abi: erc20Abi,
      };
      return [
        {
          ...tokenContract,
          functionName: 'decimals',
        },
        {
          ...tokenContract,
          functionName: 'symbol',
        },
        {
          ...tokenContract,
          functionName: 'name',
        },
      ];
    })
    .flat(1);

  const tokenData = (
    await chainConfig.publicClient?.multicall({
      contracts: tokenCalls,
      multicallAddress: chainConfig.multicallAddress,
    })
  )
    ?.filter((r) => r.status === 'success')
    .map((r) => r.result as number | string)
    .reduce(
      (resultArray: (number | string)[][], item, index) => {
        const chunkIndex = Math.floor(index / 3);
        if (chunkIndex < 0 || chunkIndex >= 2) {
          throw new Error('Invalid token data chunk index');
        }
        resultArray[chunkIndex] = resultArray[chunkIndex] || [];
        resultArray[chunkIndex].push(item);
        return resultArray;
      },
      [] as (number | string)[][]
    );

  const pool = new Pool(
    new UniswapSDKToken(
      params.chainId,
      positionsCallData.token0,
      tokenData?.[0]?.[0] as number,
      tokenData?.[0]?.[1] as string,
      tokenData?.[0]?.[2] as string
    ),
    new UniswapSDKToken(
      params.chainId,
      positionsCallData.token1,
      tokenData?.[1]?.[0] as number,
      tokenData?.[1]?.[1] as string,
      tokenData?.[1]?.[2] as string
    ),
    positionsCallData.feeTier,
    poolData.sqrtPriceX96.toString(),
    poolData.liquidity.toString(),
    poolData.tick
  );
  const position = new Position({
    pool,
    tickLower: positionsCallData.tickLower,
    tickUpper: positionsCallData.tickUpper,
    liquidity: positionsCallData.liquidity.toString(),
  });

  return {
    owner,
    tokenId: params.tokenId,
    ...toSDKPosition(chainConfig, position),
    feeAmount0: LPFeeData[0],
    feeAmount1: LPFeeData[1],
  };
};
