// smart contract related types
export type SenderFeeParams = {
  senderFeeBps: number;
  senderFeeRecipient: `0x${string}`;
}

export type UniswapV3SettlementParams = SenderFeeParams & {
  recipient: `0x${string}`; // always goes first
  token0: `0x${string}`;
  token1: `0x${string}`;
  feeTier: number;
  tickLower: number;
  tickUpper: number;
  amount0Min: bigint;
  amount1Min: bigint;
}

export type UniswapV4SettlementParams = SenderFeeParams & {
  recipient: `0x${string}`; // always goes first
  token0: `0x${string}`;
  token1: `0x${string}`;
  feeTier: number;
  hooks: `0x${string}`;
  tickLower: number;
  tickUpper: number;
  amount0Min: bigint;
  amount1Min: bigint;
}

export type BaseMigratorParams = {
  destinationChainId: number;
  recipientSettler: `0x${string}`;
  settlementParams: UniswapV3SettlementParams | UniswapV4SettlementParams; 
}

export type AcrossRoute = {
  inputToken: `0x${string}`;
  outputToken: `0x${string}`;
  maxFees: bigint;
  quoteTimestamp: number;
  fillDeadlineOffset: number;
  exclusiveRelayer: `0x${string}`;
  exclusivityDeadline: number;
}

export type AcrossMigrationParams = {
  baseParams: BaseMigratorParams;
  acrossRoutes: AcrossRoute[];
}