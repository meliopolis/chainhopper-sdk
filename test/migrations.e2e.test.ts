import { test, describe, expect, beforeAll } from 'bun:test';
import { ChainHopperClient } from '../src/client';
import { configurePublicClients } from '../src/utils/configurePublicClients';
import { Protocol, BridgeType, MigrationMethod, NATIVE_ETH_ADDRESS } from '../src/utils/constants';
import type {
  RequestV3toV4MigrationParams,
  RequestV3toV3MigrationParams,
  RequestV4toV3MigrationParams,
  RequestV4toV4MigrationParams,
  RequestMigrationResponse,
  RequestMigrationParams,
} from '../src/types/sdk';
import { Pool as V4Pool } from '@uniswap/v4-sdk';
import { IV3PositionWithUncollectedFees, IV4PositionWithUncollectedFees } from '../src/actions';

let client: ReturnType<typeof ChainHopperClient.create>;

beforeAll(() => {
  const rpcUrls = {
    1: Bun.env.MAINNET_RPC_URL!,
    10: Bun.env.OPTIMISM_RPC_URL!,
    130: Bun.env.UNICHAIN_RPC_URL!,
    8453: Bun.env.BASE_RPC_URL!,
    42161: Bun.env.ARBITRUM_RPC_URL!,
  };

  // approx 17:12:38 UTC on Apr 28, 2025
  const blockNumbers = {
    1: 22369267n,
    10: 135130791n,
    130: 15115599n,
    8453: 29537305n,
    42161: 331163184n,
  };

  // get client and override block numbers for read calls
  client = ChainHopperClient.create({ rpcUrls });
  configurePublicClients(client.chainConfigs, rpcUrls, blockNumbers);
});

const validateMigrationResponse = (params: RequestMigrationParams, result: RequestMigrationResponse): void => {
  // check correct output chain
  expect(result.destChainId).toBe(params.destinationChainId);

  // check correct output protocol
  expect(result.destProtocol).toBe(params.destinationProtocol);

  const position = result.destPosition;
  if (params.token0 == NATIVE_ETH_ADDRESS) {
    expect(position.pool.token0.isNative).toBe(true);
  } else {
    expect(position.pool.token0.wrapped.address).toBe(params.token0);
  }
  expect(position.pool.token1.wrapped.address).toBe(params.token1);

  // check correct output ticks
  expect(position.tickLower).toBe(params.tickLower);
  expect(position.tickUpper).toBe(params.tickUpper);

  // check correct output pool
  const pool: V4Pool = result.destPosition.pool as V4Pool;
  expect(pool.fee).toBe(params.fee);
  if ('hooks' in params) expect(pool.hooks).toBe(params.hooks);
  if ('tickSpacing' in params) expect(pool.tickSpacing).toBe(params.tickSpacing);

  const amount0 = BigInt(result.destPosition.amount0.quotient.toString());
  const amount1 = BigInt(result.destPosition.amount1.quotient.toString());

  // check correct output amounts within slippage
  expect(amount0).toBeGreaterThanOrEqual(result.slippageCalcs.mintAmount0Min);
  expect(amount1).toBeGreaterThanOrEqual(result.slippageCalcs.mintAmount1Min);

  // check execution params
  const executionParams = result.executionParams;
  expect(executionParams.functionName).toBe('safeTransferFrom');
  expect(executionParams.args[0]).toBe(params.owner);
  expect(executionParams.args[1]).toBeDefined();
  expect(executionParams.args[2]).toBe(params.tokenId);
  expect(executionParams.args[3]).toBe(result.migratorMessage);
  if (params.sourceProtocol === Protocol.UniswapV3) {
    expect(executionParams.address).toBe(client.chainConfigs[params.sourceChainId].v3NftPositionManagerContract.address);
    expect(executionParams.args[1]).toBe(client.chainConfigs[params.sourceChainId].UniswapV3AcrossMigrator as `0x${string}`);
  } else {
    expect(executionParams.address).toBe(client.chainConfigs[params.sourceChainId].v4PositionManagerContract.address);
    expect(executionParams.args[1]).toBe(client.chainConfigs[params.sourceChainId].UniswapV4AcrossMigrator as `0x${string}`);
  }
};

