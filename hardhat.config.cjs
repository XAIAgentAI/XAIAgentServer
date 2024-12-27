require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    dbcTestnet: {
      url: process.env.DBC_RPC_URL || "https://rpc-testnet.dbcwallet.io",
      chainId: 19880818,
      accounts: [process.env.PRIVATE_KEY || "15ed9810f64dc30002a26def833fdda5006ef5ae51553c9d83e1644b295fa321"],
      gasPrice: 10000000000  // 10 gwei
    },
    hardhat: {
      chainId: 31337
    }
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  }
};
