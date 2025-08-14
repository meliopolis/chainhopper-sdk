import { CurrencyAmount, Price, Token } from '@uniswap/sdk-core';
import { type ChainConfig } from '../chains';
import { PoolContractABI as v3PoolAbi } from '../abis/v3PoolContract';
import type { v3Pool } from '@/types/sdk';

export const getV3Quote = async (
  chainConfig: ChainConfig,
  tokenIn: Token,
  tokenOut: Token,
  pool: v3Pool,
  amountIn: bigint,
  sqrtPriceLimitX96?: bigint
): Promise<{ amountOut: bigint; sqrtPriceX96After: bigint; slippageBps: number }> => {

  const result = await chainConfig.publicClient?.readContract({
    address: pool.poolAddress,
    abi: v3PoolAbi,
    functionName: 'slot0',
  });

  if (!result) throw new Error("getV3Quote failed to receive a quote")

  const preSwapSqrtPriceX96 = result[0];
  const numerator = preSwapSqrtPriceX96 ** 2n;
  const denominator = 2n ** 192n;
  const preSwapPrice = new Price(tokenIn, tokenOut, denominator.toString(), numerator.toString());

  const quote = (await chainConfig.publicClient?.simulateContract({
    ...chainConfig.quoterV2Contract,
    functionName: 'quoteExactInputSingle',
    args: [
      {
        tokenIn: tokenIn.address,
        tokenOut: tokenOut.address,
        fee: pool.fee,
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
