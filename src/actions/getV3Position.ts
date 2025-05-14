import { type Abi } from 'viem';
import { type ChainConfig } from '../chains';
import PoolContract from '@uniswap/v3-core/artifacts/contracts/UniswapV3Pool.sol/UniswapV3Pool.json';
import { computePoolAddress, Pool, Position } from '@uniswap/v3-sdk';
import { CurrencyAmount, Token } from '@uniswap/sdk-core';
import { erc20Abi } from 'viem';
import type { IUniswapPositionParams } from '../types';
const MAX_UINT128: bigint = BigInt(2) ** BigInt(127);

type IPositionsCallResult = [bigint, string, string, string, number, number, number, bigint, bigint, bigint, bigint, bigint];
type IPoolCallResult = [[bigint, number, number, number, number, number, boolean], bigint];
type ILPFeeCallResult = [bigint, bigint];

export type IV3PositionsCallType = {
  token0: `0x${string}`;
  token1: `0x${string}`;
  feeTier: number;
  tickLower: number;
  tickUpper: number;
  liquidity: bigint;
};

export type IV3PositionWithUncollectedFees = {
  owner: `0x${string}`;
  position: Position;
  uncollectedFees: {
    amount0: CurrencyAmount<Token>;
    amount1: CurrencyAmount<Token>;
  };
};

// ── CACHE SETUP ────────────────────────────────────────────────────────────────
const v3PositionCache = new Map<string, Promise<IV3PositionWithUncollectedFees>>();

export const getV3Position = async (
  chainConfig: ChainConfig,
  params: IUniswapPositionParams
): Promise<IV3PositionWithUncollectedFees> => {
  const key = `${chainConfig.chainId}:${params.tokenId}`;
  if (v3PositionCache.has(key)) {
    return v3PositionCache.get(key)!;
  }

  const p = (async (): Promise<IV3PositionWithUncollectedFees> => {
    const publicClient = chainConfig.publicClient;
    // ── 1. ownerOf + positions() ─────────────────────────────────────────────
    const [ownerRes, posRes] = await publicClient!.multicall({
      contracts: [
        {
          address: chainConfig.v3NftPositionManagerContract.address as `0x${string}`,
          abi: chainConfig.v3NftPositionManagerContract.abi,
          functionName: 'ownerOf',
          args: [params.tokenId],
        },
        {
          address: chainConfig.v3NftPositionManagerContract.address as `0x${string}`,
          abi: chainConfig.v3NftPositionManagerContract.abi,
          functionName: 'positions',
          args: [params.tokenId],
        },
      ],
      multicallAddress: chainConfig.multicallAddress,
    });
    const owner = ownerRes.result as `0x${string}`;
    const positionsCallResult = posRes.result as IPositionsCallResult;

    const positionsCallData = {
      token0: positionsCallResult[2],
      token1: positionsCallResult[3],
      feeTier: positionsCallResult[4],
      tickLower: positionsCallResult[5],
      tickUpper: positionsCallResult[6],
      liquidity: positionsCallResult[7],
    };

    // ── 2. collect() simulate to get uncollected fees ──────────────────────────
    const lpFee = (await publicClient!.simulateContract({
      address: chainConfig.v3NftPositionManagerContract.address as `0x${string}`,
      abi: chainConfig.v3NftPositionManagerContract.abi,
      functionName: 'collect',
      args: [
        {
          tokenId: params.tokenId,
          recipient: owner,
          amount0Max: MAX_UINT128,
          amount1Max: MAX_UINT128,
        },
      ] as const,
      account: owner,
    })).result as ILPFeeCallResult;

    // ── 3. fetch pool slot0 + liquidity ────────────────────────────────────────
    const poolAddress = computePoolAddress({
      factoryAddress: chainConfig.v3FactoryAddress as `0x${string}`,
      tokenA: new Token(chainConfig.chain.id, positionsCallData.token0, 18),
      tokenB: new Token(chainConfig.chain.id, positionsCallData.token1, 18),
      fee: positionsCallData.feeTier,
    });
    const poolContract = {
      address: poolAddress as `0x${string}`,
      abi: PoolContract.abi as Abi,
    };
    const [slot0Res, liqRes] = await publicClient!.multicall({
      contracts: [
        { ...poolContract, functionName: 'slot0' },
        { ...poolContract, functionName: 'liquidity' },
      ],
      multicallAddress: chainConfig.multicallAddress,
    });
    const poolData = {
      sqrtPriceX96: (slot0Res.result as any)[0] as bigint,
      liquidity: liqRes.result as bigint,
      tick: (slot0Res.result as any)[1] as number,
    };

    // ── 4. fetch token metadata ────────────────────────────────────────────────
    const tokenCalls = [positionsCallData.token0, positionsCallData.token1]
      .flatMap((tokenAddress) =>
        ['decimals', 'symbol', 'name'].map((fn) => ({
          address: tokenAddress as `0x${string}`,
          abi: erc20Abi,
          functionName: fn as 'decimals' | 'symbol' | 'name',
        }))
      );

    const rawMeta = await publicClient!.multicall({
      contracts: tokenCalls,
      multicallAddress: chainConfig.multicallAddress,
    });

    const meta = rawMeta
      .filter((r) => r.status === 'success')
      .map((r) => r.result as number | string)
      .reduce((arr: (number | string)[][], v, i) => {
        const idx = Math.floor(i / 3);
        arr[idx] = arr[idx] || [];
        arr[idx].push(v);
        return arr;
      }, []);

    const pool = new Pool(
      new Token(params.chainId, positionsCallData.token0, meta[0][0] as number, meta[0][1] as string, meta[0][2] as string),
      new Token(params.chainId, positionsCallData.token1, meta[1][0] as number, meta[1][1] as string, meta[1][2] as string),
      positionsCallData.feeTier,
      poolData.sqrtPriceX96.toString(),
      poolData.liquidity.toString(),
      poolData.tick
    );

    return {
      owner,
      position: new Position({
        pool,
        liquidity: positionsCallData.liquidity.toString(),
        tickLower: positionsCallData.tickLower,
        tickUpper: positionsCallData.tickUpper,
      }),
      uncollectedFees: {
        amount0: CurrencyAmount.fromRawAmount(pool.token0, lpFee[0].toString()),
        amount1: CurrencyAmount.fromRawAmount(pool.token1, lpFee[1].toString()),
      },
    };
  })();

  v3PositionCache.set(key, p);
  setTimeout(() => v3PositionCache.delete(key), 300);
  return p;
};