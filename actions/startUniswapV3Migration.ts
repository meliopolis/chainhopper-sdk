import type { ChainConfig } from "../chains";
import { type IV3PositionWithUncollectedFees } from "./getV3Position";
import { BridgeType, MigrationMethod } from "../utils/constants";
import type { RequestV3MigrationParams } from "../types";
import { CurrencyAmount } from "@uniswap/sdk-core";
import { acrossClient } from "../lib/acrossClient";
import { encodeSettlementParamsForSettler, encodeV3SettlementParams } from "./encode";

export async function startUniswapV3Migration(
  sourceChainConfig: ChainConfig, 
  destinationChainConfig: ChainConfig, 
  v3PositionWithUncollectedFees: IV3PositionWithUncollectedFees, 
  params: RequestV3MigrationParams
) {
  const { position, uncollectedFees } = v3PositionWithUncollectedFees;

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
  if (params.migrationMethod === MigrationMethod.SingleToken) {
    // get a quote from Uniswap Router to trade otherToken
    const quote = await sourceChainConfig.publicClient?.simulateContract({
      ...sourceChainConfig.quoterV2Contract, 
      functionName: 'quoteExactInputSingle',
      args: [{
        tokenIn: isWethToken0 ? totalToken1.currency.address : totalToken0.currency.address,
        tokenOut: isWethToken0 ? totalToken0.currency.address : totalToken1.currency.address,
        fee: position.pool.fee,
        amountIn: isWethToken0 ? totalToken1.asFraction.toFixed(0) : totalToken0.asFraction.toFixed(0),
        sqrtPriceLimitX96: 0
      }],
    }) as {
      result: bigint[]
    };

    // calculate total amount of WETH available
    const amountOut = CurrencyAmount.fromRawAmount(
      isWethToken0 ? totalToken0.currency : totalToken1.currency,
      quote.result[0].toString()
    );
    const totalWethAvailable = isWethToken0 ? totalToken0.add(amountOut) : totalToken1.add(amountOut);

    // now we need to generate the message that will be passed to the settler on the destination chain
    // note that this is different than the message that is passed to Migrator on the source chain
    let interimMessageForSettler: `0x${string}` = '0x';
    if (params.bridgeType === BridgeType.Across) {
      interimMessageForSettler = encodeSettlementParamsForSettler(
        encodeV3SettlementParams({
          recipient: params.owner,
          amount0Min: 1000n,
          amount1Min: 1000n,
          senderFeeBps: 0,
          senderFeeRecipient: '0x0000000000000000000000000000000000000000',
          ...params, // get the rest of the params from the request
        })
      )
    } else {
      throw new Error('Bridge type not supported');
    }

    // get a quote from Across
    const acrossQuote = await acrossClient({testnet: sourceChainConfig.testnet})
      .getQuote({
        route: {
          originChainId: sourceChainConfig.chainId,
          destinationChainId: destinationChainConfig.chainId,
          inputToken: isWethToken0 ? totalToken0.currency.address as `0x${string}` : totalToken1.currency.address as `0x${string}`,
          outputToken: destinationChainConfig.wethAddress,
        },
        inputAmount: totalWethAvailable.asFraction.toFixed(0),
        recipient: destinationChainConfig.AcrossV3Settler as `0x${string}`,
        crossChainMessage: interimMessageForSettler
      })
    
    return {
      acrossQuotes: [acrossQuote],
    }
  } else if (params.migrationMethod === MigrationMethod.DualToken) {
    // TODO: implement dual token migration
    throw new Error('Dual token migration not implemented');
  } else {
    throw new Error('Invalid migration method');
  }

}