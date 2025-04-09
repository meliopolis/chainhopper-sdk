import type { BigintIsh } from '@uniswap/sdk-core';
import { type TickDataProvider } from '@uniswap/v3-sdk';
import { PoolContractABI } from '../abis/v3PoolContract';
import { chainConfigs } from '../chains';

export class LazyTickDataProvider implements TickDataProvider {
  private chainId: number;
  private poolAddress: string;

  constructor(chainId: number, poolAddress: string) {
    this.chainId = chainId;
    this.poolAddress = poolAddress;
  }

  async getTick(tick: number): Promise<{ liquidityNet: BigintIsh }> {
    const chainConfig = chainConfigs[this.chainId];
    const results = await chainConfig.publicClient?.readContract({
      address: this.poolAddress as `0x${string}`,
      abi: PoolContractABI,
      functionName: 'ticks',
      args: [tick],
    });
    if (!results) {
      throw new Error('Failed to get tick data');
    }
    return {
      liquidityNet: results[6],
    };
  }

  async nextInitializedTickWithinOneWord(tick: number, lte: boolean, tickSpacing: number): Promise<[number, boolean]> {
    let compressed = Math.floor(tick / tickSpacing);
    if (tick < 0 && tick % tickSpacing !== 0) compressed--;

    let next: number;
    let initialized: boolean;

    if (lte) {
      const [wordPos, bitPos] = this.position(compressed);
      const mask = (1n << BigInt(bitPos)) - 1n + (1n << BigInt(bitPos));
      const masked = (await this.getWord(wordPos)) & mask;

      initialized = masked !== 0n;
      next = initialized ? (compressed - (bitPos - this.mostSignificantBit(masked))) * tickSpacing : (compressed - bitPos) * tickSpacing;
    } else {
      const [wordPos, bitPos] = this.position(compressed + 1);
      const mask = ~((1n << BigInt(bitPos)) - 1n);
      const masked = (await this.getWord(wordPos)) & mask;

      initialized = masked !== 0n;
      next = initialized ? (compressed + 1 + (this.leastSignificantBit(masked) - bitPos)) * tickSpacing : (compressed + 1 + (255 - bitPos)) * tickSpacing;
    }

    return [next, initialized];
  }

  private position(tick: number): [number, number] {
    const wordPos = Math.floor(tick / 256);
    const bitPos = ((tick % 256) + 256) % 256;
    return [wordPos, bitPos];
  }

  private async getWord(wordPos: number): Promise<bigint> {
    const chainConfig = chainConfigs[this.chainId];
    const results = await chainConfig.publicClient?.readContract({
      address: this.poolAddress as `0x${string}`,
      abi: PoolContractABI,
      functionName: 'tickBitmap',
      args: [wordPos],
    });
    if (!results) {
      throw new Error('Failed to get tick data');
    }
    return results;
  }

  private mostSignificantBit(x: bigint): number {
    let r = 0;
    for (let i = 128; i >= 1; i /= 2) {
      if (x >= 1n << BigInt(i)) {
        x >>= BigInt(i);
        r += i;
      }
    }
    return r;
  }

  private leastSignificantBit(x: bigint): number {
    return this.mostSignificantBit(x & -x);
  }
}
