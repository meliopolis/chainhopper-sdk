import {
  BridgeType,
  DEFAULT_FILL_DEADLINE_OFFSET,
  DEFAULT_SLIPPAGE_IN_BPS,
  MigrationMethod,
  NATIVE_ETH_ADDRESS,
} from '../utils/constants';
import { getV3Quote } from './getV3Quote';
import type { InternalStartMigrationParams, InternalStartMigrationResult } from '../types/internal';
import { generateSettlerData } from '../utils/helpers';
import { getAcrossQuote } from '../lib/acrossClient';

export const startUniswapV3Migration = async ({
  sourceChainConfig,
  destinationChainConfig,
  positionWithFees,
  migration,
  externalParams,
}: InternalStartMigrationParams): Promise<InternalStartMigrationResult> => {
  const { destination, exactPath } = migration;
  const { pool } = positionWithFees;

  // find WETH in position
  const isWethToken0 = pool.token0.address === sourceChainConfig.wethAddress;
  const isWethToken1 = pool.token1.address === sourceChainConfig.wethAddress;

  if (!isWethToken0 && !isWethToken1) {
    throw new Error('WETH not found in position');
  }

  // calculate total token0 and token1 available
  const totalToken0 = positionWithFees.amount0 + positionWithFees.feeAmount0;
  const totalToken1 = positionWithFees.amount1 + positionWithFees.feeAmount1;

  // if migration Method is single-token
  if (exactPath.migrationMethod === MigrationMethod.SingleToken) {
    // get a quote from Uniswap Router to trade otherToken
    const amountIn = isWethToken0 ? totalToken1 : totalToken0;
    let amountOut = 0n;

    if (amountIn > 0n) {
      const quote = await getV3Quote(
        sourceChainConfig,
        isWethToken0 ? positionWithFees.pool.token1.address : positionWithFees.pool.token0.address,
        isWethToken0 ? positionWithFees.pool.token0.address : positionWithFees.pool.token1.address,
        positionWithFees.pool.fee,
        amountIn,
        0n
      );
      // calculate total amount of WETH available
      amountOut = quote.amountOut;
    }
    const totalWethAvailable = isWethToken0 ? totalToken0 + amountOut : totalToken1 + amountOut;

    // todo check that quote price is not much worse than current price
    // otherwise trigger a slippage warning

    if (exactPath.bridgeType === BridgeType.Across) {
      // generate the message that will be passed to the settler on the destination chain
      // note that this is different than the message that is passed to Migrator on the source chain
      const { interimMessageForSettler } = generateSettlerData(
        sourceChainConfig,
        migration,
        externalParams,
        positionWithFees.owner
      );
      const acrossQuote = await getAcrossQuote(
        sourceChainConfig,
        destinationChainConfig,
        sourceChainConfig.wethAddress,
        totalWethAvailable,
        destinationChainConfig.wethAddress,
        destination.protocol,
        interimMessageForSettler
      );

      return {
        acrossQuotes: [acrossQuote],
        routes: [
          {
            inputToken: acrossQuote.deposit.inputToken,
            outputToken: acrossQuote.deposit.outputToken,
            inputAmount: totalWethAvailable,
            outputAmount: acrossQuote.deposit.outputAmount,
            minOutputAmount:
              (acrossQuote.deposit.outputAmount *
                BigInt(10000 - (exactPath.slippageInBps || DEFAULT_SLIPPAGE_IN_BPS) / 2)) /
              10000n,
            maxFees: acrossQuote.fees.totalRelayFee.total,
            fillDeadlineOffset: DEFAULT_FILL_DEADLINE_OFFSET,
            exclusiveRelayer: acrossQuote.deposit.exclusiveRelayer,
            exclusivityDeadline: acrossQuote.deposit.exclusivityDeadline,
          },
        ],
      };
    } else {
      throw new Error('Bridge type not supported');
    }
  } else if (exactPath.migrationMethod === MigrationMethod.DualToken) {
    if (exactPath.bridgeType === BridgeType.Across) {
      const { interimMessageForSettler } = generateSettlerData(
        sourceChainConfig,
        migration,
        externalParams,
        positionWithFees.owner
      );

      let flipTokens = false;
      if (isWethToken0)
        flipTokens =
          destination.token0 != NATIVE_ETH_ADDRESS && destination.token0 != destinationChainConfig.wethAddress;
      if (isWethToken1) flipTokens = destination.token1 != destinationChainConfig.wethAddress;

      const acrossQuote0 = await getAcrossQuote(
        sourceChainConfig,
        destinationChainConfig,
        pool.token0.address,
        totalToken0,
        isWethToken0 ? destinationChainConfig.wethAddress : flipTokens ? destination.token1 : destination.token0,
        destination.protocol,
        interimMessageForSettler
      );

      const acrossQuote1 = await getAcrossQuote(
        sourceChainConfig,
        destinationChainConfig,
        pool.token1.address,
        totalToken1,
        isWethToken1 ? destinationChainConfig.wethAddress : flipTokens ? destination.token0 : destination.token1,
        destination.protocol,
        interimMessageForSettler
      );

      // add extra gas for second quote to mint position
      // usually takes 200k gas, instead estimating 1000k (actual usage is around 700k)
      const relayerGasFee1 = acrossQuote1.fees.relayerGasFee.total;
      const additionalGasFee1 = relayerGasFee1 * 4n;

      return {
        acrossQuotes: [acrossQuote0, acrossQuote1],
        routes: [
          {
            inputToken: acrossQuote0.deposit.inputToken,
            outputToken: acrossQuote0.deposit.outputToken,
            inputAmount: totalToken0,
            outputAmount: acrossQuote0.deposit.outputAmount,
            minOutputAmount:
              (acrossQuote0.deposit.outputAmount *
                BigInt(10000 - (exactPath.slippageInBps || DEFAULT_SLIPPAGE_IN_BPS) / 2)) /
              10000n,
            maxFees: acrossQuote0.fees.totalRelayFee.total,
            fillDeadlineOffset: DEFAULT_FILL_DEADLINE_OFFSET,
            exclusiveRelayer: acrossQuote0.deposit.exclusiveRelayer,
            exclusivityDeadline: acrossQuote0.deposit.exclusivityDeadline,
          },
          {
            inputToken: acrossQuote1.deposit.inputToken,
            outputToken: acrossQuote1.deposit.outputToken,
            inputAmount: totalToken1,
            outputAmount: acrossQuote1.deposit.outputAmount - additionalGasFee1,
            minOutputAmount:
              ((acrossQuote1.deposit.outputAmount - additionalGasFee1) *
                BigInt(10000 - (exactPath.slippageInBps || DEFAULT_SLIPPAGE_IN_BPS) / 2)) /
              10000n,
            maxFees: acrossQuote1.fees.totalRelayFee.total + additionalGasFee1,
            fillDeadlineOffset: DEFAULT_FILL_DEADLINE_OFFSET,
            exclusiveRelayer: acrossQuote1.deposit.exclusiveRelayer,
            exclusivityDeadline: acrossQuote1.deposit.exclusivityDeadline + 10, // giving extra time for second quote to mint position
          },
        ],
      };
    } else {
      throw new Error('Bridge type not supported');
    }
  } else {
    throw new Error('Invalid migration method');
  }
};
