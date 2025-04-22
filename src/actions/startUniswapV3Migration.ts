import { type IV3PositionWithUncollectedFees } from './getV3Position';
import { BridgeType, DEFAULT_FILL_DEADLINE_OFFSET, DEFAULT_SLIPPAGE_IN_BPS, MigrationMethod, Protocol } from '../utils/constants';
import { CurrencyAmount, Token } from '@uniswap/sdk-core';
import { acrossClient } from '../lib/acrossClient';
import { encodeMintParamsForV3, encodeMintParamsForV4, encodeSettlementParams, encodeSettlementParamsForSettler } from './encode';
import { zeroAddress } from 'viem';
import { genMigrationId } from '../utils/helpers';
import { getV3Quote } from './getV3Quote';
import type { InternalStartMigrationParams, InternalStartMigrationResult } from '../types/internal';
import type { RequestV3MigrationParams, RequestV4MigrationParams } from '../types/sdk';
import type { ChainConfig } from '../chains';

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
  const totalToken0 = position.amount0.add(uncollectedFees.amount0).divide(10);
  const totalToken1 = position.amount1.add(uncollectedFees.amount1).divide(10);

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
      amountOut = CurrencyAmount.fromRawAmount(isWethToken0 ? totalToken0.currency : totalToken1.currency, quote.toString());
    }
    const totalWethAvailable = isWethToken0 ? totalToken0.add(amountOut) : totalToken1.add(amountOut);

    // todo check that quote price is not much worse than current price
    // otherwise trigger a slippage warning

    if (externalParams.bridgeType === BridgeType.Across) {
      // generate the message that will be passed to the settler on the destination chain
      // note that this is different than the message that is passed to Migrator on the source chain
      const { migrationId, interimMessageForSettler } = generateMigration(sourceChainConfig, MigrationMethod.DualToken, externalParams);
      const wethToken = isWethToken0 ? totalToken0 : totalToken1
      const acrossQuote = await getAcrossQuote(sourceChainConfig, destinationChainConfig, wethToken, totalWethAvailable.asFraction.toFixed(0), interimMessageForSettler);

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
    // for now, skip adjusting token amounts and revisit as an enhancement
    // get across quotes for both token amounts

    if (externalParams.bridgeType === BridgeType.Across) {
      const { migrationId, interimMessageForSettler } = generateMigration(sourceChainConfig, MigrationMethod.DualToken, externalParams);

      console.log('totalToken0', totalToken0.toFixed(6))
      console.log('totalToken1', totalToken1.toFixed(6))

      const acrossQuote0 = await getAcrossQuote(sourceChainConfig, destinationChainConfig, totalToken0, totalToken0.asFraction.toFixed(0), interimMessageForSettler);
      const acrossQuote1 = await getAcrossQuote(sourceChainConfig, destinationChainConfig, totalToken1, totalToken1.asFraction.toFixed(0), interimMessageForSettler);

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

function generateMigration(
  sourceChainConfig: ChainConfig,
  migrationMethod: MigrationMethod,
  externalParams: RequestV3MigrationParams | RequestV4MigrationParams) {
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
  return { migrationId, interimMessageForSettler }
}

async function getAcrossQuote(
  sourceChainConfig: ChainConfig,
  destinationChainConfig: ChainConfig,
  token: CurrencyAmount<Token>, tokenAmount: string,
  interimMessageForSettler: `0x${string}`) {
  // initially just supporting (W)ETH/USDC pairs
  // TODO: add desired dual token pair address mappings to chain config or similar for address lookup
  const isWethToken = token.currency.address === sourceChainConfig.wethAddress;
  return await acrossClient({ testnet: sourceChainConfig.testnet }).getQuote({
    route: {
      originChainId: sourceChainConfig.chainId,
      destinationChainId: destinationChainConfig.chainId,
      inputToken: token.currency.address as `0x${string}`,
      outputToken: isWethToken ? destinationChainConfig.wethAddress : destinationChainConfig.usdcAddress,
    },
    inputAmount: tokenAmount,
    recipient: destinationChainConfig.UniswapV3AcrossSettler as `0x${string}`,
    crossChainMessage: interimMessageForSettler,
  })
}
