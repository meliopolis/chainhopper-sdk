// smart contract related types

import type { MigrationMethod } from '../utils/constants';

// Migrator Params

export type AcrossRoute = {
  outputToken: `0x${string}`;
  maxFees: bigint;
  quoteTimestamp: number;
  fillDeadlineOffset: number;
  exclusiveRelayer: `0x${string}`;
  exclusivityDeadline: number;
};

export type TokenRoute = AcrossRoute & {
  inputToken: `0x${string}`;
  minAmountOut: bigint;
};

export type MigrationParams = {
  chainId: bigint;
  settler: `0x${string}`;
  tokenRoutes: TokenRoute[];
  settlementParams: SettlementParams & (UniswapV3MintParams | UniswapV4MintParams);
};

export type MigrationData = {
  sourceChainId: bigint;
  migrator: `0x${string}`;
  nonce: bigint;
  mode: MigrationMethod;
  routesData?: `0x${string}`;
  settlementData?: `0x${string}`;
};

// Settlement Params
export type SettlementParams = {
  recipient: `0x${string}`;
  senderShareBps: number;
  senderFeeRecipient: `0x${string}`;
};

export type UniswapV3MintParams = {
  token0: `0x${string}`;
  token1: `0x${string}`;
  fee: number;
  sqrtPriceX96: bigint;
  tickLower: number;
  tickUpper: number;
  swapAmountInMilliBps: number;
  amount0Min: bigint;
  amount1Min: bigint;
};

export type UniswapV4MintParams = {
  token0: `0x${string}`;
  token1: `0x${string}`;
  fee: number;
  tickSpacing: number;
  hooks: `0x${string}`;
  sqrtPriceX96: bigint;
  tickLower: number;
  tickUpper: number;
  swapAmountInMilliBps: number;
  amount0Min: bigint;
  amount1Min: bigint;
};