describe('invalid migrations', () => {
  test('reject single token v3 migration with invalid bridge type', async () => {
    const params: RequestV3toV4MigrationParams = {
      sourceChainId: 8453,
      destinationChainId: 130,
      tokenId: 104758n,
      owner: '0x5a395ae92f10f082380a6254e5aa904cf60b5be2',
      sourceProtocol: Protocol.UniswapV3,
      destinationProtocol: Protocol.UniswapV4,
      bridgeType: 'nobridge' as BridgeType,
      migrationMethod: MigrationMethod.SingleToken,
      token0: NATIVE_ETH_ADDRESS,
      token1: '0x532f27101965dd16442E59d40670FaF5eBB142E4',
      tickLower: 62200,
      tickUpper: 103800,
      fee: 10000,
      tickSpacing: 200,
      hooks: '0x0000000000000000000000000000000000000000',
    };
    try {
      await client.requestMigration(params);
    } catch (e) {
      expect(e.message.includes('Bridge type not supported'));
    }
  });

  test('reject dual token v3 migration with invalid bridge type', async () => {
    const params: RequestV3toV4MigrationParams = {
      sourceChainId: 8453,
      destinationChainId: 130,
      tokenId: 104758n,
      owner: '0x5a395ae92f10f082380a6254e5aa904cf60b5be2',
      sourceProtocol: Protocol.UniswapV3,
      destinationProtocol: Protocol.UniswapV4,
      bridgeType: 'nobridge' as BridgeType,
      migrationMethod: MigrationMethod.DualToken,
      token0: NATIVE_ETH_ADDRESS,
      token1: '0x532f27101965dd16442E59d40670FaF5eBB142E4',
      tickLower: 62200,
      tickUpper: 103800,
      fee: 10000,
      tickSpacing: 200,
      hooks: '0x0000000000000000000000000000000000000000',
    };
    try {
      await client.requestMigration(params);
    } catch (e) {
      expect(e.message.includes('Bridge type not supported'));
    }
  });

  test('reject single token v4 migration with invalid bridge type', async () => {
    const params: RequestV4toV4MigrationParams = {
      sourceChainId: 8453,
      destinationChainId: 130,
      tokenId: 104758n,
      owner: '0x5a395ae92f10f082380a6254e5aa904cf60b5be2',
      sourceProtocol: Protocol.UniswapV4,
      destinationProtocol: Protocol.UniswapV4,
      bridgeType: 'nobridge' as BridgeType,
      migrationMethod: MigrationMethod.SingleToken,
      token0: NATIVE_ETH_ADDRESS,
      token1: '0x532f27101965dd16442E59d40670FaF5eBB142E4',
      tickLower: 62200,
      tickUpper: 103800,
      fee: 10000,
      tickSpacing: 200,
      hooks: '0x0000000000000000000000000000000000000000',
    };
    try {
      await client.requestMigration(params);
    } catch (e) {
      expect(e.message.includes('Bridge type not supported'));
    }
  });

  test('reject dual token v4 migration with invalid bridge type', async () => {
    const params: RequestV4toV4MigrationParams = {
      sourceChainId: 8453,
      destinationChainId: 130,
      tokenId: 104758n,
      owner: '0x5a395ae92f10f082380a6254e5aa904cf60b5be2',
      sourceProtocol: Protocol.UniswapV4,
      destinationProtocol: Protocol.UniswapV4,
      bridgeType: 'nobridge' as BridgeType,
      migrationMethod: MigrationMethod.DualToken,
      token0: NATIVE_ETH_ADDRESS,
      token1: '0x532f27101965dd16442E59d40670FaF5eBB142E4',
      tickLower: 62200,
      tickUpper: 103800,
      fee: 10000,
      tickSpacing: 200,
      hooks: '0x0000000000000000000000000000000000000000',
    };
    try {
      await client.requestMigration(params);
    } catch (e) {
      expect(e.message.includes('Bridge type not supported'));
    }
  });

  test('reject migration that are too large for across', async () => {
    const params: RequestV3toV4MigrationParams = {
      sourceChainId: 8453,
      destinationChainId: 130,
      tokenId: 104758n,
      owner: '0x5a395ae92f10f082380a6254e5aa904cf60b5be2',
      sourceProtocol: Protocol.UniswapV3,
      destinationProtocol: Protocol.UniswapV4,
      bridgeType: BridgeType.Across,
      migrationMethod: MigrationMethod.SingleToken,
      token0: NATIVE_ETH_ADDRESS,
      token1: '0x532f27101965dd16442E59d40670FaF5eBB142E4',
      tickLower: 62200,
      tickUpper: 103800,
      fee: 10000,
      tickSpacing: 200,
      hooks: '0x0000000000000000000000000000000000000000',
    };
    try {
      await client.requestMigration(params);
    } catch (e) {
      expect(e.message.includes("doesn't have enough funds to support this deposit") || e.message.includes('Amount exceeds max. deposit limit')).toBe(true);
    }
  });

  test("reject migration where a token can't be found on the destination chain", async () => {
    const params: RequestV3toV4MigrationParams = {
      sourceChainId: 8453,
      destinationChainId: 130,
      tokenId: 1638928n,
      owner: '0x8ba7cf01f651daeb71031b43a2bf380dfe0a81bc',
      sourceProtocol: Protocol.UniswapV3,
      destinationProtocol: Protocol.UniswapV4,
      bridgeType: BridgeType.Across,
      migrationMethod: MigrationMethod.SingleToken,
      token0: NATIVE_ETH_ADDRESS,
      token1: '0x532f27101965dd16442E59d40670FaF5eBB142E4', // this is the base address for BRETT bc it doesn't exist
      tickLower: 62200,
      tickUpper: 103800,
      fee: 10000,
      tickSpacing: 200,
      hooks: '0x0000000000000000000000000000000000000000',
    };
    try {
      await client.requestMigration(params);
    } catch (e) {
      expect(e.message).toContain('Failed to get token');
    }
  });

  test("reject migration where a token can't be bridged", async () => {
    const params: RequestV3toV4MigrationParams = {
      sourceChainId: 8453,
      destinationChainId: 130,
      tokenId: 1638928n,
      owner: '0x8ba7cf01f651daeb71031b43a2bf380dfe0a81bc',
      sourceProtocol: Protocol.UniswapV3,
      destinationProtocol: Protocol.UniswapV4,
      bridgeType: BridgeType.Across,
      migrationMethod: MigrationMethod.SingleToken,
      token0: NATIVE_ETH_ADDRESS,
      token1: '0x532f27101965dd16442E59d40670FaF5eBB142E4', // this is the base address for BRETT bc it doesn't exist
      tickLower: 62200,
      tickUpper: 103800,
      fee: 10000,
      tickSpacing: 200,
      hooks: '0x0000000000000000000000000000000000000000',
    };
    try {
      params.migrationMethod = MigrationMethod.DualToken;
      await client.requestMigration(params);
    } catch (e) {
      expect(e.message).toContain('Unsupported token on given origin chain');
    }
  });

  test('reject migration with an invalid token order', async () => {
    const params: RequestV3toV4MigrationParams = {
      sourceChainId: 1,
      destinationChainId: 130,
      tokenId: 963499n,
      owner: '0xbab7901210a28eef316744a713aed9036e2c5d21',
      sourceProtocol: Protocol.UniswapV3,
      destinationProtocol: Protocol.UniswapV4,
      bridgeType: BridgeType.Across,
      migrationMethod: MigrationMethod.SingleToken,
      token0: '0x078D782b760474a361dDA0AF3839290b0EF57AD6',
      token1: NATIVE_ETH_ADDRESS,
      tickLower: -203450,
      tickUpper: -193130,
      fee: 500,
      tickSpacing: 10,
      hooks: '0x0000000000000000000000000000000000000000',
    };
    try {
      await client.requestMigration(params);
    } catch (e) {
      expect(e.message).toContain('token0 and token1 must be distinct addresses in alphabetical order');
    }
  });

  test('reject migration with two of the same token', async () => {
    const params: RequestV3toV4MigrationParams = {
      sourceChainId: 1,
      destinationChainId: 130,
      tokenId: 963499n,
      owner: '0xbab7901210a28eef316744a713aed9036e2c5d21',
      sourceProtocol: Protocol.UniswapV3,
      destinationProtocol: Protocol.UniswapV4,
      bridgeType: BridgeType.Across,
      migrationMethod: MigrationMethod.SingleToken,
      token0: '0x078D782b760474a361dDA0AF3839290b0EF57AD6',
      token1: '0x078D782b760474a361dDA0AF3839290b0EF57AD6',
      tickLower: -203450,
      tickUpper: -193130,
      fee: 500,
      tickSpacing: 10,
      hooks: '0x0000000000000000000000000000000000000000',
    };
    try {
      await client.requestMigration(params);
    } catch (e) {
      expect(e.message).toContain('token0 and token1 must be distinct addresses in alphabetical order');
    }
  });

  test('reject migration to v3 requesting native token', async () => {
    try {
      const params: RequestV4toV3MigrationParams = {
        sourceChainId: 130,
        destinationChainId: 8453,
        tokenId: 64594n,
        owner: '0x29d8915a034d690ea4919fd9657cfdf6e6f679b1',
        sourceProtocol: Protocol.UniswapV4,
        destinationProtocol: Protocol.UniswapV3,
        bridgeType: BridgeType.Across,
        migrationMethod: MigrationMethod.SingleToken,
        token0: '0x0000000000000000000000000000000000000000',
        token1: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        tickLower: -202230,
        tickUpper: -199380,
        fee: 500,
      };
      await client.requestMigration(params);
    } catch (e) {
      expect(e.message).toContain('Native tokens not supported on Uniswap v3');
    }
  });

  test('reject migration from v3 where neither token is weth', async () => {
    try {
      const params: RequestV3toV4MigrationParams = {
        sourceChainId: 1,
        destinationChainId: 8453,
        tokenId: 949124n,
        owner: '0x6dd98c8488dc6b37a3afd4a0a26f803c04c6c043',
        sourceProtocol: Protocol.UniswapV3,
        destinationProtocol: Protocol.UniswapV4,
        bridgeType: BridgeType.Across,
        migrationMethod: MigrationMethod.DualToken,
        token0: '0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34',
        token1: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        tickLower: -276352,
        tickUpper: -276299,
        fee: 100,
        tickSpacing: 1,
        hooks: '0x0000000000000000000000000000000000000000',
      };
      await client.requestMigration(params);
    } catch (e) {
      expect(e.message).toContain('WETH not found in position');
    }
  });

  test('reject migration from v4 where neither token is weth or eth', async () => {
    try {
      const params: RequestV4toV4MigrationParams = {
        sourceChainId: 8453,
        destinationChainId: 130,
        tokenId: 13300n,
        owner: '0xa836154C6031cA89086A9cfa48a3C25c9dfd9D9B',
        sourceProtocol: Protocol.UniswapV4,
        destinationProtocol: Protocol.UniswapV4,
        bridgeType: BridgeType.Across,
        migrationMethod: MigrationMethod.SingleToken,
        token0: '0x078D782b760474a361dDA0AF3839290b0EF57AD6',
        token1: '0x588CE4F028D8e7B53B687865d6A67b3A54C75518',
        tickLower: -887220,
        tickUpper: 887220,
        fee: 500,
        tickSpacing: 10,
        hooks: '0x0000000000000000000000000000000000000000',
      };
      await client.requestMigration(params);
    } catch (e) {
      expect(e.message).toContain('ETH/WETH not found in position');
    }
  });
});

