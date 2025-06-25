import { Pool, Position, type PoolKey } from '@uniswap/v4-sdk';
import type { ChainConfig } from '../chains';
import type { PositionWithFees } from '../types';
import { getV4Pool } from './getV4Pool';
import { encodePacked, keccak256, pad } from 'viem';
import { subIn256 } from '../utils/helpers';
import { toSDKPosition } from '../utils/position';
import type { IPositionParams } from '@/types/internal';

type IPoolAndPositionCallResult = [PoolKey, bigint];

const extract24BitsAsSigned = (positionInfo: bigint, shift: bigint): number => {
  // Extract 24 bits
  const bits = (positionInfo >> shift) & ((1n << 24n) - 1n);

  // Check if the sign bit (bit 23) is set
  const isNegative = (bits & (1n << 23n)) !== 0n;
  if (isNegative) {
    // If negative, perform sign extension by setting all higher bits to 1
    // We subtract 2^24 to get the correct negative value
    return Number(bits | (BigInt(-1) << 24n));
  } else {
    // If positive, just convert to number
    return Number(bits);
  }
};

export const getV4Position = async (chainConfig: ChainConfig, params: IPositionParams): Promise<PositionWithFees> => {
  const { tokenId } = params;

  // get position details
  const poolAndPositionCallResult = (
    await chainConfig.publicClient?.multicall({
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
    })
  )?.map((result) => result.result) as [IPoolAndPositionCallResult, bigint, `0x${string}`];

  const poolKey = poolAndPositionCallResult[0][0];
  const tickLower = extract24BitsAsSigned(poolAndPositionCallResult[0][1], 8n);
  const tickUpper = extract24BitsAsSigned(poolAndPositionCallResult[0][1], 32n);
  const liquidity = poolAndPositionCallResult[1];
  const owner = poolAndPositionCallResult[2];

  // get pool data
  const pool = await getV4Pool(chainConfig, poolKey);

  const poolId = Pool.getPoolId(pool.token0, pool.token1, pool.fee, pool.tickSpacing, pool.hooks);
  const positionId = keccak256(
    encodePacked(
      ['address', 'int24', 'int24', 'bytes32'],
      [
        chainConfig.v4PositionManagerContract?.address as `0x${string}`,
        tickLower as number,
        tickUpper as number,
        pad(tokenId?.toString(16) as `0x${string}`),
      ]
    )
  );
  const feeGrowthCallResult = (
    await chainConfig.publicClient?.multicall({
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
    })
  )?.map((result) => result.result) as [[bigint, bigint], [bigint, bigint, bigint]];

  // get uncollected fees
  const feeGrowthInside0X128 = feeGrowthCallResult[0][0];
  const feeGrowthInside1X128 = feeGrowthCallResult[0][1];
  const feeGrowthInside0LastX128 = feeGrowthCallResult[1][1];
  const feeGrowthInside1LastX128 = feeGrowthCallResult[1][2];
  const feeGrowthDelta0: bigint = subIn256(feeGrowthInside0X128, feeGrowthInside0LastX128);
  const feeGrowthDelta1: bigint = subIn256(feeGrowthInside1X128, feeGrowthInside1LastX128);

  const uncollectedFees0 = (liquidity * feeGrowthDelta0) / 2n ** 128n;
  const uncollectedFees1 = (liquidity * feeGrowthDelta1) / 2n ** 128n;

  const position = new Position({
    pool,
    liquidity: (liquidity || 0n).toString(),
    tickLower: tickLower || 0,
    tickUpper: tickUpper || 0,
  });

  return {
    owner: owner,
    tokenId: params.tokenId,
    ...toSDKPosition(chainConfig, position),
    feeAmount0: uncollectedFees0,
    feeAmount1: uncollectedFees1,
  };
};
