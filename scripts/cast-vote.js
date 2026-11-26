import { network } from "hardhat";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Retrieves the deployed Voting contract address from existing deployment sources.
 * Checks:
 * 1. VOTING_CONTRACT_ADDRESS environment variable
 * 2. Ignition deployment artifact: ignition/deployments/chain-31337/deployed_addresses.json
 * 3. Frontend configuration file: frontend/src/contracts/contractConfig.js
 */
async function getDeployedAddress() {
  // 1. Check environment variable
  if (process.env.VOTING_CONTRACT_ADDRESS) {
    return process.env.VOTING_CONTRACT_ADDRESS.trim();
  }

  // 2. Check Ignition deployment file for chain 31337 (localhost)
  const deployedAddressesPath = path.resolve(
    process.cwd(),
    "ignition/deployments/chain-31337/deployed_addresses.json"
  );

  if (fs.existsSync(deployedAddressesPath)) {
    try {
      const content = fs.readFileSync(deployedAddressesPath, "utf-8");
      const addresses = JSON.parse(content);
      if (addresses["VotingModule#Voting"]) {
        return addresses["VotingModule#Voting"];
      }
    } catch (err) {
      console.warn("Warning: Could not parse deployed_addresses.json:", err);
    }
  }

  // 3. Fallback to frontend contract config if present
  const frontendConfigPath = path.resolve(
    process.cwd(),
    "frontend/src/contracts/contractConfig.js"
  );
  if (fs.existsSync(frontendConfigPath)) {
    try {
      const content = fs.readFileSync(frontendConfigPath, "utf-8");
      const match = content.match(/CONTRACT_ADDRESS\s*=\s*["'](0x[a-fA-F0-9]{40})["']/);
      if (match) {
        return match[1];
      }
    } catch {
      // Ignore fallback read error
    }
  }

  return null;
}

async function main() {
  console.log("==========================================");
  console.log("  Ethereum Voting DApp — CLI Vote Script  ");
  console.log("==========================================");

  // 1. Resolve deployed contract address
  const contractAddress = await getDeployedAddress();
  if (!contractAddress) {
    console.error("[ERROR] Could not find deployed Voting contract address.");
    console.error("Checked sources:");
    console.error("  - Environment variable: VOTING_CONTRACT_ADDRESS");
    console.error("  - Ignition artifact: ignition/deployments/chain-31337/deployed_addresses.json");
    console.error("  - Frontend config: frontend/src/contracts/contractConfig.js");
    process.exitCode = 1;
    return;
  }

  // 2. Connect to network
  const connection = await network.create();
  const { ethers } = connection;

  // Verify bytecode at contract address
  const code = await ethers.provider.getCode(contractAddress);
  if (code === "0x") {
    console.error(`[ERROR] No contract bytecode found at address ${contractAddress}.`);
    console.error("Please verify the local Hardhat node is running and the contract is deployed.");
    process.exitCode = 1;
    return;
  }

  console.log(`Connected to Voting contract at: ${contractAddress}`);

  // 3. Select test account index 2 (third account)
  const signers = await ethers.getSigners();
  if (signers.length < 3) {
    console.error(`[ERROR] Insufficient signers available: expected at least 3, got ${signers.length}`);
    process.exitCode = 1;
    return;
  }

  const voterIndex = 2;
  const voter = signers[voterIndex];
  console.log(`Voting Account [Index ${voterIndex}]: ${voter.address}`);

  // Connect contract with voter as signer
  const voting = await ethers.getContractAt("Voting", contractAddress, voter);

  // 4. Check if account has already voted
  const alreadyVoted = await voting.hasVoted(voter.address);
  console.log(`Initial hasVoted status: ${alreadyVoted}`);

  if (alreadyVoted) {
    console.log(`[INFO] Account ${voter.address} has already voted. Exiting gracefully without submitting a transaction.`);
    return;
  }

  // 5. Read and display Alice's vote count before voting
  const candidateId = 1; // Alice
  const candidateBefore = await voting.candidates(candidateId);
  console.log(`\nCandidate #${candidateId} (${candidateBefore.name}) vote count before voting: ${candidateBefore.voteCount.toString()}`);

  // 6. Submit vote(1) for Alice
  console.log(`\nSubmitting vote for Candidate #${candidateId} (${candidateBefore.name})...`);
  const tx = await voting.vote(candidateId);
  console.log(`Transaction submitted!`);
  console.log(`Transaction Hash : ${tx.hash}`);

  // 7. Wait for transaction confirmation
  console.log("Waiting for block confirmation...");
  const receipt = await tx.wait();

  // 8. Display transaction confirmation details
  console.log(`\n--- Transaction Receipt ---`);
  console.log(`Transaction Hash : ${receipt.hash}`);
  console.log(`Block Number     : ${receipt.blockNumber}`);
  console.log(`Status           : ${receipt.status === 1 ? "1 (Confirmed / Success)" : `${receipt.status} (Failed)`}`);
  console.log(`Gas Used         : ${receipt.gasUsed.toString()}`);

  if (receipt.status !== 1) {
    console.error("[ERROR] Transaction execution failed on-chain.");
    process.exitCode = 1;
    return;
  }

  // 9. Read and display Alice's updated vote count
  const candidateAfter = await voting.candidates(candidateId);
  console.log(`\nCandidate #${candidateId} (${candidateAfter.name}) updated vote count: ${candidateAfter.voteCount.toString()}`);

  // 10. Confirm that hasVoted is now true
  const hasVotedAfter = await voting.hasVoted(voter.address);
  console.log(`Account ${voter.address} hasVoted confirmation: ${hasVotedAfter}`);

  if (!hasVotedAfter) {
    console.error("[ERROR] Verification failed: hasVoted is still false after confirmation.");
    process.exitCode = 1;
    return;
  }

  console.log("\n[SUCCESS] Vote successfully cast and verified on localhost!");
}

main().catch((error) => {
  console.error("[FATAL] An unexpected error occurred:", error);
  process.exitCode = 1;
});
