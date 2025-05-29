# ChainHopper Protocol SDK

[ChainHopper Protocol](https://github.com/meliopolis/chainhopper-protocol) allows Uniswap v3 and v4 LP positions to migrate between supported chains with a single click.

Use this Typescript SDK to quickly and integrate with ChainHopper protocol with a few lines of code.

## Installation

```
bun install chainhopper-sdk viem
```

## Quick Start

### 1. Setup the ChainHopperClient

```typescript
import { ChainHopperClient } from 'chainhopper-sdk';

export const client = ChainHopperClient.create({
  rpcUrls: {
    1: Bun.env.MAINNET_RPC_URL,
    10: Bun.env.OPTIMISM_RPC_URL,
    130: Bun.env.UNICHAIN_RPC_URL,
    8453: Bun.env.BASE_RPC_URL,
    42161: Bun.env.ARBITRUM_RPC_URL,
  },
});
```

### 2. Retrieve migration data

Now, you can pass in a source LP position and parameters of a destination LP position and retrieve all the relevant data.

```typescript
import { RequestV3toV4MigrationParams, Protocol, chainConfigs } from "chainhopper-sdk";
import { zeroAddress } from 'viem';

const migrationParams: RequestV3toV4MigrationParams = {
  // source chain, protocol and LP position info
  sourceChainId: 8453, // Base, in this example
  sourceProtocol: Protocol.UniswapV3, // source protocol: UniswapV3 or UniswapV4
  tokenId: 1806423n, // change to the position you want to migrate

  // destination chain and protocol info
  destinationChainId: 130, // Unichain, in this example
  destinationProtocol: Protocol.UniswapV4, // can be v3 or v4

  // destination pool info
  token0: zeroAddress, // native ETH on destination chain; can be any ERC20;
  token1: chainConfigs[130].usdcAddress, // any ERC20; must be sorted token0 < token1
  fee: 500, // specify the fee for the pool
  tickSpacing: 10, // specify the tick spacing for the pool; only needed for v4
  hooks: zeroAddress, // specify the address of the hooks for the pool; only needed for v4

  // destination position info
  tickLower: -250000, // SDK will automatically calculate the nearest usable tick
  tickUpper: -150000, // SDK will automatically calculate the nearest usable tick
  }

const migrationResponse = await client.requestMigration(requestParams);

console.log(migrationResponse);
// this will look like the following
{
  // details of the position at above tokenId
  sourcePosition: {
    owner: '0x4bD047CA72fa05F0B89ad08FE5Ba5ccdC07DFFBF',
    tokenId: 1806423n,
    pool: { // v3 or v4 pool object
      protocol: Protocol.UniswapV3,
      chainId: 8453,
      token0: { // token0 info
        address: "0x4200000000000000000000000000000000000006"
        chainId: 8453
        decimals: 18
        name: "Wrapped Ether"
        symbol: "WETH"
      },
      token1: { // token1 info
        address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        chainId: 8453,
        decimals: 6,
        name: "USD Coin",
        symbol: "USDC"
      },
      fee: 3000,
      tickSpacing: 60,
      sqrtPriceX96: 4105828726027126556352508n,
      liquidity: 1082505696438362025n, // current tick's liquidity
      tick: -197364, // current tick
      poolAddress: '0x6c561B446416E1A00E8E93E221854d6eA4171372', // only for v3 Pool
    },
    tickLower: -200340,
    tickUpper: -194700,
    liquidity: 34702496678031n,
    amount0: 83490622982773580n, // token0 amount
    amount1: 248671239n, // token1 amount
    feeAmount0: 15657622399553202n, // uncollected fees for token0
    feeAmount1: 23282n, // uncollected fees for token1
  },
  // destination Position that will be created under current conditions on both chains
  destPosition: {
    pool: { // v3 or v4 pool
      protocol: Protocol.UniswapV4,
      chainId: 130,
      token0: zeroAddress,
      token1: '0x078D782b760474a361dDA0AF3839290b0EF57AD6',
      fee: 500,
      tickSpacing: 10,
      hooks: zeroAddress,
      sqrtPriceX96: 38...n, // current value from pool
      liquidity: 338183823922020n, // current tick's liquidity
      tick: 35, // current tick
      poolId: '0x...', // only for v4 pool
    },
    tickLower: -250000,
    tickUpper: -150000,
    liquidity: ..., // max possible given token amounts
    amount0: 5853820000n,
    amount1: 838202n,
    amount0Min: 84393483n, // min amount of token0 after minting on destination chain
    amount1Min: 38282n, // min amount of token1 after minting on destination chain
  },

  // Routes: each bridged route is listed; one route for singleToken and two for dualToken
  routes: [{
    inputToken: '0x4200000000000000000000000000000000000006', // WETH on source chain
    outputToken: '0x4200000000000000000000000000000000000006', // WETH on destination chain (even though final position uses native token)
    inputAmount: 8439903000303483n, // amount of WETH sent to the bridge
    outputAmount: 843209999393939n, // amount of WETH expected at the output
    minOutputAmount: 843509999393939n, // slippage check on the route
    maxFees: 383922n, // max fees allowed to be charged by Across, based on quote
    fillDeadlineOffset: 3000, // used by Across
    exclusivityDeadline: 9, // seconds that exclusivity is valid; used by Across
    exclusiveRelayer: '0x...', // If there is an exclusive relayer on Across
  }]

  // execution params. Use these to submit the migration
  executionParams: {
    address: '0x...', // NonFungiblePositionManager.sol (v3) or  PositionManager.sol (v4) on source chain
    abi: [...], // abi for `safeTransferFrom` from v3/v4 Position Manager
    functionName: 'safeTransferFrom', // this is how the position is transferred to migrator and liquidated
    args: [
      '0x...', // current owner of the LP position (the user)
      '0x...', // address of the migrator contract on source chain
      1806423n, // tokenId
      '0x...', // migratorMessage (this also encodes the `settlerMessage` and passes it directly through the bridge)
    ]
  },
}
```

### 3. Execute the migration

```typescript
import { createWalletClient, simulateContract, writeContract } from 'viem';
import { base } from 'viem/chains';
import { config } from './config.ts';
import { NFTSafeTransferFrom } from 'chainhopper-sdk';

export const walletClient = createWalletClient({
  chain: base,
  transport: custom(window.ethereum!),
});

const { request } = await walletClient.simulateContract({
  ...migrationResponse.executionParams,
  account: migrationResponse.owner,
});
// verify `request`
const result = await writeContract(config, request);
```

This will open up a wallet window to sign transaction and kickoff the migration.

## Advance Options

### Sender fees

ChainHopper protocol charges 10bps (0.1%) for any completed migration. In addition, an integrator (or an interface) can specify their own fees and the protocol takes a small cut of those fees and passes the rest to an address specified in the calldata. To add fees:

```typescript
const migrationParams: RequestV3toV4MigrationParams = {
  // ... previous params
  senderShareBps: 15,
  senderFeeRecipient: '0x...';
}
```

This will add an additional 15bps for fees that will be split between protocol and sender. Currently, the protocol takes 15% of the sender fees. So, in this scenario, user will pay 25bps (0.25%) total _for a completed migration_. If a migration fails, user pays nothing. Of that 25bps, protocol will receive 12.25bps (10bps protocol fee and 15% of sender's 15bps) and sender will take 12.75bps.

### Single Token vs Dual Token migrations

ChainHopper Protocol supports two different methods to migrate a position.

Single Token: converts the entire position into WETH (or USDC) (via a swap on source chain), migrates that asset to destination chain and swaps back to the OtherToken on destination chain before minting.

Dual Token: moves both tokens over independently and reconstructs the position on destination chain. This is simpler (fewer steps within the smart contract) but limited as both tokens need to be available as routes on the bridge. Typically WETH and USDC are primary routes, though our current bridge Across supports [a few others for specific chains](https://app.across.to/api/available-routes). As of now, one of the two tokens in this path must be either WETH or ETH.

By default, SDK returns Single Token route. To get a quote for Dual Token:

```typescript
const migrationParams: RequestV3toV4MigrationParams = {
  // source info
  sourceChainId: 8453,
  sourceProtocol: Protocol.UniswapV3,
  tokenId: 1806423n, // change to the position you want to migrate

  // destination info
  destinationChainId: 130,
  destinationProtocol: Protocol.UniswapV4, // can be v3 or v4

  // migration method (new)
  migrationMethod: MigrationMethod.DualToken,

  // ... rest of params
};
```

### Slippage Params

By default, the SDK uses 1% slippage, which it splits across source chain and destination chain. So, it allows up to 0.5% slippage on source chain and 0.5% on destination chain. You can specify a different amount by passing in `slippageInBps` param.

```typescript
const migrationParams: RequestV3toV4MigrationParams = {
  // .. previous params
  slippageInBps: 100, // 1% slippage
};
```

### Creating a new pool before migration

ChainHopper Protocol (the smart contracts) supports creating a pool if it doesn't exist already. We are working on adding this functionality to the SDK. If this is blocking you, please get in touch with us.

## FAQs

_1. What chains are supported?_

Currently, we support Ethereum, Optimism, Arbitrum, Base and Unichain. Please get in touch if you want us to support additional chains.

_2. Do you have plans to support additional bridges?_

Currently, we only support Across. We are considering adding Wormhole and Native Interop. If you have a request, please let us know.

_3. What types of pools or tokens are supported?_

Besides Fee-on-transfer and rebasing tokens, we support all tokens.

For pools, as long as there is a bridgeable asset in a pool, we can support it. Though, we caution users when using any pool with hooks, as those can lead to unpredictable scenarios.

_4. Is this protocol Audited?_

Yes. You can find the audit reports in protocol repository: [ChainHopper Protocol](https://github.com/meliopolis/chainhopper-protocol).

_5. How long does a migration typically take?_

Most migrations with reasonable slippage (~1%) finish within 10 seconds.

_6. How do fees work?_

You, as the interface, can specify a fee and a recipient address to share that fee with. The protocol takes a 0.1% fee and additionally takes a 15% cut of the interface fee. So, if you specified 0.15% as the interface fee, the user will pay 0.25% which will be split 0.1225% for protocol and 0.1275% for you.

_7. What happens if migration fails midway?_

If migration fails on the source chain, nothing happens. User still owns the LP token and can retry.

If migration fails on the destination chian, the bridged asset will be delivered to the user's wallet **on destination chain**. And we will not take any fees for a failed migration.

In extremely rare scenarios, it's possible that an Across relayer was unable to deliver the asset on destination chain. In those situations, the attempted bridged asset - ETH, WETH, USDC - will be returned to the user _on source chain_.

## Questions/Comments

You can open an issue on this repo or reach us at [chainhopper@melio.io](mailto:chainhopper@melio.io).
