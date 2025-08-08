import { CurrencyAmount, Fraction } from '@uniswap/sdk-core';
import { getV4Pool } from './getV4Pool';
import { DEFAULT_SLIPPAGE_IN_BPS, NATIVE_ETH_ADDRESS } from '../utils/constants';
import { zeroAddress } from 'viem';
import {
  generateMaxV4Position,
  generateMigrationParams,
  generateMaxV3orV4PositionWithSwapAllowed,
  calculateFees,
} from '../utils/helpers';
import type { InternalSettleMigrationParams, InternalSettleMigrationResult } from '../types/internal';
import { getSettlerFees } from './getSettlerFees';
import JSBI from 'jsbi';
import type { UniswapV4Params } from '@/types/sdk';

export const settleUniswapV4Migration = async ({
  sourceChainConfig,
  destinationChainConfig,
  routes,
  migration,
  externalParams,
  owner,
}: InternalSettleMigrationParams): Promise<InternalSettleMigrationResult> => {
  const { destination, exactPath } = migration;
  if (routes.length === 0) throw new Error('No routes found');
  if (routes.length > 2) throw new Error('Invalid number of routes');

  const { tickSpacing, hooks } = destination as UniswapV4Params;
  const slippageLimit = exactPath.slippageInBps || DEFAULT_SLIPPAGE_IN_BPS;

  // now we need fetch the pool on the destination chain, or specify a sqrtPriceX96 to initialize one
  const pool = await getV4Pool(
    destinationChainConfig,
    {
      currency0: destination.token0,
      currency1: destination.token1,
      fee: destination.fee,
      tickSpacing: tickSpacing,
      hooks: hooks,
    },
    destination.sqrtPriceX96
  );

  // get the settler fees
  const { protocolShareBps, protocolShareOfSenderFeePct } = await getSettlerFees(
    destinationChainConfig,
    destinationChainConfig.UniswapV4AcrossSettler
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

    const route = routes[0];
    const routeMinAmountOut = route.minOutputAmount;

    // we need to create two potential LP positions on destination chain
    // 1. using the across quote output amount. This is the best position possible
    // 2. using the routeMinAmountOut. This helps us calculate the worst position given slippage

    // TODO need to handle weth (right now only handle native token pools)
    // 1. calculate the max position using the across quote output amount

    const { amountIn, protocolFee, senderFee } = calculateFees(
      route.outputAmount,
      senderShareBps,
      protocolShareBps,
      protocolShareOfSenderFeePct
    );

    let protocolFees, senderFees;
    if (destination.token0 === destinationChainConfig.wethAddress || destination.token0 === zeroAddress) {
      protocolFees = { bps: Number(protocolShareBps), amount0: protocolFee, amount1: 0n };
      senderFees = { bps: Number(senderShareBps), amount0: senderFee, amount1: 0n };
    } else {
      protocolFees = { bps: Number(protocolShareBps), amount0: 0n, amount1: protocolFee };
      senderFees = { bps: Number(senderShareBps), amount0: 0n, amount1: senderFee };
    }

    const baseTokenAvailable = CurrencyAmount.fromRawAmount(pool.token0, amountIn.toString());
    const maxOtherTokenAvailable = CurrencyAmount.fromRawAmount(pool.token1, 0);
    const { position: maxPosition, slippageBps: destinationSlippageBps } =
      await generateMaxV3orV4PositionWithSwapAllowed(
        destinationChainConfig,
        pool,
        baseTokenAvailable,
        maxOtherTokenAvailable,
        destination.tickLower,
        destination.tickUpper,
        new Fraction(slippageLimit, 10000).divide(20),
        10
      );

    if (-1 * destinationSlippageBps > slippageLimit) {
      throw new Error('Price impact exceeds slippage');
    }

    const amountInUsingRouteMinAmountOut = routeMinAmountOut * (1n - settlerFeesInBps / 10_000n);
    const baseTokenAvailableUsingRouteMinAmountOut = CurrencyAmount.fromRawAmount(
      pool.token0,
      amountInUsingRouteMinAmountOut.toString()
    );
    const maxOtherTokenAvailableUsingRouteMinAmountOut = CurrencyAmount.fromRawAmount(pool.token1, 0);
    const { position: maxPositionUsingRouteMinAmountOut } = await generateMaxV3orV4PositionWithSwapAllowed(
      destinationChainConfig,
      pool,
      baseTokenAvailableUsingRouteMinAmountOut,
      maxOtherTokenAvailableUsingRouteMinAmountOut,
      destination.tickLower,
      destination.tickUpper,
      new Fraction(slippageLimit, 10000).divide(20),
      10
    );

    // calculate swapAmountInMilliBps
    const swapAmountInMilliBps =
      destination.token0 === destinationChainConfig.wethAddress || destination.token0 === zeroAddress
        ? maxPosition.amount0.asFraction
            .divide(baseTokenAvailable.asFraction)
            .multiply(10_000_000)
            .add(new Fraction(1, 10_000_000))
            .toFixed(0)
        : maxPosition.amount1.asFraction
            .divide(baseTokenAvailable.asFraction)
            .multiply(10_000_000)
            .add(new Fraction(1, 10_000_000))
            .toFixed(0);

    return generateMigrationParams({
      externalParams,
      sourceChainConfig,
      destinationChainConfig,
      routes,
      migration,
      maxPosition,
      maxPositionUsingRouteMinAmountOut,
      owner,
      senderFees,
      protocolFees,
      swapAmountInMilliBps: 10_000_000 - Number(swapAmountInMilliBps),
      destinationSlippageBps,
    });
  } else {
    // logically has to be (routes.length) === 2 but needs to look exhaustive for ts compiler
    // make sure both tokens are found in routes
    const token0Address =
      destination.token0 === NATIVE_ETH_ADDRESS ? destinationChainConfig.wethAddress : destination.token0;
    const token1Address = destination.token1;
    if (token0Address != routes[0].outputToken && token0Address != routes[1].outputToken)
      throw new Error('Requested token0 not found in routes');
    if (token1Address != routes[0].outputToken && token1Address != routes[1].outputToken)
      throw new Error('Requested token1 not found in routes');

    const feeInfo = routes.map((route) =>
      calculateFees(route.outputAmount, senderShareBps, protocolShareBps, protocolShareOfSenderFeePct)
    );

    const token0Available = feeInfo[0].amountIn;
    const token1Available = feeInfo[1].amountIn;
    const minToken0Available = routes[0].minOutputAmount * (1n - settlerFeesInBps / 10_000n);
    const minToken1Available = routes[1].minOutputAmount * (1n - settlerFeesInBps / 10_000n);

    let settleAmountOut0, settleAmountOut1, settleMinAmountOut0, settleMinAmountOut1, senderFees, protocolFees;
    if (token0Address !== routes[0].outputToken) {
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

    const maxPosition = generateMaxV4Position(
      pool,
      settleAmountOut0,
      settleAmountOut1,
      destination.tickLower,
      destination.tickUpper
    );

    const maxPositionUsingSettleMinAmountsOut = generateMaxV4Position(
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
      senderFees,
      protocolFees,
      expectedRefund,
    });
  }
};
