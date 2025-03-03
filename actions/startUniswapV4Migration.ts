import type { ChainConfig } from "../chains";
import { type IV3PositionWithUncollectedFees } from "./getV3Position";
import { BridgeType, MigrationMethod } from "../utils/constants";
import type { RequestV4MigrationParams } from "../types";
import { CurrencyAmount } from "@uniswap/sdk-core";
import { acrossClient } from "../lib/acrossClient";
import { encodeSettlementParamsForSettler, encodeV3SettlementParams } from "./encode";
import type { IV4PositionWithUncollectedFees } from "./getV4Position";
import type { Quote } from "@across-protocol/app-sdk";

export async function startUniswapV4Migration(
  sourceChainConfig: ChainConfig, 
  destinationChainConfig: ChainConfig, 
  v4PositionWithUncollectedFees: IV4PositionWithUncollectedFees, 
  params: RequestV4MigrationParams
) {

  // TODO: implement v4 migration

  // if migration Method is single-token
  if (params.migrationMethod === MigrationMethod.SingleToken) {
    return {
      acrossQuotes: [] as Quote[],
    }
  } else if (params.migrationMethod === MigrationMethod.DualToken) {
    // TODO: implement dual token migration
    throw new Error('Dual token migration not implemented');
  } else {
    throw new Error('Invalid migration method');
  }

}