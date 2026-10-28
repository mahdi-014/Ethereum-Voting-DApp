// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

contract Voting {
    address public owner;

    struct Candidate {
        uint256 id;
        string name;
        uint256 voteCount;
    }

    Candidate[] private candidates;

    mapping(address => bool) public hasVoted;

    event CandidateAdded(uint256 indexed candidateId, string name);
    event VoteCast(uint256 indexed candidateId, address indexed voter);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can add candidates");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function addCandidate(string memory name) external onlyOwner {
        require(bytes(name).length > 0, "Candidate name cannot be empty");

        uint256 candidateId = candidates.length;

        candidates.push(
            Candidate({
                id: candidateId,
                name: name,
                voteCount: 0
            })
        );

        emit CandidateAdded(candidateId, name);
    }

    function vote(uint256 candidateId) external {
        require(candidateId < candidates.length, "Invalid candidate ID");
        require(!hasVoted[msg.sender], "Already voted");

        hasVoted[msg.sender] = true;
        candidates[candidateId].voteCount += 1;

        emit VoteCast(candidateId, msg.sender);
    }

    function candidateCount() external view returns (uint256) {
        return candidates.length;
    }

    function getCandidate(
        uint256 candidateId
    )
        external
        view
        returns (uint256 id, string memory name, uint256 voteCount)
    {
        require(candidateId < candidates.length, "Invalid candidate ID");

        Candidate storage candidate = candidates[candidateId];

        return (candidate.id, candidate.name, candidate.voteCount);
    }
}
