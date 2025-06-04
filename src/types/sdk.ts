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

export type DestinationSearch = (UniswapV3Params | UniswapV4Params) & {
  bridgeType?: BridgeType;
  migrationMethod?: MigrationMethod;
};

export type BaseRequestMigrationParams = {
  sourceChainId: number;
  tokenId: bigint;
  destinations: DestinationSearch[];
  senderShareBps?: number;
  senderFeeRecipient?: `0x${string}`;
  slippageInBps?: number;
  debug?: boolean;
};

export type UniswapV3Params = {
  protocol: Protocol.UniswapV3;
  chainId: number;
  token0: `0x${string}`;
  token1: `0x${string}`;
  fee: number;
  sqrtPriceX96?: bigint;
  tickLower: number;
  tickUpper: number;
};

export type UniswapV4Params = UniswapV3Params & {
  protocol: Protocol.UniswapV4;
  chainId: number;
  hooks: `0x${string}`;
  tickSpacing: number;
};

export type RequestV3toV3MigrationParams = BaseRequestMigrationParams &
  UniswapV3Params & {
    sourceProtocol: Protocol.UniswapV3;
  };

export type RequestV3toV4MigrationParams = BaseRequestMigrationParams &
  UniswapV4Params & {
    sourceProtocol: Protocol.UniswapV3;
  };

export type RequestV4toV4MigrationParams = BaseRequestMigrationParams &
  UniswapV4Params & {
    sourceProtocol: Protocol.UniswapV4;
  };

export type RequestV4toV3MigrationParams = BaseRequestMigrationParams &
  UniswapV3Params & {
    sourceProtocol: Protocol.UniswapV4;
  };

export type RequestV3MigrationParams = RequestV3toV3MigrationParams | RequestV3toV4MigrationParams;

export type RequestV4MigrationParams = RequestV4toV3MigrationParams | RequestV4toV4MigrationParams;

export type RequestMigrationParams = RequestV3MigrationParams | RequestV4MigrationParams;

export type RequestSingleDestinationSearchParams = Omit<RequestMigrationParams, 'destinations'> & {
  destination: DestinationSearch;
};

export type RequestExactDestination = DestinationSearch & { bridgeType: BridgeType; migrationMethod: MigrationMethod };

export type RequestExactMigrationParams = Omit<RequestMigrationParams, 'destinations'> & {
  destination: RequestExactDestination;
};

// type AcrossFeeBreakdown = {
//   [K in 'lpFee' | 'relayerGasFee' | 'relayerCapitalFee' | 'totalRelayFee']: {
//     pct: bigint;
//     total: bigint;
//   };
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

export type MigratorExecutionParams = {
  address: `0x${string}`;
  abi: Abi;
  functionName: string;
  args: [`0x${string}`, `0x${string}`, bigint, `0x${string}`];
};

export type SettlerExecutionParams = {
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

export type Position = {
  pool: v3Pool | v4Pool;
  tickLower: number;
  tickUpper: number;
  liquidity: bigint;
  amount0: bigint;
  amount1: bigint;
  amount0Min?: bigint; // encodes slippage
  amount1Min?: bigint; // encodes slippage
};

export type PositionWithFees = Position & {
  owner: `0x${string}`;
  tokenId: bigint; // could also see a case for this to be under Position
  feeAmount0: bigint;
  feeAmount1: bigint;
};

export type ResponseDestination = (v3Pool | v4Pool) & {
  routes: Route[];
  bridgeType: BridgeType;
  migrationMethod: MigrationMethod;
  executionParams: MigratorExecutionParams;
  // if debug flag set, these will be populated
  settlerExecutionParams?: SettlerExecutionParams[];
  swapAmountInMilliBps?: number;
};

export type UnavailableResponseDestination = {
  destination: RequestExactDestination;
  reasons: string[];
};

export type RequestMigrationResponse = {
  sourcePosition: PositionWithFees;
  destinations: ResponseDestination[];
  unavailableDestinations: UnavailableResponseDestination[];
};

export type RequestMigrationsResponse = {
  sourcePosition: PositionWithFees;
  destinations: ResponseDestination[][];
  unavailableDestinations: UnavailableResponseDestination[];
};

export type RequestExactMigrationResponse = {
  sourcePosition: PositionWithFees;
  destination: ResponseDestination;
};
