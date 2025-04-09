// smart contract related types

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
  chainId: number;
  settler: `0x${string}`;
  tokenRoutes: TokenRoute[];
  settlementParams: SettlementParams & (UniswapV3MintParams | UniswapV4MintParams);
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
  sqrtPriceX96: bigint;
  tickSpacing: number;
  hooks: `0x${string}`;
  tickLower: number;
  tickUpper: number;
  swapAmountInMilliBps: number;
  amount0Min: bigint;
  amount1Min: bigint;
};