import type { Abi, PublicClient } from 'viem';
import type { Chain } from 'viem/chains';
import { mainnet, base, arbitrum, unichain, sepolia, baseSepolia, arbitrumSepolia, unichainSepolia } from 'viem/chains';
// import { NFTPositionManagerABI } from './abis/NFTPositionManager';
// import { v3NFTPositionManagerABI } from './abis/v3NFTPositionManager';
import QuoterV2 from '@uniswap/v3-periphery/artifacts/contracts/lens/QuoterV2.sol/QuoterV2.json';
import NonfungiblePositionManager from '@uniswap/v3-periphery/artifacts/contracts/NonfungiblePositionManager.sol/NonfungiblePositionManager.json';
import { v4PositionManagerAbi } from './abis/v4PositionManager';
import { stateViewAbi } from './abis/v4StateView';

type Contract = {
  address: `0x${string}`;
  abi: Abi;
};

export type ChainConfig = {
  // chain basics
  chainId: number,
  testnet: boolean,
  chain: Chain,
  publicClient?: PublicClient,

  // v3
  v3FactoryAddress: `0x${string}`,
  v3NftPositionManagerContract: Contract,

  // v4
  v4PositionManagerContract?: Contract,
  v4StateViewContract?: Contract,
  subgraphURL?: string,

  // other
  quoterV2Contract: Contract,
  multicallAddress?: `0x${string}`

  // Across
  spokePoolAddress: `0x${string}`,

  // tokens
  wethAddress: `0x${string}`,
  usdcAddress: `0x${string}`,

  // Hopper
  AcrossV3Migrator?: `0x${string}`
  AcrossV3Settler?: `0x${string}`

}