describe('in-range v3→ migrations', () => {
  let v3ChainId: number;
  let v3Owner: `0x${string}`;
  let v3TokenId: bigint;
  let v3Response: IV3PositionWithUncollectedFees;

  beforeAll(async () => {
    v3ChainId = 1;
    v3Owner = '0xbab7901210a28eef316744a713aed9036e2c5d21';
    v3TokenId = 963499n;
    v3Response = await client.getV3Position({
      chainId: v3ChainId,
      tokenId: v3TokenId,
      owner: v3Owner,
    });
  });

  test('generate valid mainnet v3 → unichain v4 single-token migration', async () => {
    const params: RequestV3toV4MigrationParams = {
      sourceChainId: v3ChainId,
      destinationChainId: 130,
      tokenId: v3TokenId,
      owner: v3Owner,
      sourceProtocol: Protocol.UniswapV3,
      destinationProtocol: Protocol.UniswapV4,
      bridgeType: BridgeType.Across,
      migrationMethod: MigrationMethod.SingleToken,
      token0: NATIVE_ETH_ADDRESS,
      token1: '0x078D782b760474a361dDA0AF3839290b0EF57AD6',
      tickLower: -1 * v3Response.position.tickUpper,
      tickUpper: -1 * v3Response.position.tickLower,
      fee: v3Response.position.pool.fee,
      tickSpacing: v3Response.position.pool.tickSpacing,
      hooks: '0x0000000000000000000000000000000000000000',
    };
    validateMigrationResponse(params, await client.requestMigration(params));
  });

  test('generate valid mainnet v3 → unichain v4 dual-token migration', async () => {
    const params: RequestV3toV4MigrationParams = {
      sourceChainId: v3ChainId,
      destinationChainId: 130,
      tokenId: v3TokenId,
      owner: v3Owner,
      sourceProtocol: Protocol.UniswapV3,
      destinationProtocol: Protocol.UniswapV4,
      bridgeType: BridgeType.Across,
      migrationMethod: MigrationMethod.DualToken,
      token0: NATIVE_ETH_ADDRESS,
      token1: '0x078D782b760474a361dDA0AF3839290b0EF57AD6',
      tickLower: -1 * v3Response.position.tickUpper,
      tickUpper: -1 * v3Response.position.tickLower,
      fee: v3Response.position.pool.fee,
      tickSpacing: v3Response.position.pool.tickSpacing,
      hooks: '0x0000000000000000000000000000000000000000',
    };
    validateMigrationResponse(params, await client.requestMigration(params));
  });

  test('generate valid mainnet v3 → unichain v3 single-token migration', async () => {
    const params: RequestV3toV3MigrationParams = {
      sourceChainId: v3ChainId,
      destinationChainId: 130,
      tokenId: v3TokenId,
      owner: v3Owner,
      sourceProtocol: Protocol.UniswapV3,
      destinationProtocol: Protocol.UniswapV3,
      bridgeType: BridgeType.Across,
      migrationMethod: MigrationMethod.SingleToken,
      token0: '0x078D782b760474a361dDA0AF3839290b0EF57AD6',
      token1: '0x4200000000000000000000000000000000000006',
      tickLower: v3Response.position.tickLower,
      tickUpper: v3Response.position.tickUpper,
      fee: v3Response.position.pool.fee,
    };
    validateMigrationResponse(params, await client.requestMigration(params));
  });

  test('generate valid mainnet v3 → unichain v3 dual-token migration', async () => {
    const params: RequestV3toV3MigrationParams = {
      sourceChainId: v3ChainId,
      destinationChainId: 130,
      tokenId: v3TokenId,
      owner: v3Owner,
      sourceProtocol: Protocol.UniswapV3,
      destinationProtocol: Protocol.UniswapV3,
      bridgeType: BridgeType.Across,
      migrationMethod: MigrationMethod.DualToken,
      token0: '0x078D782b760474a361dDA0AF3839290b0EF57AD6',
      token1: '0x4200000000000000000000000000000000000006',
      tickLower: v3Response.position.tickLower,
      tickUpper: v3Response.position.tickUpper,
      fee: v3Response.position.pool.fee,
    };
    validateMigrationResponse(params, await client.requestMigration(params));
  });

  // TODO: this example actually be used to test pool creation path when needed
  //   const params: RequestV3toV4MigrationParams = {
  //     sourceChainId: 1,
  //     destinationChainId: 130,
  //     tokenId: 35119n,
  //     owner: '0x6615d7f48beddb737953ec447f67d555c64500bc',
  //     sourceProtocol: Protocol.UniswapV3,
  //     destinationProtocol: Protocol.UniswapV4,
  //     bridgeType: BridgeType.Across,
  //     migrationMethod: MigrationMethod.SingleToken,
  //     token0: NATIVE_ETH_ADDRESS,
  //     token1: '0x927B51f251480a681271180DA4de28D44EC4AfB8',
  //     tickLower: -292400,
  //     tickUpper: -230200,
  //     fee: 10000,
  //     tickSpacing: 200,
  //     hooks: '0x0000000000000000000000000000000000000000',
  //   }
});

