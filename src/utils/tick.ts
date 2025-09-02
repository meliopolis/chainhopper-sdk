import { Protocol } from './constants';
import { nearestUsableTick as uniswapNearestUsableTick } from '@uniswap/v3-sdk';

export const nearestUsableTick = (protocol: Protocol, tick: number, tickSpacing: number): number => {
  if ([Protocol.UniswapV3, Protocol.UniswapV4].includes(protocol)) {
    return uniswapNearestUsableTick(tick, tickSpacing);
  } else {
    const MIN_TICK = -887272;
    const MAX_TICK = 887272;
    const clampedTick = Math.max(MIN_TICK, Math.min(MAX_TICK, tick));
    return Math.round(clampedTick / tickSpacing) * tickSpacing;
  }
};
