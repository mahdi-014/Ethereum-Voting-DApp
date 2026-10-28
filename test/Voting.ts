import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.create();

describe("Voting", function () {
  async function deployVoting() {
    const [owner, voter1, voter2, nonOwner] =
      await ethers.getSigners();

    const voting = await ethers.deployContract("Voting");
    await voting.waitForDeployment();

    return { voting, owner, voter1, voter2, nonOwner };
  }

  it("Should allow the owner to add candidates", async function () {
    const { voting, owner } = await deployVoting();

    expect(await voting.owner()).to.equal(owner.address);

    await voting.addCandidate("Alice");
    await voting.addCandidate("Bob");

    expect(await voting.candidateCount()).to.equal(2n);

    const alice = await voting.getCandidate(0);
    const bob = await voting.getCandidate(1);

    expect(alice.name).to.equal("Alice");
    expect(alice.voteCount).to.equal(0n);
    expect(bob.name).to.equal("Bob");
    expect(bob.voteCount).to.equal(0n);
  });

  it("Should increase the vote count after voting", async function () {
    const { voting, voter1 } = await deployVoting();

    await voting.addCandidate("Alice");
    await voting.connect(voter1).vote(0);

    const alice = await voting.getCandidate(0);

    expect(alice.voteCount).to.equal(1n);
    expect(await voting.hasVoted(voter1.address)).to.equal(true);
  });

  it("Should reject a second vote from the same wallet", async function () {
    const { voting, voter1 } = await deployVoting();

    await voting.addCandidate("Alice");
    await voting.connect(voter1).vote(0);

    await expect(
      voting.connect(voter1).vote(0)
    ).to.be.revertedWith("Already voted");
  });

  it("Should reject an invalid candidate ID", async function () {
    const { voting, voter1 } = await deployVoting();

    await voting.addCandidate("Alice");

    await expect(
      voting.connect(voter1).vote(99)
    ).to.be.revertedWith("Invalid candidate ID");
  });

  it("Should prevent non-owners from adding candidates", async function () {
    const { voting, nonOwner } = await deployVoting();

    await expect(
      voting.connect(nonOwner).addCandidate("Charlie")
    ).to.be.revertedWith("Only owner can add candidates");

    expect(await voting.candidateCount()).to.equal(0n);
  });
});