describe('in-range v4→ migrations', () => {
  let v4ChainId: number;
  let v4Owner: `0x${string}`;
  let v4TokenId: bigint;
  let v4Response: IV4PositionWithUncollectedFees;

  beforeAll(async () => {
    v4ChainId = 130;
    v4Owner = '0x29d8915a034d690ea4919fd9657cfdf6e6f679b1';
    v4TokenId = 64594n;
    v4Response = await client.getV4Position({
      chainId: v4ChainId,
      tokenId: v4TokenId,
      owner: v4Owner,
    });
  });

  test('generate valid unichain v4 → base v3 single-token migration', async () => {
    const params: RequestV4toV3MigrationParams = {
      sourceChainId: v4ChainId,
      destinationChainId: 8453,
      tokenId: v4TokenId,
      owner: v4Owner,
      sourceProtocol: Protocol.UniswapV4,
      destinationProtocol: Protocol.UniswapV3,
      bridgeType: BridgeType.Across,
      migrationMethod: MigrationMethod.SingleToken,
      token0: '0x4200000000000000000000000000000000000006',
      token1: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      tickLower: v4Response.position.tickLower,
      tickUpper: v4Response.position.tickUpper,
      fee: v4Response.position.pool.fee,
    };
    validateMigrationResponse(params, await client.requestMigration(params));
  });

  test('generate valid unichain v4 → base v3 dual-token migration', async () => {
    const params: RequestV4toV3MigrationParams = {
      sourceChainId: v4ChainId,
      destinationChainId: 8453,
      tokenId: v4TokenId,
      owner: v4Owner,
      sourceProtocol: Protocol.UniswapV4,
      destinationProtocol: Protocol.UniswapV3,
      bridgeType: BridgeType.Across,
      migrationMethod: MigrationMethod.DualToken,
      token0: '0x4200000000000000000000000000000000000006',
      token1: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      tickLower: v4Response.position.tickLower,
      tickUpper: v4Response.position.tickUpper,
      fee: v4Response.position.pool.fee,
    };
    validateMigrationResponse(params, await client.requestMigration(params));
  });

  test('generate valid unichain v4 → base v4 single-token migration', async () => {
    const params: RequestV4toV4MigrationParams = {
      sourceChainId: v4ChainId,
      destinationChainId: 8453,
      tokenId: v4TokenId,
      owner: v4Owner,
      sourceProtocol: Protocol.UniswapV4,
      destinationProtocol: Protocol.UniswapV4,
      bridgeType: BridgeType.Across,
      migrationMethod: MigrationMethod.SingleToken,
      token0: '0x4200000000000000000000000000000000000006',
      token1: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      tickLower: v4Response.position.tickLower,
      tickUpper: v4Response.position.tickUpper,
      fee: v4Response.position.pool.fee,
      hooks: '0x0000000000000000000000000000000000000000',
      tickSpacing: v4Response.position.pool.tickSpacing,
    };
    validateMigrationResponse(params, await client.requestMigration(params));
  });

  test('generate valid unichain v4 → base v4 dual-token migration', async () => {
    const params: RequestV4toV4MigrationParams = {
      sourceChainId: v4ChainId,
      destinationChainId: 8453,
      tokenId: v4TokenId,
      owner: v4Owner,
      sourceProtocol: Protocol.UniswapV4,
      destinationProtocol: Protocol.UniswapV4,
      bridgeType: BridgeType.Across,
      migrationMethod: MigrationMethod.DualToken,
      token0: '0x4200000000000000000000000000000000000006',
      token1: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      tickLower: v4Response.position.tickLower,
      tickUpper: v4Response.position.tickUpper,
      fee: v4Response.position.pool.fee,
      hooks: '0x0000000000000000000000000000000000000000',
      tickSpacing: v4Response.position.pool.tickSpacing,
    };
    validateMigrationResponse(params, await client.requestMigration(params));
  });
});

