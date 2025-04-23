import { type IV3PositionWithUncollectedFees } from './getV3Position';
import { BridgeType, DEFAULT_FILL_DEADLINE_OFFSET, DEFAULT_SLIPPAGE_IN_BPS, MigrationMethod, Protocol } from '../utils/constants';
import { CurrencyAmount } from '@uniswap/sdk-core';
import { acrossClient } from '../lib/acrossClient';
import { encodeMintParamsForV3, encodeMintParamsForV4, encodeSettlementParams, encodeSettlementParamsForSettler } from './encode';
import { zeroAddress } from 'viem';
import { genMigrationId } from '../utils/helpers';
import { getV3Quote } from './getV3Quote';
import type { InternalStartMigrationParams, InternalStartMigrationResult } from '../types/internal';

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

    // generate the message that will be passed to the settler on the destination chain
    // note that this is different than the message that is passed to Migrator on the source chain
    const migrationId = genMigrationId(externalParams.sourceChainId, sourceChainConfig.UniswapV3AcrossMigrator || zeroAddress, MigrationMethod.SingleToken, BigInt(0));
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
      // get a quote from Across
      const acrossQuote = await acrossClient({ testnet: sourceChainConfig.testnet }).getQuote({
        route: {
          originChainId: sourceChainConfig.chainId,
          destinationChainId: destinationChainConfig.chainId,
          inputToken: isWethToken0 ? (totalToken0.currency.address as `0x${string}`) : (totalToken1.currency.address as `0x${string}`),
          outputToken: destinationChainConfig.wethAddress,
        },
        inputAmount: totalWethAvailable.asFraction.toFixed(0),
        recipient: destinationChainConfig.UniswapV3AcrossSettler as `0x${string}`,
        crossChainMessage: interimMessageForSettler,
      });

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
    // TODO: implement dual token migration
    throw new Error('Dual token migration not implemented');
  } else {
    throw new Error('Invalid migration method');
  }
};
