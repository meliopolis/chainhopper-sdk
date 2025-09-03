import type { Abi, Hex } from 'viem';
import { BridgeType, MigrationMethod, Protocol } from '../utils/constants';

export type RequestWithdrawalParams = {
  settler: `0x${string}`;
  migrationId: `0x${string}`;
};

export type WithdrawalExecutionParams = {
  address: `0x${string}`;
  abi: Abi;
  functionName: 'withdraw';
  args: readonly [Hex];
};

export type CheckMigrationIdResponse = {
  recipient: `0x${string}`;
  token: `0x${string}`;
  amount: bigint;
} | null;

/*
 * These types describe the input params
 */

export type BaseRequestMigrationParams = {
  sourcePosition: {
    chainId: number;
    protocol: Protocol;
    tokenId: bigint;
  };
  senderShareBps?: number;
  senderFeeRecipient?: `0x${string}`;
  debug?: boolean;
};

// These types describe the parameters for a destination pool
export type DestinationParams = {
  chainId: number;
  token0: `0x${string}`;
  token1: `0x${string}`;
  fee: number;
  sqrtPriceX96?: bigint;
  tickLower: number;
  tickUpper: number;
};

export type UniswapV3Params = DestinationParams & {
  protocol: Protocol.UniswapV3;
};

export type UniswapV4Params = DestinationParams & {
  protocol: Protocol.UniswapV4;
  hooks: `0x${string}`;
  tickSpacing: number;
};

export type AerodromeParams = Omit<DestinationParams, 'fee'> & {
  protocol: Protocol.Aerodrome;
  tickSpacing: number;
};

// These types describe the parameters for a migration path
export type ExactPath = {
  bridgeType: BridgeType;
  migrationMethod: MigrationMethod;
  slippageInBps: number;
};

export type PathFilter = {
  bridgeType?: BridgeType;
  migrationMethod?: MigrationMethod;
  slippageInBps?: number;
};

export type RequestExactMigrationParams = BaseRequestMigrationParams & {
  destination: UniswapV3Params | UniswapV4Params | AerodromeParams;
  exactPath: ExactPath;
};

export type RequestMigrationParams = BaseRequestMigrationParams & {
  destination: UniswapV3Params | UniswapV4Params | AerodromeParams;
  path?: PathFilter;
};

export type RequestExactMigrationsParams = BaseRequestMigrationParams & {
  migrations: {
    destination: UniswapV3Params | UniswapV4Params | AerodromeParams;
    exactPath: ExactPath;
  }[];
};
export type RequestMigrationsParams = BaseRequestMigrationParams & {
  migrations: {
    destination: UniswapV3Params | UniswapV4Params | AerodromeParams;
    path?: PathFilter;
  }[];
};

// type AcrossFeeBreakdown = {
//   [K in 'lpFee' | 'relayerGasFee' | 'relayerCapitalFee' | 'totalRelayFee']: {
//     pct: bigint;
//     total: bigint;
//   };
// };

/*
 * These types describe the output params
 */

export type Token = {
  chainId: number;
  address: `0x${string}`;
  decimals: number;
  symbol?: string;
  name?: string;
};

export type Pool = {
  chainId: number;
  token0: Token;
  token1: Token;
  fee: number;
  tickSpacing: number;
  sqrtPriceX96?: bigint;
  liquidity?: bigint;
  tick?: number;
};

export type v3Pool = Pool & {
  protocol: Protocol.UniswapV3;
  poolAddress: `0x${string}`;
};

export type v4Pool = Pool & {
  protocol: Protocol.UniswapV4;
  hooks: `0x${string}`;
  poolId: `0x${string}`;
};

export type aerodromePool = Pool & {
  protocol: Protocol.Aerodrome;
  poolAddress: `0x${string}`;
};

export type Position = {
  pool: v3Pool | v4Pool | aerodromePool;
  tickLower: number;
  tickUpper: number;
  liquidity: bigint;
  amount0: bigint;
  amount1: bigint;
  amount0Min?: bigint; // encodes slippage
  amount1Min?: bigint; // encodes slippage
  amount0Refund?: bigint; // expected refund if any
  amount1Refund?: bigint; // expected refund if any
};

// Describes an existing position with fees
export type PositionWithFees = Position & {
  owner: `0x${string}`;
  tokenId: bigint; // could also see a case for this to be under Position
  feeAmount0: bigint;
  feeAmount1: bigint;
};

export type Route = AcrossRoute | DirectRoute;

export type AcrossRoute = {
  inputToken: `0x${string}`;
  outputToken: `0x${string}`;
  inputAmount: bigint;
  outputAmount: bigint;
  minOutputAmount: bigint;
  maxFees: bigint;
  fillDeadlineOffset: number;
  exclusivityDeadline: number;
  exclusiveRelayer: `0x${string}`;
  destinationSettler: `0x${string}`;
  sourceSlippageBps?: number;
  destinationSlippageBps?: number;
};

export type DirectRoute = {
  inputToken: `0x${string}`;
  outputToken: `0x${string}`;
  inputAmount: bigint;
  outputAmount: bigint;
  minOutputAmount: bigint;
  destinationSettler: `0x${string}`;
  sourceSlippageBps?: number;
  destinationSlippageBps?: number;
};

export type MigratorExecutionParams = {
  address: `0x${string}`;
  abi: Abi;
  functionName: string;
  args: [`0x${string}`, `0x${string}`, bigint, `0x${string}`];
};

export type AcrossSettlerExecutionParams = {
  address: `0x${string}`;
  abi: Abi;
  functionName: string;
  args: [
    {
      depositor: `0x${string}`;
      recipient: `0x${string}`;
      exclusiveRelayer: `0x${string}`;
      inputToken: `0x${string}`;
      outputToken: `0x${string}`;
      inputAmount: bigint;
      outputAmount: bigint;
      originChainId: bigint;
      depositId: number; // hardcoded for now
      exclusivityDeadline: number; // can make it zero for now
      fillDeadline: number;
      message: `0x${string}`;
    },
    bigint,
  ];
};

export type DirectSettlerExecutionParams = {
  address: `0x${string}`;
  abi: Abi;
  functionName: 'handleDirectTransfer';
  args: [`0x${string}`, bigint, `0x${string}`];
};

export type SettlerExecutionParams = AcrossSettlerExecutionParams | DirectSettlerExecutionParams;

export type MigrationFees = {
  bps: number;
  amount0: bigint;
  amount1: bigint;
};

export type PathWithPosition = {
  exactPath: ExactPath;
  position: Position;
  routes: Route[];
  executionParams: MigratorExecutionParams;
  // if debug flag set, these will be populated
  settlerExecutionParams?: SettlerExecutionParams[];
  swapAmountInMilliBps?: number;
  migrationFees: {
    protocol: MigrationFees;
    sender: MigrationFees;
    total: MigrationFees;
  };
};

export type PathUnavailable = {
  exactPath: ExactPath;
  destination: UniswapV3Params | UniswapV4Params | AerodromeParams;
  reasons: string[];
};

export type BaseMigrationResponse = {
  sourcePosition: PositionWithFees;
};

export type ExactMigrationResponse = BaseMigrationResponse & {
  migration: PathWithPosition;
};

export type ExactMigrationsResponse = BaseMigrationResponse & {
  migrations: PathWithPosition[];
};

export type MigrationResponse = BaseMigrationResponse & {
  migrations: PathWithPosition[];
  unavailableMigrations: PathUnavailable[];
};

export type MigrationsResponse = BaseMigrationResponse & {
  migrations: PathWithPosition[][];
  unavailableMigrations: PathUnavailable[];
};
