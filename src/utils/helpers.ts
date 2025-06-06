import { CurrencyAmount, Fraction, Percent, Price, Token, type Currency } from '@uniswap/sdk-core';
import { DEFAULT_FILL_DEADLINE_OFFSET, DEFAULT_SLIPPAGE_IN_BPS, Protocol } from './constants';
import { nearestUsableTick, Pool as V3Pool, SqrtPriceMath, TickMath, Position as V3Position } from '@uniswap/v3-sdk';
import { Position as V4Position, Pool as V4Pool } from '@uniswap/v4-sdk';
import type {
  RequestMigrationParams,
  MigratorExecutionParams,
  Position,
  Route,
  SettlerExecutionParams,
  ExactMigrationRequest,
} from '../types/sdk';

import {
  encodeMigrationParams,
  encodeMintParamsForV3,
  encodeMintParamsForV4,
  encodeSettlementParams,
  encodeParamsForSettler,
} from '../actions/encode';
import { zeroAddress, type Abi } from 'viem';

import JSBI from 'jsbi';
import { getV3Quote } from '../actions/getV3Quote';
import { chainConfigs, type ChainConfig } from '../chains';
import { getV4CombinedQuote } from '../actions/getV4CombinedQuote';
import { NFTSafeTransferFrom } from '../abis/NFTSafeTransferFrom';
import type { InternalGenerateMigrationParamsInput } from '../types/internal';
import { toSDKPosition } from './position';
import { SpokePoolABI } from '../abis';

export const generateSettlerData = (
  sourceChainConfig: ChainConfig,
  migration: ExactMigrationRequest,
  externalParams: RequestMigrationParams,
  owner: `0x${string}`
): { interimMessageForSettler: `0x${string}` } => {
  const { destination, exactPath } = migration;
  // generate mintParams first
  let mintParams: `0x${string}`;
  const additionalParams = {
    amount0Min: 1000n,
    amount1Min: 1000n,
    swapAmountInMilliBps: 0,
    sqrtPriceX96: destination.sqrtPriceX96 || 0n,
  };
  if (destination.protocol === Protocol.UniswapV3) {
    mintParams = encodeMintParamsForV3({
      ...additionalParams,
      ...externalParams, // get the rest of the params from the request
      ...destination,
    });
  } else if (destination.protocol === Protocol.UniswapV4 && 'hooks' in destination && 'tickSpacing' in destination) {
    mintParams = encodeMintParamsForV4({
      ...additionalParams,
      ...externalParams,
      ...destination,
    });
  } else {
    throw new Error('Destination protocol not supported');
  }
  // encode settlement params
  const settlementParams = encodeSettlementParams(
    {
      recipient: owner,
      senderShareBps: 0,
      senderFeeRecipient: zeroAddress,
    },
    mintParams
  );

  // generate migrationdata to calculate hash
  const migratorAddress =
    externalParams.sourcePosition.protocol == Protocol.UniswapV3
      ? sourceChainConfig.UniswapV3AcrossMigrator || zeroAddress
      : sourceChainConfig.UniswapV4AcrossMigrator || zeroAddress;
  // todo fix routesData to account for dualToken
  const routesData = '0x' as `0x${string}`;
  const migrationData = {
    sourceChainId: BigInt(externalParams.sourcePosition.chainId),
    migrator: migratorAddress,
    nonce: BigInt(1), // hardcoded, as it doesn't matter
    mode: exactPath.migrationMethod,
    routesData: routesData,
    settlementData: settlementParams,
  };
  // generate interim message for settler
  const interimMessageForSettler = encodeParamsForSettler(migrationData);
  return { interimMessageForSettler };
};

