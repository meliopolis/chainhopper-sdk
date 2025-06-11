# ChainHopper Protocol SDK

[ChainHopper Protocol](https://github.com/meliopolis/chainhopper-protocol) allows Uniswap v3 and v4 LP positions to migrate between supported chains with a single click.

Supports:

- One-click migration from any v3/v4 pool to any v3/v4 pool
- Smart bridging: Single or Dual Token migrations
- Native token support for v4
- Initialize new pools through the migration, if needed
- Live on: Mainnet, Unichain, Base, Arbitrum, Optimism

We are grateful to [Uniswap Foundation](https://www.uniswapfoundation.org/) for funding and support!

## Why use ChainHopper?

To move an LP position to another chain, it takes 4-5 manual steps:

1. Remove liquidity & collect fees
2. Swap/bridge "other" token
3. Bridge WETH [Wait for confirmations...]
4. Swap back, if needed
5. Mint new position

Plus: you need gas tokens on destination chain 😫.

With ChainHopper, you can do all this with one transaction.

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

### 2. Retrieve Migration Data

To initiate a migration, you must provide the SDK with a single source LP position (`sourcePosition`) to be migrated along with parameters for at least one migration. Each migration requested requires a destination (`destination`) specifying the desired migration output parameters, and a path specification (either `pathFilter` or `exactPath`) specifying information about how the migration should be executed. The SDK then returns all the relevant data for submitting a migration transaction based on the parameters provided.

If the parameters provided allow for multiple destinations and paths, the various migration options will be returned in `migrations` in descending order of the estimated destination position value. If a migration requested is not available it will be returned in `unavailableMigrations` on the response along with the reasons why it is not available. If a single migration with an `ExactPath` is requested and that combination of migration and path are not available, it will throw an exception.

You can use both `requestMigration` with `PathFilter` to look for all migration requests matching the `pathFilter` or `requestExactMigration` for `ExactPath` requests where all of the paths are completely specified. In other words, when `exactPath` is used only the exact paths will be considered. If a `pathFilter` is used, specifiying an optional value will constrain the options to use that value. If an optional parameter is not specified in a `PathFilter`, all options for that parameter will be searched with the exception of `slippageInBps` which, if omitted, will default to 100 basis points or 1%.

In addition to `requestMigration` and `requestExactMigration`, corresponding functions `requestMigrations` and `requestExactMigrations` are available for requesting multiple combinations of `destination` and `path` (`migrations`) at once.

```typescript
export type ExactPath = {
  bridgeType: BridgeType;
  migrationMethod: MigrationMethod;
  slippageInBps: number;
};

export type PathFilter = {
  bridgeType?: BridgeType; // searches all available bridges unless specified
  migrationMethod?: MigrationMethod; // searches all available methods unless specified
  slippageInBps?: number; // defaults to 100bps/1% if not specifed
};
```

```typescript
import {
  RequestMigrationParams, // requires a PathFilter for a destination
  RequestExactMigrationParams, // requires an ExactPath for a destination
  RequestMigrationsParams, // requires multiple destination / pathFilter combinations
  RequestExactMigrationsParams, // requires multiple destination / exactPath combinations
  Protocol,
  chainConfigs,
} from 'chainhopper-sdk';
import { zeroAddress } from 'viem';

// For a open-ended migration request using pathFilter:

const migrationParams: RequestMigrationParams = {
  sourcePosition: {
    chainId: 8453, // Base, in this example
    protocol: Protocol.UniswapV3, // source protocol: UniswapV3 or UniswapV4
    tokenId: 1806423n, // change to the position you want to migrate
  },
  destination: {
    chainId: 130, // Unichain, in this example
    token0: zeroAddress, // native ETH on destination chain; can be any ERC20
    token1: chainConfigs[130].usdcAddress, // any ERC20; must be sorted token0 < token1
    fee: 500, // specify the fee for the pool
    tickSpacing: 10, // tick spacing for the pool; only needed for v4
    hooks: zeroAddress, // the hooks contract for the pool; only needed for v4
    tickLower: -250000, // SDK will automatically calculate the nearest usable tick
    tickUpper: -150000, // SDK will automatically calculate the nearest usable tick
  },
  pathFilter: { bridgeType: BridgeType.Across }, // search all options using Across
};

const migrationResponse = await client.requestMigration(migrationParams);

// For an exact migration, where you want to specify the exact path precisely

const exactMigrationParams: RequestExactMigrationParams = {
  sourcePosition: {
    chainId: 8453,
    protocol: Protocol.UniswapV3,
    tokenId: 1806423n,
  },
  destination: {
    chainId: 130,
    token0: zeroAddress,
    token1: chainConfigs[130].usdcAddress,
    fee: 500,
    tickSpacing: 10,
    hooks: zeroAddress,
    tickLower: -250000,
    tickUpper: -150000,
  },
  exactPath: {
    bridgeType: BridgeType.Across, // specify the bridge type
    migrationMethod: MigrationMethod.SingleToken, // or DualToken
    slippageInBps: 50, // specify slippage in bps
  },
};

const exactMigrationResponse = await client.requestExactMigration(exactMigrationParams);

// For `requestExactMigrations` use `migrations` with `exactPath` to request
// multiple destination/path combinations:

const exactMigrationsParams: RequestExactMigrationsParams = {
  sourcePosition: {
    chainId: 8453,
    protocol: Protocol.UniswapV3,
    tokenId: 1806423n,
  },
  migrations: [
    {
      destination: {
        chainId: 130,
        protocol: Protocol.UniswapV4,
        token0: zeroAddress,
        token1: chainConfigs[130].usdcAddress,
        fee: 500,
        tickSpacing: 10,
        hooks: zeroAddress,
        tickLower: -250000,
        tickUpper: -150000,
      },
      exactPath: {
        bridgeType: BridgeType.Across,
        migrationMethod: MigrationMethod.SingleToken,
        slippageInBps: 100,
      },
    },
    {
      destination: {
        chainId: 130,
        protocol: Protocol.UniswapV4,
        token0: zeroAddress,
        token1: chainConfigs[130].usdcAddress,
        fee: 100,
        tickSpacing: 1,
        hooks: zeroAddress,
        tickLower: -250000,
        tickUpper: -150000,
      },
      exactPath: {
        bridgeType: BridgeType.Across,
        migrationMethod: MigrationMethod.SingleToken,
        slippageInBps: 100,
      },
    },
  ],
};

const exactMigrationsResponse =
  await client.requestExactMigrations(exactMigrationsParams);

// For `requestMigrations` use `migrations` with `pathFilter` to request
// multiple destination/path combinations:

const migrationParams: RequestMigrationsParams = {
  sourcePosition: {
    chainId: 8453,
    protocol: Protocol.UniswapV3,
    tokenId: 1806423n,
  },
  migrations: [
    {
      destination: {
        chainId: 130,
        protocol: Protocol.UniswapV4,
        token0: zeroAddress,
        token1: chainConfigs[130].usdcAddress,
        fee: 500,
        tickSpacing: 10,
        hooks: zeroAddress,
        tickLower: -250000,
        tickUpper: -150000,
      },
      pathFilter: {
        slippageInBps: 100,
      },
    },
    {
      destination: {
        chainId: 130,
        protocol: Protocol.UniswapV4,
        token0: zeroAddress,
        token1: chainConfigs[130].usdcAddress,
        fee: 100,
        tickSpacing: 1,
        hooks: zeroAddress,
        tickLower: -250000,
        tickUpper: -150000,
      },
      pathFilter: {
        slippageInBps: 100,
      },
    },
  ],
};

const exactMigrationsResponse = 
  await client.requestExactMigrations(exactMigrationsParams);
```

### 3. Execute the Migration

You can execute the migration by using the data returned from either the general or exact migration requests:

```typescript
import { createWalletClient, simulateContract, writeContract } from 'viem';
import { base } from 'viem/chains';
import { config } from './config';
import { NFTSafeTransferFrom } from 'chainhopper-sdk';

export const walletClient = createWalletClient({
  chain: base,
  transport: custom(window.ethereum!),
});

// Select a migration from the migrationResponse:
const migration = migrationResponse.migrations[0];
// migrations are sorted by highest to lowest expected value of the destination

// If needed, inspect unavailableMigrations to show migrations matching pathFilter
// but not currently available with the reasons why they are not available:
console.log(migrationResponse.unavailableMigrations);

const { request } = await walletClient.simulateContract({
  ...migration.executionParams,
  account: migrationResponse.sourcePosition.owner,
});

// execute the request
const result = await writeContract(config, request);

// For exact migration, only one migration is available:

const { request: exactRequest } = await walletClient.simulateContract({
  ...exactMigrationResponse.migration.executionParams,
  account: exactMigrationResponse.sourcePosition.owner,
});

// execute the exact request
const exactResult = await writeContract(config, exactRequest);

// Select a migration from the migrationsResponse:
const migration = migrationsResponse.migrations[0][0];
// for a migration request with multiple destinations, outputs are grouped
// per destination (and sorted by value per requested destination)

const { request: selectedMigration } = await walletClient.simulateContract({
  ...migration.executionParams,
  account: migrationsResponse.sourcePosition.owner,
});

// execute the selected migration
const exactResult = await writeContract(config, selectedMigration);
```

Calling `writeContract` open up a wallet window for signing the transaction and initiating the migration process.

## Advanced Options

### Sender Fees

ChainHopper protocol charges a 10bps (0.1%) fee for any completed migration. Additionally, integrators can specify their own fees, which the protocol will split with a percentage going to the specified recipient.

```typescript
const migrationParams: RequestMigrationParams = {
  // ... previous params
  senderShareBps: 15,
  senderFeeRecipient: '0x...', // address for fee recipient
};
```

### Migration Methods: Single Token vs Dual Token

ChainHopper Protocol supports two migration methods:

- **Single Token**: Converts the entire position to WETH (or USDC), migrates it, and then swaps back to the other token at the destination.
- **Dual Token**: Moves both tokens independently, reconstructing the position at the destination.

For example, to request a Dual Token route use `pathFilter` or `exactPath` to speciy it:

```typescript
const migrationParams: RequestMigrationParams = {
  sourcePosition: {
    // ... source position info
  },
  destination: {
    // ... destination info
  },
  pathFilter: {
    migrationMethod: MigrationMethod.DualToken, // specify DualToken
  },
  // ... rest of params
};
```

### Slippage Parameters

By default, the SDK allows for 1% slippage, divided evenly across the source and destination chains. You can adjust this by specifying the `slippageInBps` parameter:

```typescript
const migrationParams: RequestMigrationParams = {
  // ... previous params
  path: {
    // ... other params
    slippageInBps: 100, // allows for up to 1% slippage
  },
};
```

### Creating a New Pool

ChainHopper Protocol (the smart contracts) supports creating a pool if it doesn't exist already. If you want to do this, you can specify a `sqrtPriceX96` to initialize the new pool and a new pool will be initialized with this price to support the migration:

```typescript
const migrationParams: RequestMigrationParams = {
  sourcePosition: {
    // ... source position info
  },
  destination: {
    // ... other destination info
    // specifying sqrtPriceX96 will initialize a new pool at this price:
    sqrtPriceX96: 736087614829673861315061733n,
  },
  pathFilter: {
    // ... path filter
  },
  // ... rest of params
};
```

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
