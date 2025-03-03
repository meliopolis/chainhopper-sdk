import type { ChainConfig } from "../chains";
import { type IV3PositionWithUncollectedFees } from "./getV3Position";
import { BridgeType, MigrationMethod, Protocol } from "../utils/constants";
import type { RequestV3MigrationParams, RequestV3toV3MigrationParams } from "../types";
import { CurrencyAmount, Token } from "@uniswap/sdk-core";
import { acrossClient } from "../lib/acrossClient";
import { encodeAcrossMigrationParams, encodeSettlementParamsForSettler, encodeV3SettlementParams } from "./encode";
import { getV3Pool } from "./getV3Pool";
import { nearestUsableTick, Position } from "@uniswap/v3-sdk";
import type { Quote } from "@across-protocol/app-sdk";
import type { TokenAmount } from "../types/sdk";

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
      sourceV3Position: v3PositionWithUncollectedFees,
      sourceTokenId: params.tokenId,
      destChainId: destinationChainConfig.chainId,
      tokenAmounts: [
        {
          address: destinationChainConfig.wethAddress,
          amount: acrossQuote.deposit.outputAmount
        }
      ],
      acrossQuote: [acrossQuote],
    }
  } else if (params.migrationMethod === MigrationMethod.DualToken) {
    // TODO: implement dual token migration
    throw new Error('Dual token migration not implemented');
  } else {
    throw new Error('Invalid migration method');
  }

}


export async function settleV3Migration(
  sourceChainConfig: ChainConfig, 
  destinationChainConfig: ChainConfig, 
  v3PositionWithUncollectedFees: IV3PositionWithUncollectedFees, 
  tokenAmounts: TokenAmount[],
  acrossQuotes: Quote[],
  params: RequestV3MigrationParams
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
      sourceV3Position: v3PositionWithUncollectedFees,
      sourceTokenId: params.tokenId,
      destV3Position: maxPosition,
      destChainId: destinationChainConfig.chainId,
      migratorMessage,
      settlerMessage,
      quoteDetails: {
        inputAmount: acrossQuote.deposit.inputAmount,
        outputAmount: acrossQuote.deposit.outputAmount,
        fees: acrossQuote.fees,
          exclusivityDeadline: acrossQuote.deposit.exclusivityDeadline,
        },
      }
  } else if (acrossQuotes.length === 2){
    throw new Error('Dual token migration not implemented');
  } else {
    throw new Error('Invalid number of quotes');
  }
}

export async function migrateV3ToV3(
  sourceChainConfig: ChainConfig, 
  destinationChainConfig: ChainConfig, 
  v3PositionWithUncollectedFees: IV3PositionWithUncollectedFees, 
  params: RequestV3toV3MigrationParams
) {
  const { sourceChainId, destinationChainId, tokenId, destinationProtocol } = params;

  if (destinationProtocol !== Protocol.UniswapV3) {
    throw new Error('Invalid destination protocol');
  }

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
        token0: params.token0,
        token1: params.token1,
        feeTier: params.feeTier,
        tickLower: params.tickLower,
        tickUpper: params.tickUpper,
        amount0Min: 1n,
        amount1Min: 1n,
        senderFeeBps: 0,
        senderFeeRecipient: '0x0000000000000000000000000000000000000000'
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
      inputToken: isWethToken0 ? totalToken0.currency.address as `0x${string}` : totalToken1.currency.address as `0x${string}`,
      outputToken: destinationChainConfig.wethAddress,
      maxFees: acrossQuote.fees.totalRelayFee.total,
      quoteTimestamp: Number((await destinationChainConfig.publicClient?.getBlock())?.timestamp || 0),
      fillDeadlineOffset: 3000, // hardcoded for now; taken from spokePool contract
      exclusiveRelayer: acrossQuote.deposit.exclusiveRelayer,
      exclusivityDeadline: acrossQuote.deposit.exclusivityDeadline
    }]
  })
  return {
    sourceV3Position: v3PositionWithUncollectedFees,
    sourceTokenId: params.tokenId,
    destV3Position: maxPosition,
    destChainId: destinationChainConfig.chainId,
    migratorMessage,
    settlerMessage,
    quoteDetails: {
      inputAmount: BigInt(totalWethAvailable.asFraction.toFixed(0).toString()),
      outputAmount: BigInt(acrossQuote.deposit.outputAmount.toString()),
      fees: acrossQuote.fees,
      exclusivityDeadline: acrossQuote.deposit.exclusivityDeadline,
    },
  }
}
