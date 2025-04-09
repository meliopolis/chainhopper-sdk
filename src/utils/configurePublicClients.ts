import { createPublicClient, http } from 'viem';
import type { ChainConfig } from '../chains';

export const configurePublicClients = (
  chainConfigs: Record<number, ChainConfig>,
  rpcUrls?: {
    [key: number]: string;
  }
): Record<number, ChainConfig> => {
  Object.values(chainConfigs).map((chainConfig) => {
    const rpcUrl = rpcUrls?.[chainConfig.chain.id];
    chainConfig.publicClient = createPublicClient({
      chain: chainConfig.chain,
      key: chainConfig.chain.id.toString(),
      transport: http(rpcUrl),
      batch: {
        multicall: true,
      },
    });
  });
  return chainConfigs;
};
