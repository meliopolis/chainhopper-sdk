import { createPublicClient, http } from "viem";
import type { ChainConfig } from "../chains";

// // creates a mapping chainId => publicClient
// export function configurePublicClients(
//   chains: Chain[],
//   rpcUrls?: {
//     [key: number]: string;
//   },
// ): ConfiguredPublicClientMap {
//   return new Map(
//     chains.map((chain) => {
//       const rpcUrl = rpcUrls?.[chain.id];
//       return [
//         chain.id,
//         createPublicClient({
//           chain,
//           key: chain.id.toString(),
//           transport: http(rpcUrl),
//           batch: {
//             multicall: true,
//           },
//         }),
//       ];
//     }),
//   );
// }

export function configurePublicClients(
  chainConfigList: Record<number, ChainConfig>,
  rpcUrls?: {
    [key: number]: string;
  },
): Record<number, ChainConfig> {
  Object.values(chainConfigList).map((chainConfig) => {
    const rpcUrl = rpcUrls?.[chainConfig.chain.id]; 
    chainConfig.publicClient = createPublicClient({
        chain: chainConfig.chain,
        key: chainConfig.chain.id.toString(),
        transport: http(rpcUrl),
        batch: {
          multicall: true,
        },
      })
  });
  return chainConfigList;
}