/**
 * Deploy AaveHFReactive to the Reactive Network (Kopli testnet).
 *
 * Usage:
 *   npx hardhat run scripts/deploy-reactive.ts --network kopli
 *
 * Prerequisites:
 *   1. AaveHFCallback must be deployed on Base Sepolia.
 *      Set AAVE_HF_CALLBACK_ADDRESS in .env.
 *   2. CRON_TICKER_ADDRESS must be set (Kopli CRON ticker contract).
 *      Find it at: https://dev.reactive.network/docs/cron
 *   3. Deployer needs REACT tokens on Kopli.
 *      Faucet: https://kopli.reactscan.net/faucet
 *
 * After deployment, set in .env:
 *   AAVE_HF_REACTIVE_ADDRESS=0x...
 */

import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const balance = await deployer.provider.getBalance(deployer.address);
  console.log("Balance:", ethers.formatEther(balance), "REACT");

  // Validate prerequisites
  const callbackAddress = process.env.AAVE_HF_CALLBACK_ADDRESS;
  if (!callbackAddress || callbackAddress === "0x0000000000000000000000000000000000000000") {
    throw new Error(
      "AAVE_HF_CALLBACK_ADDRESS not set. Deploy AaveHFCallback first:\n" +
        "  npx hardhat run scripts/deploy-callback.ts --network base-sepolia"
    );
  }

  const cronTicker = process.env.CRON_TICKER_ADDRESS;
  if (!cronTicker || cronTicker === "0x0000000000000000000000000000000000000000") {
    throw new Error(
      "CRON_TICKER_ADDRESS not set in .env.\n" +
        "This is the Kopli CRON ticker contract address.\n" +
        "Find it at: https://dev.reactive.network/docs/cron"
    );
  }

  // Gas limit for runCycle() callback (configurable via env)
  const callbackGasLimit = parseInt(process.env.CALLBACK_GAS_LIMIT ?? "2000000", 10);

  // REACT to send as subscription fees (default: 0.5 REACT)
  const funding = ethers.parseEther(process.env.REACT_FUNDING_AMOUNT ?? "0.5");

  if (balance < funding) {
    throw new Error(
      `Need at least ${ethers.formatEther(funding)} REACT.\n` +
        "Faucet: https://kopli.reactscan.net/faucet"
    );
  }

  console.log("AaveHFCallback:", callbackAddress);
  console.log("CRON Ticker:", cronTicker);
  console.log("Callback gas limit:", callbackGasLimit);
  console.log("Funding:", ethers.formatEther(funding), "REACT");

  const Factory = await ethers.getContractFactory("AaveHFReactive");
  const contract = await Factory.deploy(callbackAddress, cronTicker, callbackGasLimit, {
    value: funding,
  });
  await contract.waitForDeployment();
  const address = await contract.getAddress();

  console.log("\nAaveHFReactive deployed:", address);
  console.log("\nSet in .env:");
  console.log(`AAVE_HF_REACTIVE_ADDRESS=${address}`);
  console.log(`\nhttps://kopli.reactscan.net/contracts/${address}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