export const generateMigrationParams = async ({
  externalParams,
  sourceChainConfig,
  destinationChainConfig,
  routes,
  migration,
  maxPosition,
  maxPositionUsingRouteMinAmountOut,
  owner,
  swapAmountInMilliBps,
}: InternalGenerateMigrationParamsInput): Promise<{
  destPosition: Position;
  swapAmountInMilliBps: number;
  migratorMessage: `0x${string}`;
  settlerMessage: `0x${string}`;
}> => {
  const { destination, exactPath } = migration;
  const { amount0: amount0Min, amount1: amount1Min } = maxPositionUsingRouteMinAmountOut.burnAmountsWithSlippage(
    new Percent(exactPath.slippageInBps || DEFAULT_SLIPPAGE_IN_BPS, 10000)
  );

  const { migratorMessage, settlerMessage } = encodeMigrationParams(
    {
      chainId: BigInt(destinationChainConfig.chainId),
      settler: resolveSettler(destination.protocol, destinationChainConfig),
      tokenRoutes: await Promise.all(
        routes.map(async (route) => ({
          ...route,
          minAmountOut: route.minOutputAmount,
          quoteTimestamp: Number((await destinationChainConfig.publicClient?.getBlock())?.timestamp || 0),
          fillDeadlineOffset: DEFAULT_FILL_DEADLINE_OFFSET,
        }))
      ),
      settlementParams: {
        recipient: owner,
        senderShareBps: externalParams.senderShareBps || 0,
        senderFeeRecipient: externalParams.senderFeeRecipient || zeroAddress,
        // mint params
        token0: destination.token0,
        token1: destination.token1,
        fee: destination.fee,
        sqrtPriceX96: destination.sqrtPriceX96 || 0n,
        tickLower: destination.tickLower,
        tickUpper: destination.tickUpper,
        amount0Min: BigInt(amount0Min.toString()),
        amount1Min: BigInt(amount1Min.toString()),
        swapAmountInMilliBps: swapAmountInMilliBps ? swapAmountInMilliBps : 0,
        ...('tickSpacing' in externalParams && { tickSpacing: externalParams.tickSpacing }),
        ...('hooks' in externalParams && { hooks: externalParams.hooks }),
      },
    },
    {
      sourceChainId: BigInt(externalParams.sourcePosition.chainId),
      migrator:
        externalParams.sourcePosition.protocol == Protocol.UniswapV3
          ? sourceChainConfig.UniswapV3AcrossMigrator || zeroAddress
          : sourceChainConfig.UniswapV4AcrossMigrator || zeroAddress,
      nonce: BigInt(1), // hardcoded, as it doesn't matter
      mode: exactPath.migrationMethod!,
    }
  );

  return {
    destPosition: toSDKPosition(destinationChainConfig, maxPosition, maxPositionUsingRouteMinAmountOut),
    swapAmountInMilliBps: swapAmountInMilliBps ? swapAmountInMilliBps : 0,
    migratorMessage,
    settlerMessage,
  };
};

