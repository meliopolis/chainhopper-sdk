import { CurrencyAmount, Price, Token } from '@uniswap/sdk-core';
import { type ChainConfig } from '../chains';

export const getV3Quote = async (
  chainConfig: ChainConfig,
  tokenIn: Token,
  tokenOut: Token,
  fee: number,
  amountIn: bigint,
  sqrtPriceLimitX96?: bigint
): Promise<{ amountOut: bigint; sqrtPriceX96After: bigint; slippageBps: number }> => {
  const zeroQuote = (await chainConfig.publicClient?.simulateContract({
    ...chainConfig.quoterV2Contract,
    functionName: 'quoteExactInputSingle',
    args: [
      {
        tokenIn: tokenIn.address,
        tokenOut: tokenOut.address,
        fee,
        amountIn: 0,
        sqrtPriceLimitX96: 0,
      },
    ],
  })) as {
    result: bigint[];
  };

  const preSwapSqrtPriceX96 = zeroQuote.result[1];
  const numerator = preSwapSqrtPriceX96 ** 2n;
  const denominator = 2 ** 192;
  const preSwapPrice = new Price(tokenIn, tokenOut, denominator.toString(), numerator.toString());

  const quote = (await chainConfig.publicClient?.simulateContract({
    ...chainConfig.quoterV2Contract,
    functionName: 'quoteExactInputSingle',
    args: [
      {
        tokenIn: tokenIn.address,
        tokenOut: tokenOut.address,
        fee,
        amountIn: amountIn.toString(),
        sqrtPriceLimitX96: sqrtPriceLimitX96 ?? 0,
      },
    ],
  })) as {
    result: bigint[];
  };

  const amountOut = quote.result[0];

  const execPrice = new Price({
    baseAmount: CurrencyAmount.fromRawAmount(tokenIn, amountIn.toString()),
    quoteAmount: CurrencyAmount.fromRawAmount(tokenOut, amountOut.toString()),
  });

  const slippageBps = Number(execPrice.divide(preSwapPrice).subtract(1).multiply(10_000).toSignificant(18));

  return {
    amountOut,
    sqrtPriceX96After: quote.result[1],
    slippageBps,
  };
};
