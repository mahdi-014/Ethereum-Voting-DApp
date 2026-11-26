import { network } from "hardhat";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Deploys a fresh Voting contract on the already-running localhost Hardhat node
 * using the last test account (index 19) so voter accounts (#0, #1, #2, ...) keep
 * their exact nonces in MetaMask without requiring "Clear activity tab data".
 *
 * Also updates frontend/src/contracts/contractConfig.js and
 * ignition/deployments/chain-31337/deployed_addresses.json so the UI and scripts
 * immediately point to the fresh 0-vote contract.
 */
async function main() {
  const { ethers } = await network.create();
  const signers = await ethers.getSigners();
  const deployer = signers[signers.length - 1];

  console.log(`Deploying fresh Voting contract using Account #${signers.length - 1}: ${deployer.address}`);

  const VotingFactory = await ethers.getContractFactory("Voting", deployer);
  const voting = await VotingFactory.deploy();
  await voting.waitForDeployment();

  const newAddress = await voting.getAddress();
  console.log(`Fresh Voting contract deployed at: ${newAddress}`);

  const tx1 = await voting.addCandidate("Alice");
  await tx1.wait();
  const tx2 = await voting.addCandidate("Bob");
  await tx2.wait();
  console.log("Initialized candidates: Alice (#1, 0 votes) and Bob (#2, 0 votes)");

  // Sync frontend contractConfig.js (Vite HMR updates the open UI automatically)
  const frontendConfigPath = path.resolve(
    process.cwd(),
    "frontend/src/contracts/contractConfig.js"
  );
  const configContent = `export const CONTRACT_ADDRESS = "${newAddress}";
export const CHAIN_ID = 31337;
export const RPC_URL = "http://127.0.0.1:8545";

export default {
  CONTRACT_ADDRESS,
  CHAIN_ID,
  RPC_URL,
};
`;
  fs.writeFileSync(frontendConfigPath, configContent, "utf-8");
  console.log(`Updated ${frontendConfigPath}`);

  // Sync Ignition deployed_addresses.json so CLI scripts stay aligned
  const deployedAddressesPath = path.resolve(
    process.cwd(),
    "ignition/deployments/chain-31337/deployed_addresses.json"
  );
  fs.mkdirSync(path.dirname(deployedAddressesPath), { recursive: true });
  fs.writeFileSync(
    deployedAddressesPath,
    JSON.stringify({ "VotingModule#Voting": newAddress }, null, 2) + "\n",
    "utf-8"
  );
  console.log(`Updated ${deployedAddressesPath}`);

  console.log("\n[SUCCESS] Votes reset to 0 / 0 without restarting the node or clearing MetaMask!");
}

main().catch((error) => {
  console.error("[ERROR] Failed to reset voting contract:", error);
  process.exitCode = 1;
});
