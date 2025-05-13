import type { Quote } from '@across-protocol/app-sdk';
import type { RequestMigrationParams, RequestV3MigrationParams, RequestV4MigrationParams, Route, SlippageCalcs } from './sdk';
import type { Position as V3Position } from '@uniswap/v3-sdk';
import type { Position as V4Position } from '@uniswap/v4-sdk';
import type { ChainConfig } from '../chains';
import type { IV3PositionWithUncollectedFees } from '../actions/getV3Position';
import type { IV4PositionWithUncollectedFees } from '../actions/getV4Position';

export type InternalStartMigrationParams = {
  sourceChainConfig: ChainConfig;
  destinationChainConfig: ChainConfig;
  positionWithUncollectedFees: IV3PositionWithUncollectedFees | IV4PositionWithUncollectedFees;
  externalParams: RequestV3MigrationParams | RequestV4MigrationParams;
};

export type InternalStartMigrationResult = {
  acrossQuotes: Quote[];
  migrationHash: `0x${string}`;
  routes: Route[];
};

export type InternalSettleMigrationParams = {
  sourceChainConfig: ChainConfig;
  destinationChainConfig: ChainConfig;
  migrationHash: `0x${string}`;
  routes: Route[];
  externalParams: RequestMigrationParams;
  owner: `0x${string}`;
};

export type InternalSettleMigrationResult = {
  destPosition: V3Position | V4Position;
  slippageCalcs: SlippageCalcs;
  migratorMessage: `0x${string}`;
  settlerMessage: `0x${string}`;
};

export type InternalGenerateMigrationParamsInput = {
  migrationHash: `0x${string}`;
  externalParams: RequestMigrationParams;
  sourceChainConfig: ChainConfig;
  destinationChainConfig: ChainConfig;
  routes: Route[];
  maxPosition: V3Position | V4Position;
  maxPositionUsingRouteMinAmountOut: V3Position | V4Position;
  owner: `0x${string}`;
  swapAmountInMilliBps?: number;
};
