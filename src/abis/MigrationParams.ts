export const MigrationParamsAbi = [
  {
    name: 'MigrationParams',
    type: 'tuple',
    components: [
      {
        name: 'chainId',
        internalType: 'uint32',
        type: 'uint32',
      },
      {
        name: 'settler',
        internalType: 'address',
        type: 'address',
      },
      {
        name: 'tokenRoutes',
        type: 'tuple[]',
        components: [
          {
            name: 'inputToken',
            internalType: 'address',
            type: 'address',
          },
          {
            name: 'minAmountOut',
            internalType: 'uint256',
            type: 'uint256',
          },
          {
            name: 'route',
            internalType: 'bytes',
            type: 'bytes',
          },
        ],
      },
      {
        name: 'settlementParams',
        internalType: 'bytes',
        type: 'bytes',
      },
    ],
  },
];

export const RouteAbi = [
  {
    name: 'Route',
    type: 'tuple',
    components: [
      {
        name: 'outputToken',
        internalType: 'address',
        type: 'address',
      },
      {
        name: 'maxFees',
        internalType: 'uint256',
        type: 'uint256',
      },
      {
        name: 'quoteTimestamp',
        internalType: 'uint32',
        type: 'uint32',
      },
      {
        name: 'fillDeadlineOffset',
        internalType: 'uint32',
        type: 'uint32',
      },
      {
        name: 'exclusiveRelayer',
        internalType: 'address',
        type: 'address',
      },
      {
        name: 'exclusivityDeadline',
        internalType: 'uint32',
        type: 'uint32',
      },
    ],
  },
];
