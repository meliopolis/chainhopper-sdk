#!/usr/bin/env tsx
import { ChainHopperClient } from '../src/client';
import { configurePublicClients } from '../src/utils/configurePublicClients';
import type { RequestV3toV4MigrationParams, RequestV3toV3MigrationParams } from '../src/types/sdk';
import { Protocol, BridgeType, MigrationMethod } from '../src/utils/constants';

const rpcUrls = {
  1: Bun.env.MAINNET_RPC_URL!,
  130: Bun.env.UNICHAIN_RPC_URL!,
};
const blockNumbers: Record<number, bigint> = {
  1: 22328545n,
  130: 14624728n,
};

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
    token0: "0x0000000000000000000000000000000000000000", // v3Response.position.pool.token0.address as `0x${string}`,
    token1: "0x078d782b760474a361dda0af3839290b0ef57ad6",
    tickLower: v3Response.position.tickLower,
    tickUpper: v3Response.position.tickUpper,
    fee: v3Response.position.pool.fee,
    tickSpacing: v3Response.position.pool.tickSpacing,
    hooks: '0x0000000000000000000000000000000000000000',
  };

  const singleV3ToV4Result = await client.requestMigration(singleV3ToV4Params);

  console.log('\n--------- dual token v3 to v4 migration ---------:')
  const dualV3ToV4Params: RequestV3toV4MigrationParams = {
    ...singleV3ToV4Params,
    migrationMethod: MigrationMethod.DualToken,
  };

  const dualV3ToV4Result = await client.requestMigration(dualV3ToV4Params);

  console.log('\n--------- single token v3 to v3 migration ---------:')

  const singleV3ToV3Params: RequestV3toV3MigrationParams = {
    sourceChainId: 1,
    destinationChainId: 130,
    tokenId: v3TokenId,
    owner: v3Owner,
    sourceProtocol: Protocol.UniswapV3,
    destinationProtocol: Protocol.UniswapV3,
    bridgeType: BridgeType.Across,
    migrationMethod: MigrationMethod.SingleToken,
    token0: "0x0000000000000000000000000000000000000000", // v3Response.position.pool.token0.address as `0x${string}`,
    token1: "0x078d782b760474a361dda0af3839290b0ef57ad6",
    tickLower: v3Response.position.tickLower,
    tickUpper: v3Response.position.tickUpper,
    fee: v3Response.position.pool.fee
  };

  const singleV3ToV3Result = await client.requestMigration(singleV3ToV4Params);

  // TODO: you were here...this migration isn't working yet
  // maybe this pool doesn't even exist -- need to investigate
  console.log('\n--------- dual token v3 to v3 migration ---------:')
  const dualV3ToV3Params: RequestV3toV3MigrationParams = {
    ...singleV3ToV3Params,
    token0: "0x078d782b760474a361dda0af3839290b0ef57ad6",
    token1: "0x4200000000000000000000000000000000000006",
    migrationMethod: MigrationMethod.DualToken,
  };

  const dualV3ToV3Result = await client.requestMigration(dualV3ToV3Params);

})();
