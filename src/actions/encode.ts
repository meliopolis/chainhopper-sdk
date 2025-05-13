import { SettlementParamsAbi, V4MintParamsAbi, V3MintParamsAbi, ParamsForSettlerAbi } from '../abis/SettlementParams';
import { MigrationParamsAbi, RouteAbi } from '../abis/MigrationParams';
import type { MigrationData, MigrationParams, SettlementParams, UniswapV3MintParams, UniswapV4MintParams } from '../types';
import { encodeAbiParameters } from 'viem';
import { MigrationMethod } from '../utils/constants';
import { RoutesDataAbi } from '../abis/MigrationData';

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

export const encodeParamsForSettler = (migrationHash: `0x${string}`, migrationData: MigrationData): `0x${string}` => {
  return encodeAbiParameters(ParamsForSettlerAbi, [
    migrationHash,
    {
      sourceChainId: migrationData.sourceChainId,
      migrator: migrationData.migrator,
      nonce: migrationData.nonce,
      mode: migrationData.mode == MigrationMethod.SingleToken ? 1 : 2,
      routesData: migrationData.routesData,
      settlementData: migrationData.settlementData,
    },
  ]);
};

export const encodeMigrationParams = (
  params: MigrationParams,
  migrationHash: `0x${string}`,
  migrationData: MigrationData
): { migratorMessage: `0x${string}`; settlerMessage: `0x${string}` } => {
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
  const routesDataForSettler =
    params.tokenRoutes.length > 1
      ? encodeAbiParameters(
          RoutesDataAbi,
          params.tokenRoutes.map((route) => ({
            token0: route.inputToken,
            token1: route.outputToken,
            amount0Min: route.minAmountOut,
            amount1Min: route.minAmountOut,
          }))
        )
      : '0x';
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
    settlerMessage: encodeParamsForSettler(migrationHash, {
      ...migrationData,
      routesData: routesDataForSettler,
      settlementData: settlementParams,
    }),
  };
};
