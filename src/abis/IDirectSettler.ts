export const IDirectSettlerAbi = [
  {
    type: 'function',
    name: 'handleDirectTransfer',
    inputs: [
      { name: 'token', type: 'address', internalType: 'address' },
      { name: 'amount', type: 'uint256', internalType: 'uint256' },
      { name: 'message', type: 'bytes', internalType: 'bytes' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  { type: 'error', name: 'InvalidMigration', inputs: [] },
  { type: 'error', name: 'MissingAmount', inputs: [{ name: 'token', type: 'address', internalType: 'address' }] },
];
