import { erc20Abi } from 'viem';
import { type ChainConfig } from '../chains';
import { Ether, Token, type Currency } from '@uniswap/sdk-core';
import { NATIVE_ETH_ADDRESS } from '../utils/constants';

export const getTokens = async (chainConfig: ChainConfig, tokenAddresses: `0x${string}`[]): Promise<Currency[]> => {
  const tokens = await chainConfig.publicClient?.multicall({
    contracts: tokenAddresses
      .filter((tokenAddress) => tokenAddress !== NATIVE_ETH_ADDRESS)
      .map((tokenAddress) => [
        {
          address: tokenAddress,
          abi: erc20Abi,
          functionName: 'name',
        },
        {
          address: tokenAddress,
          abi: erc20Abi,
          functionName: 'symbol',
        },
        {
          address: tokenAddress,
          abi: erc20Abi,
          functionName: 'decimals',
        },
      ])
      .flat(),
  });
  // check that all were successful
  if (tokens?.some((token) => token.status !== 'success')) {
    throw new Error('Failed to get token');
  }
  // now split the tokens into sets of 3
  const nativeTokens = tokenAddresses.filter((tokenAddress) => tokenAddress === NATIVE_ETH_ADDRESS).map(() => Ether.onChain(chainConfig.chainId));
  return [
    ...nativeTokens,
    ...tokenAddresses
      .filter((tokenAddress) => tokenAddress !== NATIVE_ETH_ADDRESS)
      .map((tokenAddress, index) => {
        return new Token(
          chainConfig.chainId,
          tokenAddress, // address
          tokens?.[index * 3 + 2].result as number, // decimals
          tokens?.[index * 3 + 1].result as string, // symbol
          tokens?.[index * 3].result as string // name
        );
      }),
  ];
};
