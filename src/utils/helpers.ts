import { CurrencyAmount, Fraction, Percent, Token, type Currency } from '@uniswap/sdk-core';
import { DEFAULT_FILL_DEADLINE_OFFSET, DEFAULT_SLIPPAGE_IN_BPS, MigrationMethod, Protocol } from './constants';
import type { IV3PositionWithUncollectedFees } from '../actions/getV3Position';
import type { IV4PositionWithUncollectedFees } from '../actions/getV4Position';
import { nearestUsableTick, Pool, SqrtPriceMath, TickMath, Position as V3Position, type Pool as V3Pool } from '@uniswap/v3-sdk';
import { Position as V4Position, type Pool as V4Pool } from '@uniswap/v4-sdk';
import { acrossClient } from '../lib/acrossClient';
import { encodeMigrationParams, encodeMintParamsForV3, encodeMintParamsForV4, encodeSettlementParams, encodeSettlementParamsForSettler } from '../actions/encode';
import { zeroAddress } from 'viem';
import type { RequestV3MigrationParams, RequestV4MigrationParams, Route } from '../types/sdk';
import JSBI from 'jsbi';
import { getV3Quote } from '../actions/getV3Quote';
import type { ChainConfig } from '../chains';
import type { Quote } from '@across-protocol/app-sdk';

export const getBurnAmountsWithSlippage = (
  extendedPosition: IV3PositionWithUncollectedFees | IV4PositionWithUncollectedFees,
  slippageInBps: number | undefined
): { amount0Min: bigint; amount1Min: bigint } => {
  const position = extendedPosition.position;
  const { amount0, amount1 } = position.burnAmountsWithSlippage(new Percent(slippageInBps || DEFAULT_SLIPPAGE_IN_BPS, 10000));
  return {
    amount0Min: BigInt(amount0.toString()) + BigInt(extendedPosition.uncollectedFees.amount0.quotient.toString()),
    amount1Min: BigInt(amount1.toString()) + BigInt(extendedPosition.uncollectedFees.amount1.quotient.toString()),
  };
};

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

export const generateMigration = (sourceChainConfig: ChainConfig, migrationMethod: MigrationMethod, externalParams: RequestV3MigrationParams | RequestV4MigrationParams) => {
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
    throw new Error('Bridge type not supported');
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
  externalParams: RequestV3MigrationParams | RequestV4MigrationParams,
  destinationChainConfig: ChainConfig,
  routes: Route[],
  maxPosition: V3Position | V4Position,
  maxPositionUsingRouteMinAmountOut: V3Position | V4Position,
  swapAmountInMilliBps?: number
) => {
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

export const getAcrossQuote = async (
  sourceChainConfig: ChainConfig,
  destinationChainConfig: ChainConfig,
  tokenAddress: `0x${string}`,
  tokenAmount: string,
  externalParams: RequestV3MigrationParams | RequestV4MigrationParams,
  interimMessageForSettler: `0x${string}`
): Promise<Quote> => {
  // initially just supporting (W)ETH/USDC pairs
  // TODO: add desired dual token pair address mappings to chain config or similar for address lookup
  const isWethToken = tokenAddress === sourceChainConfig.wethAddress;
  return await acrossClient({ testnet: sourceChainConfig.testnet }).getQuote({
    route: {
      originChainId: sourceChainConfig.chainId,
      destinationChainId: destinationChainConfig.chainId,
      inputToken: tokenAddress,
      outputToken: isWethToken ? destinationChainConfig.wethAddress : destinationChainConfig.usdcAddress,
    },
    inputAmount: tokenAmount,
    recipient: resolveSettler(externalParams, destinationChainConfig),
    crossChainMessage: interimMessageForSettler,
  });
};

const resolveSettler = (externalParams: RequestV3MigrationParams | RequestV4MigrationParams, destinationChainConfig: ChainConfig) => {
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
    default:
      const _exhaustiveCheck: never = externalParams.destinationProtocol;
      throw new Error(`Unhandled protocol: ${_exhaustiveCheck}`);
  }
  return settler;
};

