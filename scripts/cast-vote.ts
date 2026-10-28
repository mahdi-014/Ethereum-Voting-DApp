import { network } from "hardhat";

const { ethers } = await network.create();
const contractAddress = "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9";
const voting = await ethers.getContractAt("Voting", contractAddress);

const accounts = await ethers.getSigners();
const voter = accounts[1];
console.log("Voter address:", voter.address);

const alreadyVoted = await voting.hasVoted(voter.address);
if (alreadyVoted) {
  console.log("This account has already voted.");
} else {
  const tx = await voting.connect(voter).vote(0);
  console.log("Transaction submitted:", tx.hash);
  await tx.wait();
  console.log("Transaction confirmed.");
}

const alice = await voting.getCandidate(0);
console.log("Candidate:", alice.name);
console.log("Alice's vote count:", alice.voteCount.toString());
console.log("Voter has voted:", await voting.hasVoted(voter.address));

