import { type ChainConfig } from '../chains';

export const getAerodromeQuote = async (
  chainConfig: ChainConfig,
  tokenIn: `0x${string}`,
  tokenOut: `0x${string}`,
  tickSpacing: number,
  amountIn: bigint,
  sqrtPriceLimitX96?: bigint
): Promise<{ amountOut: bigint; sqrtPriceX96After: bigint }> => {
  if (!chainConfig.aerodromeQuoterContract) {
    throw new Error('Aerodrome Quoter contract not found');
  }
  const quote = (await chainConfig.publicClient?.simulateContract({
    ...chainConfig.aerodromeQuoterContract,
    functionName: 'quoteExactInputSingle',
    args: [
      {
        tokenIn,
        tokenOut,
        amountIn: amountIn.toString(),
        tickSpacing,
        sqrtPriceLimitX96: sqrtPriceLimitX96 ?? 0,
      },
    ],
  })) as {
    result: bigint[];
  };
  return {
    amountOut: quote.result[0],
    sqrtPriceX96After: quote.result[1],
  };
};
