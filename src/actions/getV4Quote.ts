import type { PoolKey } from '@uniswap/v4-sdk';
import { type ChainConfig } from '../chains';

export const getV4Quote = async (
  chainConfig: ChainConfig,
  poolKey: PoolKey,
  exactAmount: bigint,
  zeroForOne: boolean,
  hookData: `0x${string}`
): Promise<bigint> => {
  const quote = (await chainConfig.publicClient?.simulateContract({
    ...chainConfig.v4QuoterContract,
    functionName: 'quoteExactInputSingle',
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
  return quote.result[0];
};
