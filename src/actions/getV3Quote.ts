import { type ChainConfig } from '../chains';

export const getV3Quote = async (
  chainConfig: ChainConfig,
  tokenIn: `0x${string}`,
  tokenOut: `0x${string}`,
  fee: number,
  amountIn: bigint,
  sqrtPriceLimitX96?: bigint
): Promise<{ amountOut: bigint; sqrtPriceX96After: bigint }> => {
  const quote = (await chainConfig.publicClient?.simulateContract({
    ...chainConfig.quoterV2Contract,
    functionName: 'quoteExactInputSingle',
    args: [
      {
        tokenIn,
        tokenOut,
        fee,
        amountIn: amountIn.toString(),
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
