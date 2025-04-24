import { Token, CurrencyAmount, Fraction, Percent } from '@uniswap/sdk-core';
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

    const isToken0EthOrWeth = pool.token0.isNative || pool.token0.address === destinationChainConfig.wethAddress;
    const isRoute0Weth = routes[0].outputToken === destinationChainConfig.wethAddress;
    const flippedTokenOrder = !(isRoute0Weth && isToken0EthOrWeth);

    let token0Available = routes[0].outputAmount * (1n - settlerFeesInBps / 10_000n);
    let token1Available = routes[1].outputAmount * (1n - settlerFeesInBps / 10_000n);
    let minToken0Available = routes[0].minOutputAmount * (1n - settlerFeesInBps / 10_000n);
    let minToken1Available = routes[1].minOutputAmount * (1n - settlerFeesInBps / 10_000n);

    console.log('token0Available', token0Available)
    console.log('token1Available', token1Available)

    let settleAmountOut0, settleAmountOut1, settleMinAmountOut0, settleMinAmountOut1;
    if (flippedTokenOrder) {
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

    console.log('settleAmountOut0', settleAmountOut0.toFixed(6));
    console.log('settleAmountOut1', settleAmountOut1.toFixed(6));
    console.log('settleMinAmountOut0', settleMinAmountOut0.toFixed(6));
    console.log('settleMinAmountOut1', settleMinAmountOut1.toFixed(6));

    const maxPosition = getMaxPositionV4(pool, settleAmountOut0, settleAmountOut1, externalParams.tickLower, externalParams.tickUpper);
    const maxPositionUsingSettleMinAmountsOut = getMaxPositionV4(pool, settleMinAmountOut0, settleMinAmountOut1, externalParams.tickLower, externalParams.tickUpper);

    console.log('maxPositionUsingSettleMinAmountsOut', maxPositionUsingSettleMinAmountsOut.amount0.toFixed(6));
    console.log('maxPositionUsingSettleMinAmountsOut', maxPositionUsingSettleMinAmountsOut.amount1.toFixed(6));

    const { amount0: amount0Min, amount1: amount1Min } = maxPositionUsingSettleMinAmountsOut.burnAmountsWithSlippage(
      new Percent(externalParams.slippageInBps || DEFAULT_SLIPPAGE_IN_BPS, 10000)
    );

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
          swapAmountInMilliBps: 0,
        },
      },
      migrationId
    );

    return {
      destPosition: maxPosition,
      slippageCalcs: {
        routeMinAmountOut0: routes[0].minOutputAmount,
        routeMinAmountOut1: routes[1].minOutputAmount,
        swapAmountInMilliBps: 0,
        mintAmount0Min: BigInt(amount0Min.toString()),
        mintAmount1Min: BigInt(amount1Min.toString()),
      },
      migratorMessage,
      settlerMessage,
    };
  }
};
