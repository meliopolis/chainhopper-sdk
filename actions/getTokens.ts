import { erc20Abi, type Abi } from "viem";
import { type ChainConfig } from "../chains";
import { Token } from "@uniswap/sdk-core";

export const getTokens = async (chainConfig: ChainConfig, tokenAddresses: `0x${string}`[]) => {
  const tokens = await chainConfig.publicClient?.multicall({
    contracts: tokenAddresses.map((tokenAddress) => ([{
      address: tokenAddress,
      abi: erc20Abi,
      functionName: 'name',
    }, {
      address: tokenAddress,
      abi: erc20Abi,
      functionName: 'symbol',
    }, {
      address: tokenAddress,
      abi: erc20Abi,
      functionName: 'decimals',
    }])).flat(),
  });
  // check that all were successful
  if (tokens?.some((token) => token.status !== 'success')) {
    throw new Error('Failed to get token');
  }
  // now split the tokens into sets of 3
  return tokenAddresses?.map((tokenAddress, index) => new Token(
    chainConfig.chainId,
    tokenAddress, // address
    tokens?.[index * 3 + 2].result as number, // decimals
    tokens?.[index * 3 + 1].result as string, // symbol
    tokens?.[index * 3].result as string, // name
  ));
}