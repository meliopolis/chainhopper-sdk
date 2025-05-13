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
  token0: zeroAddress, // native ETH on destination chain; can be any ERC20 address as well
  token1: chainConfigs[130].usdcAddress, // can be any ERC20 token address
  fee: 500, // set the fee for the pool
  tickSpacing: 10, // set the tick spacing for your pool
  hooks: zeroAddress, // set the address of the hooks for your pool

  // destination position info
  tickLower: -250000, // SDK will automatically calculate the nearest usable tick
  tickUpper: -150000, // SDK will automatically calculate the nearest usable tick
  }

const migrationResponse = await client.requestMigration(requestParams);

console.log(migrationResponse);
// this will look like the following
{
  // source chain params (returned for confirmation purposes)
  sourceProtocol: Protocol.UniswapV3,
  sourcePosition: Position, // from @uniswap/v3-sdk
  sourceTokenId: 1806423n,
  sourceChainId: 8453,
  owner: '0x4bD047CA72fa05F0B89ad08FE5Ba5ccdC07DFFBF',

  // destination chain, protocol and Position that could be created
  destProtocol: Protocol.UniswapV4,
  destPosition: Position, // from @uniswap/v4-sdk (note it's a Uniswap v4 position)
  destChainId: 130,

  // messages
  migratorMessage: '0x...', // message sent to the migrator on the source chain
  settlerMessage: '0x...', // useful to simulate settler receiving message from the bridge

  // slippage calcs that can be used to give messages to the user
  slippageCalcs: {
    swapAmountInMilliBps: 40_000_000, // amount of WETH to be swapped on destination chain
    mintAmount0Min: 84393483n, // min amount of token0 after minting on destination chain
    mintAmount1Min: 348933n, // min amount of token1 after minting on destination chain
    routeMinAmountOuts: [89939399n] // min amount that the bridge must output
  },

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
  }
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

## Advanced Options

### Single Token vs Dual Token paths

ChainHopper Protocol supports two different methods to migrate a position.

Single Token: converts the entire position into WETH (via a swap on source chain), migrates it and swaps back to the OtherToken on destination chain before minting.

Dual Token: moves both tokens over independently and reconstructs the position on destination chain. This is simpler (fewer steps within the smart contract) but limited as both tokens need to be available routes on the bridge. Typically WETH and USDC are primary routes, though our current bridge Across supports [a few others for specific chains](https://app.across.to/api/available-routes). As of now, one of the two tokens in this path must be either WETH or ETH.

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
  }
```

### Creating a new pool before migration

ChainHopper Protocol (the smart contracts) supports creating a pool if it doesn't exist already. We are working on adding this functionality to the SDK. If this is blocking you, please get in touch with us.

### Different bridges

Currently, we only support Across. We are considering adding Wormhole and Native Interop. If you have a request, please let us know.

### Supported chains

Currently, we support Ethereum, Optimism, Arbitrum, Base and Unichain. Please get in touch if you want us to support additional chains.

## Questions/Comments

You can open an issue on this repo or reach us at [chainhopper@melio.io](mailto:chainhopper@melio.io).
