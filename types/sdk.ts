import type { IV3PositionWithUncollectedFees } from "../actions/getV3Position";
import type { IV4PositionWithUncollectedFees } from "../actions/getV4Position";
import { BridgeType, MigrationMethod, Protocol } from "../utils/constants";
import type { Position as V3Position } from "@uniswap/v3-sdk";
import type { Position as V4Position } from "@uniswap/v4-sdk";

export interface IUniswapPositionParams {
  chainId: number;
  tokenId: bigint;
  owner: `0x${string}`;
}

export type TokenAmount = {
  address: `0x${string}`;
  amount: bigint;
}

export type BaseRequestMigrationParams = {
  sourceChainId: number;
  // sourceProtocol: Protocol;
  destinationChainId: number;
  tokenId: bigint;
  owner: `0x${string}`; // needed for call data
  destinationProtocol: Protocol;
  bridgeType: BridgeType;
  migrationMethod: MigrationMethod;
  senderFeeBps?: number;
  senderFeeRecipient?: `0x${string}`;
}

export type UniswapV3Params = {
  token0: `0x${string}`;
  token1: `0x${string}`;
  feeTier: number;
  tickLower: number;
  tickUpper: number;
}

export type UniswapV4Params = UniswapV3Params & {
  hooks: `0x${string}`;
  tickSpacing: number;
}

export type RequestV3MigrationParams = BaseRequestMigrationParams & (UniswapV3Params | UniswapV4Params) & {
  sourceProtocol: Protocol.UniswapV3;
  // destinationProtocol: Protocol.UniswapV3 | Protocol.UniswapV4;
}

export type RequestV4MigrationParams = BaseRequestMigrationParams & (UniswapV3Params | UniswapV4Params) & {
  sourceProtocol: Protocol.UniswapV4;
  // destinationProtocol: Protocol.UniswapV3 | Protocol.UniswapV4;
}

export type RequestV3toV3MigrationParams = BaseRequestMigrationParams & UniswapV3Params & {
  sourceProtocol: Protocol.UniswapV3;
  destinationProtocol: Protocol.UniswapV3;
};

export type RequestV3toV4MigrationParams = BaseRequestMigrationParams & UniswapV4Params & {
  sourceProtocol: Protocol.UniswapV3;
  destinationProtocol: Protocol.UniswapV4;
};

export type RequestV4toV4MigrationParams = BaseRequestMigrationParams & UniswapV4Params & {
  sourceProtocol: Protocol.UniswapV4;
  destinationProtocol: Protocol.UniswapV4;
}

export type RequestV4toV3MigrationParams = BaseRequestMigrationParams & UniswapV3Params & {
  sourceProtocol: Protocol.UniswapV4;
  destinationProtocol: Protocol.UniswapV3;
}

export type RequestMigrationParams = RequestV3toV3MigrationParams | RequestV3toV4MigrationParams | RequestV4toV4MigrationParams | RequestV4toV3MigrationParams;


type AcrossFeeBreakdown = {
  [K in 'lpFee' | 'relayerGasFee' | 'relayerCapitalFee' | 'totalRelayFee']: {
    pct: bigint;
    total: bigint;
  }
}

export type RequestMigrationResponse = {
  sourceProtocol: Protocol,
  sourcePosition: IV3PositionWithUncollectedFees | IV4PositionWithUncollectedFees,
  sourceTokenId: bigint,
  destProtocol: Protocol,
  destPosition: V3Position | V4Position,
  destChainId: number,
  migratorMessage: `0x${string}`,
  settlerMessage: `0x${string}`,
  quoteDetails: {
    inputAmount: bigint,
    outputAmount: bigint,
    fees: AcrossFeeBreakdown,
    exclusivityDeadline: number,
  }
}