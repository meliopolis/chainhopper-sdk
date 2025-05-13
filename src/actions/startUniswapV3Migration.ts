import { type IV3PositionWithUncollectedFees } from './getV3Position';
import { BridgeType, DEFAULT_FILL_DEADLINE_OFFSET, DEFAULT_SLIPPAGE_IN_BPS, MigrationMethod, NATIVE_ETH_ADDRESS } from '../utils/constants';
import { CurrencyAmount } from '@uniswap/sdk-core';
import { getV3Quote } from './getV3Quote';
import type { InternalStartMigrationParams, InternalStartMigrationResult } from '../types/internal';
import { generateSettlerData } from '../utils/helpers';
import { getAcrossQuote } from '../lib/acrossClient';

export const startUniswapV3Migration = async ({
  sourceChainConfig,
  destinationChainConfig,
  positionWithUncollectedFees,
  externalParams,
}: InternalStartMigrationParams): Promise<InternalStartMigrationResult> => {
  const positionWithFees = positionWithUncollectedFees as IV3PositionWithUncollectedFees;
  const { position, uncollectedFees } = positionWithFees;

  // find WETH in position
  const isWethToken0 = position.amount0.currency.address === sourceChainConfig.wethAddress;
  const isWethToken1 = position.amount1.currency.address === sourceChainConfig.wethAddress;

  if (!isWethToken0 && !isWethToken1) {
    throw new Error('WETH not found in position');
  }

  // calculate total token0 and token1 available
  const totalToken0 = position.amount0.add(uncollectedFees.amount0);
  const totalToken1 = position.amount1.add(uncollectedFees.amount1);

  // if migration Method is single-token
  if (externalParams.migrationMethod === MigrationMethod.SingleToken) {
    // get a quote from Uniswap Router to trade otherToken
    const amountIn = isWethToken0 ? BigInt(totalToken1.asFraction.toFixed(0)) : BigInt(totalToken0.asFraction.toFixed(0));
    let amountOut = CurrencyAmount.fromRawAmount(isWethToken0 ? totalToken0.currency : totalToken1.currency, 0);

    if (amountIn > 0n) {
      const quote = await getV3Quote(
        sourceChainConfig,
        isWethToken0 ? (totalToken1.currency.address as `0x${string}`) : (totalToken0.currency.address as `0x${string}`),
        isWethToken0 ? (totalToken0.currency.address as `0x${string}`) : (totalToken1.currency.address as `0x${string}`),
        position.pool.fee,
        amountIn,
        0n
      );
      // calculate total amount of WETH available
      amountOut = CurrencyAmount.fromRawAmount(isWethToken0 ? totalToken0.currency : totalToken1.currency, quote.amountOut.toString());
    }
    const totalWethAvailable = isWethToken0 ? totalToken0.add(amountOut) : totalToken1.add(amountOut);

    // todo check that quote price is not much worse than current price
    // otherwise trigger a slippage warning

    if (externalParams.bridgeType === BridgeType.Across) {
      // generate the message that will be passed to the settler on the destination chain
      // note that this is different than the message that is passed to Migrator on the source chain
      const { migrationHash, interimMessageForSettler } = generateSettlerData(sourceChainConfig, MigrationMethod.SingleToken, externalParams, positionWithFees.owner);
      const acrossQuote = await getAcrossQuote(
        sourceChainConfig,
        destinationChainConfig,
        sourceChainConfig.wethAddress,
        totalWethAvailable.asFraction.toFixed(0),
        destinationChainConfig.wethAddress,
        externalParams,
        interimMessageForSettler
      );

      return {
        acrossQuotes: [acrossQuote],
        routes: [
          {
            inputToken: acrossQuote.deposit.inputToken,
            outputToken: acrossQuote.deposit.outputToken,
            inputAmount: BigInt(totalWethAvailable.asFraction.toFixed(0)),
            outputAmount: acrossQuote.deposit.outputAmount,
            minOutputAmount: (acrossQuote.deposit.outputAmount * BigInt(10000 - (externalParams.slippageInBps || DEFAULT_SLIPPAGE_IN_BPS) / 2)) / 10000n,
            maxFees: acrossQuote.fees.totalRelayFee.total,
            fillDeadlineOffset: DEFAULT_FILL_DEADLINE_OFFSET,
            exclusiveRelayer: acrossQuote.deposit.exclusiveRelayer,
            exclusivityDeadline: acrossQuote.deposit.exclusivityDeadline,
          },
        ],
        migrationHash,
      };
    } else {
      throw new Error('Bridge type not supported');
    }
  } else if (externalParams.migrationMethod === MigrationMethod.DualToken) {
    if (externalParams.bridgeType === BridgeType.Across) {
      const { migrationHash, interimMessageForSettler } = generateSettlerData(sourceChainConfig, MigrationMethod.DualToken, externalParams, positionWithFees.owner);

      let flipTokens = false;
      if (isWethToken0) flipTokens = externalParams.token0 != NATIVE_ETH_ADDRESS && externalParams.token0 != destinationChainConfig.wethAddress;
      if (isWethToken1) flipTokens = externalParams.token1 != destinationChainConfig.wethAddress;

      const acrossQuote0 = await getAcrossQuote(
        sourceChainConfig,
        destinationChainConfig,
        totalToken0.currency.address as `0x${string}`,
        totalToken0.asFraction.toFixed(0),
        isWethToken0 ? destinationChainConfig.wethAddress : flipTokens ? externalParams.token1 : externalParams.token0,
        externalParams,
        interimMessageForSettler
      );

      const acrossQuote1 = await getAcrossQuote(
        sourceChainConfig,
        destinationChainConfig,
        totalToken1.currency.address as `0x${string}`,
        totalToken1.asFraction.toFixed(0),
        isWethToken1 ? destinationChainConfig.wethAddress : flipTokens ? externalParams.token0 : externalParams.token1,
        externalParams,
        interimMessageForSettler
      );

      return {
        acrossQuotes: [acrossQuote0, acrossQuote1],
        routes: [
          {
            inputToken: acrossQuote0.deposit.inputToken,
            outputToken: acrossQuote0.deposit.outputToken,
            inputAmount: BigInt(totalToken0.asFraction.toFixed(0)),
            outputAmount: acrossQuote0.deposit.outputAmount,
            minOutputAmount: (acrossQuote0.deposit.outputAmount * BigInt(10000 - (externalParams.slippageInBps || DEFAULT_SLIPPAGE_IN_BPS) / 2)) / 10000n,
            maxFees: acrossQuote0.fees.totalRelayFee.total,
            fillDeadlineOffset: DEFAULT_FILL_DEADLINE_OFFSET,
            exclusiveRelayer: acrossQuote0.deposit.exclusiveRelayer,
            exclusivityDeadline: acrossQuote0.deposit.exclusivityDeadline,
          },
          {
            inputToken: acrossQuote1.deposit.inputToken,
            outputToken: acrossQuote1.deposit.outputToken,
            inputAmount: BigInt(totalToken1.asFraction.toFixed(0)),
            outputAmount: acrossQuote1.deposit.outputAmount,
            minOutputAmount: (acrossQuote1.deposit.outputAmount * BigInt(10000 - (externalParams.slippageInBps || DEFAULT_SLIPPAGE_IN_BPS) / 2)) / 10000n,
            maxFees: acrossQuote1.fees.totalRelayFee.total,
            fillDeadlineOffset: DEFAULT_FILL_DEADLINE_OFFSET,
            exclusiveRelayer: acrossQuote1.deposit.exclusiveRelayer,
            exclusivityDeadline: acrossQuote1.deposit.exclusivityDeadline,
          },
        ],
        migrationHash,
      };
    } else {
      throw new Error('Bridge type not supported');
    }
  } else {
    throw new Error('Invalid migration method');
  }
};
