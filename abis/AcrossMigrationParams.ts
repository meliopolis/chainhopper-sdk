// export const AcrossRoutesAbi = [{
//   name: "acrossRoutes",
//   type: "tuple[]",
//   components: [
//     { internalType: "address", name: "inputToken", type: "address" },
//     { internalType: "address", name: "outputToken", type: "address" },
//     { internalType: "uint256", name: "maxFees", type: "uint256" },
//     {
//       internalType: "uint32",
//       name: "quoteTimestamp",
//       type: "uint32",
//     },
//     {
//       internalType: "uint32",
//       name: "fillDeadlineOffset",
//       type: "uint32",
//     },
//     {
//       internalType: "address",
//       name: "exclusiveRelayer",
//       type: "address",
//     },
//     {
//       internalType: "uint32",
//       name: "exclusivityDeadline",
//       type: "uint32",
//     },
//   ],
// }]

export const AcrossMigrationParamsAbi = [
  {
    name: "acrossMigrationParams",
    type: "tuple",
    components: [
      {
        name: "baseMigrationParams",
        type: "tuple",
        components: [
          {
            name: "destinationChainId",
            internalType: "uint256",
            type: "uint256",
          },
          {
            name: "recipientSettler",
            internalType: "address",
            type: "address",
          },
          {
            name: "settlementParams",
            internalType: "bytes",
            type: "bytes",
          },
        ],
      }, // BaseMigrationParams
      {
        name: "acrossRoutes",
        type: "tuple[]",
        components: [
          { internalType: "address", name: "inputToken", type: "address" },
          { internalType: "address", name: "outputToken", type: "address" },
          { internalType: "uint256", name: "maxFees", type: "uint256" },
          {
            internalType: "uint32",
            name: "quoteTimestamp",
            type: "uint32",
          },
          {
            internalType: "uint32",
            name: "fillDeadlineOffset",
            type: "uint32",
          },
          {
            internalType: "address",
            name: "exclusiveRelayer",
            type: "address",
          },
          {
            internalType: "uint32",
            name: "exclusivityDeadline",
            type: "uint32",
          },
        ],
      }, // AcrossRoutes
    ],
  },
]

