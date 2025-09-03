export enum Protocol {
  UniswapV3 = 'UniswapV3',
  UniswapV4 = 'UniswapV4',
  Aerodrome = 'Aerodrome',
}

export enum MigrationMethod {
  SingleToken = 'SingleToken',
  DualToken = 'DualToken',
}

export enum BridgeType {
  Across = 'Across',
  Direct = 'Direct',
}

export const DEFAULT_SLIPPAGE_IN_BPS = 100; // 1%
export const DEFAULT_FILL_DEADLINE_OFFSET = 3000; // in seconds

export const NATIVE_ETH_ADDRESS = '0x0000000000000000000000000000000000000000';
