import { CurrencyAmount, Percent, type Currency } from '@uniswap/sdk-core';
import { DEFAULT_SLIPPAGE_IN_BPS, MigrationMethod } from './constants';
import type { IV3PositionWithUncollectedFees } from '../actions/getV3Position';
import type { IV4PositionWithUncollectedFees } from '../actions/getV4Position';
import { nearestUsableTick, Position as V3Position, type Pool as V3Pool } from '@uniswap/v3-sdk';
import { Position as V4Position, type Pool as V4Pool } from '@uniswap/v4-sdk';

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

export const getMaxPositionV3 = (
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
  // now we need to proportionally reduce the position to fit within the max tokens available on the destination chain
  // if neither amount is 0, then we need to reduce both proportionally
  if (!maxPosition.amount0.equalTo(0) && !maxPosition.amount1.equalTo(0)) {
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

export const getMaxPositionV4 = (
  pool: V4Pool,
  currencyAmount0: CurrencyAmount<Currency>,
  currencyAmount1: CurrencyAmount<Currency>,
  tickLower: number,
  tickUpper: number
): V4Position => {
  const [amount0, amount1] = [currencyAmount0.asFraction.toFixed(0).toString(), currencyAmount1.asFraction.toFixed(0).toString()];
  console.log('fromAmounts args', {
    pool: pool,
    tickLower: nearestUsableTick(tickLower, pool.tickSpacing),
    tickUpper: nearestUsableTick(tickUpper, pool.tickSpacing),
    amount0: amount0,
    amount1: amount1,
    useFullPrecision: true,
  })
  // estimate max position possible given the ticks and both tokens maxed out
  const maxPosition = V4Position.fromAmounts({
    pool: pool,
    tickLower: nearestUsableTick(tickLower, pool.tickSpacing),
    tickUpper: nearestUsableTick(tickUpper, pool.tickSpacing),
    amount0: amount0,
    amount1: amount1,
    useFullPrecision: true,
  });
  console.log('getMaxPositionV4 maxPosition amount0', maxPosition.amount0.toFixed(6));
  console.log('getMaxPositionV4 maxPosition amount1', maxPosition.amount1.toFixed(6));
  // now we need to proportionally reduce the position to fit within the max tokens available on the destination chain
  // if neither amount is 0, then we need to reduce both proportionally
  if (!maxPosition.amount0.equalTo(0) && !maxPosition.amount1.equalTo(0)) {
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
