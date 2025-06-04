import {
  BridgeType,
  DEFAULT_FILL_DEADLINE_OFFSET,
  DEFAULT_SLIPPAGE_IN_BPS,
  MigrationMethod,
  NATIVE_ETH_ADDRESS,
} from '../utils/constants';
import { generateSettlerData } from '../utils/helpers';
import { getV4Quote } from './getV4Quote';
import type { InternalStartMigrationParams, InternalStartMigrationResult } from '../types/internal';
import { getAcrossQuote } from '../lib/acrossClient';
import type { v4Pool } from '../types/sdk';
import type { PoolKey } from '@uniswap/v4-sdk';

export const startUniswapV4Migration = async ({
  sourceChainConfig,
  destinationChainConfig,
  destination,
  positionWithFees,
  externalParams,
}: InternalStartMigrationParams): Promise<InternalStartMigrationResult> => {
  const { pool } = positionWithFees as { pool: v4Pool };

  // find ETH/WETH in position
  const isToken0EthOrWeth =
    pool.token0.address === NATIVE_ETH_ADDRESS || pool.token0.address === sourceChainConfig.wethAddress;
  const isToken1Weth = pool.token1.address === sourceChainConfig.wethAddress;

  if (!isToken0EthOrWeth && !isToken1Weth) {
    throw new Error('ETH/WETH not found in position');
  }
  // calculate total token0 and token1 available
  const totalToken0 = positionWithFees.amount0 + positionWithFees.feeAmount0;
  const totalToken1 = positionWithFees.amount1 + positionWithFees.feeAmount1;

  // if migration Method is single-token
  if (destination.migrationMethod === MigrationMethod.SingleToken) {
    // get a quote from Uniswap Router to trade otherToken
    const exactAmount = isToken0EthOrWeth ? totalToken1 : totalToken0;
    let amountOut = 0n;
    const poolKey = {
      currency0: pool.token0.address,
      currency1: pool.token1.address,
      fee: pool.fee,
      tickSpacing: pool.tickSpacing,
      hooks: pool.hooks,
    } as PoolKey;

    if (exactAmount > 0n) {
      const quote = await getV4Quote(
        sourceChainConfig,
        poolKey,
        BigInt(exactAmount),
        !isToken0EthOrWeth,
        '0x' as `0x${string}`
      );
      // calculate total amount of WETH available
      amountOut = quote;
    }

    // TODO check that quote price is not much worse than current price
    const totalWethAvailable = isToken0EthOrWeth ? totalToken0 + amountOut : totalToken1 + amountOut;

    if (destination.bridgeType === BridgeType.Across) {
      const { interimMessageForSettler } = generateSettlerData(
        sourceChainConfig,
        destination,
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
                BigInt(10000 - (externalParams.slippageInBps || DEFAULT_SLIPPAGE_IN_BPS) / 2)) /
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
  } else if (destination.migrationMethod === MigrationMethod.DualToken) {
    if (destination.bridgeType === BridgeType.Across) {
      const { interimMessageForSettler } = generateSettlerData(
        sourceChainConfig,
        destination,
        externalParams,
        positionWithFees.owner
      );

      let flipTokens = false;
      if (isToken0EthOrWeth)
        flipTokens =
          externalParams.token0 != NATIVE_ETH_ADDRESS && externalParams.token0 != destinationChainConfig.wethAddress;
      if (isToken1Weth) flipTokens = externalParams.token1 != destinationChainConfig.wethAddress;

      const acrossQuote0 = await getAcrossQuote(
        sourceChainConfig,
        destinationChainConfig,
        pool.token0.address !== NATIVE_ETH_ADDRESS ? pool.token0.address : sourceChainConfig.wethAddress,
        totalToken0,
        isToken0EthOrWeth
          ? destinationChainConfig.wethAddress
          : flipTokens
            ? externalParams.token1
            : externalParams.token0,
        destination.protocol,
        interimMessageForSettler
      );

      const acrossQuote1 = await getAcrossQuote(
        sourceChainConfig,
        destinationChainConfig,
        pool.token1.address,
        totalToken1,
        isToken1Weth ? destinationChainConfig.wethAddress : flipTokens ? externalParams.token0 : externalParams.token1,
        destination.protocol,
        interimMessageForSettler
      );

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
                BigInt(10000 - (externalParams.slippageInBps || DEFAULT_SLIPPAGE_IN_BPS) / 2)) /
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
            outputAmount: acrossQuote1.deposit.outputAmount,
            minOutputAmount:
              (acrossQuote1.deposit.outputAmount *
                BigInt(10000 - (externalParams.slippageInBps || DEFAULT_SLIPPAGE_IN_BPS) / 2)) /
              10000n,
            maxFees: acrossQuote1.fees.totalRelayFee.total,
            fillDeadlineOffset: DEFAULT_FILL_DEADLINE_OFFSET,
            exclusiveRelayer: acrossQuote1.deposit.exclusiveRelayer,
            exclusivityDeadline: acrossQuote1.deposit.exclusivityDeadline,
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
