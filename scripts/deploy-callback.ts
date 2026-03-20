/**
 * Deploy AaveHFCallback to Base Sepolia.
 *
 * Usage:
 *   npx hardhat run scripts/deploy-callback.ts --network base-sepolia
 *
 * Prerequisites:
 *   REACTIVE_NETWORK_SENDER must be set in .env (the relayer address on Base Sepolia
 *   that delivers Reactive Network callbacks).
 *   Find it at: https://dev.reactive.network/docs/callback-contracts
 *
 * After deployment, set in .env:
 *   AAVE_HF_CALLBACK_ADDRESS=0x...
 */

import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log(
    "Balance:",
    ethers.formatEther(await deployer.provider.getBalance(deployer.address)),
    "ETH"
  );

  const rnSender = process.env.REACTIVE_NETWORK_SENDER;
  if (!rnSender || rnSender === "0x0000000000000000000000000000000000000000") {
    throw new Error(
      "REACTIVE_NETWORK_SENDER not set.\n" +
        "This is the address that delivers RC callbacks on Base Sepolia.\n" +
        "Find it at: https://dev.reactive.network/docs/callback-contracts"
    );
  }

  console.log("Reactive Network Sender:", rnSender);

  const Factory = await ethers.getContractFactory("AaveHFCallback");
  const contract = await Factory.deploy(rnSender);
  await contract.waitForDeployment();
  const address = await contract.getAddress();

  console.log("\nAaveHFCallback deployed:", address);
  console.log("\nSet in .env:");
  console.log(`AAVE_HF_CALLBACK_ADDRESS=${address}`);
  console.log(`\nhttps://sepolia.basescan.org/address/${address}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
