#!/usr/bin/env tsx
import { ChainHopperClient } from '../src/client';
import { configurePublicClients } from '../src/utils/configurePublicClients';
import type { RequestV3toV4MigrationParams, RequestV3toV3MigrationParams, RequestV4toV3MigrationParams } from '../src/types/sdk';
import { Protocol, BridgeType, MigrationMethod } from '../src/utils/constants';
import type { InternalSettleMigrationParams, InternalSettleMigrationResult } from '../types/internal';

const rpcUrls = {
  1: Bun.env.MAINNET_RPC_URL!,
  130: Bun.env.UNICHAIN_RPC_URL!,
  8453: Bun.env.BASE_RPC_URL!
};

const blockNumbers: Record<number, bigint> = {
  1: 22328545n,
  130: 14624728n,
  8453: 29291900n
};

const logMigrationResult = (result: InternalSettleMigrationResult) => {
  console.log('amount0', result.destPosition.amount0.toFixed(6));
  console.log('amount1', result.destPosition.amount1.toFixed(6));
  console.log('tickLower', result.destPosition.tickLower);
  console.log('tickUpper', result.destPosition.tickUpper);
  console.log('slippage: ', result.slippageCalcs);
}

(async () => {
  const client = ChainHopperClient.create({ rpcUrls });

  // override publicClients to be block-scoped for deterministic tests
  configurePublicClients(client.chainConfigs, rpcUrls, blockNumbers);

  // v3 position for testing v3-> migrations
  const v3Owner = '0xbab7901210a28eef316744a713aed9036e2c5d21';
  const v3TokenId = 963499n;
  const v3Response = await client.getV3Position({
    chainId: 1,
    tokenId: v3TokenId,
    owner: v3Owner,
  });

  console.log('v3 pre-migration position.amount0:', v3Response.position.amount0.toFixed(6));
  console.log('v3 pre-migration position.amount1:', v3Response.position.amount1.toFixed(6));
  console.log('v3 pre-migration uncollectedFees.amount0:', v3Response.uncollectedFees.amount0.toFixed(6));
  console.log('v3 pre-migration uncollectedFees.amount1:', v3Response.uncollectedFees.amount1.toFixed(6));

  console.log('\n--------- single token v3 to v4 migration ---------:')

  const singleV3ToV4Params: RequestV3toV4MigrationParams = {
    sourceChainId: 1,
    destinationChainId: 130,
    tokenId: v3TokenId,
    owner: v3Owner,
    sourceProtocol: Protocol.UniswapV3,
    destinationProtocol: Protocol.UniswapV4,
    bridgeType: BridgeType.Across,
    migrationMethod: MigrationMethod.SingleToken,
    token0: "0x0000000000000000000000000000000000000000",
    token1: "0x078d782b760474a361dda0af3839290b0ef57ad6",
    tickLower: -1 * v3Response.position.tickUpper,
    tickUpper: -1 * v3Response.position.tickLower,
    fee: v3Response.position.pool.fee,
    tickSpacing: v3Response.position.pool.tickSpacing,
    hooks: '0x0000000000000000000000000000000000000000',
  };

  const singleV3ToV4Result = await client.requestMigration(singleV3ToV4Params);
  logMigrationResult(singleV3ToV4Result);

  console.log('\n--------- dual token v3 to v4 migration ---------:')
  const dualV3ToV4Params: RequestV3toV4MigrationParams = {
    ...singleV3ToV4Params,
    migrationMethod: MigrationMethod.DualToken,
  };

  const dualV3ToV4Result = await client.requestMigration(dualV3ToV4Params);
  logMigrationResult(dualV3ToV4Result);

  // console.log('\n--------- single token v3 to v3 migration ---------:')

  // const singleV3ToV3Params: RequestV3toV3MigrationParams = {
  //   sourceChainId: 1,
  //   destinationChainId: 130,
  //   tokenId: v3TokenId,
  //   owner: v3Owner,
  //   sourceProtocol: Protocol.UniswapV3,
  //   destinationProtocol: Protocol.UniswapV3,
  //   bridgeType: BridgeType.Across,
  //   migrationMethod: MigrationMethod.SingleToken,
  //   token0: "0x0000000000000000000000000000000000000000", // v3Response.position.pool.token0.address as `0x${string}`,
  //   token1: "0x078D782b760474a361dDA0AF3839290b0EF57AD6",
  //   tickLower: v3Response.position.tickLower,
  //   tickUpper: v3Response.position.tickUpper,
  //   fee: v3Response.position.pool.fee
  // };

  // const singleV3ToV3Result = await client.requestMigration(singleV3ToV4Params);
  // logMigrationResult(singleV3ToV3Result);

  // console.log('\n--------- dual token v3 to v3 migration ---------:')
  // const dualV3ToV3Params: RequestV3toV3MigrationParams = {
  //   ...singleV3ToV3Params,
  //   token0: "0x078D782b760474a361dDA0AF3839290b0EF57AD6",
  //   token1: "0x4200000000000000000000000000000000000006",
  //   migrationMethod: MigrationMethod.DualToken,
  // };

  // const dualV3ToV3Result = await client.requestMigration(dualV3ToV3Params);
  // logMigrationResult(dualV3ToV3Result);

  // // v4 position for testing v4-> migrations
  // const v4Owner = '0x29d8915a034d690ea4919fd9657cfdf6e6f679b1';
  // const v4TokenId = 64594n;
  // const v4Response = await client.getV4Position({
  //   chainId: 130,
  //   tokenId: v4TokenId,
  //   owner: v4Owner,
  // });

  // console.log('\nv4-> migrations -------------------------------------: ')
  // console.log('v4 pre-migration position.amount0:', v4Response.position.amount0.toFixed(6));
  // console.log('v4 pre-migration position.amount1:', v4Response.position.amount1.toFixed(6));
  // console.log('v4 pre-migration uncollectedFees.amount0:', v4Response.uncollectedFees.amount0.toFixed(6));
  // console.log('v4 pre-migration uncollectedFees.amount1:', v4Response.uncollectedFees.amount1.toFixed(6));

  // console.log('\n--------- single token v4 to v3 migration ---------:')

  // const singleV4ToV3Params: RequestV4toV3MigrationParams = {
  //   sourceChainId: 130,
  //   destinationChainId: 8453,
  //   tokenId: v4TokenId,
  //   owner: v4Owner,
  //   sourceProtocol: Protocol.UniswapV4,
  //   destinationProtocol: Protocol.UniswapV3,
  //   bridgeType: BridgeType.Across,
  //   migrationMethod: MigrationMethod.SingleToken,
  //   token0: "0x4200000000000000000000000000000000000006", // v4Response.position.pool.token0.address as `0x${string}`,
  //   token1: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  //   tickLower: v4Response.position.tickLower,
  //   tickUpper: v4Response.position.tickUpper,
  //   fee: v4Response.position.pool.fee
  // };

  // const singleV4ToV3Result = await client.requestMigration(singleV4ToV3Params);
  // logMigrationResult(singleV4ToV3Result);

})();