describe('flipped token order between chains', () => {
  test('generate valid base v4 → unichain v3 dual-token migration', async () => {
    const params: RequestV4toV3MigrationParams = {
      sourceChainId: 8453,
      destinationChainId: 130,
      tokenId: 46001n,
      owner: '0xD0f0ba9c73983E283451cA872A94b2f0662b8976',
      sourceProtocol: Protocol.UniswapV4,
      destinationProtocol: Protocol.UniswapV3,
      bridgeType: BridgeType.Across,
      migrationMethod: MigrationMethod.DualToken,
      token0: '0x078D782b760474a361dDA0AF3839290b0EF57AD6',
      token1: '0x4200000000000000000000000000000000000006',
      tickLower: 201320,
      tickUpper: 201870,
      fee: 500,
    };
    validateMigrationResponse(params, await client.requestMigration(params));
  });

  test('generate valid arbitrum v4 → unichain v4 dual-token migration', async () => {
    const params: RequestV4toV4MigrationParams = {
      sourceChainId: 42161,
      destinationChainId: 10,
      tokenId: 4n,
      owner: '0x4423b0d6955af39b48cf215577a79ce574299d3f',
      sourceProtocol: Protocol.UniswapV4,
      destinationProtocol: Protocol.UniswapV4,
      bridgeType: BridgeType.Across,
      migrationMethod: MigrationMethod.DualToken,
      token0: NATIVE_ETH_ADDRESS,
      token1: '0x68f180fcCe6836688e9084f035309E29Bf0A2095',
      tickLower: -887220,
      tickUpper: 887220,
      fee: 3000,
      hooks: '0x0000000000000000000000000000000000000000',
      tickSpacing: 60,
    };
    validateMigrationResponse(params, await client.requestMigration(params));
  });
});

