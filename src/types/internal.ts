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
  migrationId: `0x${string}`;
  routes: Route[];
};

export type InternalSettleMigrationParams = {
  destinationChainConfig: ChainConfig;
  migrationId: `0x${string}`;
  routes: Route[];
  externalParams: RequestMigrationParams;
};

export type InternalSettleMigrationResult = {
  destPosition: V3Position | V4Position;
  slippageCalcs: SlippageCalcs;
  migratorMessage: `0x${string}`;
  settlerMessage: `0x${string}`;
};
