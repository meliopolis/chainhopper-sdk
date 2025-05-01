import { CurrencyAmount, Fraction, Percent, Price, Token, type Currency } from '@uniswap/sdk-core';
import { DEFAULT_FILL_DEADLINE_OFFSET, DEFAULT_SLIPPAGE_IN_BPS, MigrationMethod, Protocol } from './constants';
import { nearestUsableTick, Pool as V3Pool, SqrtPriceMath, TickMath, Position as V3Position } from '@uniswap/v3-sdk';
import { Position as V4Position, Pool as V4Pool } from '@uniswap/v4-sdk';

import { encodeMigrationParams, encodeMintParamsForV3, encodeMintParamsForV4, encodeSettlementParams, encodeSettlementParamsForSettler } from '../actions/encode';
import { zeroAddress } from 'viem';
import type { RequestMigrationParams, Route } from '../types/sdk';

import JSBI from 'jsbi';
import { getV3Quote } from '../actions/getV3Quote';
import type { ChainConfig } from '../chains';
import { getV4CombinedQuote } from '../actions/getV4CombinedQuote';

export const genMigrationId = (chainId: number, migrator: string, method: MigrationMethod, nonce: bigint): `0x${string}` => {
  const mode = method === MigrationMethod.SingleToken ? 1 : 2;
  // Mask values to match Solidity's assembly masks
  const chainIdMasked = BigInt(chainId) & BigInt('0xFFFFFFFF'); // 4 bytes
  const migratorMasked = BigInt(migrator) & BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF'); // 20 bytes
  const modeMasked = BigInt(mode) & BigInt('0xFF'); // 1 byte
  const nonceMasked = nonce & BigInt('0xFFFFFFFFFFFFFF'); // 7 bytes

  // Perform the shifts and combinations
  const shiftedChainId = chainIdMasked << BigInt(224);
  const shiftedMigrator = migratorMasked << BigInt(64);
  const shiftedMode = modeMasked << BigInt(56);

  // Combine all parts using OR operations
  return `0x${(shiftedChainId | shiftedMigrator | shiftedMode | nonceMasked).toString(16).padStart(64, '0')}` as `0x${string}`;
};

export const generateMigration = (
  sourceChainConfig: ChainConfig,
  migrationMethod: MigrationMethod,
  externalParams: RequestMigrationParams
): { migrationId: `0x${string}`; interimMessageForSettler: `0x${string}` } => {
  const migrationId = genMigrationId(externalParams.sourceChainId, sourceChainConfig.UniswapV3AcrossMigrator || zeroAddress, migrationMethod, BigInt(0));
  let mintParams: `0x${string}`;

  const additionalParams = {
    amount0Min: 1000n,
    amount1Min: 1000n,
    swapAmountInMilliBps: 0,
    sqrtPriceX96: externalParams.sqrtPriceX96 || 0n,
  };
  if (externalParams.destinationProtocol === Protocol.UniswapV3) {
    mintParams = encodeMintParamsForV3({
      ...additionalParams,
      ...externalParams, // get the rest of the params from the request
    });
  } else if (externalParams.destinationProtocol === Protocol.UniswapV4 && 'hooks' in externalParams) {
    mintParams = encodeMintParamsForV4({
      ...additionalParams,
      ...externalParams, // get the rest of the params from the request
    });
  } else {
    throw new Error('Destination protocol not supported');
  }
  const interimMessageForSettler = encodeSettlementParamsForSettler(
    encodeSettlementParams(
      {
        recipient: externalParams.owner,
        senderShareBps: 0,
        senderFeeRecipient: zeroAddress,
      },
      mintParams
    ),
    migrationId
  );
  return { migrationId, interimMessageForSettler };
};

