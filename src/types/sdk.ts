import type { Abi } from 'viem';
import { BridgeType, MigrationMethod, Protocol } from '../utils/constants';

export type IUniswapPositionParams = {
  chainId: number;
  tokenId: bigint;
};

export type TokenAmount = {
  address: `0x${string}`;
  amount: bigint;
};

export type BaseRequestMigrationParams = {
  sourceChainId: number;
  destinationChainId: number;
  tokenId: bigint;
  destinationProtocol: Protocol;
  bridgeType?: BridgeType;
  migrationMethod?: MigrationMethod;
  senderShareBps?: number;
  senderFeeRecipient?: `0x${string}`;
  slippageInBps?: number;
  debug?: boolean;
};

export type UniswapV3Params = {
  token0: `0x${string}`;
  token1: `0x${string}`;
  fee: number;
  sqrtPriceX96?: bigint;
  tickLower: number;
  tickUpper: number;
};

export type UniswapV4Params = UniswapV3Params & {
  hooks: `0x${string}`;
  tickSpacing: number;
};

export type RequestV3toV3MigrationParams = BaseRequestMigrationParams &
  UniswapV3Params & {
    sourceProtocol: Protocol.UniswapV3;
    destinationProtocol: Protocol.UniswapV3;
  };

export type RequestV3toV4MigrationParams = BaseRequestMigrationParams &
  UniswapV4Params & {
    sourceProtocol: Protocol.UniswapV3;
    destinationProtocol: Protocol.UniswapV4;
  };

export type RequestV4toV4MigrationParams = BaseRequestMigrationParams &
  UniswapV4Params & {
    sourceProtocol: Protocol.UniswapV4;
    destinationProtocol: Protocol.UniswapV4;
  };

export type RequestV4toV3MigrationParams = BaseRequestMigrationParams &
  UniswapV3Params & {
    sourceProtocol: Protocol.UniswapV4;
    destinationProtocol: Protocol.UniswapV3;
  };

export type RequestV3MigrationParams = RequestV3toV3MigrationParams | RequestV3toV4MigrationParams;

export type RequestV4MigrationParams = RequestV4toV3MigrationParams | RequestV4toV4MigrationParams;

export type RequestMigrationParams = RequestV3MigrationParams | RequestV4MigrationParams;

// type AcrossFeeBreakdown = {
//   [K in 'lpFee' | 'relayerGasFee' | 'relayerCapitalFee' | 'totalRelayFee']: {
//     pct: bigint;
//     total: bigint;
//   };
// };

// export type SlippageCalcs = {
//   swapAmountInMilliBps: number;
//   routeMinAmountOuts: bigint[];
// };

export type Route = {
  inputToken: `0x${string}`;
  outputToken: `0x${string}`;
  inputAmount: bigint;
  outputAmount: bigint;
  minOutputAmount: bigint;
  maxFees: bigint;
  fillDeadlineOffset: number;
  exclusivityDeadline: number;
  exclusiveRelayer: `0x${string}`;
};

export type ExecutionParams = {
  address: `0x${string}`;
  abi: Abi;
  functionName: string;
  args: [`0x${string}`, `0x${string}`, bigint, `0x${string}`];
};

export type pool = {
  chainId: number;
  token0: `0x${string}`;
  token1: `0x${string}`;
  fee: number;
  sqrtPriceX96?: bigint;
  liquidity?: bigint;
  tick?: number;
}

export type v3Pool = pool & {
  protocol: Protocol.UniswapV3;
  poolAddress: `0x${string}`;
};

export type v4Pool = pool & {
  protocol: Protocol.UniswapV4;
  hooks: `0x${string}`;
  tickSpacing: number;
  poolId: `0x${string}`;
};

export type Position = (v3Pool | v4Pool) & {
  tickLower: number;
  tickUpper: number;
  liquidity: bigint;
  amount0: bigint;
  amount1: bigint;
  amount0Min: bigint; // encodes slippage
  amount1Min: bigint; // encodes slippage
};

export type PositionWithFees = Position & {
  tokenId?: bigint; // could also see a case for this to be under Position
  feeAmount0: bigint;
  feeAmount1: bigint;
};

export type RequestMigrationResponse = {
  sourcePosition: PositionWithFees;
  owner: `0x${string}`;
  destPosition: Position;
  routes: Route[];
  executionParams: ExecutionParams;
  // if debug set, this will be populated
  settlerExecutionParams?: ExecutionParams;
  swapAmountInMilliBps?: number;
};
