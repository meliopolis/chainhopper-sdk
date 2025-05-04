import type { Abi } from 'viem';
import type { IV3PositionWithUncollectedFees } from '../actions/getV3Position';
import type { IV4PositionWithUncollectedFees } from '../actions/getV4Position';
import { BridgeType, MigrationMethod, Protocol } from '../utils/constants';
import type { Position as V3Position } from '@uniswap/v3-sdk';
import type { Position as V4Position } from '@uniswap/v4-sdk';

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

export type SlippageCalcs = {
  swapAmountInMilliBps: number;
  mintAmount0Min: bigint;
  mintAmount1Min: bigint;
  routeMinAmountOuts: bigint[];
};

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

export type RequestMigrationResponse = {
  sourceProtocol: Protocol;
  sourcePosition: IV3PositionWithUncollectedFees | IV4PositionWithUncollectedFees;
  sourceTokenId: bigint;
  sourceChainId: number;
  owner: `0x${string}`;
  destProtocol: Protocol;
  destPosition: V3Position | V4Position;
  destChainId: number;
  migratorMessage: `0x${string}`;
  settlerMessage: `0x${string}`;
  slippageCalcs: SlippageCalcs;
  routes: Route[];
  executionParams: ExecutionParams;
};