export const generateMigrationParams = async (
  migrationId: `0x${string}`,
  externalParams: RequestMigrationParams,
  destinationChainConfig: ChainConfig,
  routes: Route[],
  maxPosition: V3Position | V4Position,
  maxPositionUsingRouteMinAmountOut: V3Position | V4Position,
  swapAmountInMilliBps?: number
): Promise<{
  destPosition: V3Position | V4Position;
  slippageCalcs: { routeMinAmountOuts: bigint[]; swapAmountInMilliBps: number; mintAmount0Min: bigint; mintAmount1Min: bigint };
  migratorMessage: `0x${string}`;
  settlerMessage: `0x${string}`;
}> => {
  const { amount0: amount0Min, amount1: amount1Min } = maxPositionUsingRouteMinAmountOut.burnAmountsWithSlippage(
    new Percent(externalParams.slippageInBps || DEFAULT_SLIPPAGE_IN_BPS, 10000)
  );

  const { migratorMessage, settlerMessage } = encodeMigrationParams(
    {
      chainId: destinationChainConfig.chainId,
      settler: resolveSettler(externalParams, destinationChainConfig),
      tokenRoutes: await Promise.all(
        routes.map(async (route) => ({
          ...route,
          minAmountOut: route.minOutputAmount,
          quoteTimestamp: Number((await destinationChainConfig.publicClient?.getBlock())?.timestamp || 0),
          fillDeadlineOffset: DEFAULT_FILL_DEADLINE_OFFSET,
        }))
      ),
      settlementParams: {
        recipient: externalParams.owner,
        senderShareBps: externalParams.senderShareBps || 0,
        senderFeeRecipient: externalParams.senderFeeRecipient || zeroAddress,
        // mint params
        token0: externalParams.token0,
        token1: externalParams.token1,
        fee: externalParams.fee,
        sqrtPriceX96: externalParams.sqrtPriceX96 || 0n,
        tickLower: externalParams.tickLower,
        tickUpper: externalParams.tickUpper,
        amount0Min: BigInt(amount0Min.toString()),
        amount1Min: BigInt(amount1Min.toString()),
        swapAmountInMilliBps: swapAmountInMilliBps ? swapAmountInMilliBps : 0,
        ...('tickSpacing' in externalParams && { tickSpacing: externalParams.tickSpacing }),
        ...('hooks' in externalParams && { hooks: externalParams.hooks }),
      },
    },
    migrationId
  );

  return {
    destPosition: maxPosition,
    slippageCalcs: {
      routeMinAmountOuts: routes.map((r) => r.minOutputAmount),
      swapAmountInMilliBps: swapAmountInMilliBps ? swapAmountInMilliBps : 0,
      mintAmount0Min: BigInt(amount0Min.toString()),
      mintAmount1Min: BigInt(amount1Min.toString()),
    },
    migratorMessage,
    settlerMessage,
  };
};

export const resolveSettler = (externalParams: RequestMigrationParams, destinationChainConfig: ChainConfig): `0x${string}` => {
  let settler: `0x${string}`;
  switch (externalParams.destinationProtocol) {
    case Protocol.UniswapV3:
      if (destinationChainConfig.UniswapV3AcrossSettler) {
        settler = destinationChainConfig.UniswapV3AcrossSettler;
        break;
      } else {
        throw new Error('UniswapV3AcrossSettler not provided for destination chain.');
      }
    case Protocol.UniswapV4:
      if (destinationChainConfig.UniswapV4AcrossSettler) {
        settler = destinationChainConfig.UniswapV4AcrossSettler;
        break;
      } else {
        throw new Error('UniswapV4AcrossSettler not provided for destination chain.');
      }
  }
  return settler;
};

export const generateMaxV3Position = (
  pool: V3Pool,
  currencyAmount0: CurrencyAmount<Currency>,
  currencyAmount1: CurrencyAmount<Currency>,
  tickLower: number,
  tickUpper: number
): V3Position => {
  const [amount0, amount1] = [currencyAmount0.asFraction.toFixed(0).toString(), currencyAmount1.asFraction.toFixed(0).toString()];
  // estimate max position possible given the ticks and both tokens maxed out
  const maxPosition = V3Position.fromAmounts({
    pool: pool,
    tickLower: nearestUsableTick(tickLower, pool.tickSpacing),
    tickUpper: nearestUsableTick(tickUpper, pool.tickSpacing),
    amount0: amount0,
    amount1: amount1,
    useFullPrecision: true,
  });

  return maxPosition;
};

