import type { ChainConfig } from '../chains';
import { ProtocolFeesAbi } from '../abis/ProtocolFees';
import type { Abi } from 'viem';

export const getSettlerFees = async (chainConfig: ChainConfig, settler: `0x${string}` | undefined): Promise<{ protocolShareOfSenderFeePct: bigint; protocolShareBps: bigint }> => {
  if (!settler) {
    return { protocolShareOfSenderFeePct: 0n, protocolShareBps: 0n };
  }
  const contracts = [
    {
      address: settler,
      abi: ProtocolFeesAbi as Abi,
      functionName: 'protocolShareOfSenderFeePct',
    },
    {
      address: settler,
      abi: ProtocolFeesAbi as Abi,
      functionName: 'protocolShareBps',
    },
  ];
  const results = await chainConfig.publicClient?.multicall({
    contracts,
  });
  if (results?.some((result) => result.status !== 'success')) {
    throw new Error('Failed to get settler fees');
  }
  return {
    protocolShareOfSenderFeePct: BigInt(results?.[0].result as number),
    protocolShareBps: BigInt(results?.[1].result as number),
  };
};
