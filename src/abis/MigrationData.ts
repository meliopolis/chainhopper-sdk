export const RoutesDataAbi = [
  {
    name: 'token0',
    internalType: 'address',
    type: 'address',
  },
  {
    name: 'token1',
    internalType: 'address',
    type: 'address',
  },
  {
    name: 'amount0Min',
    internalType: 'uint256',
    type: 'uint256',
  },
  {
    name: 'amount1Min',
    internalType: 'uint256',
    type: 'uint256',
  },
];

export const MigrationDataComponentsAbi = [
  {
    name: 'sourceChainId',
    internalType: 'uint256',
    type: 'uint256',
  },
  {
    name: 'migrator',
    internalType: 'address',
    type: 'address',
  },
  {
    name: 'nonce',
    internalType: 'uint256',
    type: 'uint256',
  },
  {
    name: 'mode',
    internalType: 'MigrationMode',
    type: 'uint8',
  },
  {
    name: 'routesData',
    internalType: 'bytes',
    type: 'bytes',
  },
  {
    name: 'settlementData',
    internalType: 'bytes',
    type: 'bytes',
  },
];

export const MigrationDataAbi = [
  {
    name: 'MigrationData',
    type: 'tuple',
    components: MigrationDataComponentsAbi,
  },
];