export const generateMaxV3Position = (
  pool: V3Pool,
  currencyAmount0: CurrencyAmount<Currency>,
  currencyAmount1: CurrencyAmount<Currency>,
  tickLower: number,
  tickUpper: number,
  migrationMethod: MigrationMethod
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

  // now we need to proportionally reduce the position to fit within the max tokens available on the destination chain
  // if neither amount is 0, then we need to reduce both proportionally
  if (migrationMethod == MigrationMethod.SingleToken && !maxPosition.amount0.equalTo(0) && !maxPosition.amount1.equalTo(0)) {
    const maxPositionValueInBaseToken = maxPosition.amount0.add(maxPosition.pool.token1Price.quote(maxPosition.amount1));
    const reductionFactor = currencyAmount0.asFraction.divide(maxPositionValueInBaseToken.asFraction);

    return V3Position.fromAmounts({
      pool: pool,
      tickLower: nearestUsableTick(tickLower, pool.tickSpacing),
      tickUpper: nearestUsableTick(tickUpper, pool.tickSpacing),
      amount0: maxPosition.amount0.asFraction.multiply(reductionFactor).toFixed(0),
      amount1: maxPosition.amount1.asFraction.multiply(reductionFactor).toFixed(0),
      useFullPrecision: true,
    });
  }
  return maxPosition;
};

export const generateMaxV4Position = (
  pool: V4Pool,
  currencyAmount0: CurrencyAmount<Currency>,
  currencyAmount1: CurrencyAmount<Currency>,
  tickLower: number,
  tickUpper: number,
  migrationMethod: MigrationMethod
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

  // now we need to proportionally reduce the position to fit within the max tokens available on the destination chain
  // if neither amount is 0, then we need to reduce both proportionally
  if (migrationMethod === MigrationMethod.SingleToken && !maxPosition.amount0.equalTo(0) && !maxPosition.amount1.equalTo(0)) {
    const maxPositionValueInBaseToken = maxPosition.amount0.add(maxPosition.pool.token1Price.quote(maxPosition.amount1));
    const reductionFactor = currencyAmount0.asFraction.divide(maxPositionValueInBaseToken.asFraction);

    return V4Position.fromAmounts({
      pool: pool,
      tickLower: nearestUsableTick(tickLower, pool.tickSpacing),
      tickUpper: nearestUsableTick(tickUpper, pool.tickSpacing),
      amount0: maxPosition.amount0.asFraction.multiply(reductionFactor).toFixed(0),
      amount1: maxPosition.amount1.asFraction.multiply(reductionFactor).toFixed(0),
      useFullPrecision: true,
    });
  }
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

export const generateMaxV3PositionWithSwapAllowed = async (
  chainConfig: ChainConfig,
  pool: V3Pool,
  token0Balance: CurrencyAmount<Token>,
  token1Balance: CurrencyAmount<Token>,
  tickLower: number,
  tickUpper: number,
  slippageTolerance: Fraction,
  numIterations: number
): Promise<V3Position> => {
  if (token1Balance.currency.wrapped.sortsBefore(token0Balance.currency.wrapped)) {
    [token0Balance, token1Balance] = [token1Balance, token0Balance];
  }
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
  let postSwapPool: V3Pool = pool;
  const exchangeRate = zeroForOne ? pool.token0Price : pool.token1Price;

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
    const { amountOut, sqrtPriceX96After } = await getV3Quote(
      chainConfig,
      inputBalance.currency.address as `0x${string}`,
      outputBalance.currency.address as `0x${string}`,
      pool.fee,
      BigInt(currencyAmountToSwap.quotient.toString()),
      0n
    );
    const currencyAmountOut = CurrencyAmount.fromRawAmount(outputBalance.currency, amountOut.toString());
    inputBalanceUpdated = inputBalance.subtract(currencyAmountToSwap);
    outputBalanceUpdated = outputBalance.add(currencyAmountOut);
    const newRatio = inputBalanceUpdated.divide(outputBalanceUpdated);
    optimalRatio = calculateOptimalRatio(tickLower, tickUpper, JSBI.BigInt(sqrtPriceX96After.toString()), zeroForOne);

    // check slippage
    ratioAchieved = newRatio.equalTo(optimalRatio) || newRatio.asFraction.divide(optimalRatio).subtract(1).lessThan(slippageTolerance);
    // if slippage is acceptable, break
    if (ratioAchieved) {
      postSwapPool = new Pool(
        pool.token0,
        pool.token1,
        pool.fee,
        sqrtPriceX96After.toString(),
        pool.liquidity.toString(),
        TickMath.getTickAtSqrtRatio(JSBI.BigInt(sqrtPriceX96After.toString())),
        pool.tickDataProvider
      );
      break;
    }
  }
  const [token0BalanceUpdated, token1BalanceUpdated] = inputBalanceUpdated.currency.wrapped.sortsBefore(outputBalanceUpdated.currency.wrapped)
    ? [inputBalanceUpdated, outputBalanceUpdated]
    : [outputBalanceUpdated, inputBalanceUpdated];

  return V3Position.fromAmounts({
    pool: postSwapPool,
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
