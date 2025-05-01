import { test, describe, expect } from 'bun:test';
import { ChainHopperClient } from '../src/client';
import { getSettlerFees } from '../src/actions/getSettlerFees';

const rpcUrls = {
  1: Bun.env.MAINNET_RPC_URL!,
  10: Bun.env.OPTIMISM_RPC_URL!,
  130: Bun.env.UNICHAIN_RPC_URL!,
  8453: Bun.env.BASE_RPC_URL!,
  42161: Bun.env.ARBITRUM_RPC_URL!,
};

const client = ChainHopperClient.create({ rpcUrls });

describe('getSettlerFees', () => {
  Object.entries(client.chainConfigs).forEach(([chainId, chainConfig]) => {
    describe(`Chain ID: ${chainId}`, () => {
      test('should return zero fees when settler is undefined', async () => {
        const fees = await getSettlerFees(chainConfig, undefined);
        expect(fees.protocolShareOfSenderFeePct).toBe(0n);
        expect(fees.protocolShareBps).toBe(0n);
      });

      if (chainConfig.UniswapV3AcrossSettler) {
        test('should return fees for UniswapV3AcrossSettler', async () => {
          const fees = await getSettlerFees(chainConfig, chainConfig.UniswapV3AcrossSettler);
          expect(fees.protocolShareOfSenderFeePct).toBe(10n);
          expect(fees.protocolShareBps).toBe(10n);
        });
      }

      if (chainConfig.UniswapV4AcrossSettler) {
        test('should return fees for UniswapV4AcrossSettler', async () => {
          const fees = await getSettlerFees(chainConfig, chainConfig.UniswapV4AcrossSettler);
          expect(fees.protocolShareOfSenderFeePct).toBe(10n);
          expect(fees.protocolShareBps).toBe(10n);
        });
      }
    });
  });
});
