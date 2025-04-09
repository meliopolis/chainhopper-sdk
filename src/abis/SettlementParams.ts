export const SettlementParamsAbi = [
  {
    name: 'SettlementParams',
    type: 'tuple',
    components: [
      { internalType: 'address', name: 'recipient', type: 'address' },
      { internalType: 'uint16', name: 'senderShareBps', type: 'uint16' },
      {
        internalType: 'address',
        name: 'senderFeeRecipient',
        type: 'address',
      },
      { name: 'mintParams', type: 'bytes' },
    ],
  },
];


export const V3MintParamsAbi = [
  {
    name: 'V3MintParams',
    type: 'tuple',
    components: [
      { internalType: 'address', name: 'token0', type: 'address' },
      { internalType: 'address', name: 'token1', type: 'address' },
      { internalType: 'uint24', name: 'fee', type: 'uint24' },
      { internalType: 'uint160', name: 'sqrtPriceX96', type: 'uint160' },
      { internalType: 'int24', name: 'tickLower', type: 'int24' },
      { internalType: 'int24', name: 'tickUpper', type: 'int24' },
      { internalType: 'uint24', name: 'swapAmountInMilliBps', type: 'uint24' },
      { internalType: 'uint256', name: 'amount0Min', type: 'uint256' },
      { internalType: 'uint256', name: 'amount1Min', type: 'uint256' },
    ],
  },
];

export const V4MintParamsAbi = [
  {
    name: 'V4MintParams',
    type: 'tuple',
    components: [
      { internalType: 'address', name: 'token0', type: 'address' },
      { internalType: 'address', name: 'token1', type: 'address' },
      { internalType: 'uint24', name: 'fee', type: 'uint24' },
      { internalType: 'int24', name: 'tickSpacing', type: 'int24' },
      { internalType: 'address', name: 'hooks', type: 'address' },
      { internalType: 'uint160', name: 'sqrtPriceX96', type: 'uint160' },
      { internalType: 'int24', name: 'tickLower', type: 'int24' },
      { internalType: 'int24', name: 'tickUpper', type: 'int24' },
      { internalType: 'uint256', name: 'swapAmountInMilliBps', type: 'uint256' },
      { internalType: 'uint256', name: 'amount0Min', type: 'uint256' },
      { internalType: 'uint256', name: 'amount1Min', type: 'uint256' },
    ],
  },
];

export const SettlementParamsForSettlerAbi = [
  {
    name: 'migrationId',
    type: 'bytes32',
  },
  {
    name: 'SettlementParams',
    type: 'bytes',
  },
];
