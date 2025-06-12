import type { WithdrawalExecutionParams } from '@/types/sdk';
import { ISettlerAbi } from '../abis';
import { isHex, size, type Abi, type Hex } from 'viem';

export const isBytes32 = (value: unknown): boolean => {
  return typeof value === 'string' && isHex(value, { strict: true }) && size(value) === 32;
};

export const assertBytes32 = (value: unknown): boolean => {
  if (!isBytes32(value)) throw new Error('Expected 0x-prefixed 32-byte hex string (bytes32).');
  return true;
};

export const withdraw = (settler: `0x${string}`, migrationId: Hex): WithdrawalExecutionParams => {
  assertBytes32(migrationId);
  return {
    address: settler,
    abi: ISettlerAbi as Abi,
    functionName: 'withdraw',
    args: [migrationId],
  } as const;
};
