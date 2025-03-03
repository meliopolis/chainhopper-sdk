import { AcrossClient } from "@across-protocol/app-sdk";
import { chainConfigList } from "../chains";

export const acrossClient = ({testnet}: {testnet: boolean}) => {

  // fetch chains from chainConfigList
  const testnets = Object.values(chainConfigList).map((chain) => chain).filter((chain) => chain.testnet).map(c => c.chain);
  const mainnets = Object.values(chainConfigList).map((chain) => chain).filter((chain) => !chain.testnet).map(c => c.chain);
  const chains = testnet ? testnets : mainnets;
  // TODO: known bug, across client can't switch from testnet to mainnet
  const client = AcrossClient.create({
    integratorId: "0xdead", // 2-byte hex string
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
}