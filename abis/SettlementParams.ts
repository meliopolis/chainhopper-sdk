import type { AcrossMigrationParams } from "../types";

export const V3SettlementParamsAbi = [
  {
    name: "V3SettlementParams",
    type: "tuple",
    components: [
      { internalType: "address", name: "recipient", type: "address" },
      { internalType: "address", name: "token0", type: "address" },
      { internalType: "address", name: "token1", type: "address" },
      { internalType: "uint24", name: "fee", type: "uint24" },
      { internalType: "int24", name: "tickLower", type: "int24" },
      { internalType: "int24", name: "tickUpper", type: "int24" },
      { internalType: "uint256", name: "amount0Min", type: "uint256" },
      { internalType: "uint256", name: "amount1Min", type: "uint256" },
      { internalType: "uint24", name: "senderFeeBps", type: "uint24" },
      {
        internalType: "address",
        name: "senderFeeRecipient",
        type: "address",
      },
    ],
  },
];

export const V4SettlementParamsAbi = [
  {
    name: "V4SettlementParams",
    type: "tuple",
    components: [
      { internalType: "address", name: "recipient", type: "address" },
      { internalType: "address", name: "token0", type: "address" },
      { internalType: "address", name: "token1", type: "address" },
      { internalType: "uint24", name: "fee", type: "uint24" },
      { internalType: "address", name: "hooks", type: "address" },
      { internalType: "int24", name: "tickLower", type: "int24" },
      { internalType: "int24", name: "tickUpper", type: "int24" },
      { internalType: "uint256", name: "amount0Min", type: "uint256" },
      { internalType: "uint256", name: "amount1Min", type: "uint256" },
      { internalType: "uint24", name: "senderFeeBps", type: "uint24" },
      {
        internalType: "address",
        name: "senderFeeRecipient",
        type: "address",
      },
    ],
  },
];

export const SettlementParamsForSettlerAbi = [
  {
    name: "migrationId",
    type: "bytes32",
  },
  {
    name: "SettlementParams",
    type: "bytes",
  },
];
