import { CurrencyAmount, Fraction } from '@uniswap/sdk-core';
import { getV3Pool } from './getV3Pool';
import { DEFAULT_SLIPPAGE_IN_BPS } from '../utils/constants';
import { generateMaxV3Position, generateMaxV3orV4PositionWithSwapAllowed, generateMigrationParams } from '../utils/helpers';
import type { InternalSettleMigrationParams, InternalSettleMigrationResult } from '../types/internal';
import { getSettlerFees } from './getSettlerFees';

export const settleUniswapV3Migration = async ({
  destinationChainConfig,
  migrationId,
  routes,
  externalParams,
}: InternalSettleMigrationParams): Promise<InternalSettleMigrationResult> => {
  if (routes.length === 0) throw new Error('No routes found');
  if (routes.length > 2) throw new Error('Invalid number of routes');

  // fetch the pool on the destination chain
  const pool = await getV3Pool(destinationChainConfig, externalParams.token0, externalParams.token1, externalParams.fee);

  // get the settler fees
  const { protocolShareBps } = await getSettlerFees(destinationChainConfig, destinationChainConfig.UniswapV3AcrossSettler);
  const settlerFeesInBps = BigInt(protocolShareBps) + BigInt(externalParams.senderShareBps || 0);

  if (routes.length === 1) {
    const isWethToken0 = externalParams.token0 === destinationChainConfig.wethAddress;
    const route = routes[0];
    const routeMinAmountOut = route.minOutputAmount;
    const numIterations = 5; // number of iterations to calculate the max position with swap

    // we need to create two potential LP positions on destination chain:

    // 1. using the across quote output amount. This is the best position possible
    // 2. using the routeMinAmountOut. This helps us calculate the worst position given slippage

    // 1. calculate the max position using the across quote output amount
    const amountIn = route.outputAmount * (1n - settlerFeesInBps / 10_000n);
    const baseTokenAvailable = CurrencyAmount.fromRawAmount(isWethToken0 ? pool.token0 : pool.token1, amountIn.toString());
    const otherTokenAvailable = isWethToken0 ? CurrencyAmount.fromRawAmount(pool.token1, 0) : CurrencyAmount.fromRawAmount(pool.token0, 0);
    const maxPositionWithSwap = await generateMaxV3orV4PositionWithSwapAllowed(
      destinationChainConfig,
      pool,
      isWethToken0 ? baseTokenAvailable : otherTokenAvailable,
      isWethToken0 ? otherTokenAvailable : baseTokenAvailable,
      externalParams.tickLower,
      externalParams.tickUpper,
      new Fraction(externalParams.slippageInBps || DEFAULT_SLIPPAGE_IN_BPS, 10000).divide(20),
      numIterations
    );
    // TODO compare quote price vs pool price; if diff too high, alert somehow
    // 2. now we calculate the max position using the routeMinAmountOut
    const amountInUsingRouteMinAmountOut = routeMinAmountOut * (1n - settlerFeesInBps / 10_000n);
    const baseTokenAvailableUsingRouteMinAmountOut = CurrencyAmount.fromRawAmount(isWethToken0 ? pool.token0 : pool.token1, amountInUsingRouteMinAmountOut.toString());
    const otherTokenAvailableUsingRouteMinAmountOut = isWethToken0 ? CurrencyAmount.fromRawAmount(pool.token1, 0) : CurrencyAmount.fromRawAmount(pool.token0, 0);
    const maxPositionWithSwapUsingRouteMinAmountOut = await generateMaxV3orV4PositionWithSwapAllowed(
      destinationChainConfig,
      pool,
      isWethToken0 ? baseTokenAvailableUsingRouteMinAmountOut : otherTokenAvailableUsingRouteMinAmountOut,
      isWethToken0 ? otherTokenAvailableUsingRouteMinAmountOut : baseTokenAvailableUsingRouteMinAmountOut,
      externalParams.tickLower,
      externalParams.tickUpper,
      new Fraction(externalParams.slippageInBps || DEFAULT_SLIPPAGE_IN_BPS, 10000).divide(20),
      numIterations
    );

    // calculate swapAmountInMilliBps
    // TODO improve this calculation
    const swapAmountInMilliBps =
      externalParams.token0 === destinationChainConfig.wethAddress
        ? maxPositionWithSwap.amount0.asFraction.divide(baseTokenAvailable.asFraction).multiply(10_000_000).quotient
        : maxPositionWithSwap.amount1.asFraction.divide(baseTokenAvailable.asFraction).multiply(10_000_000).quotient;

    return generateMigrationParams(
      migrationId,
      externalParams,
      destinationChainConfig,
      routes,
      maxPositionWithSwap,
      maxPositionWithSwapUsingRouteMinAmountOut,
      10_000_000 - Number(swapAmountInMilliBps.toString())
    );
  } else {
    // logically has to be (routes.length) === 2 but needs to look exhaustive for ts compiler
    // make sure both tokens are found in routes
    if (externalParams.token0 != routes[0].outputToken && externalParams.token0 != routes[1].outputToken) throw new Error('Requested token0 not found in routes');
    if (externalParams.token1 != routes[0].outputToken && externalParams.token1 != routes[1].outputToken) throw new Error('Requested token1 not found in routes');

    const token0Available = routes[0].outputAmount * (1n - settlerFeesInBps / 10_000n);
    const token1Available = routes[1].outputAmount * (1n - settlerFeesInBps / 10_000n);
    const minToken0Available = routes[0].minOutputAmount * (1n - settlerFeesInBps / 10_000n);
    const minToken1Available = routes[1].minOutputAmount * (1n - settlerFeesInBps / 10_000n);

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

    const maxPosition = generateMaxV3Position(pool, settleAmountOut0, settleAmountOut1, externalParams.tickLower, externalParams.tickUpper);

    const maxPositionUsingSettleMinAmountsOut = generateMaxV3Position(pool, settleMinAmountOut0, settleMinAmountOut1, externalParams.tickLower, externalParams.tickUpper);

    return generateMigrationParams(migrationId, externalParams, destinationChainConfig, routes, maxPosition, maxPositionUsingSettleMinAmountsOut);
  }
};
