import { ChainHopperClient } from './client';
import type { RequestV3toV4MigrationParams } from './types/sdk';
import { Protocol, BridgeType, MigrationMethod } from './utils/constants'
import { encodeFunctionData } from 'viem'

const owner = '0xbab7901210a28eef316744a713aed9036e2c5d21'
const tokenId = 963499n;

// to simulate locally:
// anvil --fork-url https://eth.llamarpc.com  --port 8545

// 1. Create client and get publicClient
const client = ChainHopperClient.create({
  rpcUrls: {
    1: "https://eth.llamarpc.com", //"http://127.0.0.1:8545",
    130: "https://mainnet.unichain.org"
  }
});
const publicClient = client.chainConfigs[1]?.publicClient!
const abi = client.chainConfigs[1].v3NftPositionManagerContract.abi

// await publicClient.request({
//   method: 'anvil_impersonateAccount',
//   params: [owner],
// })

// await publicClient.request({
//   method: 'anvil_setBalance',
//   params: [owner, '0xDE0B6B3A7640000'] // 1 ETH
// })

let v3Response = await client.getV3Position({
  chainId: 1,
  tokenId,
  owner,
})

console.log('v3Response position.amount0', v3Response.position.amount0.toFixed(6));
console.log('v3Response position.amount1', v3Response.position.amount1.toFixed(6));
console.log('v3Response position.amount0', v3Response.uncollectedFees.amount0.toFixed(6));
console.log('v3Response position.amount1', v3Response.uncollectedFees.amount1.toFixed(6));

// request single token, single chain v3 to v4 migration

const singleTokenRequestParams: RequestV3toV4MigrationParams = {
  sourceChainId: 1,
  destinationChainId: 130,
  tokenId: tokenId,
  owner: owner,
  sourceProtocol: Protocol.UniswapV3,
  destinationProtocol: Protocol.UniswapV4,
  bridgeType: BridgeType.Across,
  migrationMethod: MigrationMethod.SingleToken,
  token0: "0x0000000000000000000000000000000000000000", // v3Response.position.pool.token0.address as `0x${string}`,
  token1: "0x078d782b760474a361dda0af3839290b0ef57ad6",
  tickLower: v3Response.position.tickLower,
  tickUpper: v3Response.position.tickUpper,
  fee: v3Response.position.pool.fee, //500, matches destination
  tickSpacing: v3Response.position.pool.tickSpacing, // 10, matches destination
  hooks: '0x0000000000000000000000000000000000000000'
}

// // TODO: need to add token0 / token1 to required params or look it up from position
// // TODO: v4 destinations need to specify hooks or we get bridge type not supported exception
// // TODO: v4 destinations require tickLower, tickUpper, fee, tickSpacing which are not getting defined

 //console.log(
   await client.requestMigration(singleTokenRequestParams)
// );

// request same migration, dual token

const dualTokenRequestParams: RequestV3toV4MigrationParams = {
  sourceChainId: 1,
  destinationChainId: 130,
  tokenId: tokenId,
  owner: owner,
  sourceProtocol: Protocol.UniswapV3,
  destinationProtocol: Protocol.UniswapV4,
  bridgeType: BridgeType.Across,
  migrationMethod: MigrationMethod.DualToken,
  token0: "0x0000000000000000000000000000000000000000", // v3Response.position.pool.token0.address as `0x${string}`,
  token1: "0x078d782b760474a361dda0af3839290b0ef57ad6",
  tickLower: v3Response.position.tickLower,
  tickUpper: v3Response.position.tickUpper,
  fee: v3Response.position.pool.fee, //500, matches destination
  tickSpacing: v3Response.position.pool.tickSpacing, // 10, matches destination
  hooks: '0x0000000000000000000000000000000000000000'
}

// console.log(
  await client.requestMigration(dualTokenRequestParams)
// );
