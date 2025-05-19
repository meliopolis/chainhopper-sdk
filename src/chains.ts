import { zeroAddress, type Abi, type PublicClient } from 'viem';
import type { Chain } from 'viem/chains';
import {
  mainnet,
  base,
  arbitrum,
  unichain,
  sepolia,
  baseSepolia,
  arbitrumSepolia,
  unichainSepolia,
  optimism,
} from 'viem/chains';
import QuoterV2 from '@uniswap/v3-periphery/artifacts/contracts/lens/QuoterV2.sol/QuoterV2.json';
import NonfungiblePositionManager from '@uniswap/v3-periphery/artifacts/contracts/NonfungiblePositionManager.sol/NonfungiblePositionManager.json';
import { v4PositionManagerAbi } from './abis/v4PositionManager';
import { stateViewAbi } from './abis/v4StateView';
import { v4QuoterAbi } from './abis/v4Quoter';
import { v4DopplerQuoterAbi } from './abis/v4DopplerQuoter';

type Contract = {
  address: `0x${string}`;
  abi: Abi;
};

export type ChainConfig = {
  // chain basics
  chainId: number;
  testnet: boolean;
  chain: Chain;
  publicClient?: PublicClient;

  // v3
  v3FactoryAddress: `0x${string}`;
  v3NftPositionManagerContract: Contract;
  quoterV2Contract: Contract;

  // v4
  v4PositionManagerContract: Contract;
  v4StateViewContract: Contract;
  v4QuoterContract: Contract;
  v4DopplerQuoterContract?: Contract;

  // other
  multicallAddress: `0x${string}`;
  universalRouterAddress: `0x${string}`;
  permit2Address: `0x${string}`;

  // Across
  spokePoolAddress: `0x${string}`;

  // tokens
  wethAddress: `0x${string}`;
  usdcAddress: `0x${string}`;

  // chainhopper
  UniswapV3AcrossMigrator?: `0x${string}`;
  UniswapV3AcrossSettler?: `0x${string}`;
  UniswapV4AcrossMigrator?: `0x${string}`;
  UniswapV4AcrossSettler?: `0x${string}`;
};