describe('out of range v3→ migrations', () => {
  let v3ChainId: number;
  let v3Owner: `0x${string}`;
  let v3TokenId: bigint;
  let v3Response: IV3PositionWithUncollectedFees;

  beforeAll(async () => {
    v3ChainId = 1;
    v3Owner = '0x98f6910cb1f3dd6accae99945b3291d0f99407f9';
    v3TokenId = 893202n;
    v3Response = await client.getV3Position({
      chainId: v3ChainId,
      tokenId: v3TokenId,
      owner: v3Owner,
    });
  });

  describe('single token', () => {
    describe('current price below requested range', () => {
      test('generate valid mainnet v3 → unichain v4 migration', async () => {
        const params: RequestV3toV4MigrationParams = {
          sourceChainId: v3ChainId,
          destinationChainId: 130,
          tokenId: v3TokenId,
          owner: v3Owner,
          sourceProtocol: Protocol.UniswapV3,
          destinationProtocol: Protocol.UniswapV4,
          bridgeType: BridgeType.Across,
          migrationMethod: MigrationMethod.SingleToken,
          token0: NATIVE_ETH_ADDRESS,
          token1: '0x927B51f251480a681271180DA4de28D44EC4AfB8',
          tickLower: -1 * v3Response.position.tickUpper,
          tickUpper: -1 * v3Response.position.tickLower,
          fee: v3Response.position.pool.fee,
          tickSpacing: v3Response.position.pool.tickSpacing,
          hooks: '0x0000000000000000000000000000000000000000',
        };
        validateMigrationResponse(params, await client.requestMigration(params));
      });
    });
    describe('current price above requested range', () => {
      test('generate valid mainnet v3 → unichain v4 migration', async () => {
        const params: RequestV3toV4MigrationParams = {
          sourceChainId: v3ChainId,
          destinationChainId: 130,
          tokenId: v3TokenId,
          owner: v3Owner,
          sourceProtocol: Protocol.UniswapV3,
          destinationProtocol: Protocol.UniswapV4,
          bridgeType: BridgeType.Across,
          migrationMethod: MigrationMethod.SingleToken,
          token0: NATIVE_ETH_ADDRESS,
          token1: '0x927B51f251480a681271180DA4de28D44EC4AfB8',
          tickLower: -299990,
          tickUpper: -289990,
          fee: v3Response.position.pool.fee,
          tickSpacing: v3Response.position.pool.tickSpacing,
          hooks: '0x0000000000000000000000000000000000000000',
        };
        validateMigrationResponse(params, await client.requestMigration(params));
      });
    });
  });

  describe('dual token', () => {
    test('mainnet v3 → unichain v4 migration throws unsupported token address', async () => {
      const params: RequestV3toV4MigrationParams = {
        sourceChainId: v3ChainId,
        destinationChainId: 130,
        tokenId: v3TokenId,
        owner: v3Owner,
        sourceProtocol: Protocol.UniswapV3,
        destinationProtocol: Protocol.UniswapV4,
        bridgeType: BridgeType.Across,
        migrationMethod: MigrationMethod.DualToken,
        token0: NATIVE_ETH_ADDRESS,
        token1: '0x927B51f251480a681271180DA4de28D44EC4AfB8',
        tickLower: -1 * v3Response.position.tickUpper,
        tickUpper: -1 * v3Response.position.tickLower,
        fee: v3Response.position.pool.fee,
        tickSpacing: v3Response.position.pool.tickSpacing,
        hooks: '0x0000000000000000000000000000000000000000',
      };
      try {
        validateMigrationResponse(params, await client.requestMigration(params));
      } catch (e) {
        expect(e.message).toContain('Unsupported token address on given destination chain');
      }
    });
  });
});

