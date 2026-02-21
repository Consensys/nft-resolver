import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-verify";

import * as dotenv from "dotenv";

dotenv.config();

const deployer =
  process.env.DEPLOYER_PRIVATE_KEY ||
  "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

const config: HardhatUserConfig = {
  solidity: "0.8.25",

  networks: {
    sepolia: {
      url: `https://sepolia.infura.io/v3/${process.env.INFURA_API_KEY}`,
      chainId: 11155111,
      accounts: [deployer],
    },
    lineaSepolia: {
      url: `https://linea-sepolia.infura.io/v3/${process.env.INFURA_API_KEY}`,
      chainId: 59141,
      accounts: [deployer],
    },
    mainnet: {
      url: `https://mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`,
      chainId: 1,
      accounts: [deployer],
    },
    lineaMainnet: {
      url: `https://linea-mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`,
      chainId: 59144,
      accounts: [deployer],
    },
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY ?? "",
    customChains: [
      {
        network: "sepolia",
        chainId: 11155111,
        urls: {
          apiURL: "https://api.etherscan.io/v2/api?chainid=11155111",
          browserURL: "https://sepolia.etherscan.io",
        },
      },
      {
        network: "mainnet",
        chainId: 1,
        urls: {
          apiURL: "https://api.etherscan.io/v2/api?chainid=1",
          browserURL: "https://etherscan.io",
        },
      },
    ],
  },
};

export default config;
