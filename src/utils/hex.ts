import { isHex, size } from 'viem';

export const isBytes32 = (value: unknown): boolean => {
  return typeof value === 'string' && isHex(value, { strict: true }) && size(value) === 32;
};

export const assertBytes32 = (value: unknown): boolean => {
  if (!isBytes32(value)) throw new Error('Expected 0x-prefixed 32-byte hex string (bytes32).');
  return true;
};
