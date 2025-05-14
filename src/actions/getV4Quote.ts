import type { PoolKey } from '@uniswap/v4-sdk';
import { type ChainConfig } from '../chains';

const v4QuoteCache = new Map<string, Promise<bigint>>();

export const getV4Quote = async (
  chainConfig: ChainConfig,
  poolKey: PoolKey,
  exactAmount: bigint,
  zeroForOne: boolean,
  hookData: `0x${string}`
): Promise<bigint> => {
  // build a unique key for this combo of inputs
  const key = [
    chainConfig.chainId,
    // PoolKey is an object; stringify its primitive parts
    (poolKey.currency0 as any).address ?? (poolKey.currency0 as string),
    (poolKey.currency1 as any).address ?? (poolKey.currency1 as string),
    poolKey.fee,
    // tickSpacing exists on PoolKey in v4
    (poolKey as any).tickSpacing,
    exactAmount.toString(),
    zeroForOne,
    hookData,
  ].join(':');

  // if we’ve done (or are doing) this quote in the last 300 ms, reuse it
  if (v4QuoteCache.has(key)) {
    return v4QuoteCache.get(key)!;
  }

  // otherwise fire off the RPC and cache its promise
  const p = (async (): Promise<bigint> => {
    const raw = await chainConfig.publicClient!.simulateContract({
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
    });
    return (raw as { result: bigint[] }).result[0];
  })();

  v4QuoteCache.set(key, p);

  // evict after 300 ms
  setTimeout(() => {
    v4QuoteCache.delete(key);
  }, 300);

  return p;
};