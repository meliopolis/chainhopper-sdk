import { BridgeType, DEFAULT_FILL_DEADLINE_OFFSET, DEFAULT_SLIPPAGE_IN_BPS, MigrationMethod, Protocol } from '../utils/constants';
import { CurrencyAmount } from '@uniswap/sdk-core';
import { encodeMintParamsForV3, encodeMintParamsForV4, encodeSettlementParams, encodeSettlementParamsForSettler } from './encode';
import type { IV4PositionWithUncollectedFees } from './getV4Position';
import { zeroAddress } from 'viem';
import { genMigrationId, generateMigration, getAcrossQuote } from '../utils/helpers';
import { getV4Quote } from './getV4Quote';
import type { InternalStartMigrationParams, InternalStartMigrationResult } from '../types/internal';

export const startUniswapV4Migration = async ({
  sourceChainConfig,
  destinationChainConfig,
  positionWithUncollectedFees,
  externalParams,
}: InternalStartMigrationParams): Promise<InternalStartMigrationResult> => {
  const positionWithFees = positionWithUncollectedFees as IV4PositionWithUncollectedFees;
  const { position, uncollectedFees } = positionWithFees;

  // find ETH/WETH in position
  const isToken0EthOrWeth = position.amount0.currency.isNative || position.amount0.currency.address === sourceChainConfig.wethAddress;
  const isToken1Weth = position.amount1.currency.isNative || position.amount1.currency.address === sourceChainConfig.wethAddress;

  if (!isToken0EthOrWeth && !isToken1Weth) {
    throw new Error('ETH/WETH not found in position');
  }

  // calculate total token0 and token1 available
  const totalToken0 = position.amount0.add(uncollectedFees.amount0);
  const totalToken1 = position.amount1.add(uncollectedFees.amount1);

  // if migration Method is single-token
  if (externalParams.migrationMethod === MigrationMethod.SingleToken) {
    // get a quote from Uniswap Router to trade otherToken
    const exactAmount = isToken0EthOrWeth ? totalToken1.asFraction.toFixed(0) : totalToken0.asFraction.toFixed(0);
    let amountOut = CurrencyAmount.fromRawAmount(isToken0EthOrWeth ? totalToken0.currency : totalToken1.currency, 0);

    if (BigInt(exactAmount) > 0n) {
      const quote = await getV4Quote(sourceChainConfig, position.pool.poolKey, BigInt(exactAmount), !isToken0EthOrWeth, position.pool.hooks as `0x${string}`);
      // calculate total amount of WETH available
      amountOut = CurrencyAmount.fromRawAmount(isToken0EthOrWeth ? totalToken0.currency : totalToken1.currency, quote.toString());
    }

    // TODO check that quote price is not much worse than current price
    const totalWethAvailable = isToken0EthOrWeth ? totalToken0.add(amountOut) : totalToken1.add(amountOut);

    // now we need to generate the message that will be passed to the settler on the destination chain
    // note that this is different than the message that is passed to Migrator on the source chain
    const migrationId = genMigrationId(externalParams.sourceChainId, sourceChainConfig.UniswapV4AcrossMigrator || zeroAddress, MigrationMethod.SingleToken, BigInt(0));
    let mintParams: `0x${string}`;
    if (externalParams.bridgeType === BridgeType.Across) {
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

      const acrossQuote = await getAcrossQuote(
        sourceChainConfig,
        destinationChainConfig,
        sourceChainConfig.wethAddress,
        totalWethAvailable.asFraction.toFixed(0),
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
        migrationId,
      };
    } else {
      throw new Error('Bridge type not supported');
    }
  } else if (externalParams.migrationMethod === MigrationMethod.DualToken) {
    if (externalParams.bridgeType === BridgeType.Across) {
      const { migrationId, interimMessageForSettler } = generateMigration(sourceChainConfig, MigrationMethod.DualToken, externalParams);

      const token0Address = totalToken0.currency.isNative ? sourceChainConfig.wethAddress : (totalToken0.currency.address as `0x${string}`);
      const token1Address = totalToken1.currency.isNative ? sourceChainConfig.wethAddress : (totalToken1.currency.address as `0x${string}`);

      const acrossQuote0 = await getAcrossQuote(
        sourceChainConfig,
        destinationChainConfig,
        token0Address,
        totalToken0.asFraction.toFixed(0),
        externalParams,
        interimMessageForSettler
      );
      const acrossQuote1 = await getAcrossQuote(
        sourceChainConfig,
        destinationChainConfig,
        token1Address,
        totalToken1.asFraction.toFixed(0),
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
        migrationId,
      };
    } else {
      throw new Error('Bridge type not supported');
    }
  } else {
    throw new Error('Invalid migration method');
  }
};
