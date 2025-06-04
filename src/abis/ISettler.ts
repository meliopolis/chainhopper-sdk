export const ISettlerAbi = [
  {
    type: 'function',
    name: 'selfSettle',
    inputs: [
      { name: 'migrationId', type: 'bytes32', internalType: 'bytes32' },
      { name: 'token', type: 'address', internalType: 'address' },
      { name: 'amount', type: 'uint256', internalType: 'uint256' },
      {
        name: 'migrationData',
        type: 'tuple',
        internalType: 'struct MigrationData',
        components: [
          { name: 'sourceChainId', type: 'uint256', internalType: 'uint256' },
          { name: 'migrator', type: 'address', internalType: 'address' },
          { name: 'nonce', type: 'uint256', internalType: 'uint256' },
          { name: 'mode', type: 'uint8', internalType: 'MigrationMode' },
          { name: 'routesData', type: 'bytes', internalType: 'bytes' },
          { name: 'settlementData', type: 'bytes', internalType: 'bytes' },
        ],
      },
    ],
    outputs: [{ name: '', type: 'bool', internalType: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'withdraw',
    inputs: [{ name: 'migrationId', type: 'bytes32', internalType: 'bytes32' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    name: 'FeePayment',
    inputs: [
      { name: 'migrationId', type: 'bytes32', indexed: true, internalType: 'bytes32' },
      { name: 'token', type: 'address', indexed: true, internalType: 'address' },
      { name: 'protocolFee', type: 'uint256', indexed: false, internalType: 'uint256' },
      { name: 'senderFee', type: 'uint256', indexed: false, internalType: 'uint256' },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'Receipt',
    inputs: [
      { name: 'migrationId', type: 'bytes32', indexed: true, internalType: 'bytes32' },
      { name: 'token', type: 'address', indexed: true, internalType: 'address' },
      { name: 'amount', type: 'uint256', indexed: false, internalType: 'uint256' },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'Refund',
    inputs: [
      { name: 'migrationId', type: 'bytes32', indexed: true, internalType: 'bytes32' },
      { name: 'recipient', type: 'address', indexed: true, internalType: 'address' },
      { name: 'token', type: 'address', indexed: true, internalType: 'address' },
      { name: 'amount', type: 'uint256', indexed: false, internalType: 'uint256' },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'Settlement',
    inputs: [
      { name: 'migrationId', type: 'bytes32', indexed: true, internalType: 'bytes32' },
      { name: 'recipient', type: 'address', indexed: true, internalType: 'address' },
      { name: 'positionId', type: 'uint256', indexed: false, internalType: 'uint256' },
    ],
    anonymous: false,
  },
  {
    type: 'error',
    name: 'MaxFeeExceeded',
    inputs: [
      { name: 'protocolShareBps', type: 'uint16', internalType: 'uint16' },
      { name: 'senderShareBps', type: 'uint16', internalType: 'uint16' },
    ],
  },
  {
    type: 'error',
    name: 'NativeTokenTransferFailed',
    inputs: [
      { name: 'recipient', type: 'address', internalType: 'address' },
      { name: 'amount', type: 'uint256', internalType: 'uint256' },
    ],
  },
  { type: 'error', name: 'NotRecipient', inputs: [] },
  { type: 'error', name: 'NotSelf', inputs: [] },
  { type: 'error', name: 'SameToken', inputs: [] },
  { type: 'error', name: 'UnsupportedMode', inputs: [{ name: 'mode', type: 'uint8', internalType: 'MigrationMode' }] },
];
