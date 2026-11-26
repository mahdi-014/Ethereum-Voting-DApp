import { expect } from "chai";
import { network } from "hardhat";
import type { Voting } from "../types/ethers-contracts/index.js";

const { ethers } = await network.create();

type Signer = Awaited<ReturnType<typeof ethers.getSigners>>[number];

describe("Voting Contract Unit Tests", function () {
  let voting: Voting;
  let owner: Signer;
  let voter1: Signer;
  let voter2: Signer;
  let nonOwner: Signer;

  beforeEach(async function () {
    [owner, voter1, voter2, nonOwner] = await ethers.getSigners();
    voting = (await ethers.deployContract("Voting")) as unknown as Voting;
  });

  it("1. Contract deployer is assigned as owner", async function () {
    expect(await voting.owner()).to.equal(owner.address);
  });

  it("2. Initial candidateCount is zero", async function () {
    expect(await voting.candidateCount()).to.equal(0n);
  });

  it("3. Owner can add a candidate", async function () {
    await expect(voting.connect(owner).addCandidate("Alice"))
      .to.emit(voting, "CandidateAdded")
      .withArgs(1n, "Alice");
    expect(await voting.candidateCount()).to.equal(1n);
  });

  it("4. First candidate receives ID 1", async function () {
    await voting.connect(owner).addCandidate("Alice");
    const candidate = await voting.candidates(1);
    expect(candidate.id).to.equal(1n);
    expect(candidate.name).to.equal("Alice");
  });

  it("5. Second candidate receives ID 2", async function () {
    await voting.connect(owner).addCandidate("Alice");
    await voting.connect(owner).addCandidate("Bob");
    const candidate2 = await voting.candidates(2);
    expect(candidate2.id).to.equal(2n);
    expect(candidate2.name).to.equal("Bob");
  });

  it("6. Candidate voteCount initially equals zero", async function () {
    await voting.connect(owner).addCandidate("Alice");
    const candidate = await voting.candidates(1);
    expect(candidate.voteCount).to.equal(0n);
  });

  it("7. A voter can successfully vote for a valid candidate", async function () {
    await voting.connect(owner).addCandidate("Alice");
    await voting.connect(owner).addCandidate("Bob");

    await expect(voting.connect(voter1).vote(1))
      .to.emit(voting, "VoteCast")
      .withArgs(voter1.address, 1n);

    expect(await voting.hasVoted(voter1.address)).to.be.true;
  });

  it("8. Successful voting increments the correct candidate's voteCount", async function () {
    await voting.connect(owner).addCandidate("Alice");
    await voting.connect(owner).addCandidate("Bob");

    await voting.connect(voter1).vote(1);

    const candidate1 = await voting.candidates(1);
    const candidate2 = await voting.candidates(2);
    expect(candidate1.voteCount).to.equal(1n);
    expect(candidate2.voteCount).to.equal(0n);
  });

  it("9. A voter cannot vote more than once", async function () {
    await voting.connect(owner).addCandidate("Alice");
    await voting.connect(owner).addCandidate("Bob");

    await voting.connect(voter1).vote(1);

    await expect(voting.connect(voter1).vote(1)).to.be.revertedWith(
      "You have already voted"
    );
  });

  it("10. Voting for an invalid candidate ID is rejected", async function () {
    await voting.connect(owner).addCandidate("Alice");
    await voting.connect(owner).addCandidate("Bob");

    await expect(voting.connect(voter1).vote(0)).to.be.revertedWith(
      "Invalid candidate ID"
    );
    await expect(voting.connect(voter1).vote(99)).to.be.revertedWith(
      "Invalid candidate ID"
    );
  });

  it("11. A non-owner cannot add candidates", async function () {
    await expect(
      voting.connect(nonOwner).addCandidate("Alice")
    ).to.be.revertedWith("Only owner can perform this action");
  });

  it("12. Rejects empty and whitespace-only candidate names", async function () {
    await expect(voting.connect(owner).addCandidate("")).to.be.revertedWith(
      "Candidate name cannot be empty"
    );
    await expect(voting.connect(owner).addCandidate("   \t\n ")).to.be.revertedWith(
      "Candidate name cannot be empty"
    );
    expect(await voting.candidateCount()).to.equal(0n);
  });

  it("13. Rejects duplicate candidate names regardless of ASCII case", async function () {
    await voting.connect(owner).addCandidate("Alice");
    await expect(voting.connect(owner).addCandidate("Alice")).to.be.revertedWith(
      "Candidate already exists"
    );
    await expect(voting.connect(owner).addCandidate("alice")).to.be.revertedWith(
      "Candidate already exists"
    );
    expect(await voting.candidateCount()).to.equal(1n);
  });

  it("14. Rejects voting when no candidates exist and preserves hasVoted=false", async function () {
    await expect(voting.connect(voter1).vote(1)).to.be.revertedWith(
      "Invalid candidate ID"
    );
    expect(await voting.hasVoted(voter1.address)).to.be.false;
  });

  it("15. Rejects cross-candidate double voting and keeps counts unchanged", async function () {
    await voting.connect(owner).addCandidate("Alice");
    await voting.connect(owner).addCandidate("Bob");

    await voting.connect(voter1).vote(1);

    await expect(voting.connect(voter1).vote(2)).to.be.revertedWith(
      "You have already voted"
    );

    expect((await voting.candidates(1)).voteCount).to.equal(1n);
    expect((await voting.candidates(2)).voteCount).to.equal(0n);
  });

  it("16. Supports 5+ voters (including owner) and 4 candidates accurately", async function () {
    const signers = await ethers.getSigners();
    const voter3 = signers[4];
    const voter4 = signers[5];

    await voting.connect(owner).addCandidate("Alice");
    await voting.connect(owner).addCandidate("Bob");
    await voting.connect(owner).addCandidate("Charlie");
    await voting.connect(owner).addCandidate("Diana");

    expect(await voting.candidateCount()).to.equal(4n);

    await voting.connect(owner).vote(1); // Alice: 1
    await voting.connect(voter1).vote(2); // Bob: 1
    await voting.connect(voter2).vote(1); // Alice: 2
    await voting.connect(voter3).vote(3); // Charlie: 1
    await voting.connect(voter4).vote(4); // Diana: 1

    expect((await voting.candidates(1)).voteCount).to.equal(2n);
    expect((await voting.candidates(2)).voteCount).to.equal(1n);
    expect((await voting.candidates(3)).voteCount).to.equal(1n);
    expect((await voting.candidates(4)).voteCount).to.equal(1n);

    for (const signer of [owner, voter1, voter2, voter3, voter4]) {
      expect(await voting.hasVoted(signer.address)).to.be.true;
      await expect(voting.connect(signer).vote(1)).to.be.revertedWith(
        "You have already voted"
      );
    }
  });
});
