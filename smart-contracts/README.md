# Smart  Contracts using Hardhat 3 Beta Project (`node:test` and `viem`)

This includes production-ready smart contracts, comprehensive testing suite, and multi-network deployment scripts using Hardhat 3.0+.

## Smart Contracts List

The protocol implements a modular smart contract system built with Hardhat:

### CollateralManager Contract
    
- Manages cross-chain collateral deposits and conversions with sophisticated risk management:
- 150% minimum collateralization ratio for market volatility protection
- 130% liquidation threshold to prevent undercollateralized positions
- Real-time asset valuation using Pyth price feeds
- Multi-token collateral support across different blockchains

### StakingProxy Contract

- Handles staking operations on behalf of users:
- Synthetic staking position management
- Automated reward distribution and compounding
- Liquid staking token issuance (ccstETH, ccstBTC, etc.)
- Integration with major staking protocols

### BridgeCoordinator Contract

- Orchestrates cross-chain operations using Avail Nexus SDK:
- Bridge and execute functionality for seamless user experience
- Transaction batching for gas optimization
- Multi-signature validation for enhanced security
- Fallback mechanisms for failed bridge operations

### AIAgentController contract

 - Complete AI agent authorization framework with role management, rate limiting, and request handling for ASI Alliance Prize compliance

## Usage

### Running Tests

To run all the tests in the project, execute the following command:

```shell
npx hardhat test
```

You can also selectively run the Solidity or `node:test` tests:

```shell
npx hardhat test solidity
npx hardhat test nodejs
```

### Make a deployment to Sepolia

This project includes an example Ignition module to deploy the contract. You can deploy this module to a locally simulated chain or to Sepolia.

To run the deployment to a local chain:

```shell
npx hardhat ignition deploy ignition/modules/Counter.ts
```

To run the deployment to Sepolia, you need an account with funds to send the transaction. The provided Hardhat configuration includes a Configuration Variable called `SEPOLIA_PRIVATE_KEY`, which you can use to set the private key of the account you want to use.

You can set the `SEPOLIA_PRIVATE_KEY` variable using the `hardhat-keystore` plugin or by setting it as an environment variable.

To set the `SEPOLIA_PRIVATE_KEY` config variable using `hardhat-keystore`:

```shell
npx hardhat keystore set SEPOLIA_PRIVATE_KEY
```

After setting the variable, you can run the deployment with the Sepolia network:

```shell
npx hardhat ignition deploy --network sepolia ignition/modules/Counter.ts
```