const multicallAddress = '0xcA11bde05977b3631167028862bE2a173976CA11';
export const chainConfigList: Record<number, ChainConfig> = {
  // mainnets
  1: {
    chainId: 1,
    testnet: false,
    chain: mainnet,
    v3FactoryAddress: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
    v3NftPositionManagerContract: {
      address: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
      abi: NonfungiblePositionManager.abi as Abi,
    },
    quoterV2Contract: {
      address: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e", 
      abi: QuoterV2.abi as Abi,
    },
    spokePoolAddress: '0x5c7BCd6E7De5423a257D81B442095A1a6ced35C5',
    multicallAddress,
    wethAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    usdcAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    
  },
  8453: {
    chainId: 8453,
    testnet: false,
    chain: base,
    v3FactoryAddress: "0x33128a8fC17869897dcE68Ed026d694621f6FDfD",
    v3NftPositionManagerContract: {
      address: "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1",
      abi: NonfungiblePositionManager.abi as Abi,
    },
    quoterV2Contract: {
      address: "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a", 
      abi: QuoterV2.abi as Abi,
    },
    spokePoolAddress: '0x09aea4b2242abC8bb4BB78D537A67a245A7bEC64',
    multicallAddress,
    wethAddress: '0x4200000000000000000000000000000000000006',
    usdcAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    AcrossV3Migrator: '0xDB87A6AB3720CB45857d0b3dA8f53089C918a42a',
    AcrossV3Settler: '0x691F0E6833362c9B96c0292bcd5Ce74f46300786',
  },
  42161: {
    chainId: 42161,
    testnet: false,
    chain: arbitrum,
    v3FactoryAddress: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
    v3NftPositionManagerContract: {
      address: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
      abi: NonfungiblePositionManager.abi as Abi,
    },
    quoterV2Contract: {
      address: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e", 
      abi: QuoterV2.abi as Abi,
    },
    // v4
    v4PositionManagerContract: {
      address: "0xd88f38f930b7952f2db2432cb002e7abbf3dd869",
      abi: v4PositionManagerAbi as Abi,
    },
    v4StateViewContract: {
      address: "0x76fd297e2d437cd7f76d50f01afe6160f86e9990",
      abi: stateViewAbi as Abi,
    },
    subgraphURL: 'https://subgraph.satsuma-prod.com/f90b74a29c42/gabors-team--257999/Uniswap-v4-transfers-arb-one/api',
    spokePoolAddress: '0xe35e9842fceaCA96570B734083f4a58e8F7C5f2A',
    multicallAddress,
    wethAddress: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    usdcAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',


    // Hopper
    AcrossV3Migrator: '0xb2EA372b51e83092302dFD46B7eD41C6E877a98B',
    AcrossV3Settler: '0xD5C28d7932F44d2edD9fA6E62bc827B9aa543978'
  },
  130: {
    chainId: 130,
    testnet: false,
    chain: unichain,
    v3FactoryAddress: "0x1f98400000000000000000000000000000000003",
    v3NftPositionManagerContract: {
      address: "0x943e6e07a7e8e791dafc44083e54041d743c46e9",
      abi: NonfungiblePositionManager.abi as Abi,
    },
    quoterV2Contract: {
      address: "0x385a5cf5f83e99f7bb2852b6a19c3538b9fa7658", 
      abi: QuoterV2.abi as Abi,
    },
    spokePoolAddress: '0x09aea4b2242abC8bb4BB78D537A67a245A7bEC64',
    multicallAddress,
    wethAddress: '0x4200000000000000000000000000000000000006',
    usdcAddress: '0x078d782b760474a361dda0af3839290b0ef57ad6',
    AcrossV3Migrator: '0x56b5E12AFbbBA6dbCB20eD6001009Ffb8d96bD1e',
    AcrossV3Settler: '0x402C0C0458C04A2D0996d0ED8a06D4b2A5D92336'
  },
  // testnets
  11155111: {
    chainId: 11155111,
    testnet: true,
    chain: sepolia,
    v3FactoryAddress: "0x0227628f3F023bb0B980b67D528571c95c6DaC1c",
    v3NftPositionManagerContract: {
      address: "0x1238536071E1c677A632429e3655c799b22cDA52",
      abi: NonfungiblePositionManager.abi as Abi,
    },
    quoterV2Contract: {
      address: "0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3", 
      abi: QuoterV2.abi as Abi,
    },
    spokePoolAddress: '0x5ef6C01E11889d86803e0B23e3cB3F9E9d97B662',
    multicallAddress,
    wethAddress: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
    usdcAddress: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
  },
  84532: {
    chainId: 84532,
    testnet: true,
    chain: baseSepolia,
    v3FactoryAddress: "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24",
    v3NftPositionManagerContract: {
      address: "0x27F971cb582BF9E50F397e4d29a5C7A34f11faA2",
      abi: NonfungiblePositionManager.abi as Abi,
    },
    quoterV2Contract: {
      address: "0xC5290058841028F1614F3A6F0F5816cAd0df5E27", 
      abi: QuoterV2.abi as Abi,
    },
    spokePoolAddress: '0x82B564983aE7274c86695917BBf8C99ECb6F0F8F',
    multicallAddress,
    wethAddress: '0x4200000000000000000000000000000000000006',
    usdcAddress: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  },
  421614: {
    chainId: 421614,
    testnet: true,
    chain: arbitrumSepolia,
    v3FactoryAddress: "0x248AB79Bbb9bC29bB72f7Cd42F17e054Fc40188e",
    v3NftPositionManagerContract: {
      address: "0x6b2937Bde17889EDCf8fbD8dE31C3C2a70Bc4d65",
      abi: NonfungiblePositionManager.abi as Abi,
    },
    quoterV2Contract: {
      address: "0x2779a0CC1c3e0E44D2542EC3e79e3864Ae93Ef0B", 
      abi: QuoterV2.abi as Abi,
    },
    spokePoolAddress: '0x7E63A5f1a8F0B4d0934B2f2327DAED3F6bb2ee75',
    multicallAddress,
    wethAddress: '0x980B62Da83eFf3D4576C647993b0c1D7faf17c73',
    usdcAddress: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
  },
  1301: {
    chainId: 1301,
    testnet: true,
    chain: unichainSepolia,
    v3FactoryAddress: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
    v3NftPositionManagerContract: {
      address: "0xB7F724d6dDDFd008eFf5cc2834edDE5F9eF0d075",
      abi: NonfungiblePositionManager.abi as Abi,
    },
    quoterV2Contract: {
      address: "0x6Dd37329A1A225a6Fca658265D460423DCafBF89", 
      abi: QuoterV2.abi as Abi,
    },
    spokePoolAddress: '0x0000000000000000000000000000000000000000', // TODO: need to deploy on Unichain sepolia
    multicallAddress,
    wethAddress: '0x4200000000000000000000000000000000000006',
    usdcAddress: '0x31d0220469e10c4E71834a79b1f276d740d3768F',
  }
}