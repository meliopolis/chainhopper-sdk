import type { ChainConfig } from "../chains";
import type { RequestV3toV4MigrationParams, RequestV4MigrationParams, RequestV4toV4MigrationParams } from "../types";
import { CurrencyAmount } from "@uniswap/sdk-core";
import { encodeAcrossMigrationParams } from "./encode";
import { getV3Pool } from "./getV3Pool";
import { nearestUsableTick, Position } from "@uniswap/v3-sdk";
import type { Quote } from "@across-protocol/app-sdk";


export async function settleUniswapV4Migration(
  destinationChainConfig: ChainConfig, 
  acrossQuotes: Quote[],
  params: RequestV3toV4MigrationParams | RequestV4toV4MigrationParams
) {

  if (acrossQuotes.length === 0){
    throw new Error('No bridged token found');
  } else if (acrossQuotes.length === 1){
  
    
    return {
      destV4Position: {} as Position,
      migratorMessage: '0x' as `0x${string}`,
      settlerMessage: '0x' as `0x${string}`,
    }
  } else if (acrossQuotes.length === 2){
    throw new Error('Dual token migration not implemented');
  } else {
    throw new Error('Invalid number of quotes');
  }
}