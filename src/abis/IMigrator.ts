export const IMigratorAbi = [
  {
    type: 'function',
    name: 'chainSettlers',
    inputs: [
      { name: '', type: 'uint256', internalType: 'uint256' },
      { name: '', type: 'address', internalType: 'address' },
    ],
    outputs: [{ name: '', type: 'bool', internalType: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'migrationCounter',
    inputs: [],
    outputs: [{ name: '', type: 'uint56', internalType: 'uint56' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'owner',
    inputs: [],
    outputs: [{ name: '', type: 'address', internalType: 'address' }],
    stateMutability: 'view',
  },
  { type: 'function', name: 'renounceOwnership', inputs: [], outputs: [], stateMutability: 'nonpayable' },
  {
    type: 'function',
    name: 'setChainSettlers',
    inputs: [
      { name: 'chainIds', type: 'uint256[]', internalType: 'uint256[]' },
      { name: 'settlers', type: 'address[]', internalType: 'address[]' },
      { name: 'values', type: 'bool[]', internalType: 'bool[]' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'transferOwnership',
    inputs: [{ name: 'newOwner', type: 'address', internalType: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    name: 'ChainSettlerUpdated',
    inputs: [
      { name: 'chainId', type: 'uint256', indexed: true, internalType: 'uint256' },
      { name: 'settler', type: 'address', indexed: true, internalType: 'address' },
      { name: 'value', type: 'bool', indexed: false, internalType: 'bool' },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'MigrationStarted',
    inputs: [
      { name: 'migrationId', type: 'bytes32', indexed: true, internalType: 'bytes32' },
      { name: 'positionId', type: 'uint256', indexed: true, internalType: 'uint256' },
      { name: 'chainId', type: 'uint256', indexed: true, internalType: 'uint256' },
      { name: 'settler', type: 'address', indexed: false, internalType: 'address' },
      { name: 'mode', type: 'uint8', indexed: false, internalType: 'MigrationMode' },
      { name: 'sender', type: 'address', indexed: false, internalType: 'address' },
      { name: 'token', type: 'address', indexed: false, internalType: 'address' },
      { name: 'amount', type: 'uint256', indexed: false, internalType: 'uint256' },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'OwnershipTransferred',
    inputs: [
      { name: 'previousOwner', type: 'address', indexed: true, internalType: 'address' },
      { name: 'newOwner', type: 'address', indexed: true, internalType: 'address' },
    ],
    anonymous: false,
  },
  {
    type: 'error',
    name: 'AmountTooLow',
    inputs: [
      { name: 'amount', type: 'uint256', internalType: 'uint256' },
      { name: 'amountMin', type: 'uint256', internalType: 'uint256' },
    ],
  },
  {
    type: 'error',
    name: 'ChainSettlerNotSupported',
    inputs: [
      { name: 'chainId', type: 'uint256', internalType: 'uint256' },
      { name: 'settler', type: 'address', internalType: 'address' },
    ],
  },
  { type: 'error', name: 'ChainSettlersParamsLengthMismatch', inputs: [] },
  { type: 'error', name: 'MissingTokenRoutes', inputs: [] },
  { type: 'error', name: 'OwnableInvalidOwner', inputs: [{ name: 'owner', type: 'address', internalType: 'address' }] },
  {
    type: 'error',
    name: 'OwnableUnauthorizedAccount',
    inputs: [{ name: 'account', type: 'address', internalType: 'address' }],
  },
  {
    type: 'error',
    name: 'TokenAndRouteMismatch',
    inputs: [{ name: 'token', type: 'address', internalType: 'address' }],
  },
  {
    type: 'error',
    name: 'TokensAndRoutesMismatch',
    inputs: [
      { name: 'token0', type: 'address', internalType: 'address' },
      { name: 'token1', type: 'address', internalType: 'address' },
    ],
  },
  { type: 'error', name: 'TooManyTokenRoutes', inputs: [] },
];
