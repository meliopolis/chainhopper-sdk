import { createPublicClient, http, type HttpTransport, type PublicClient } from 'viem';
import type { ChainConfig } from '../chains';

type ChainId = number;

// wraps a viem publicClient to inject a blockNumber override on all read calls for integration testing
const createBlockScopedClient = ({
  transport,
  chainConfig,
  blockNumber,
}: {
  transport: HttpTransport;
  chainConfig: ChainConfig;
  blockNumber: bigint;
}): PublicClient => {
  const baseClient = createPublicClient({
    transport: transport,
    chain: chainConfig.chain,
    batch: { multicall: true },
  });

  return new Proxy(baseClient, {
    get(target, prop: keyof PublicClient): unknown {
      const original = target[prop];
      if (typeof original !== 'function') return original;

      return (...args: unknown[]) => {
        const lastArg = args[args.length - 1];
        const hasOverrides = lastArg && typeof lastArg === 'object' && !Array.isArray(lastArg);
        const overrides = hasOverrides
          ? { ...lastArg }
          : ({} as { blockNumber?: bigint; blockTag?: 'latest' | 'earliest' | 'pending' });

        // Inject blockNumber if not already provided
        if (!('blockNumber' in overrides) && !('blockTag' in overrides)) {
          overrides.blockNumber = blockNumber;
        }

        const finalArgs = hasOverrides ? [...args.slice(0, -1), overrides] : [...args, overrides];

        return (original as (...args: unknown[]) => unknown).call(target, ...finalArgs);
      };
    },
  }) as PublicClient;
};

export const configurePublicClients = (
  chainConfigs: Record<ChainId, ChainConfig>,
  rpcUrls?: Record<ChainId, string>,
  blockNumbers?: Record<ChainId, bigint>
): Record<ChainId, ChainConfig> => {
  for (const [key, chainConfig] of Object.entries(chainConfigs)) {
    const chainId = Number(key) as ChainId;
    const rpcUrl = rpcUrls?.[chainId];
    const blockNumber = blockNumbers?.[chainId];
    const transport = http(rpcUrl);

    chainConfig.publicClient =
      blockNumber !== undefined
        ? createBlockScopedClient({ transport, chainConfig, blockNumber })
        : createPublicClient({
            chain: chainConfig.chain,
            transport: transport,
            batch: { multicall: true },
          });
  }
  return chainConfigs;
};