export const generateMaxV4Position = (
  pool: V4Pool,
  currencyAmount0: CurrencyAmount<Currency>,
  currencyAmount1: CurrencyAmount<Currency>,
  tickLower: number,
  tickUpper: number
): V4Position => {
  const [amount0, amount1] = [currencyAmount0.asFraction.toFixed(0).toString(), currencyAmount1.asFraction.toFixed(0).toString()];

  // estimate max position possible given the ticks and both tokens maxed out
  const maxPosition = V4Position.fromAmounts({
    pool: pool,
    tickLower: nearestUsableTick(tickLower, pool.tickSpacing),
    tickUpper: nearestUsableTick(tickUpper, pool.tickSpacing),
    amount0: amount0,
    amount1: amount1,
    useFullPrecision: true,
  });

  return maxPosition;
};

const calculateOptimalRatio = (tickLower: number, tickUpper: number, sqrtRatioX96: JSBI, zeroForOne: boolean): Fraction => {
  const upperSqrtRatioX96 = TickMath.getSqrtRatioAtTick(tickUpper);
  const lowerSqrtRatioX96 = TickMath.getSqrtRatioAtTick(tickLower);

  // returns Fraction(0, 1) for any out of range position regardless of zeroForOne. Implication: function
  // cannot be used to determine the trading direction of out of range positions.
  if (JSBI.greaterThan(sqrtRatioX96, upperSqrtRatioX96) || JSBI.lessThan(sqrtRatioX96, lowerSqrtRatioX96)) {
    return new Fraction(0, 1);
  }

  const precision = JSBI.BigInt(`1${'0'.repeat(18)}`);
  let optimalRatio = new Fraction(
    SqrtPriceMath.getAmount0Delta(sqrtRatioX96, upperSqrtRatioX96, precision, true).toString(),
    SqrtPriceMath.getAmount1Delta(sqrtRatioX96, lowerSqrtRatioX96, precision, true).toString()
  );
  if (!zeroForOne) optimalRatio = optimalRatio.invert();
  return optimalRatio;
};

const calculateRatioAmountIn = (
  optimalRatio: Fraction,
  inputTokenPrice: Fraction,
  inputBalance: CurrencyAmount<Currency>,
  outputBalance: CurrencyAmount<Currency>
): CurrencyAmount<Currency> => {
  // formula: amountToSwap = (inputBalance - (optimalRatio * outputBalance)) / ((optimalRatio * inputTokenPrice) + 1))
  const amountToSwapRaw = new Fraction(inputBalance.quotient).subtract(optimalRatio.multiply(outputBalance.quotient)).divide(optimalRatio.multiply(inputTokenPrice).add(1));

  if (amountToSwapRaw.lessThan(0)) {
    // should never happen since we do checks before calling in
    throw new Error('routeToRatio: insufficient input token amount');
  }

  return CurrencyAmount.fromRawAmount(inputBalance.currency, amountToSwapRaw.quotient);
};

