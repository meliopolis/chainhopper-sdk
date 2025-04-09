import { CurrencyAmount, Percent } from '@uniswap/sdk-core';
import { encodeMigrationParams } from './encode';
import { getV3Pool } from './getV3Pool';
import { DEFAULT_SLIPPAGE_IN_BPS } from '../utils/constants';
import { getMaxPositionV3 } from '../utils/helpers';
import { getV3Quote } from './getV3Quote';
import type { InternalSettleMigrationParams, InternalSettleMigrationResult } from '../types/internal';
import { getSettlerFees } from './getSettlerFees';

export const settleUniswapV3Migration = async ({
  destinationChainConfig,
  migrationId,
  routes,
  externalParams,
}: InternalSettleMigrationParams): Promise<InternalSettleMigrationResult> => {
  if (routes.length === 0) {
    throw new Error('No routes found');
  } else if (routes.length === 1) {
    // fetch the pool on the destination chain
    const pool = await getV3Pool(destinationChainConfig, externalParams.token0, externalParams.token1, externalParams.fee);

    const route = routes[0];
    const routeMinAmountOut = route.minOutputAmount;

    // get the settler fees
    const { protocolShareBps } = await getSettlerFees(destinationChainConfig, destinationChainConfig.UniswapV3AcrossSettler);
    const settlerFeesInBps = BigInt(protocolShareBps) + BigInt(externalParams.senderShareBps || 0);

    // we need to create two potential LP positions on destination chain
    // 1. using the across quote output amount. This is the best position possible
    // 2. using the routeMinAmountOut. This helps us calculate the worst position given slippage

    // estimate max position using across quote output amount
    const quoteArgs = {
      tokenIn: destinationChainConfig.wethAddress,
      tokenOut: externalParams.token0 === destinationChainConfig.wethAddress ? externalParams.token1 : externalParams.token0,
      fee: externalParams.fee,
      sqrtPriceLimitX96: 0,
    };
    const amountIn = route.outputAmount * (1n - settlerFeesInBps / 10_000n);
    const quoteOnDestChain = await getV3Quote(destinationChainConfig, quoteArgs.tokenIn, quoteArgs.tokenOut, quoteArgs.fee, amountIn, 0n);

    // TODO compare quote price vs pool price; if diff too high, alert somehow

    const baseTokenAvailable = CurrencyAmount.fromRawAmount(
      externalParams.token0 === destinationChainConfig.wethAddress ? pool.token0 : pool.token1,
      route.outputAmount.toString()
    );
    const maxOtherTokenAvailable = CurrencyAmount.fromRawAmount(
      externalParams.token0 === destinationChainConfig.wethAddress ? pool.token1 : pool.token0,
      quoteOnDestChain.toString()
    );
    const maxPosition = getMaxPositionV3(pool, baseTokenAvailable, maxOtherTokenAvailable, externalParams.tickLower, externalParams.tickUpper);

    // now we calculate the max position using the routeMinAmountOut
    const amountInUsingRouteMinAmountOut = routeMinAmountOut * (1n - settlerFeesInBps / 10_000n);
    const quoteUsingRouteMinAmountOut = await getV3Quote(destinationChainConfig, quoteArgs.tokenIn, quoteArgs.tokenOut, quoteArgs.fee, amountInUsingRouteMinAmountOut, 0n);
    const baseTokenAvailableUsingRouteMinAmountOut = CurrencyAmount.fromRawAmount(
      externalParams.token0 === destinationChainConfig.wethAddress ? pool.token0 : pool.token1,
      amountInUsingRouteMinAmountOut.toString()
    );
    const maxOtherTokenAvailableUsingRouteMinAmountOut = CurrencyAmount.fromRawAmount(
      externalParams.token0 === destinationChainConfig.wethAddress ? pool.token1 : pool.token0,
      quoteUsingRouteMinAmountOut.toString()
    );

    const maxPositionUsingRouteMinAmountOut = getMaxPositionV3(
      pool,
      baseTokenAvailableUsingRouteMinAmountOut,
      maxOtherTokenAvailableUsingRouteMinAmountOut,
      externalParams.tickLower,
      externalParams.tickUpper
    );

    // calculate swapAmountInMilliBps
    // TODO improve this calculation
    const swapAmountInMilliBps =
      externalParams.token0 === destinationChainConfig.wethAddress
        ? maxPosition.amount0.asFraction.divide(baseTokenAvailable.asFraction).multiply(10_000_000).quotient
        : maxPosition.amount1.asFraction.divide(baseTokenAvailable.asFraction).multiply(10_000_000).quotient;

    const { amount0: amount0Min, amount1: amount1Min } = maxPositionUsingRouteMinAmountOut.mintAmountsWithSlippage(
      new Percent(externalParams.slippageInBps || DEFAULT_SLIPPAGE_IN_BPS, 10000)
    );

    // generate the final messages
    const { migratorMessage, settlerMessage } = encodeMigrationParams(
      {
        chainId: destinationChainConfig.chainId,
        settler: destinationChainConfig.UniswapV3AcrossSettler as `0x${string}`,
        tokenRoutes: [
          {
            inputToken: route.inputToken,
            outputToken: route.outputToken,
            minAmountOut: routeMinAmountOut,
            maxFees: route.maxFees,
            quoteTimestamp: Number((await destinationChainConfig.publicClient?.getBlock())?.timestamp || 0),
            fillDeadlineOffset: 3000, // hardcoded for now; taken from spokePool contract
            exclusiveRelayer: route.exclusiveRelayer,
            exclusivityDeadline: route.exclusivityDeadline,
          },
        ],
        settlementParams: {
          recipient: externalParams.owner,
          senderShareBps: externalParams.senderShareBps || 0,
          senderFeeRecipient: externalParams.senderFeeRecipient || '0x0000000000000000000000000000000000000000',
          token0: externalParams.token0,
          token1: externalParams.token1,
          fee: externalParams.fee,
          sqrtPriceX96: externalParams.sqrtPriceX96 || 0n,
          tickLower: externalParams.tickLower,
          tickUpper: externalParams.tickUpper,
          amount0Min: BigInt(amount0Min.toString()),
          amount1Min: BigInt(amount1Min.toString()),
          swapAmountInMilliBps: 10_000_000 - Number(swapAmountInMilliBps.toString()),
        },
      },
      migrationId
    );
    return {
      destPosition: maxPosition,
      slippageCalcs: {
        routeMinAmountOut,
        swapAmountInMilliBps: 10_000_000 - Number(swapAmountInMilliBps.toString()),
        mintAmount0Min: BigInt(amount0Min.toString()),
        mintAmount1Min: BigInt(amount1Min.toString()),
      },
      migratorMessage,
      settlerMessage,
    };
  } else if (routes.length === 2) {
    throw new Error('Dual token migration not implemented');
  } else {
    throw new Error('Invalid number of routes');
  }
};
