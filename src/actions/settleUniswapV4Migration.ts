import { CurrencyAmount, Fraction, Percent } from '@uniswap/sdk-core';
import { getV4Pool } from './getV4Pool';
import { MigrationMethod, NATIVE_ETH_ADDRESS } from '../utils/constants';
import { zeroAddress } from 'viem';
import { generateMaxV4Position, generateMigrationParams } from '../utils/helpers';
import { getV4Quote } from './getV4Quote';
import type { InternalSettleMigrationParams, InternalSettleMigrationResult } from '../types/internal';
import { getSettlerFees } from './getSettlerFees';
import type { RequestV3toV4MigrationParams, RequestV4toV4MigrationParams } from '../types';

export const settleUniswapV4Migration = async ({
  destinationChainConfig,
  migrationId,
  routes,
  externalParams,
}: InternalSettleMigrationParams): Promise<InternalSettleMigrationResult> => {
  if (routes.length === 0) throw new Error('No routes found');
  if (routes.length > 2) throw new Error('Invalid number of routes');

  const { tickSpacing, hooks } = externalParams as RequestV3toV4MigrationParams | RequestV4toV4MigrationParams;

  // now we need fetch the pool on the destination chain
  const pool = await getV4Pool(destinationChainConfig, {
    currency0: externalParams.token0,
    currency1: externalParams.token1,
    fee: externalParams.fee,
    tickSpacing: tickSpacing,
    hooks: hooks,
  });

  // get the settler fees
  const { protocolShareBps } = await getSettlerFees(destinationChainConfig, destinationChainConfig.UniswapV4AcrossSettler);
  const settlerFeesInBps = BigInt(protocolShareBps) + BigInt(externalParams.senderShareBps || 0);

  if (routes.length === 1) {

    const route = routes[0];
    const routeMinAmountOut = route.minOutputAmount;

    // we need to create two potential LP positions on destination chain
    // 1. using the across quote output amount. This is the best position possible
    // 2. using the routeMinAmountOut. This helps us calculate the worst position given slippage

    // estimate max otherToken available if all baseToken was traded away
    // TODO need to handle weth (right now only handle native token pools)
    const amountIn = route.outputAmount * (1n - settlerFeesInBps / 10_000n);
    const quoteOnDestChain = await getV4Quote(destinationChainConfig, pool.poolKey, amountIn, true, '0x');

    // TODO compare quote price vs pool price
    // if diff too high, find a communicate that in return bundle
    const baseTokenAvailable = CurrencyAmount.fromRawAmount(pool.token0, route.outputAmount.toString());
    const maxOtherTokenAvailable = CurrencyAmount.fromRawAmount(pool.token1, quoteOnDestChain.toString());
    const maxPosition = generateMaxV4Position(pool, baseTokenAvailable, maxOtherTokenAvailable, externalParams.tickLower, externalParams.tickUpper, MigrationMethod.SingleToken);

    // now we calculate the max position using the routeMinAmountOut
    const amountInUsingRouteMinAmountOut = routeMinAmountOut * (1n - settlerFeesInBps / 10_000n);
    const quoteOnDestChainUsingRouteMinAmountOut = await getV4Quote(destinationChainConfig, pool.poolKey, amountInUsingRouteMinAmountOut, true, '0x');

    const baseTokenAvailableUsingRouteMinAmountOut = CurrencyAmount.fromRawAmount(pool.token0, amountInUsingRouteMinAmountOut.toString());
    const maxOtherTokenAvailableUsingRouteMinAmountOut = CurrencyAmount.fromRawAmount(pool.token1, quoteOnDestChainUsingRouteMinAmountOut.toString());
    const maxPositionUsingRouteMinAmountOut = generateMaxV4Position(
      pool,
      baseTokenAvailableUsingRouteMinAmountOut,
      maxOtherTokenAvailableUsingRouteMinAmountOut,
      externalParams.tickLower,
      externalParams.tickUpper,
      MigrationMethod.SingleToken
    );

    // calculate swapAmountInMilliBps
    const swapAmountInMilliBps =
      externalParams.token0 === destinationChainConfig.wethAddress || externalParams.token0 === zeroAddress
      ? maxPosition.amount0.asFraction.divide(baseTokenAvailable.asFraction).multiply(10_000_000).add(new Fraction(1, 10_000_000)).toFixed(0)
      : maxPosition.amount1.asFraction.divide(baseTokenAvailable.asFraction).multiply(10_000_000).add(new Fraction(1, 10_000_000)).toFixed(0);

    return generateMigrationParams(
      migrationId,
      externalParams,
      destinationChainConfig,
      routes,
      maxPosition,
      maxPositionUsingRouteMinAmountOut,
      10_000_000 - Number(swapAmountInMilliBps)
    );

  } else { // logically has to be (routes.length) === 2 but needs to look exhaustive for ts compiler
    // make sure both tokens are found in routes
    let token0Address = externalParams.token0 === NATIVE_ETH_ADDRESS ? destinationChainConfig.wethAddress : externalParams.token0;
    let token1Address = externalParams.token1 === NATIVE_ETH_ADDRESS ? destinationChainConfig.wethAddress : externalParams.token1;
    if (token0Address != routes[0].outputToken && token0Address != routes[1].outputToken) throw new Error('Requested token0 not found in routes');
    if (token1Address != routes[0].outputToken && token1Address != routes[1].outputToken) throw new Error('Requested token1 not found in routes');

    let token0Available = routes[0].outputAmount * (1n - settlerFeesInBps / 10_000n);
    let token1Available = routes[1].outputAmount * (1n - settlerFeesInBps / 10_000n);
    let minToken0Available = routes[0].minOutputAmount * (1n - settlerFeesInBps / 10_000n);
    let minToken1Available = routes[1].minOutputAmount * (1n - settlerFeesInBps / 10_000n);

    let settleAmountOut0, settleAmountOut1, settleMinAmountOut0, settleMinAmountOut1;
    if (externalParams.token0 !== routes[0].outputToken) {
      // the token order must be flipped if the token addresses sort in a different order on the destination chain
      settleAmountOut0 = CurrencyAmount.fromRawAmount(pool.token0, token1Available.toString());
      settleAmountOut1 = CurrencyAmount.fromRawAmount(pool.token1, token0Available.toString());
      settleMinAmountOut0 = CurrencyAmount.fromRawAmount(pool.token0, minToken1Available.toString());
      settleMinAmountOut1 = CurrencyAmount.fromRawAmount(pool.token1, minToken0Available.toString());
    } else {
      settleAmountOut0 = CurrencyAmount.fromRawAmount(pool.token0, token0Available.toString());
      settleAmountOut1 = CurrencyAmount.fromRawAmount(pool.token1, token1Available.toString());
      settleMinAmountOut0 = CurrencyAmount.fromRawAmount(pool.token0, minToken0Available.toString());
      settleMinAmountOut1 = CurrencyAmount.fromRawAmount(pool.token1, minToken1Available.toString());
    }

    const maxPosition = generateMaxV4Position(
      pool,
      settleAmountOut0,
      settleAmountOut1,
      externalParams.tickLower,
      externalParams.tickUpper,
      MigrationMethod.DualToken
    );

    const maxPositionUsingSettleMinAmountsOut = generateMaxV4Position(
      pool,
      settleMinAmountOut0,
      settleMinAmountOut1,
      externalParams.tickLower,
      externalParams.tickUpper,
      MigrationMethod.DualToken
    );

    return generateMigrationParams(
      migrationId,
      externalParams,
      destinationChainConfig,
      routes,
      maxPosition,
      maxPositionUsingSettleMinAmountsOut
    );
  }
};
