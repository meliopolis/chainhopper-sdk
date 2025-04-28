import type { PoolKey } from '@uniswap/v4-sdk';
import { type ChainConfig } from '../chains';
import { getV4Quote } from './getV4Quote';
import { getV4DopplerQuote } from './getV4DopplerQuote';

export const getV4CombinedQuote = async (
  chainConfig: ChainConfig,
  poolKey: PoolKey,
  exactAmount: bigint,
  zeroForOne: boolean,
  hookData: `0x${string}`
): Promise<{ amountOut: bigint; sqrtPriceX96After: bigint }> => {
  const amountOut = await getV4Quote(chainConfig, poolKey, exactAmount, zeroForOne, hookData);
  const { sqrtPriceX96After } = await getV4DopplerQuote(chainConfig, poolKey, exactAmount, zeroForOne, hookData);
  return {
    amountOut,
    sqrtPriceX96After,
  };
};
