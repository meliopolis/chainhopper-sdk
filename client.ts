import type { Chain } from "viem";
import { configurePublicClients } from "./utils/configurePublicClients";
import { chainConfigList } from "./chains";
import {
  getV3Position,
  type IV3PositionWithUncollectedFees,
} from "./actions/getV3Position";
import { BridgeType, MigrationMethod, Protocol } from "./utils/constants";
import type { ChainConfig } from "./chains";
import type {
  RequestMigrationParams,
  RequestV3MigrationParams,
  RequestV4MigrationParams,
  IUniswapPositionParams,
  RequestV3toV3MigrationParams,
  RequestV4toV3MigrationParams,
  RequestV4toV4MigrationParams,
  RequestMigrationResponse,
} from "./types";
import { startUniswapV3Migration, settleUniswapV3Migration } from "./actions";
import {
  getV4Position,
  type IV4PositionWithUncollectedFees,
} from "./actions/getV4Position";
import { startUniswapV4Migration } from "./actions/startUniswapV4Migration";
import { settleUniswapV4Migration } from "./actions/settleUniswapV4Migration";

export type HopperClientOptions = {
  /**
   * The RPC URLs to use for fetching on-chain data. Defaults to public RPC URLs for the chains.
   */
  rpcUrls?: {
    [chainId: number]: string;
  };
};

export class HopperClient {
  private static instance: HopperClient | null = null;
  public readonly chainConfigs: Record<number, ChainConfig>;

  private constructor(args: HopperClientOptions) {
    this.chainConfigs = configurePublicClients(chainConfigList, args.rpcUrls);
  }

  public static create(args: HopperClientOptions) {
    if (this.instance === null) {
      this.instance = new HopperClient(args);
    }
    return this.instance;
  }

  public isChainSupported(chainId: number) {
    return chainConfigList[chainId] !== undefined;
  }

  public getSupportedChainIds() {
    return Object.values(chainConfigList).map(
      (chainConfig) => chainConfig.chain.id
    );
  }

  public getV3Position(params: IUniswapPositionParams) {
    return getV3Position(this.chainConfigs[params.chainId], params);
  }

  public async requestMigration(params: RequestMigrationParams): Promise<RequestMigrationResponse> {
    // make sure both chains are supported
    if (
      !this.isChainSupported(params.sourceChainId) ||
      !this.isChainSupported(params.destinationChainId)
    ) {
      throw new Error("chain not supported");
    }

    // make sure source protocol is supported
    if (
      params.sourceProtocol !== Protocol.UniswapV3 &&
      params.sourceProtocol !== Protocol.UniswapV4
    ) {
      throw new Error("source protocol not supported");
    }

    // make sure destination protocol is supported
    if (
      params.destinationProtocol !== Protocol.UniswapV3 &&
      params.destinationProtocol !== Protocol.UniswapV4
    ) {
      throw new Error("destination protocol not supported");
    }

    // make sure bridge type is supported
    if (
      params.bridgeType !== BridgeType.Across &&
      params.bridgeType !== BridgeType.Wormhole
    ) {
      throw new Error("bridge type not supported");
    }

    // make sure migration method is supported
    if (
      params.migrationMethod !== MigrationMethod.SingleToken &&
      params.migrationMethod !== MigrationMethod.DualToken
    ) {
      throw new Error("migration method not supported");
    }

    // make sure tokenId is valid
    if (params.tokenId === BigInt(0)) {
      throw new Error("tokenId is not valid");
    }

    // make sure owner is valid
    if (params.owner.length !== 42 || !params.owner.startsWith("0x")) {
      throw new Error("owner is not valid");
    }

    if (params.token0.toLowerCase() > params.token1.toLowerCase()) {
      throw new Error("token0 and token1 must be in alphabetical order");
    }

    if (params.tickLower > params.tickUpper) {
      throw new Error("tickLower must be less than tickUpper");
    }

    if (params.sourceProtocol === Protocol.UniswapV3) {
      return await this.requestV3Migration(params);
    } else if (params.sourceProtocol === Protocol.UniswapV4) {
      return await this.requestV4Migration(params);
    } else {
      throw new Error("source protocol not supported");
    }
  }

