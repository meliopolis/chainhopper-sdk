import { CurrencyAmount, Fraction } from '@uniswap/sdk-core';
import { DEFAULT_SLIPPAGE_IN_BPS } from '../utils/constants';
import {
  generateMaxV3Position,
  generateMaxV3orV4PositionWithSwapAllowed,
  generateMigrationParams,
  calculateFees,
} from '../utils/helpers';
import type { InternalSettleMigrationParams, InternalSettleMigrationResult } from '../types/internal';
import { getSettlerFees } from './getSettlerFees';
import JSBI from 'jsbi';
import { getAerodromePool } from './getAerodromePool';
import type { AerodromeParams } from '@/types/sdk';

export const settleAerodromeMigration = async ({
  sourceChainConfig,
  destinationChainConfig,
  routes,
  migration,
  externalParams,
  owner,
}: InternalSettleMigrationParams): Promise<InternalSettleMigrationResult> => {
  const { exactPath } = migration;
  const destination = migration.destination as AerodromeParams;
  if (routes.length === 0) throw new Error('No routes found');
  if (routes.length > 2) throw new Error('Invalid number of routes');

  // fetch the pool on the destination chain
  const pool = await getAerodromePool(
    destinationChainConfig,
    destination.token0,
    destination.token1,
    destination.tickSpacing,
    destination.sqrtPriceX96
  );

  // get the settler fees
  const { protocolShareBps, protocolShareOfSenderFeePct } = await getSettlerFees(
    destinationChainConfig,
    destinationChainConfig.AerodromeAcrossSettler!
  );
  const senderShareBps = BigInt(externalParams.senderShareBps || 0);
  const settlerFeesInBps = protocolShareBps + senderShareBps;

  if (routes.length === 1) {
    if (
      JSBI.equal(pool.liquidity, JSBI.BigInt(0)) &&
      pool.tickCurrent < destination.tickUpper &&
      pool.tickCurrent >= destination.tickLower
    ) {
      throw new Error('No liquidity for required swap in destination pool');
    }

    const isWethToken0 = destination.token0 === destinationChainConfig.wethAddress;
    const route = routes[0];
    const routeMinAmountOut = route.minOutputAmount;
    const numIterations = 5; // number of iterations to calculate the max position with swap

    // we need to create two potential LP positions on destination chain:

    // 1. using the across quote output amount. This is the best position possible
    // 2. using the routeMinAmountOut. This helps us calculate the worst position given slippage

    // 1. calculate the max position using the across quote output amount
    const { amountIn, protocolFee, senderFee } = calculateFees(
      route.outputAmount,
      senderShareBps,
      protocolShareBps,
      protocolShareOfSenderFeePct
    );

    let protocolFees, senderFees;
    if (isWethToken0) {
      protocolFees = { bps: Number(protocolShareBps), amount0: protocolFee, amount1: 0n };
      senderFees = { bps: Number(senderShareBps), amount0: senderFee, amount1: 0n };
    } else {
      protocolFees = { bps: Number(protocolShareBps), amount0: 0n, amount1: protocolFee };
      senderFees = { bps: Number(senderShareBps), amount0: 0n, amount1: senderFee };
    }

    const baseTokenAvailable = CurrencyAmount.fromRawAmount(
      isWethToken0 ? pool.token0 : pool.token1,
      amountIn.toString()
    );
    const otherTokenAvailable = isWethToken0
      ? CurrencyAmount.fromRawAmount(pool.token1, 0)
      : CurrencyAmount.fromRawAmount(pool.token0, 0);
    const maxPositionWithSwap = await generateMaxV3orV4PositionWithSwapAllowed(
      destinationChainConfig,
      pool,
      isWethToken0 ? baseTokenAvailable : otherTokenAvailable,
      isWethToken0 ? otherTokenAvailable : baseTokenAvailable,
      destination.tickLower,
      destination.tickUpper,
      new Fraction(exactPath.slippageInBps || DEFAULT_SLIPPAGE_IN_BPS, 10000).divide(20),
      numIterations
    );

    const originalRatio = Number(pool.sqrtRatioX96.toString());
    const newRatio = Number(maxPositionWithSwap.position.pool.sqrtRatioX96.toString());
    const priceImpactBps = ((newRatio / originalRatio) ** 2 - 1) * 10000;

    if (Math.abs(priceImpactBps) > (exactPath.slippageInBps || DEFAULT_SLIPPAGE_IN_BPS)) {
      throw new Error('Price impact exceeds slippage');
    }

    // 2. now we calculate the max position using the routeMinAmountOut
    const amountInUsingRouteMinAmountOut = routeMinAmountOut * (1n - settlerFeesInBps / 10_000n);
    const baseTokenAvailableUsingRouteMinAmountOut = CurrencyAmount.fromRawAmount(
      isWethToken0 ? pool.token0 : pool.token1,
      amountInUsingRouteMinAmountOut.toString()
    );
    const otherTokenAvailableUsingRouteMinAmountOut = isWethToken0
      ? CurrencyAmount.fromRawAmount(pool.token1, 0)
      : CurrencyAmount.fromRawAmount(pool.token0, 0);
    const maxPositionWithSwapUsingRouteMinAmountOut = await generateMaxV3orV4PositionWithSwapAllowed(
      destinationChainConfig,
      pool,
      isWethToken0 ? baseTokenAvailableUsingRouteMinAmountOut : otherTokenAvailableUsingRouteMinAmountOut,
      isWethToken0 ? otherTokenAvailableUsingRouteMinAmountOut : baseTokenAvailableUsingRouteMinAmountOut,
      destination.tickLower,
      destination.tickUpper,
      new Fraction(exactPath.slippageInBps || DEFAULT_SLIPPAGE_IN_BPS, 10000).divide(20),
      numIterations
    );

    // calculate swapAmountInMilliBps
    // TODO improve this calculation
    const swapAmountInMilliBps =
      destination.token0 === destinationChainConfig.wethAddress
        ? maxPositionWithSwap.position.amount0.asFraction.divide(baseTokenAvailable.asFraction).multiply(10_000_000).quotient
        : maxPositionWithSwap.position.amount1.asFraction.divide(baseTokenAvailable.asFraction).multiply(10_000_000).quotient;

    return generateMigrationParams({
      externalParams,
      sourceChainConfig,
      destinationChainConfig,
      routes,
      migration,
      maxPosition: maxPositionWithSwap.position,
      maxPositionUsingRouteMinAmountOut: maxPositionWithSwapUsingRouteMinAmountOut.position,
      owner,
      protocolFees,
      senderFees,
      swapAmountInMilliBps: 10_000_000 - Number(swapAmountInMilliBps.toString()),
    });
  } else {
    // logically has to be (routes.length) === 2 but needs to look exhaustive for ts compiler
    // make sure both tokens are found in routes
    if (destination.token0 != routes[0].outputToken && destination.token0 != routes[1].outputToken)
      throw new Error('Requested token0 not found in routes');
    if (destination.token1 != routes[0].outputToken && destination.token1 != routes[1].outputToken)
      throw new Error('Requested token1 not found in routes');

    const feeInfo = routes.map((route) =>
      calculateFees(route.outputAmount, senderShareBps, protocolShareBps, protocolShareOfSenderFeePct)
    );

    const token0Available = feeInfo[0].amountIn;
    const token1Available = feeInfo[1].amountIn;
    const minToken0Available = routes[0].minOutputAmount * (1n - settlerFeesInBps / 10_000n);
    const minToken1Available = routes[1].minOutputAmount * (1n - settlerFeesInBps / 10_000n);

    let settleAmountOut0, settleAmountOut1, settleMinAmountOut0, settleMinAmountOut1, senderFees, protocolFees;
    if (destination.token0 !== routes[0].outputToken) {
      // the token order must be flipped if the token addresses sort in a different order on the destination chain
      settleAmountOut0 = CurrencyAmount.fromRawAmount(pool.token0, token1Available.toString());
      settleAmountOut1 = CurrencyAmount.fromRawAmount(pool.token1, token0Available.toString());
      settleMinAmountOut0 = CurrencyAmount.fromRawAmount(pool.token0, minToken1Available.toString());
      settleMinAmountOut1 = CurrencyAmount.fromRawAmount(pool.token1, minToken0Available.toString());
      senderFees = {
        bps: Number(senderShareBps),
        amount0: feeInfo[1].senderFee,
        amount1: feeInfo[0].senderFee,
      };
      protocolFees = {
        bps: Number(protocolShareBps),
        amount0: feeInfo[1].protocolFee,
        amount1: feeInfo[0].protocolFee,
      };
    } else {
      settleAmountOut0 = CurrencyAmount.fromRawAmount(pool.token0, token0Available.toString());
      settleAmountOut1 = CurrencyAmount.fromRawAmount(pool.token1, token1Available.toString());
      settleMinAmountOut0 = CurrencyAmount.fromRawAmount(pool.token0, minToken0Available.toString());
      settleMinAmountOut1 = CurrencyAmount.fromRawAmount(pool.token1, minToken1Available.toString());
      senderFees = {
        bps: Number(senderShareBps),
        amount0: feeInfo[0].senderFee,
        amount1: feeInfo[1].senderFee,
      };
      protocolFees = {
        bps: Number(protocolShareBps),
        amount0: feeInfo[0].protocolFee,
        amount1: feeInfo[1].protocolFee,
      };
    }

    const maxPosition = generateMaxV3Position(
      pool,
      settleAmountOut0,
      settleAmountOut1,
      destination.tickLower,
      destination.tickUpper
    );

    const maxPositionUsingSettleMinAmountsOut = generateMaxV3Position(
      pool,
      settleMinAmountOut0,
      settleMinAmountOut1,
      destination.tickLower,
      destination.tickUpper
    );

    const expectedRefund = {
      amount0Refund: BigInt(settleAmountOut0.subtract(maxPosition.amount0).quotient.toString()),
      amount1Refund: BigInt(settleAmountOut1.subtract(maxPosition.amount1).quotient.toString()),
    };

    return generateMigrationParams({
      externalParams,
      sourceChainConfig,
      destinationChainConfig,
      routes,
      migration,
      maxPosition,
      maxPositionUsingRouteMinAmountOut: maxPositionUsingSettleMinAmountsOut,
      owner,
      protocolFees,
      senderFees,
      expectedRefund,
    });
  }
};
