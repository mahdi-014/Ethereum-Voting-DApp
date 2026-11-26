import { network } from "hardhat";
import * as fs from "node:fs";
import * as path from "node:path";
import type { Voting } from "../types/ethers-contracts/index.js";

async function getDeployedAddress(): Promise<string | null> {
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
      const addresses = JSON.parse(content) as Record<string, string>;
      if (addresses["VotingModule#Voting"]) {
        return addresses["VotingModule#Voting"];
      }
    } catch (err) {
      console.warn("Could not read deployed_addresses.json:", err);
    }
  }

  return null;
}

async function main() {
  console.log("=== Voting Contract Verification ===");

  const contractAddress = await getDeployedAddress();

  if (!contractAddress) {
    console.log(
      "\n[INFO] No deployment information found.\n" +
      "Checked sources:\n" +
      "  - Environment variable: VOTING_CONTRACT_ADDRESS\n" +
      "  - Ignition artifact: ignition/deployments/chain-31337/deployed_addresses.json\n\n" +
      "Runtime verification must wait until Phase 10 deployment.\n" +
      "To deploy on the local network in Phase 10:\n" +
      "  npx hardhat ignition deploy ignition/modules/Voting.ts --network localhost\n"
    );
    return;
  }

  console.log(`Connecting to Voting contract at: ${contractAddress}`);

  const { ethers } = await network.create();

  // Verify contract bytecode exists at address
  const code = await ethers.provider.getCode(contractAddress);
  if (code === "0x") {
    console.error(`\n[FAILURE] No contract bytecode found at address ${contractAddress}.`);
    console.error("Is the local node running, and has the contract been deployed?");
    process.exitCode = 1;
    return;
  }

  const voting = (await ethers.getContractAt("Voting", contractAddress)) as unknown as Voting;

  const owner = await voting.owner();
  const candidateCount = await voting.candidateCount();

  console.log("\n--- Contract State ---");
  console.log(`Contract Address : ${contractAddress}`);
  console.log(`Contract Owner   : ${owner}`);
  console.log(`Candidate Count  : ${candidateCount.toString()}`);

  let allChecksPassed = true;

  if (candidateCount < 2n) {
    console.error(`\n[FAILURE] Expected at least 2 candidates, found ${candidateCount.toString()}`);
    allChecksPassed = false;
  } else {
    const candidate1 = await voting.candidates(1);
    const candidate2 = await voting.candidates(2);

    console.log(`\nCandidate #1:`);
    console.log(`  ID         : ${candidate1.id.toString()}`);
    console.log(`  Name       : ${candidate1.name}`);
    console.log(`  Vote Count : ${candidate1.voteCount.toString()}`);

    console.log(`\nCandidate #2:`);
    console.log(`  ID         : ${candidate2.id.toString()}`);
    console.log(`  Name       : ${candidate2.name}`);
    console.log(`  Vote Count : ${candidate2.voteCount.toString()}`);

    console.log("\n--- Verification Checks ---");

    if (candidate1.name === "Alice") {
      console.log("✔ Candidate 1 is Alice");
    } else {
      console.error(`✖ Candidate 1 expected 'Alice', got '${candidate1.name}'`);
      allChecksPassed = false;
    }

    if (candidate1.voteCount === 0n) {
      console.log("✔ Candidate 1 initial vote count is 0");
    } else {
      console.error(`✖ Candidate 1 initial vote count expected 0, got ${candidate1.voteCount.toString()}`);
      allChecksPassed = false;
    }

    if (candidate2.name === "Bob") {
      console.log("✔ Candidate 2 is Bob");
    } else {
      console.error(`✖ Candidate 2 expected 'Bob', got '${candidate2.name}'`);
      allChecksPassed = false;
    }

    if (candidate2.voteCount === 0n) {
      console.log("✔ Candidate 2 initial vote count is 0");
    } else {
      console.error(`✖ Candidate 2 initial vote count expected 0, got ${candidate2.voteCount.toString()}`);
      allChecksPassed = false;
    }
  }

  if (allChecksPassed) {
    console.log("\n[SUCCESS] All Voting contract verification checks passed successfully!");
  } else {
    console.error("\n[FAILURE] One or more verification checks failed.");
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("Verification script encountered an unexpected error:", error);
  process.exitCode = 1;
});
