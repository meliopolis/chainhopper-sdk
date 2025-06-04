import { type Quote, AcrossClient } from '@across-protocol/app-sdk';
import { type ChainConfig, chainConfigs } from '../chains';
import { resolveSettler } from '../utils/helpers';
import type { Protocol } from '@/utils/constants';

const acrossClient = ({ testnet }: { testnet: boolean }): AcrossClient => {
  // fetch chains from chainConfigs
  const testnets = Object.values(chainConfigs)
    .map((chain) => chain)
    .filter((chain) => chain.testnet)
    .map((c) => c.chain);
  const mainnets = Object.values(chainConfigs)
    .map((chain) => chain)
    .filter((chain) => !chain.testnet)
    .map((c) => c.chain);
  const chains = testnet ? testnets : mainnets;
  const client = AcrossClient.create({
    integratorId: '0xdead', // 2-byte hex string
    chains,
    useTestnet: testnet,

    // logger: {
    //   debug: (...args) => console.log(...args),
    //   info: (...args) => console.log(...args),
    //   warn: (...args) => console.log(...args),
    //   error: (...args) => console.log(...args),
    // },
    // logLevel: "DEBUG",
  });
  return client;
};

export const getAcrossQuote = async (
  sourceChainConfig: ChainConfig,
  destinationChainConfig: ChainConfig,
  inputTokenAddress: `0x${string}`,
  inputTokenAmount: bigint,
  outputTokenAddress: `0x${string}`,
  protocol: Protocol,
  interimMessageForSettler: `0x${string}`
): Promise<Quote> => {
  return await acrossClient({ testnet: sourceChainConfig.testnet }).getQuote({
    route: {
      originChainId: sourceChainConfig.chainId,
      destinationChainId: destinationChainConfig.chainId,
      inputToken: inputTokenAddress,
      outputToken: outputTokenAddress,
    },
    inputAmount: inputTokenAmount,
    recipient: resolveSettler(protocol, destinationChainConfig),
    crossChainMessage: interimMessageForSettler,
  });
};
