import { type ChainConfig } from '../chains';

type QuoteResult = { amountOut: bigint; sqrtPriceX96After: bigint };

// simple map from a string key → in-flight promise
const quoteCache = new Map<string, Promise<QuoteResult>>();

export const getV3Quote = async (
  chainConfig: ChainConfig,
  tokenIn: `0x${string}`,
  tokenOut: `0x${string}`,
  fee: number,
  amountIn: bigint,
  sqrtPriceLimitX96?: bigint
): Promise<QuoteResult> => {
  const key = [chainConfig.chainId, tokenIn, tokenOut, fee, amountIn.toString(), (sqrtPriceLimitX96 ?? 0n).toString()].join(':');

  // if we’ve fetched (or are fetching) within the last 300 ms, return it
  if (quoteCache.has(key)) {
    return quoteCache.get(key)!;
  }

  // otherwise, kick off a new RPC, store the promise…
  const p = (async (): Promise<QuoteResult> => {
    const raw = await chainConfig.publicClient!.simulateContract({
      ...chainConfig.quoterV2Contract,
      functionName: 'quoteExactInputSingle',
      args: [
        {
          tokenIn,
          tokenOut,
          fee,
          amountIn: amountIn.toString(),
          sqrtPriceLimitX96: sqrtPriceLimitX96 ?? 0n,
        },
      ],
    });
    const result = (raw as { result: bigint[] }).result;
    return {
      amountOut: result[0],
      sqrtPriceX96After: result[1],
    };
  })();

  quoteCache.set(key, p);

  // …then schedule eviction in 300 ms
  setTimeout(() => {
    quoteCache.delete(key);
  }, 300);

  return p;
};
