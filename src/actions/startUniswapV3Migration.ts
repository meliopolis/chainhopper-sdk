import {
  BridgeType,
  DEFAULT_FILL_DEADLINE_OFFSET,
  DEFAULT_SLIPPAGE_IN_BPS,
  MigrationMethod,
  NATIVE_ETH_ADDRESS,
} from '../utils/constants';
import { getV3Quote } from './getV3Quote';
import type { InternalStartMigrationParams, InternalStartMigrationResult } from '../types/internal';
import { generateSettlerData, resolveSettler } from '../utils/helpers';
import { getAcrossQuote } from '../lib/acrossClient';
import { Token as UniswapSDKToken } from '@uniswap/sdk-core';
import type { v3Pool, DirectRoute } from '@/types';

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
    let sourceSlippageBps = 0;

    const uniswapSDKToken0 = new UniswapSDKToken(
      sourceChainConfig.chain.id,
      positionWithFees.pool.token0.address,
      positionWithFees.pool.token0.decimals
    );
    const uniswapSDKToken1 = new UniswapSDKToken(
      sourceChainConfig.chain.id,
      positionWithFees.pool.token1.address,
      positionWithFees.pool.token1.decimals
    );

    if (amountIn > 0n) {
      const quote = await getV3Quote(
        sourceChainConfig,
        isWethToken0 ? uniswapSDKToken1 : uniswapSDKToken0,
        isWethToken0 ? uniswapSDKToken0 : uniswapSDKToken1,
        positionWithFees.pool as v3Pool,
        amountIn,
        0n
      );
      // calculate total amount of WETH available
      amountOut = quote.amountOut;
      sourceSlippageBps = quote.slippageBps;
    }
    const totalWethAvailable = isWethToken0 ? totalToken0 + amountOut : totalToken1 + amountOut;

    if (-1 * sourceSlippageBps > exactPath.slippageInBps) {
      throw new Error('Price impact exceeds slippage');
    }

    if (exactPath.bridgeType === BridgeType.Direct) {
      const routes: DirectRoute[] = [];

      // Create route for WETH (the single token we're transferring)
      const directRoute: DirectRoute = {
        inputToken: sourceChainConfig.wethAddress,
        outputToken: sourceChainConfig.wethAddress,
        inputAmount: totalWethAvailable,
        outputAmount: totalWethAvailable,
        minOutputAmount: (totalWethAvailable * BigInt(10000 - exactPath.slippageInBps)) / BigInt(10000),
        destinationSettler: resolveSettler(destination.protocol, destinationChainConfig, BridgeType.Direct),
        sourceSlippageBps: sourceSlippageBps,
        destinationSlippageBps: exactPath.slippageInBps,
      };

      routes.push(directRoute);

      return {
        acrossQuotes: [],
        routes,
      };
    } else if (exactPath.bridgeType === BridgeType.Across) {
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
            destinationSettler: resolveSettler(destination.protocol, destinationChainConfig, exactPath.bridgeType),
            sourceSlippageBps,
          },
        ],
      };
    } else {
      throw new Error('Bridge type not supported');
    }
  } else if (exactPath.migrationMethod === MigrationMethod.DualToken) {
    if (exactPath.bridgeType === BridgeType.Direct) {
      const routes: DirectRoute[] = [];

      // Create routes for both tokens
      if (totalToken0 > 0n) {
        routes.push({
          inputToken: positionWithFees.pool.token0.address,
          outputToken: destination.token0,
          inputAmount: totalToken0,
          outputAmount: totalToken0,
          minOutputAmount: (totalToken0 * BigInt(10000 - exactPath.slippageInBps)) / BigInt(10000),
          destinationSettler: resolveSettler(destination.protocol, destinationChainConfig, BridgeType.Direct),
          sourceSlippageBps: 0,
          destinationSlippageBps: exactPath.slippageInBps,
        });
      }

      if (totalToken1 > 0n) {
        routes.push({
          inputToken: positionWithFees.pool.token1.address,
          outputToken: destination.token1,
          inputAmount: totalToken1,
          outputAmount: totalToken1,
          minOutputAmount: (totalToken1 * BigInt(10000 - exactPath.slippageInBps)) / BigInt(10000),
          destinationSettler: resolveSettler(destination.protocol, destinationChainConfig, BridgeType.Direct),
          sourceSlippageBps: 0,
          destinationSlippageBps: exactPath.slippageInBps,
        });
      }

      return {
        acrossQuotes: [],
        routes,
      };
    } else if (exactPath.bridgeType === BridgeType.Across) {
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
            destinationSettler: resolveSettler(destination.protocol, destinationChainConfig, exactPath.bridgeType),
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
            destinationSettler: resolveSettler(destination.protocol, destinationChainConfig, exactPath.bridgeType),
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
