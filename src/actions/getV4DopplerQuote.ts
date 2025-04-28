import type { PoolKey } from '@uniswap/v4-sdk';
import { type ChainConfig } from '../chains';

export const getV4DopplerQuote = async (
  chainConfig: ChainConfig,
  poolKey: PoolKey,
  exactAmount: bigint,
  zeroForOne: boolean,
  hookData: `0x${string}`
): Promise<{ sqrtPriceX96After: bigint }> => {
  if (!chainConfig.v4DopplerQuoterContract) {
    throw new Error('V4 Doppler Quoter contract not found');
  }
  const quote = (await chainConfig.publicClient?.simulateContract({
    ...chainConfig.v4DopplerQuoterContract,
    functionName: 'quoteDopplerLensData',
    args: [
      {
        poolKey,
        exactAmount,
        zeroForOne,
        hookData,
      },
    ],
  })) as {
    result: bigint[];
  };
  return {
    sqrtPriceX96After: quote.result[0],
  };
};
