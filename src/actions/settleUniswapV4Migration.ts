import { CurrencyAmount, Fraction, Percent } from '@uniswap/sdk-core';
import { encodeMigrationParams } from './encode';
import { getV4Pool } from './getV4Pool';
import { DEFAULT_SLIPPAGE_IN_BPS } from '../utils/constants';
import { zeroAddress } from 'viem';
import { getMaxPositionV4 } from '../utils/helpers';
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

    console.log('routeOutputAmount', route.outputAmount);
    console.log('routeMinAmountOut', routeMinAmountOut);

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
    const maxPosition = getMaxPositionV4(pool, baseTokenAvailable, maxOtherTokenAvailable, externalParams.tickLower, externalParams.tickUpper);

    // now we calculate the max position using the routeMinAmountOut
    const amountInUsingRouteMinAmountOut = routeMinAmountOut * (1n - settlerFeesInBps / 10_000n);
    const quoteOnDestChainUsingRouteMinAmountOut = await getV4Quote(destinationChainConfig, pool.poolKey, amountInUsingRouteMinAmountOut, true, '0x');

    const baseTokenAvailableUsingRouteMinAmountOut = CurrencyAmount.fromRawAmount(pool.token0, amountInUsingRouteMinAmountOut.toString());
    const maxOtherTokenAvailableUsingRouteMinAmountOut = CurrencyAmount.fromRawAmount(pool.token1, quoteOnDestChainUsingRouteMinAmountOut.toString());
    const maxPositionUsingRouteMinAmountOut = getMaxPositionV4(
      pool,
      baseTokenAvailableUsingRouteMinAmountOut,
      maxOtherTokenAvailableUsingRouteMinAmountOut,
      externalParams.tickLower,
      externalParams.tickUpper
    );

    // calculate swapAmountInMilliBps
    const swapAmountInMilliBps =
      externalParams.token0 === destinationChainConfig.wethAddress || externalParams.token0 === zeroAddress
        ? maxPosition.amount0.asFraction.divide(baseTokenAvailable.asFraction).multiply(10_000_000).add(new Fraction(1, 10_000_000)).toFixed(0)
        : maxPosition.amount1.asFraction.divide(baseTokenAvailable.asFraction).multiply(10_000_000).add(new Fraction(1, 10_000_000)).toFixed(0);

    // we use burnAmountsWithSlippage instead of mintAmountsWithSlippage because v4-sdk
    // produces max amounts (instead of min amounts) when using mintAmountsWithSlippage
    const { amount0: amount0Min, amount1: amount1Min } = maxPositionUsingRouteMinAmountOut.burnAmountsWithSlippage(
      new Percent(externalParams.slippageInBps || DEFAULT_SLIPPAGE_IN_BPS, 10000)
    );

    // generate the final messages
    const { migratorMessage, settlerMessage } = encodeMigrationParams(
      {
        chainId: destinationChainConfig.chainId,
        settler: destinationChainConfig.UniswapV4AcrossSettler as `0x${string}`,
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
          senderFeeRecipient: externalParams.senderFeeRecipient || zeroAddress,
          // mint params
          token0: externalParams.token0,
          token1: externalParams.token1,
          fee: externalParams.fee,
          sqrtPriceX96: externalParams.sqrtPriceX96 || 0n,
          tickSpacing: tickSpacing,
          hooks: hooks,
          tickLower: externalParams.tickLower,
          tickUpper: externalParams.tickUpper,
          amount0Min: BigInt(amount0Min.toString()),
          amount1Min: BigInt(amount1Min.toString()),
          swapAmountInMilliBps: 10_000_000 - Number(swapAmountInMilliBps),
        },
      },
      migrationId
    );
    return {
      destPosition: maxPosition,
      slippageCalcs: {
        routeMinAmountOut,
        swapAmountInMilliBps: 10_000_000 - Number(swapAmountInMilliBps),
        mintAmount0Min: BigInt(amount0Min.toString()),
        mintAmount1Min: BigInt(amount1Min.toString()),
      },
      migratorMessage,
      settlerMessage,
    };
  } else { // logically has to be (routes.length) === 2 but needs to look exhaustive for ts compiler
    console.log('externalParams', externalParams);

    // TODO: need to adjust amounts in for fees as above? how are fees taken in the dual token path? see contract maybe
    console.log('routes', routes);
    console.log('routes[0].outputAmount', routes[0].outputAmount);
    console.log('routes[1].outputAmount', routes[1].outputAmount);
    console.log('routes[0].minOutputAmount', routes[0].minOutputAmount);
    console.log('routes[1].minOutputAmount', routes[1].minOutputAmount);


    let routeAmountOut0, routeAmountOut1, routeMinAmountOut0, routeMinAmountOut1;
    // these token amounts may need to be flipped if the tokens are in a different order on the destination chain
    if (externalParams.token0 !== routes[0].outputToken) {
      console.log('flipping 0 for 1 on destination chain');
      routeAmountOut0 = CurrencyAmount.fromRawAmount(pool.token1, routes[1].outputAmount.toString());
      routeAmountOut1 = CurrencyAmount.fromRawAmount(pool.token0, routes[0].outputAmount.toString());
      routeMinAmountOut0 = CurrencyAmount.fromRawAmount(pool.token1, routes[1].minOutputAmount.toString());
      routeMinAmountOut1 = CurrencyAmount.fromRawAmount(pool.token0, routes[0].minOutputAmount.toString());
    } else {
      routeAmountOut0 = CurrencyAmount.fromRawAmount(pool.token0, routes[0].outputAmount.toString());
      routeAmountOut1 = CurrencyAmount.fromRawAmount(pool.token1, routes[1].outputAmount.toString());
      routeMinAmountOut0 = CurrencyAmount.fromRawAmount(pool.token0, routes[0].minOutputAmount.toString());
      routeMinAmountOut1 = CurrencyAmount.fromRawAmount(pool.token1, routes[1].minOutputAmount.toString());
    }

    // need:
    // maxPosition
    const maxPosition = getMaxPositionV4(pool, routeAmountOut0, routeAmountOut1, externalParams.tickLower, externalParams.tickUpper);
    const maxPositionUsingRouteMinAmountsOut = getMaxPositionV4(pool, routeMinAmountOut0, routeMinAmountOut1, externalParams.tickLower, externalParams.tickUpper);
    // console.log('maxPosition: ', maxPosition);
    // console.log('maxPositionUsingRouteMinAmountsOut: ', maxPositionUsingRouteMinAmountsOut);

    // route minAmountOut (need to change this to accommodate both tokens without breaking the single token usage)
    // amount0Min / amount1Min
    const { amount0: amount0Min, amount1: amount1Min } = maxPositionUsingRouteMinAmountsOut.burnAmountsWithSlippage(
      new Percent(externalParams.slippageInBps || DEFAULT_SLIPPAGE_IN_BPS, 10000)
    );

    // swapAmountInMilliBps (TODO: what is the point of this? / why do we need this?)
    const swapAmountInMilliBps =
      externalParams.token0 === destinationChainConfig.wethAddress || externalParams.token0 === zeroAddress
        ? maxPosition.amount0.asFraction.divide(routeAmountOut0.asFraction).multiply(10_000_000).add(new Fraction(1, 10_000_000)).toFixed(0)
        : maxPosition.amount1.asFraction.divide(routeAmountOut1.asFraction).multiply(10_000_000).add(new Fraction(1, 10_000_000)).toFixed(0);

    // migratorMessage
    // settlerMessage
    const { migratorMessage, settlerMessage } = encodeMigrationParams(
      {
        chainId: destinationChainConfig.chainId,
        settler: destinationChainConfig.UniswapV4AcrossSettler as `0x${string}`,
        tokenRoutes: [
          {
            inputToken: routes[0].inputToken,
            outputToken: routes[0].outputToken,
            minAmountOut: routes[0].minOutputAmount,
            maxFees: routes[0].maxFees,
            quoteTimestamp: Number((await destinationChainConfig.publicClient?.getBlock())?.timestamp || 0),
            fillDeadlineOffset: 3000, // hardcoded for now; taken from spokePool contract
            exclusiveRelayer: routes[0].exclusiveRelayer,
            exclusivityDeadline: routes[0].exclusivityDeadline,
          },
          {
            inputToken: routes[1].inputToken,
            outputToken: routes[1].outputToken,
            minAmountOut: routes[1].minOutputAmount,
            maxFees: routes[1].maxFees,
            quoteTimestamp: Number((await destinationChainConfig.publicClient?.getBlock())?.timestamp || 0),
            fillDeadlineOffset: 3000, // hardcoded for now; taken from spokePool contract
            exclusiveRelayer: routes[1].exclusiveRelayer,
            exclusivityDeadline: routes[1].exclusivityDeadline,
          },
        ],
        settlementParams: {
          recipient: externalParams.owner,
          senderShareBps: externalParams.senderShareBps || 0,
          senderFeeRecipient: externalParams.senderFeeRecipient || zeroAddress,
          // mint params
          token0: externalParams.token0,
          token1: externalParams.token1,
          fee: externalParams.fee,
          sqrtPriceX96: externalParams.sqrtPriceX96 || 0n,
          tickSpacing: tickSpacing,
          hooks: hooks,
          tickLower: externalParams.tickLower,
          tickUpper: externalParams.tickUpper,
          amount0Min: BigInt(amount0Min.toString()),
          amount1Min: BigInt(amount1Min.toString()),
          swapAmountInMilliBps: 10_000_000 - Number(swapAmountInMilliBps),
        },
      },
      migrationId
    );

    return {
      destPosition: maxPosition,
      slippageCalcs: {
        routeMinAmountOut0,
        routeMinAmountOut1,
        swapAmountInMilliBps: 10_000_000 - Number(swapAmountInMilliBps),
        mintAmount0Min: BigInt(amount0Min.toString()),
        mintAmount1Min: BigInt(amount1Min.toString()),
      },
      migratorMessage,
      settlerMessage,
    };
  }
};
