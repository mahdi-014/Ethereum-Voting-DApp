import { network } from "hardhat";

const { ethers } = await network.create();
const contractAddress = "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9";
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

