import type { Quote } from '@across-protocol/app-sdk';
import type { Position as V3Position } from '@uniswap/v3-sdk';
import type { Position as V4Position } from '@uniswap/v4-sdk';

import type {
  ExactPath,
  MigrationFees,
  PathFilter,
  RequestMigrationParams,
  Route,
  UniswapV3Params,
  UniswapV4Params,
} from './sdk';
import type { ChainConfig } from '../chains';
import type { PositionWithFees, Position } from './sdk';

export type IUniswapPositionParams = {
  chainId: number;
  tokenId: bigint;
};

export type InternalStartMigrationParams = {
  sourceChainConfig: ChainConfig;
  destinationChainConfig: ChainConfig;
  migration: InternalDestinationWithExactPath;
  positionWithFees: PositionWithFees;
  externalParams: RequestMigrationParams;
};

export type InternalStartMigrationResult = {
  acrossQuotes: Quote[];
  routes: Route[];
};

export type InternalSettleMigrationParams = {
  sourceChainConfig: ChainConfig;
  destinationChainConfig: ChainConfig;
  routes: Route[];
  migration: InternalDestinationWithExactPath;
  externalParams: RequestMigrationParams;
  owner: `0x${string}`;
};

export type InternalSettleMigrationResult = {
  destPosition: Position;
  migratorMessage: `0x${string}`;
  settlerMessage: `0x${string}`;
  swapAmountInMilliBps?: number;
  senderFees: MigrationFees;
  protocolFees: MigrationFees;
};

export type InternalGenerateMigrationParamsInput = {
  externalParams: RequestMigrationParams;
  sourceChainConfig: ChainConfig;
  destinationChainConfig: ChainConfig;
  migration: InternalDestinationWithExactPath;
  routes: Route[];
  maxPosition: V3Position | V4Position;
  maxPositionUsingRouteMinAmountOut: V3Position | V4Position;
  owner: `0x${string}`;
  swapAmountInMilliBps?: number;
  expectedRefund?: { amount0Refund: bigint; amount1Refund: bigint };
  senderFees: MigrationFees;
  protocolFees: MigrationFees;
};

export type InternalDestinationWithExactPath = {
  destination: UniswapV3Params | UniswapV4Params;
  exactPath: ExactPath;
};

export type InternalDestinationWithPathFilter = {
  destination: UniswapV3Params | UniswapV4Params;
  path?: PathFilter;
};
