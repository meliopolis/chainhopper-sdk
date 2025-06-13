import type { ChainConfig } from '../chains';
import type { RequestWithdrawalParams, CheckMigrationIdResponse } from '../types';
import { assertBytes32 } from '../utils/hex';
import { keccak256, pad } from 'viem';

const SETTLEMENT_CACHE_SLOT = 3n;

const toHexSlot = (n: bigint): `0x${string}` => `0x${n.toString(16).padStart(64, '0')}`;

export const getSettlementCacheEntry = async (
  chainConfig: ChainConfig,
  params: RequestWithdrawalParams
): Promise<CheckMigrationIdResponse> => {
  const { migrationId, settler } = params;
  assertBytes32(migrationId);

  const viemClient = chainConfig.publicClient!;

  const paddedKey = pad(migrationId, { size: 32 }).slice(2);
  const paddedSlot = pad(`0x${SETTLEMENT_CACHE_SLOT.toString(16)}`, { size: 32 }).slice(2);
  const baseHash = keccak256(`0x${paddedKey}${paddedSlot}`);
  const base = BigInt(baseHash);

  const [recipientRaw, tokenRaw, amountRaw] = await Promise.all([
    viemClient.getStorageAt({ address: settler, slot: toHexSlot(base) }),
    viemClient.getStorageAt({ address: settler, slot: toHexSlot(base + 1n) }),
    viemClient.getStorageAt({ address: settler, slot: toHexSlot(base + 2n) }),
  ]);

  if ([recipientRaw, tokenRaw, amountRaw].includes(undefined)) throw new Error('Failed to get settlement cache');

  const recipient: `0x${string}` = `0x${recipientRaw!.slice(26)}`;
  const token: `0x${string}` = `0x${tokenRaw!.slice(26)}`;
  const amount = BigInt(amountRaw!);

  const isPresent = recipient !== '0x0000000000000000000000000000000000000000';

  return isPresent ? { recipient, token, amount } : null;
};
