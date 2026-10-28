import { network } from "hardhat";

const { ethers } = await network.create();
const contractAddress = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const voting = await ethers.getContractAt("Voting", contractAddress);

console.log("Contract Address:", contractAddress);
const owner = await voting.owner();
console.log("Contract Owner:", owner);
const candidateCount = await voting.candidateCount();
console.log("Total Candidates:", candidateCount.toString());

for (let id = 0n; id < candidateCount; id++) {
  const candidate = await voting.getCandidate(id);
  console.log(`Candidate ID: ${candidate.id.toString()}`);
  console.log(`Candidate Name: ${candidate.name}`);
  console.log(`Votes: ${candidate.voteCount.toString()}`);
  console.log("-----------------------------");
}
