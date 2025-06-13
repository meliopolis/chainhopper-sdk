import { test, describe, expect } from 'bun:test';
import { ChainHopperClient } from '../src/client';
import { configurePublicClients } from '../src/utils/configurePublicClients';

const rpcUrls = {
  1: Bun.env.MAINNET_RPC_URL!,
  10: Bun.env.OPTIMISM_RPC_URL!,
  130: Bun.env.UNICHAIN_RPC_URL!,
  8453: Bun.env.BASE_RPC_URL!,
  42161: Bun.env.ARBITRUM_RPC_URL!,
};
const client = ChainHopperClient.create({ rpcUrls });
// this is needed to remove block number overrides from other tests
configurePublicClients(client.chainConfigs, rpcUrls);

describe('getSettlementCacheEntry', () => {
  test('should return settlementCache entry when migrationId is present', async () => {
    const entry = await client.getSettlementCacheEntry(130, {
      migrationId: '0x038253c0e0c452114fbb0bfe1fccf964d5b581f2470e1874bac9bcb0cf60f506',
      settler: '0xf65d7a5b7d361721cd59d70d6513d054d4a0e6fe',
    });
    expect(entry).toEqual({
      recipient: '0xdd1d28e5bedbd000a0539a3bf0ed558f4b721a84',
      token: '0x4200000000000000000000000000000000000006',
      amount: 8618954439480911n,
    });
  });
  test('should return null when valid migrationId is not present', async () => {
    const entry = await client.getSettlementCacheEntry(130, {
      migrationId: '0xbadbadbadc452114fbb0bfe1fccf964d5b581f2470e1874bac9bcb0badbadbad',
      settler: '0xf65d7a5b7d361721cd59d70d6513d054d4a0e6fe',
    });
    expect(entry).toBeNull();
  });
  test('should throw with invalid migrationId', async () => {
    const getEntry = async (): Promise<void> => {
      await client.getSettlementCacheEntry(130, {
        migrationId: '0xbadbadbadc452114fbb0bfe1fccf964d5b581f2470e1874bac9bcbadbadbad',
        settler: '0xf65d7a5b7d361721cd59d70d6513d054d4a0e6fe',
      });
    };
    expect(getEntry).toThrow('Expected 0x-prefixed 32-byte hex string (bytes32).');
  });
});