describe('out of range v4→ migrations', () => {
  let v4ChainId: number;
  let v4Owner: `0x${string}`;
  let v4TokenId: bigint;
  let v4Response: IV4PositionWithUncollectedFees;

  beforeAll(async () => {
    v4ChainId = 130;
    v4Owner = '0x29d8915a034d690ea4919fd9657cfdf6e6f679b1';
    v4TokenId = 64594n;
    v4Response = await client.getV4Position({
      chainId: v4ChainId,
      tokenId: v4TokenId,
      owner: v4Owner,
    });
  });

  describe('single token', () => {
    describe('current price below requested range', () => {
      test('generate valid unichain v4 → base v4 migration', async () => {
        const params: RequestV4toV4MigrationParams = {
          sourceChainId: 130,
          destinationChainId: 8453,
          tokenId: v4TokenId,
          owner: v4Owner,
          sourceProtocol: Protocol.UniswapV4,
          destinationProtocol: Protocol.UniswapV4,
          bridgeType: BridgeType.Across,
          migrationMethod: MigrationMethod.SingleToken,
          token0: NATIVE_ETH_ADDRESS,
          token1: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
          tickLower: -199230,
          tickUpper: -197230,
          fee: v4Response.position.pool.fee,
          tickSpacing: v4Response.position.pool.tickSpacing,
          hooks: '0x0000000000000000000000000000000000000000',
        };
        validateMigrationResponse(params, await client.requestMigration(params));
      });
    });
    describe('current price above requested range', () => {
      test('generate valid unichain v4 → base v4 migration', async () => {
        const params: RequestV4toV4MigrationParams = {
          sourceChainId: 130,
          destinationChainId: 8453,
          tokenId: v4TokenId,
          owner: v4Owner,
          sourceProtocol: Protocol.UniswapV4,
          destinationProtocol: Protocol.UniswapV4,
          bridgeType: BridgeType.Across,
          migrationMethod: MigrationMethod.SingleToken,
          token0: NATIVE_ETH_ADDRESS,
          token1: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
          tickLower: -206230,
          tickUpper: -202230,
          fee: v4Response.position.pool.fee,
          tickSpacing: v4Response.position.pool.tickSpacing,
          hooks: '0x0000000000000000000000000000000000000000',
        };
        validateMigrationResponse(params, await client.requestMigration(params));
      });
    });
  });

  describe('dual token', () => {
    test('mainnet v3 → unichain v4 migration throws unsupported token address', async () => {
      try {
        const params: RequestV4toV4MigrationParams = {
          sourceChainId: 130,
          destinationChainId: 8453,
          tokenId: v4TokenId,
          owner: v4Owner,
          sourceProtocol: Protocol.UniswapV4,
          destinationProtocol: Protocol.UniswapV4,
          bridgeType: BridgeType.Across,
          migrationMethod: MigrationMethod.DualToken,
          token0: NATIVE_ETH_ADDRESS,
          token1: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
          tickLower: -206230,
          tickUpper: -202230,
          fee: v4Response.position.pool.fee,
          tickSpacing: v4Response.position.pool.tickSpacing,
          hooks: '0x0000000000000000000000000000000000000000',
        };
        validateMigrationResponse(params, await client.requestMigration(params));
      } catch (e) {
        expect(e.message).toContain('Unsupported token address on given destination chain');
      }
    });
  });
});
