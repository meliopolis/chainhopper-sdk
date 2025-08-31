import { test, describe, expect } from 'bun:test';
import { ChainHopperClient } from '../src/client';
import { configurePublicClients } from '../src/utils/configurePublicClients';
import { WithdrawalParams } from '../src/types/sdk';

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

describe('requestWithdrawal', () => {
  test('should throw exception for invalid migrationId', async () => {
    const params: WithdrawalParams = {
      settler: client.chainConfigs[130].UniswapV4AcrossSettler!,
      migrationId: '0xinvalid',
    };
    expect(() => client.requestWithdrawal(params)).toThrow('Expected 0x-prefixed 32-byte hex string (bytes32).');
  });
  test('should return valid calldata for valid withdrawal request', async () => {
    const chainConfig = client.chainConfigs[130];
    const params: WithdrawalParams = {
      settler: chainConfig.UniswapV4AcrossSettler!,
      migrationId: '0x038253c0e0c452114fbb0bfe1fccf964d5b581f2470e1874bac9bcb0cf60f506',
    };
    const request = client.requestWithdrawal(params);
    const response = await chainConfig.publicClient!.simulateContract({
      ...request,
      account: '0xDd1D28e5BEdBd000A0539a3BF0ED558F4B721a84',
    });
    expect(response.result).toBeUndefined(); // withdraw does not return a value
    expect(response.request.address).toBe(request.address);
    expect(response.request.functionName).toBe(request.functionName);
    expect(response.request.args).toBe(request.args);
  });
});
