import { SettlementParamsForSettlerAbi, SettlementParamsAbi, V4MintParamsAbi, V3MintParamsAbi } from '../abis/SettlementParams';
import { MigrationParamsAbi, RouteAbi } from '../abis/MigrationParams';
import type { MigrationParams, SettlementParams, UniswapV3MintParams, UniswapV4MintParams } from '../types';
import { encodeAbiParameters } from 'viem';

export const encodeMintParamsForV3 = (params: UniswapV3MintParams): `0x${string}` => {
  return encodeAbiParameters(V3MintParamsAbi, [
    {
      token0: params.token0,
      token1: params.token1,
      fee: params.fee,
      sqrtPriceX96: params.sqrtPriceX96,
      tickLower: params.tickLower,
      tickUpper: params.tickUpper,
      amount0Min: params.amount0Min,
      amount1Min: params.amount1Min,
      swapAmountInMilliBps: params.swapAmountInMilliBps,
    },
  ]);
};

export const encodeMintParamsForV4 = (params: UniswapV4MintParams): `0x${string}` => {
  return encodeAbiParameters(V4MintParamsAbi, [
    {
      token0: params.token0,
      token1: params.token1,
      fee: params.fee,
      sqrtPriceX96: params.sqrtPriceX96,
      tickSpacing: params.tickSpacing,
      hooks: params.hooks,
      tickLower: params.tickLower,
      tickUpper: params.tickUpper,
      amount0Min: params.amount0Min,
      amount1Min: params.amount1Min,
      swapAmountInMilliBps: params.swapAmountInMilliBps,
    },
  ]);
};

export const encodeSettlementParams = (params: SettlementParams, mintParams: `0x${string}`): `0x${string}` => {
  return encodeAbiParameters(SettlementParamsAbi, [
    {
      recipient: params.recipient,
      senderShareBps: params.senderShareBps,
      senderFeeRecipient: params.senderFeeRecipient,
      mintParams,
    },
  ]);
};

export const encodeSettlementParamsForSettler = (settlementParams: `0x${string}`, migrationId: `0x${string}`): `0x${string}` => {
  return encodeAbiParameters(SettlementParamsForSettlerAbi, [migrationId, settlementParams]);
};

export const encodeMigrationParams = (params: MigrationParams, migrationId: `0x${string}`): { migratorMessage: `0x${string}`; settlerMessage: `0x${string}` } => {
  const mintParams =
    'hooks' in params.settlementParams
      ? encodeMintParamsForV4(params.settlementParams as SettlementParams & UniswapV4MintParams)
      : encodeMintParamsForV3(params.settlementParams as SettlementParams & UniswapV3MintParams);

  const settlementParams = encodeSettlementParams(params.settlementParams, mintParams);
  const routes = params.tokenRoutes.map((route) =>
    encodeAbiParameters(RouteAbi, [
      {
        outputToken: route.outputToken,
        maxFees: route.maxFees,
        quoteTimestamp: route.quoteTimestamp,
        fillDeadlineOffset: route.fillDeadlineOffset,
        exclusiveRelayer: route.exclusiveRelayer,
        exclusivityDeadline: route.exclusivityDeadline,
      },
    ])
  );
  return {
    migratorMessage: encodeAbiParameters(MigrationParamsAbi, [
      {
        chainId: params.chainId,
        settler: params.settler,
        tokenRoutes: params.tokenRoutes.map((route, idx) => ({
          inputToken: route.inputToken,
          minAmountOut: route.minAmountOut,
          route: routes[idx],
        })),
        settlementParams,
      },
    ]),
    settlerMessage: encodeSettlementParamsForSettler(settlementParams, migrationId),
  };
};
