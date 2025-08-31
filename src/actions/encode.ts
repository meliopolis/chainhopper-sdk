import {
  SettlementParamsAbi,
  V4MintParamsAbi,
  V3MintParamsAbi,
  ParamsForSettlerAbi,
  AerodromeMintParamsAbi,
} from '../abis/SettlementParams';
import { MigrationParamsAbi, RouteAbi } from '../abis/MigrationParams';
import type {
  AerodromeMintParams,
  MigrationData,
  MigrationParams,
  SettlementParams,
  UniswapV3MintParams,
  UniswapV4MintParams,
} from '../types';
import { encodeAbiParameters, keccak256 } from 'viem';
import { MigrationMethod } from '../utils/constants';
import { MigrationDataComponentsAbi, RoutesDataAbi } from '../abis/MigrationData';

export const genMigrationId = (migrationData: MigrationData): `0x${string}` => {
  return keccak256(
    encodeAbiParameters(MigrationDataComponentsAbi, [
      migrationData.sourceChainId,
      migrationData.migrator,
      migrationData.nonce,
      migrationData.mode == MigrationMethod.SingleToken ? 1 : 2,
      migrationData.routesData || '0x',
      migrationData.settlementData || '0x',
    ])
  );
};

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
      tickSpacing: params.tickSpacing,
      hooks: params.hooks,
      sqrtPriceX96: params.sqrtPriceX96,
      tickLower: params.tickLower,
      tickUpper: params.tickUpper,
      amount0Min: params.amount0Min,
      amount1Min: params.amount1Min,
      swapAmountInMilliBps: params.swapAmountInMilliBps,
    },
  ]);
};

export const encodeMintParamsForAerodrome = (params: AerodromeMintParams): `0x${string}` => {
  return encodeAbiParameters(AerodromeMintParamsAbi, [
    {
      token0: params.token0,
      token1: params.token1,
      tickSpacing: params.tickSpacing,
      sqrtPriceX96: params.sqrtPriceX96,
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

export const encodeParamsForSettler = (migrationData: MigrationData): `0x${string}` => {
  return encodeAbiParameters(ParamsForSettlerAbi, [
    genMigrationId(migrationData),
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
  migrationData: MigrationData
): { migratorMessage: `0x${string}`; settlerMessage: `0x${string}` } => {
  const mintParams =
    'hooks' in params.settlementParams
      ? encodeMintParamsForV4(params.settlementParams as SettlementParams & UniswapV4MintParams)
      : 'fee' in params.settlementParams
        ? encodeMintParamsForV3(params.settlementParams as SettlementParams & UniswapV3MintParams)
        : encodeMintParamsForAerodrome(params.settlementParams as SettlementParams & AerodromeMintParams);

  const settlementParams = encodeSettlementParams(params.settlementParams, mintParams);
  const routes = params.tokenRoutes.map((route) => {
    if ('maxFees' in route) {
      // check for Across route
      return encodeAbiParameters(RouteAbi, [
        {
          outputToken: route.outputToken,
          maxFees: route.maxFees,
          quoteTimestamp: route.quoteTimestamp,
          fillDeadlineOffset: route.fillDeadlineOffset,
          exclusiveRelayer: route.exclusiveRelayer,
          exclusivityDeadline: route.exclusivityDeadline,
        },
      ]);
    } else {
      return '0x' as `0x${string}`;
    }
  });
  const routesDataForSettler =
    params.tokenRoutes.length > 1
      ? encodeAbiParameters(RoutesDataAbi, [
          'outputToken' in params.tokenRoutes[0] ? params.tokenRoutes[0].outputToken : params.tokenRoutes[0].inputToken,
          'outputToken' in params.tokenRoutes[1] ? params.tokenRoutes[1].outputToken : params.tokenRoutes[1].inputToken,
          params.tokenRoutes[0].minAmountOut,
          params.tokenRoutes[1].minAmountOut,
        ])
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
    settlerMessage: encodeParamsForSettler({
      ...migrationData,
      routesData: routesDataForSettler,
      settlementData: settlementParams,
    }),
  };
};
