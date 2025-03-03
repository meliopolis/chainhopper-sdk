import { type Currency, CurrencyAmount } from "@uniswap/sdk-core";
import { Position } from "@uniswap/v4-sdk";
import type { ChainConfig } from "../chains";
import type { IUniswapPositionParams } from "../types";

export interface IV4PositionWithUncollectedFees {
  position: Position;
  uncollectedFees: {
    amount0: CurrencyAmount<Currency>;
    amount1: CurrencyAmount<Currency>;
  };
}

export const getV4Position = async (
  chainConfig: ChainConfig,
  params: IUniswapPositionParams
) => {
  const { chainId, tokenId, owner } = params;
  // TODO: implement
  return {
    position: {} as Position,
    uncollectedFees: {
      amount0: {} as CurrencyAmount<Currency>,
      amount1: {} as CurrencyAmount<Currency>,
    },
  };

};
