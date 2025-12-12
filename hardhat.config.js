import { config } from 'dotenv';
config();

/** @type import('hardhat/config').HardhatUserConfig */
export default {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
    },
  },
  networks: {
    qieMainnet: {
      url: process.env.QIE_RPC_URL_1 || "https://rpc1mainnet.qie.digital/",
      chainId: parseInt(process.env.QIE_CHAIN_ID || "1990"),
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
      gasPrice: 20000000000, // 20 gwei (adjust as needed)
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  etherscan: {
    apiKey: {
      qieMainnet: "your-api-key-here", // If QIE has an API key for verification
    },
    customChains: [
      {
        network: "qieMainnet",
        chainId: parseInt(process.env.QIE_CHAIN_ID || "1990"),
        urls: {
          apiURL: `${process.env.QIE_BLOCK_EXPLORER}/api`,
          browserURL: process.env.QIE_BLOCK_EXPLORER || "https://mainnet.qie.digital/",
        },
      },
    ],
  },
};