export const generateMaxV3orV4PositionWithSwapAllowed = async (
  chainConfig: ChainConfig,
  pool: V3Pool | V4Pool,
  token0Balance: CurrencyAmount<Currency>,
  token1Balance: CurrencyAmount<Currency>,
  tickLower: number,
  tickUpper: number,
  slippageTolerance: Fraction,
  numIterations: number
): Promise<V3Position | V4Position> => {
  const isV4 = 'hooks' in pool;
  // calculate optimal ratio returns 0 for out of range case
  let preSwapOptimalRatio = calculateOptimalRatio(tickLower, tickUpper, pool.sqrtRatioX96, true);

  let zeroForOne: boolean;

  if (pool.tickCurrent > tickUpper) {
    zeroForOne = true;
  } else if (pool.tickCurrent < tickLower) {
    zeroForOne = false;
  } else {
    zeroForOne = new Fraction(token0Balance.quotient, token1Balance.quotient).greaterThan(preSwapOptimalRatio);
    if (!zeroForOne) preSwapOptimalRatio = preSwapOptimalRatio.invert();
  }
  const [inputBalance, outputBalance] = zeroForOne ? [token0Balance, token1Balance] : [token1Balance, token0Balance];

  let n = 0;
  let optimalRatio = preSwapOptimalRatio;
  let ratioAchieved = false;
  let postSwapPool: V3Pool | V4Pool = pool;
  let exchangeRate = zeroForOne ? pool.token0Price : pool.token1Price;

  let inputBalanceUpdated = inputBalance;
  let outputBalanceUpdated = outputBalance;
  while (!ratioAchieved) {
    n++;
    if (n > numIterations) {
      break;
    }
    const currencyAmountToSwap = calculateRatioAmountIn(optimalRatio, exchangeRate, inputBalance, outputBalance) as CurrencyAmount<Token>;
    if (BigInt(currencyAmountToSwap.quotient.toString()) === 0n) {
      // todo handle this case
      break;
    }
    // now fetch the quote on the destination chain
    let amountOut: bigint;
    let sqrtPriceX96After: bigint;
    if (isV4) {
      const quote = await getV4CombinedQuote(chainConfig, pool.poolKey, BigInt(currencyAmountToSwap.quotient.toString()), zeroForOne, '0x');
      amountOut = quote.amountOut;
      sqrtPriceX96After = quote.sqrtPriceX96After;
    } else {
      const quote = await getV3Quote(
        chainConfig,
        inputBalance.currency.wrapped.address as `0x${string}`,
        outputBalance.currency.wrapped.address as `0x${string}`,
        pool.fee,
        BigInt(currencyAmountToSwap.quotient.toString()),
        0n
      );
      amountOut = quote.amountOut;
      sqrtPriceX96After = quote.sqrtPriceX96After;
    }
    const currencyAmountOut = CurrencyAmount.fromRawAmount(outputBalance.currency, amountOut.toString());
    inputBalanceUpdated = inputBalance.subtract(currencyAmountToSwap);
    outputBalanceUpdated = outputBalance.add(currencyAmountOut);
    const newRatio = inputBalanceUpdated.divide(outputBalanceUpdated);
    optimalRatio = calculateOptimalRatio(tickLower, tickUpper, JSBI.BigInt(sqrtPriceX96After.toString()), zeroForOne);

    // check slippage
    ratioAchieved = newRatio.equalTo(optimalRatio) || newRatio.asFraction.divide(optimalRatio).subtract(1).lessThan(slippageTolerance);
    // if slippage is acceptable, break
    if (ratioAchieved) {
      if (isV4) {
        postSwapPool = new V4Pool(
          pool.token0,
          pool.token1,
          pool.fee,
          pool.tickSpacing,
          pool.hooks,
          sqrtPriceX96After.toString(),
          pool.liquidity.toString(),
          TickMath.getTickAtSqrtRatio(JSBI.BigInt(sqrtPriceX96After.toString())),
          pool.tickDataProvider
        );
      } else {
        postSwapPool = new V3Pool(
          pool.token0,
          pool.token1,
          pool.fee,
          sqrtPriceX96After.toString(),
          pool.liquidity.toString(),
          TickMath.getTickAtSqrtRatio(JSBI.BigInt(sqrtPriceX96After.toString())),
          pool.tickDataProvider
        );
      }
      break;
    }
    // @ts-expect-error - Types from different package versions conflict
    exchangeRate = new Price({ baseAmount: inputBalance, quoteAmount: outputBalance });
  }
  const [token0BalanceUpdated, token1BalanceUpdated] = inputBalanceUpdated.currency.wrapped.sortsBefore(outputBalanceUpdated.currency.wrapped)
    ? [inputBalanceUpdated, outputBalanceUpdated]
    : [outputBalanceUpdated, inputBalanceUpdated];

  return isV4 && 'hooks' in postSwapPool
    ? V4Position.fromAmounts({
        pool: postSwapPool,
        tickLower: nearestUsableTick(tickLower, pool.tickSpacing),
        tickUpper: nearestUsableTick(tickUpper, pool.tickSpacing),
        amount0: token0BalanceUpdated.quotient.toString(),
        amount1: token1BalanceUpdated.quotient.toString(),
        useFullPrecision: true,
      })
    : V3Position.fromAmounts({
        pool: postSwapPool as V3Pool,
        tickLower: nearestUsableTick(tickLower, pool.tickSpacing),
        tickUpper: nearestUsableTick(tickUpper, pool.tickSpacing),
        amount0: token0BalanceUpdated.quotient.toString(),
        amount1: token1BalanceUpdated.quotient.toString(),
        useFullPrecision: true,
      });
};

export const subIn256 = (x: bigint, y: bigint): bigint => {
  const difference = x - y;

  if (x - y < 0n) {
    return 2n ** 256n + difference;
  } else {
    return difference;
  }
};