export const resolveSettler = (destinationProtocol: Protocol, destinationChainConfig: ChainConfig): `0x${string}` => {
  let settler: `0x${string}`;
  switch (destinationProtocol) {
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
  const [amount0, amount1] = [
    currencyAmount0.asFraction.toFixed(0).toString(),
    currencyAmount1.asFraction.toFixed(0).toString(),
  ];
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
  const [amount0, amount1] = [
    currencyAmount0.asFraction.toFixed(0).toString(),
    currencyAmount1.asFraction.toFixed(0).toString(),
  ];

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

const calculateOptimalRatio = (
  tickLower: number,
  tickUpper: number,
  sqrtRatioX96: JSBI,
  zeroForOne: boolean
): Fraction => {
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
  const amountToSwapRaw = new Fraction(inputBalance.quotient)
    .subtract(optimalRatio.multiply(outputBalance.quotient))
    .divide(optimalRatio.multiply(inputTokenPrice).add(1));

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
    const currencyAmountToSwap = calculateRatioAmountIn(
      optimalRatio,
      exchangeRate,
      inputBalance,
      outputBalance
    ) as CurrencyAmount<Token>;
    if (BigInt(currencyAmountToSwap.quotient.toString()) === 0n) {
      // todo handle this case
      break;
    }
    // now fetch the quote on the destination chain
    let amountOut: bigint;
    let sqrtPriceX96After: bigint;
    if (isV4) {
      const quote = await getV4CombinedQuote(
        chainConfig,
        pool.poolKey,
        BigInt(currencyAmountToSwap.quotient.toString()),
        zeroForOne,
        '0x'
      );
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
    ratioAchieved =
      newRatio.asFraction.equalTo(optimalRatio) ||
      newRatio.asFraction.divide(optimalRatio).subtract(1).lessThan(slippageTolerance);
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
    exchangeRate = new Price({ baseAmount: currencyAmountToSwap, quoteAmount: currencyAmountOut });
  }
  const [token0BalanceUpdated, token1BalanceUpdated] =
    inputBalanceUpdated.currency.isNative ||
    inputBalanceUpdated.currency.wrapped.sortsBefore(outputBalanceUpdated.currency.wrapped)
      ? [inputBalanceUpdated, outputBalanceUpdated]
      : [outputBalanceUpdated, inputBalanceUpdated];

  const returnPosition =
    isV4 && 'hooks' in postSwapPool
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

  return returnPosition;
};

export const subIn256 = (x: bigint, y: bigint): bigint => {
  const difference = x - y;

  if (x - y < 0n) {
    return 2n ** 256n + difference;
  } else {
    return difference;
  }
};

export const generateExecutionParams = ({
  sourceChainId,
  owner,
  protocol,
  tokenId,
  message,
}: {
  sourceChainId: number;
  owner: `0x${string}`;
  protocol: Protocol;
  tokenId: bigint;
  message: `0x${string}`;
}): MigratorExecutionParams => {
  let positionManagerAddress: `0x${string}`;
  let migratorAddress: `0x${string}` | undefined;
  const sourceChainConfig = chainConfigs[sourceChainId];
  if (protocol === Protocol.UniswapV3) {
    positionManagerAddress = sourceChainConfig.v3NftPositionManagerContract.address;
    migratorAddress = sourceChainConfig.UniswapV3AcrossMigrator;
  } else {
    positionManagerAddress = sourceChainConfig.v4PositionManagerContract.address;
    migratorAddress = sourceChainConfig.UniswapV4AcrossMigrator;
  }
  if (!positionManagerAddress || !migratorAddress) {
    throw new Error('Migrator or position manager not found');
  }
  return {
    address: positionManagerAddress,
    abi: NFTSafeTransferFrom,
    functionName: 'safeTransferFrom',
    args: [owner, migratorAddress, tokenId, message],
  };
};

export const generateSettlerExecutionParams = ({
  sourceChainId,
  destChainId,
  owner,
  destProtocol,
  routes,
  fillDeadline,
  message,
}: {
  sourceChainId: number;
  destChainId: number;
  owner: `0x${string}`;
  destProtocol: Protocol;
  routes: Route[];
  fillDeadline: number;
  message: `0x${string}`;
}): SettlerExecutionParams[] => {
  const destChainConfig = chainConfigs[destChainId];
  let recipient: `0x${string}` | undefined;
  if (destProtocol === Protocol.UniswapV3) {
    recipient = destChainConfig.UniswapV3AcrossSettler;
  } else if (destProtocol === Protocol.UniswapV4) {
    recipient = destChainConfig.UniswapV4AcrossSettler;
  } else {
    throw new Error('Unable to generate SettlerExecutionParams');
  }
  if (!recipient) {
    throw new Error('Settler not found');
  }
  return routes.map((route) => ({
    address: destChainConfig.spokePoolAddress,
    abi: SpokePoolABI as Abi,
    functionName: 'fillV3Relay',
    args: [
      {
        depositor: owner,
        recipient,
        exclusiveRelayer: '0x0000000000000000000000000000000000000000' as `0x${string}`,
        inputToken: route.inputToken,
        outputToken: route.outputToken,
        inputAmount: route.inputAmount,
        outputAmount: route.outputAmount,
        originChainId: BigInt(sourceChainId),
        depositId: 0, // hardcoded for now
        exclusivityDeadline: 0, // can make it zero for now
        fillDeadline: fillDeadline,
        message,
      },
      BigInt(sourceChainId),
    ],
  }));
};
