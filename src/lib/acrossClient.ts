import { AcrossClient } from '@across-protocol/app-sdk';
import { chainConfigs } from '../chains';

export const acrossClient = ({ testnet }: { testnet: boolean }): AcrossClient => {
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