const multicallAddress = '0xcA11bde05977b3631167028862bE2a173976CA11';
export const chainConfigs: Record<number, ChainConfig> = {
  // mainnets
  1: {
    chainId: 1,
    testnet: false,
    chain: mainnet,

    // v3
    v3FactoryAddress: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
    v3NftPositionManagerContract: {
      address: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
      abi: NonfungiblePositionManager.abi as Abi,
    },
    quoterV2Contract: {
      address: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
      abi: QuoterV2.abi as Abi,
    },
    // v4
    v4PositionManagerContract: {
      address: '0xbd216513d74c8cf14cf4747e6aaa6420ff64ee9e',
      abi: v4PositionManagerAbi as Abi,
    },
    v4StateViewContract: {
      address: '0x7ffe42c4a5deea5b0fec41c94c136cf115597227',
      abi: stateViewAbi as Abi,
    },
    v4QuoterContract: {
      address: '0x52f0e24d1c21c8a0cb1e5a5dd6198556bd9e1203',
      abi: v4QuoterAbi,
    },
    v4DopplerQuoterContract: {
      address: '0x56b5E12AFbbBA6dbCB20eD6001009Ffb8d96bD1e',
      abi: v4DopplerQuoterAbi,
    },
    // other
    spokePoolAddress: '0x5c7BCd6E7De5423a257D81B442095A1a6ced35C5',
    multicallAddress,
    universalRouterAddress: '0x66a9893cc07d91d95644aedd05d03f95e1dba8af',
    permit2Address: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
    wethAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    usdcAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    UniswapV3AcrossMigrator: '0x25821d96b689180790a8b3f3b3e1b715c0a37c09',
    UniswapV3AcrossSettler: '0xa0d4c0ad177caa71edad6750f28911b12a15360f',
    UniswapV4AcrossMigrator: '0x0000000000000000000000000000000000000000', // TODO: need to deploy and update
    UniswapV4AcrossSettler: '0x7d75cf20d9d623af4ef6839ace558a7811d6e613',
  },
  10: {
    chainId: 10,
    testnet: false,
    chain: optimism,
    v3FactoryAddress: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
    v3NftPositionManagerContract: {
      address: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
      abi: NonfungiblePositionManager.abi as Abi,
    },
    quoterV2Contract: {
      address: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
      abi: QuoterV2.abi as Abi,
    },
    // v4
    v4PositionManagerContract: {
      address: '0x3c3ea4b57a46241e54610e5f022e5c45859a1017',
      abi: v4PositionManagerAbi as Abi,
    },
    v4StateViewContract: {
      address: '0xc18a3169788f4f75a170290584eca6395c75ecdb',
      abi: stateViewAbi as Abi,
    },
    v4QuoterContract: {
      address: '0x1f3131a13296fb91c90870043742c3cdbff1a8d7',
      abi: v4QuoterAbi,
    },
    v4DopplerQuoterContract: {
      address: '0x543d49E9a2554704b0F0b150bb904fC1B06f8178',
      abi: v4DopplerQuoterAbi,
    },
    spokePoolAddress: '0xF383FD9A49282C9e1C99eB07a819e27E0d7B956c',
    multicallAddress,
    universalRouterAddress: '0x851116d9223fabed8e56c0e6b8ad0c31d98b3507',
    permit2Address: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
    wethAddress: '0x4200000000000000000000000000000000000006',
    usdcAddress: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
    UniswapV3AcrossMigrator: '0xb1fe7ddb2adf99fcd766f1f39050461c318fbff2',
    UniswapV3AcrossSettler: '0x3312a61e324a8c3360d67c767aa1b0381a94084a',
    UniswapV4AcrossMigrator: '0xbaa2d79b8d621ac7dbf09318993d3e537692cdc3',
    UniswapV4AcrossSettler: '0xe1d94593f86e515c93b1fda5728833796f934d70',
  },
  130: {
    chainId: 130,
    testnet: false,
    chain: unichain,
    v3FactoryAddress: '0x1f98400000000000000000000000000000000003',
    v3NftPositionManagerContract: {
      address: '0x943e6e07a7e8e791dafc44083e54041d743c46e9',
      abi: NonfungiblePositionManager.abi as Abi,
    },
    quoterV2Contract: {
      address: '0x385a5cf5f83e99f7bb2852b6a19c3538b9fa7658',
      abi: QuoterV2.abi as Abi,
    },
    // v4
    v4PositionManagerContract: {
      address: '0x4529a01c7a0410167c5740c487a8de60232617bf',
      abi: v4PositionManagerAbi as Abi,
    },
    v4StateViewContract: {
      address: '0x86e8631a016f9068c3f085faf484ee3f5fdee8f2',
      abi: stateViewAbi as Abi,
    },
    v4QuoterContract: {
      address: '0x333e3c607b141b18ff6de9f258db6e77fe7491e0',
      abi: v4QuoterAbi,
    },
    v4DopplerQuoterContract: {
      address: '0xB0230053e93d083BA4147B7c052485F096C52A91',
      abi: v4DopplerQuoterAbi,
    },
    spokePoolAddress: '0x09aea4b2242abC8bb4BB78D537A67a245A7bEC64',
    multicallAddress,
    universalRouterAddress: '0xef740bf23acae26f6492b10de645d6b98dc8eaf3',
    permit2Address: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
    wethAddress: '0x4200000000000000000000000000000000000006',
    usdcAddress: '0x078D782b760474a361dDA0AF3839290b0EF57AD6',
    UniswapV3AcrossMigrator: '0x570f172ed6eb3748db046c244710bf473cb8a912',
    UniswapV3AcrossSettler: '0xa20b26211322de80951b5fd0a6dc264179071b59',
    UniswapV4AcrossMigrator: '0x33edacc45919517ce2a857125d95452c0f9f7cb5',
    UniswapV4AcrossSettler: '0x4817139b45450482ad09a183fd540126f2e124cc',
  },
  8453: {
    chainId: 8453,
    testnet: false,
    chain: base,
    v3FactoryAddress: '0x33128a8fC17869897dcE68Ed026d694621f6FDfD',
    // v3
    v3NftPositionManagerContract: {
      address: '0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1',
      abi: NonfungiblePositionManager.abi as Abi,
    },
    quoterV2Contract: {
      address: '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a',
      abi: QuoterV2.abi as Abi,
    },
    // v4
    v4PositionManagerContract: {
      address: '0x7c5f5a4bbd8fd63184577525326123b519429bdc',
      abi: v4PositionManagerAbi as Abi,
    },
    v4StateViewContract: {
      address: '0xa3c0c9b65bad0b08107aa264b0f3db444b867a71',
      abi: stateViewAbi as Abi,
    },
    v4QuoterContract: {
      address: '0x0d5e0f971ed27fbff6c2837bf31316121532048d',
      abi: v4QuoterAbi,
    },
    v4DopplerQuoterContract: {
      address: '0x9fb6E4Cd3E52Ae6BBcedF32D6efFE8c26F894903',
      abi: v4DopplerQuoterAbi,
    },
    spokePoolAddress: '0x09aea4b2242abC8bb4BB78D537A67a245A7bEC64',
    multicallAddress,
    universalRouterAddress: '0x6ff5693b99212da76ad316178a184ab56d299b43',
    permit2Address: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
    wethAddress: '0x4200000000000000000000000000000000000006',
    usdcAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    UniswapV3AcrossMigrator: '0x31125eb26b95cf115bb5c76a417d67d43049608b',
    UniswapV3AcrossSettler: '0x2e298022e19e9070ca21c309bdf1763726d88e43',
    UniswapV4AcrossMigrator: '0xe327bf6f413340f083b5089eba933301b8d9b1a4',
    UniswapV4AcrossSettler: '0x12042053769bc618447ebe7030926678b24318fa',
  },
  42161: {
    chainId: 42161,
    testnet: false,
    chain: arbitrum,
    v3FactoryAddress: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
    v3NftPositionManagerContract: {
      address: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
      abi: NonfungiblePositionManager.abi as Abi,
    },
    quoterV2Contract: {
      address: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
      abi: QuoterV2.abi as Abi,
    },
    // v4
    v4PositionManagerContract: {
      address: '0xd88f38f930b7952f2db2432cb002e7abbf3dd869',
      abi: v4PositionManagerAbi as Abi,
    },
    v4StateViewContract: {
      address: '0x76fd297e2d437cd7f76d50f01afe6160f86e9990',
      abi: stateViewAbi as Abi,
    },
    v4QuoterContract: {
      address: '0x3972c00f7ed4885e145823eb7c655375d275a1c5',
      abi: v4QuoterAbi,
    },
    v4DopplerQuoterContract: {
      address: '0x2F7770BCaf7833eF857790FB7bc186180bb49942',
      abi: v4DopplerQuoterAbi,
    },
    spokePoolAddress: '0xe35e9842fceaCA96570B734083f4a58e8F7C5f2A',
    multicallAddress,
    universalRouterAddress: '0xa51afafe0263b40edaef0df8781ea9aa03e381a3',
    permit2Address: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
    wethAddress: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    usdcAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    UniswapV3AcrossMigrator: '0x84e13adc0843c83469897346afe3dd610a20c367',
    UniswapV3AcrossSettler: '0xfe6277fa46cb618a9f60b93a4b9491098e754776',
    UniswapV4AcrossMigrator: '0xc24cb63c456e2cbca850c2bb8b14a8d956ecdd1c',
    UniswapV4AcrossSettler: '0x4f0b98832f1ef09ba0223ab9df2206afa8cc80f9',
  },

  // testnets
  1301: {
    chainId: 1301,
    testnet: true,
    chain: unichainSepolia,
    v3FactoryAddress: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
    v3NftPositionManagerContract: {
      address: '0xB7F724d6dDDFd008eFf5cc2834edDE5F9eF0d075',
      abi: NonfungiblePositionManager.abi as Abi,
    },
    quoterV2Contract: {
      address: '0x6Dd37329A1A225a6Fca658265D460423DCafBF89',
      abi: QuoterV2.abi as Abi,
    },
    // v4
    v4PositionManagerContract: {
      address: '0xf969aee60879c54baaed9f3ed26147db216fd664',
      abi: v4PositionManagerAbi as Abi,
    },
    v4StateViewContract: {
      address: '0xc199f1072a74d4e905aba1a84d9a45e2546b6222',
      abi: stateViewAbi as Abi,
    },
    v4QuoterContract: {
      address: '0x56dcd40a3f2d466f48e7f48bdbe5cc9b92ae4472',
      abi: v4QuoterAbi,
    },
    spokePoolAddress: '0x0000000000000000000000000000000000000000', // TODO: need to deploy on Unichain sepolia
    multicallAddress,
    universalRouterAddress: '0xcA7577Afb670147c7b211C798B97118bd36058F3',
    permit2Address: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
    wethAddress: '0x4200000000000000000000000000000000000006',
    usdcAddress: '0x31d0220469e10c4E71834a79b1f276d740d3768F',
  },
  84532: {
    chainId: 84532,
    testnet: true,
    chain: baseSepolia,
    v3FactoryAddress: '0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24',
    v3NftPositionManagerContract: {
      address: '0x27F971cb582BF9E50F397e4d29a5C7A34f11faA2',
      abi: NonfungiblePositionManager.abi as Abi,
    },
    quoterV2Contract: {
      address: '0xC5290058841028F1614F3A6F0F5816cAd0df5E27',
      abi: QuoterV2.abi as Abi,
    },
    // v4
    v4PositionManagerContract: {
      address: '0x4b2c77d209d3405f41a037ec6c77f7f5b8e2ca80',
      abi: v4PositionManagerAbi as Abi,
    },
    v4StateViewContract: {
      address: '0x571291b572ed32ce6751a2cb2486ebee8defb9b4',
      abi: stateViewAbi as Abi,
    },
    v4QuoterContract: {
      address: '0x4a6513c898fe1b2d0e78d3b0e0a4a151589b1cba',
      abi: v4QuoterAbi,
    },
    spokePoolAddress: '0x82B564983aE7274c86695917BBf8C99ECb6F0F8F',
    multicallAddress,
    universalRouterAddress: '0x95273d871c8156636e114b63797d78D7E1720d81',
    permit2Address: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
    wethAddress: '0x4200000000000000000000000000000000000006',
    usdcAddress: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  },
  421614: {
    chainId: 421614,
    testnet: true,
    chain: arbitrumSepolia,
    v3FactoryAddress: '0x248AB79Bbb9bC29bB72f7Cd42F17e054Fc40188e',
    v3NftPositionManagerContract: {
      address: '0x6b2937Bde17889EDCf8fbD8dE31C3C2a70Bc4d65',
      abi: NonfungiblePositionManager.abi as Abi,
    },
    quoterV2Contract: {
      address: '0x2779a0CC1c3e0E44D2542EC3e79e3864Ae93Ef0B',
      abi: QuoterV2.abi as Abi,
    },
    // v4
    v4PositionManagerContract: {
      address: '0xAc631556d3d4019C95769033B5E719dD77124BAc',
      abi: v4PositionManagerAbi as Abi,
    },
    v4StateViewContract: {
      address: '0x9d467fa9062b6e9b1a46e26007ad82db116c67cb',
      abi: stateViewAbi as Abi,
    },
    v4QuoterContract: {
      address: '0x7de51022d70a725b508085468052e25e22b5c4c9',
      abi: v4QuoterAbi,
    },
    spokePoolAddress: '0x7E63A5f1a8F0B4d0934B2f2327DAED3F6bb2ee75',
    multicallAddress,
    universalRouterAddress: zeroAddress, // not deployed on this chain
    permit2Address: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
    wethAddress: '0x980B62Da83eFf3D4576C647993b0c1D7faf17c73',
    usdcAddress: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
  },
  11155111: {
    chainId: 11155111,
    testnet: true,
    chain: sepolia,
    v3FactoryAddress: '0x0227628f3F023bb0B980b67D528571c95c6DaC1c',
    v3NftPositionManagerContract: {
      address: '0x1238536071E1c677A632429e3655c799b22cDA52',
      abi: NonfungiblePositionManager.abi as Abi,
    },
    quoterV2Contract: {
      address: '0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3',
      abi: QuoterV2.abi as Abi,
    },
    // v4
    v4PositionManagerContract: {
      address: '0x429ba70129df741B2Ca2a85BC3A2a3328e5c09b4',
      abi: v4PositionManagerAbi as Abi,
    },
    v4StateViewContract: {
      address: '0xe1dd9c3fa50edb962e442f60dfbc432e24537e4c',
      abi: stateViewAbi as Abi,
    },
    v4QuoterContract: {
      address: '0x61b3f2011a92d183c7dbadbda940a7555ccf9227',
      abi: v4QuoterAbi,
    },
    spokePoolAddress: '0x5ef6C01E11889d86803e0B23e3cB3F9E9d97B662',
    multicallAddress,
    universalRouterAddress: '0x3a9d48ab9751398bbfa63ad67599bb04e4bdf98b',
    permit2Address: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
    wethAddress: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
    usdcAddress: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
  },
};
