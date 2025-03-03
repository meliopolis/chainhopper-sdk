import type { ChainConfig } from "../chains";
import type { RequestV3MigrationParams, RequestV3toV3MigrationParams, RequestV4toV3MigrationParams } from "../types";
import { CurrencyAmount } from "@uniswap/sdk-core";
import { encodeAcrossMigrationParams } from "./encode";
import { getV3Pool } from "./getV3Pool";
import { nearestUsableTick, Position } from "@uniswap/v3-sdk";
import type { Quote } from "@across-protocol/app-sdk";


export async function settleUniswapV3Migration(
  destinationChainConfig: ChainConfig, 
  acrossQuotes: Quote[],
  params: RequestV3toV3MigrationParams | RequestV4toV3MigrationParams
) {

  if (acrossQuotes.length === 0){
    throw new Error('No bridged token found');
  } else if (acrossQuotes.length === 1){
  
    const acrossQuote = acrossQuotes[0];
    // estimate max otherToken available if all baseToken was traded away
    const quoteOnDestChain = await destinationChainConfig.publicClient?.simulateContract({
      ...destinationChainConfig.quoterV2Contract, 
      functionName: 'quoteExactInputSingle',
      args: [{
        tokenIn: destinationChainConfig.wethAddress,
        tokenOut: params.token0 === destinationChainConfig.wethAddress ? params.token1 : params.token0,
        fee: params.feeTier,
        amountIn: acrossQuote.deposit.outputAmount.toString(),
        sqrtPriceLimitX96: 0
      }],
    }) as {
      result: bigint[]
    };

    // now we need fetch the pool on the destination chain
    const pool = await getV3Pool(destinationChainConfig, params.token0, params.token1, params.feeTier);

    const baseTokenAvailableOnDestChain = CurrencyAmount.fromRawAmount(
      params.token0 === destinationChainConfig.wethAddress ? pool.token0 : pool.token1,
      acrossQuote.deposit.outputAmount.toString()
    );
    const maxOtherTokenAvailable = CurrencyAmount.fromRawAmount(
      params.token0 === destinationChainConfig.wethAddress ? pool.token1 : pool.token0,
      quoteOnDestChain.result[0].toString()
    );

    const [amount0, amount1] = params.token0 === destinationChainConfig.wethAddress ? 
      [baseTokenAvailableOnDestChain.asFraction.toFixed(0).toString(), maxOtherTokenAvailable.asFraction.toFixed(0).toString()] : 
      [maxOtherTokenAvailable.asFraction.toFixed(0).toString(), baseTokenAvailableOnDestChain.asFraction.toFixed(0).toString()];

    // estimate max position possible given the ticks and both tokens maxed out
    let maxPosition = Position.fromAmounts({
      pool: pool,
      tickLower: nearestUsableTick(params.tickLower, pool.tickSpacing),
      tickUpper: nearestUsableTick(params.tickUpper, pool.tickSpacing),
      amount0: amount0,
      amount1: amount1,
      useFullPrecision: true,
    });


    // now we need to proportionally reduce the position to fit within the max tokens available on the destination chain
    // if neither amount is 0, then we need to reduce both proportionally
    if (!maxPosition.amount0.equalTo(0) && !maxPosition.amount1.equalTo(0)) {
      const maxPositionValueInBaseToken = params.token0 === destinationChainConfig.wethAddress ? 
        maxPosition.amount0.add(maxPosition.pool.token1Price.quote(maxPosition.amount1)) : 
        maxPosition.amount1.add(maxPosition.pool.token0Price.quote(maxPosition.amount0));
      const reductionFactor = baseTokenAvailableOnDestChain.asFraction.divide(maxPositionValueInBaseToken.asFraction);

      maxPosition = Position.fromAmounts({
        pool: pool,
        tickLower: nearestUsableTick(params.tickLower, pool.tickSpacing),
        tickUpper: nearestUsableTick(params.tickUpper, pool.tickSpacing),
        amount0: maxPosition.amount0.asFraction.multiply(reductionFactor).toFixed(0),
        amount1: maxPosition.amount1.asFraction.multiply(reductionFactor).toFixed(0),
        useFullPrecision: true,
      });
    }


    // generate the final messages
    const { migratorMessage, settlerMessage } = encodeAcrossMigrationParams({
      baseParams: {
        destinationChainId: destinationChainConfig.chainId,
        recipientSettler: destinationChainConfig.AcrossV3Settler as `0x${string}`,
        settlementParams: {
          recipient: params.owner,
          token0: params.token0,
          token1: params.token1,
          feeTier: params.feeTier,
          tickLower: params.tickLower,
          tickUpper: params.tickUpper,
          amount0Min: BigInt(maxPosition.amount0.asFraction.toFixed(0)),
          amount1Min: BigInt(maxPosition.amount1.asFraction.toFixed(0)),
          senderFeeBps: params.senderFeeBps || 0,
          senderFeeRecipient: params.senderFeeRecipient || '0x0000000000000000000000000000000000000000'
        }
      },
      acrossRoutes: [{
        inputToken: acrossQuote.deposit.inputToken,
        outputToken: acrossQuote.deposit.outputToken,
        maxFees: acrossQuote.fees.totalRelayFee.total,
        quoteTimestamp: Number((await destinationChainConfig.publicClient?.getBlock())?.timestamp || 0),
        fillDeadlineOffset: 3000, // hardcoded for now; taken from spokePool contract
        exclusiveRelayer: acrossQuote.deposit.exclusiveRelayer,
        exclusivityDeadline: acrossQuote.deposit.exclusivityDeadline
      }]
    })
    return {
      destV3Position: maxPosition,
      migratorMessage,
      settlerMessage,
    }
  } else if (acrossQuotes.length === 2){
    throw new Error('Dual token migration not implemented');
  } else {
    throw new Error('Invalid number of quotes');
  }
}