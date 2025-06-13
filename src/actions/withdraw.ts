import type { RequestWithdrawalParams, WithdrawalExecutionParams } from '../types/sdk';
import { ISettlerAbi } from '../abis';
import { type Abi } from 'viem';
import { assertBytes32 } from '../utils/hex';

export const withdraw = (params: RequestWithdrawalParams): WithdrawalExecutionParams => {
  const { settler, migrationId } = params;
  assertBytes32(migrationId);
  return {
    address: settler,
    abi: ISettlerAbi as Abi,
    functionName: 'withdraw',
    args: [migrationId],
  } as const;
};