  private async requestV3Migration(params: RequestV3MigrationParams): Promise<RequestMigrationResponse> {
    const { sourceChainId, destinationChainId, tokenId, destinationProtocol } =
      params;

    // first part: get position details and estimate amount available to migrate
    const v3Position = await getV3Position(this.chainConfigs[sourceChainId], {
      chainId: sourceChainId,
      tokenId,
      owner: params.owner,
    });

    // make sure position has liquidity or fees
    if (
      BigInt(v3Position.position?.liquidity.toString() ?? "0") === BigInt(0) &&
      (v3Position.uncollectedFees?.amount0.toString() ?? "0") === "0" &&
      (v3Position.uncollectedFees?.amount1.toString() ?? "0") === "0"
    ) {
      throw new Error("Position has no liquidity or fees");
    }

    // second part: start migration on source chain
    const { acrossQuotes } = await startUniswapV3Migration(
      this.chainConfigs[sourceChainId],
      this.chainConfigs[destinationChainId],
      v3Position as IV3PositionWithUncollectedFees,
      params
    );

    // third part: settle migration on destination chain
    if (destinationProtocol === Protocol.UniswapV3) {
      const v3Settlement = await settleUniswapV3Migration(
        this.chainConfigs[destinationChainId],
        acrossQuotes,
        params as RequestV3toV3MigrationParams
      );
      return {
        sourceProtocol: Protocol.UniswapV3,
        sourcePosition: v3Position,
        sourceTokenId: tokenId,
        destProtocol: Protocol.UniswapV3,
        destPosition: v3Settlement.destV3Position,
        destChainId: destinationChainId,
        migratorMessage: v3Settlement.migratorMessage,
        settlerMessage: v3Settlement.settlerMessage,
        quoteDetails: {
          inputAmount: acrossQuotes[0].deposit.inputAmount,
          outputAmount: acrossQuotes[0].deposit.outputAmount,
          fees: acrossQuotes[0].fees,
          exclusivityDeadline: acrossQuotes[0].deposit.exclusivityDeadline,
        },
      }
    } else if (destinationProtocol === Protocol.UniswapV4) {
      throw new Error("migrateV4Position not implemented");
    } else {
      throw new Error("Destination protocol not supported");
    }
  }

  private async requestV4Migration(params: RequestV4MigrationParams) {
    const { sourceChainId, destinationChainId, tokenId, destinationProtocol } =
      params;

    // first part: get position details and estimate amount available to migrate
    const v4Position = await getV4Position(this.chainConfigs[sourceChainId], {
      chainId: sourceChainId,
      tokenId,
      owner: params.owner,
    });

    // todo: make sure position has liquidity or fees

    // second part: start migration on source chain
    const { acrossQuotes } = await startUniswapV4Migration(
      this.chainConfigs[sourceChainId],
      this.chainConfigs[destinationChainId],
      v4Position as IV4PositionWithUncollectedFees,
      params
    );

    // third part: settle migration on destination chain
    if (destinationProtocol === Protocol.UniswapV3) {
      const v3Settlement = await settleUniswapV3Migration(
        this.chainConfigs[destinationChainId],
        acrossQuotes,
        params as RequestV4toV3MigrationParams
      );
      return {
        sourceProtocol: Protocol.UniswapV4,
        sourcePosition: v4Position,
        sourceTokenId: tokenId,
        destProtocol: Protocol.UniswapV3,
        destPosition: v3Settlement.destV3Position,
        destChainId: destinationChainId,
        migratorMessage: v3Settlement.migratorMessage,
        settlerMessage: v3Settlement.settlerMessage,
        quoteDetails: {
          inputAmount: acrossQuotes[0].deposit.inputAmount,
          outputAmount: acrossQuotes[0].deposit.outputAmount,
          fees: acrossQuotes[0].fees,
          exclusivityDeadline: acrossQuotes[0].deposit.exclusivityDeadline,
        },
      }
    } else if (destinationProtocol === Protocol.UniswapV4) {
      const v4Settlement = await settleUniswapV4Migration(
        this.chainConfigs[destinationChainId],
        acrossQuotes,
        params as RequestV4toV4MigrationParams
      );
      return {
        sourceProtocol: Protocol.UniswapV4,
        sourcePosition: v4Position,
        sourceTokenId: tokenId,
        destProtocol: Protocol.UniswapV4,
        destPosition: v4Settlement.destV4Position,
        destChainId: destinationChainId,
        migratorMessage: v4Settlement.migratorMessage,
        settlerMessage: v4Settlement.settlerMessage,
        quoteDetails: {
          inputAmount: acrossQuotes[0].deposit.inputAmount,
          outputAmount: acrossQuotes[0].deposit.outputAmount,
          fees: acrossQuotes[0].fees,
          exclusivityDeadline: acrossQuotes[0].deposit.exclusivityDeadline,
        },
      }
    } else {
      throw new Error("Destination protocol not supported");
    }
  }
}
