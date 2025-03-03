import { SettlementParamsForSettlerAbi, V3SettlementParamsAbi, V4SettlementParamsAbi } from "../abis/SettlementParams";
import { AcrossMigrationParamsAbi } from "../abis/AcrossMigrationParams";
import type {
  AcrossMigrationParams,
  AcrossRoute,
  UniswapV3SettlementParams,
  UniswapV4SettlementParams,
} from "../types";
import { encodeAbiParameters } from "viem";


export function encodeV3SettlementParams(params: UniswapV3SettlementParams) {
  return encodeAbiParameters(
    V3SettlementParamsAbi,
    [{
        recipient: params.recipient,
        token0: params.token0,
        token1: params.token1,
        fee: params.feeTier,
        tickLower: params.tickLower,
        tickUpper: params.tickUpper,
        amount0Min: params.amount0Min,
        amount1Min: params.amount1Min,
        senderFeeBps: params.senderFeeBps,
        senderFeeRecipient: params.senderFeeRecipient,
    }]
  );
}

export function encodeV4SettlementParams(params: UniswapV4SettlementParams) {
  return encodeAbiParameters(
    V4SettlementParamsAbi,
    [
      {
        recipient: params.recipient,
        token0: params.token0,
        token1: params.token1,
        fee: params.feeTier,
        hooks: params.hooks,
        tickLower: params.tickLower,
        tickUpper: params.tickUpper,
        amount0Min: params.amount0Min,
        amount1Min: params.amount1Min,
        senderFeeBps: params.senderFeeBps,
        senderFeeRecipient: params.senderFeeRecipient,
      },
    ]
  );
}

export function encodeSettlementParamsForSettler(
  params: `0x${string}`,
  migrationId?: `0x${string}`
) {
  return encodeAbiParameters(
    SettlementParamsForSettlerAbi,
    [
      migrationId ?? "0x0000000000000000000000000000000000000000000000000000000000000000",
      params,
    ]
  );
}

export function encodeAcrossMigrationParams(params: AcrossMigrationParams) {
  const settlementParams = 'hooks' in params.baseParams.settlementParams 
    ? encodeV4SettlementParams(params.baseParams.settlementParams as UniswapV4SettlementParams)
    : encodeV3SettlementParams(params.baseParams.settlementParams as UniswapV3SettlementParams);
  
  return {
    migratorMessage: encodeAbiParameters(
      AcrossMigrationParamsAbi,
      [
        {
        baseMigrationParams: {
          destinationChainId: BigInt(params.baseParams.destinationChainId),
          recipientSettler: params.baseParams.recipientSettler,
          settlementParams: settlementParams,
        },
        acrossRoutes: params.acrossRoutes.map(route => ({
          inputToken: route.inputToken,
          outputToken: route.outputToken,
          maxFees: route.maxFees,
          quoteTimestamp: route.quoteTimestamp,
          fillDeadlineOffset: route.fillDeadlineOffset,
          exclusiveRelayer: route.exclusiveRelayer,
          exclusivityDeadline: route.exclusivityDeadline,
        })),
      },
    ]),
    settlerMessage: encodeSettlementParamsForSettler(settlementParams),
  };
}

// export function encodeAcrossRoutes(routes: AcrossRoute[]) {
//   return encodeAbiParameters(
//     AcrossRoutesAbi,
//     routes.map(route => ({
//       inputToken: route.inputToken,
//       outputToken: route.outputToken,
//       maxFees: route.maxFees,
//       quoteTimestamp: route.quoteTimestamp,
//       fillDeadlineOffset: route.fillDeadlineOffset,
//       exclusiveRelayer: route.exclusiveRelayer,
//       exclusivityDeadline: route.exclusivityDeadline,
//     }))
//   );
// }
