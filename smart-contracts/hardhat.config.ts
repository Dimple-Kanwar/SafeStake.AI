import { HardhatUserConfig, configVariable } from "hardhat/config";
import hardhatToolboxViemPlugin from "@nomicfoundation/hardhat-toolbox-viem";
import hardhatViem from "@nomicfoundation/hardhat-viem";

const config: HardhatUserConfig = {
  plugins: [hardhatToolboxViemPlugin, hardhatViem],
  solidity: {
    profiles: {
      default: {
        version: "0.8.28",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
          viaIR: true, // Fixes stack too deep
        },
      },
      production: {
        version: "0.8.28",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
        // viaIR: true,
      },
    },
  },
  networks: {
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1",
    },
    hardhatOp: {
      type: "edr-simulated",
      chainType: "op",
    },
    sepolia: {
      type: "http",
      chainType: "l1",
      url: configVariable("SEPOLIA_RPC_URL"),
      accounts: [configVariable("SEPOLIA_PRIVATE_KEY")],
    },
    hedera_testnet: {
      type: "http",
      url:
        process.env.HEDERA_TESTNET_RPC_URL ||
        configVariable("HEDERA_TESTNET_RPC_URL") ||
        "",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 296,
    },
    arbitrum_sepolia: {
      type: "http",
      url:
        process.env.ARBITRUM_SEPOLIA_RPC_URL ||
        configVariable("ARBITRUM_SEPOLIA_RPC_URL") ||
        "",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 421614,
    },
    base_sepolia: {
      type: "http",
      url:
        process.env.BASE_SEPOLIA_RPC_URL ||
        configVariable("BASE_SEPOLIA_RPC_URL") ||
        "",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 84532,
    },
  },
  // etherscan: {
  //   apiKey: {
  //     sepolia: process.env.ETHERSCAN_API_KEY || "",
  //     polygonAmoy: process.env.POLYGONSCAN_API_KEY || "",
  //     arbitrumSepolia: process.env.ARBISCAN_API_KEY || "",
  //     baseSepolia: process.env.BASESCAN_API_KEY || "",
  //   },
  // },
  // typechain: {
  //   outDir: "typechain-types",
  //   target: "ethers-v6",
  // },
  paths:{
    tests: "./test",
    artifacts: "./artifacts",
    cache: "./cache",
    ignition: "./ignition"
  }
};

export default config;
