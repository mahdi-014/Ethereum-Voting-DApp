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
    expect(alice.exists).to.equal(true);
    expect(bob.name).to.equal("Bob");
    expect(bob.voteCount).to.equal(0n);
    expect(bob.exists).to.equal(true);
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

  it("Should allow the owner to edit a candidate", async function () {
    const { voting } = await deployVoting();

    await voting.addCandidate("Alice");
    await voting.editCandidate(0, "Alice Updated");

    const candidate = await voting.getCandidate(0);
    expect(candidate.name).to.equal("Alice Updated");
  });

  it("Should allow the owner to delete a candidate and prevent voting for deleted candidate", async function () {
    const { voting, voter1 } = await deployVoting();

    await voting.addCandidate("Alice");
    await voting.deleteCandidate(0);

    const candidate = await voting.getCandidate(0);
    expect(candidate.exists).to.equal(false);

    await expect(
      voting.connect(voter1).vote(0)
    ).to.be.revertedWith("Candidate does not exist");
  });

  it("Should allow the owner to add, edit, and delete voters", async function () {
    const { voting, voter1 } = await deployVoting();

    await voting.addVoter(voter1.address, "Student One");
    expect(await voting.voterCount()).to.equal(1n);

    let voterInfo = await voting.getVoter(0);
    expect(voterInfo.name).to.equal("Student One");
    expect(voterInfo.isRegistered).to.equal(true);

    // Edit voter
    await voting.editVoter(voter1.address, "Student One Updated");
    voterInfo = await voting.getVoter(0);
    expect(voterInfo.name).to.equal("Student One Updated");

    // Delete voter
    await voting.deleteVoter(voter1.address);
    expect(await voting.voterCount()).to.equal(0n);
  });

  it("Should allow resetting an individual voter's status", async function () {
    const { voting, voter1 } = await deployVoting();

    await voting.addCandidate("Alice");
    await voting.addVoter(voter1.address, "Student One");

    await voting.connect(voter1).vote(0);
    expect(await voting.hasVoted(voter1.address)).to.equal(true);
    expect((await voting.getCandidate(0)).voteCount).to.equal(1n);

    // Reset status
    await voting.resetVoterStatus(voter1.address);
    expect(await voting.hasVoted(voter1.address)).to.equal(false);
    expect((await voting.getCandidate(0)).voteCount).to.equal(0n);

    // Can vote again
    await voting.connect(voter1).vote(0);
    expect(await voting.hasVoted(voter1.address)).to.equal(true);
    expect((await voting.getCandidate(0)).voteCount).to.equal(1n);
  });

  it("Should allow the owner to reset the election votes without deleting candidates", async function () {
    const { voting, voter1, voter2 } = await deployVoting();

    await voting.addCandidate("Alice");
    await voting.addCandidate("Bob");

    await voting.connect(voter1).vote(0);
    await voting.connect(voter2).vote(1);

    expect((await voting.getCandidate(0)).voteCount).to.equal(1n);
    expect((await voting.getCandidate(1)).voteCount).to.equal(1n);

    // Reset election
    await voting.resetElection();

    expect((await voting.getCandidate(0)).voteCount).to.equal(0n);
    expect((await voting.getCandidate(1)).voteCount).to.equal(0n);
    expect(await voting.hasVoted(voter1.address)).to.equal(false);
    expect(await voting.hasVoted(voter2.address)).to.equal(false);
    expect(await voting.candidateCount()).to.equal(2n);
  });

  it("Should allow the owner to factory reset the entire system", async function () {
    const { voting, voter1 } = await deployVoting();

    await voting.addCandidate("Alice");
    await voting.addVoter(voter1.address, "Student One");
    await voting.connect(voter1).vote(0);

    // Factory reset
    await voting.resetAll();

    expect(await voting.candidateCount()).to.equal(0n);
    expect(await voting.voterCount()).to.equal(0n);
    expect(await voting.hasVoted(voter1.address)).to.equal(false);
  });
});
