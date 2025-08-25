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

  if (!result) throw new Error('getV3Quote failed to receive a quote');

  const preSwapSqrtPriceX96 = result[0];

  // Determine token ordering in the pool
  const token0 = new Token(
    pool.token0.chainId,
    pool.token0.address,
    pool.token0.decimals,
    pool.token0.symbol,
    pool.token0.name
  );
  const token1 = new Token(
    pool.token1.chainId,
    pool.token1.address,
    pool.token1.decimals,
    pool.token1.symbol,
    pool.token1.name
  );

  // sqrtPriceX96 represents price of token0 in terms of token1
  const numerator = preSwapSqrtPriceX96 ** 2n;
  const denominator = 2n ** 192n;
  const token0Price = new Price(token0, token1, denominator.toString(), numerator.toString());

  // Determine the price for our specific tokenIn/tokenOut pair
  let preSwapPrice: Price<Token, Token>;
  if (
    tokenIn.address.toLowerCase() === token0.address.toLowerCase() &&
    tokenOut.address.toLowerCase() === token1.address.toLowerCase()
  ) {
    // tokenIn is token0, tokenOut is token1 - use price as-is
    preSwapPrice = token0Price;
  } else if (
    tokenIn.address.toLowerCase() === token1.address.toLowerCase() &&
    tokenOut.address.toLowerCase() === token0.address.toLowerCase()
  ) {
    // tokenIn is token1, tokenOut is token0 - invert the price
    preSwapPrice = token0Price.invert();
  } else {
    throw new Error('Invalid token pair for pool');
  }

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
