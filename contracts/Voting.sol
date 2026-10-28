// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

contract Voting {
    address public owner;

    struct Candidate {
        uint256 id;
        string name;
        uint256 voteCount;
        bool exists;
    }

    struct Voter {
        address voterAddress;
        string name;
        bool isRegistered;
        bool hasVoted;
        uint256 votedCandidateId;
    }

    Candidate[] private candidates;
    address[] private registeredVotersList;
    address[] private votedAddressesList;

    mapping(address => bool) public hasVoted;
    mapping(address => Voter) public voters;

    event CandidateAdded(uint256 indexed candidateId, string name);
    event CandidateUpdated(uint256 indexed candidateId, string newName);
    event CandidateDeleted(uint256 indexed candidateId);
    event VoterAdded(address indexed voter, string name);
    event VoterUpdated(address indexed voter, string newName);
    event VoterDeleted(address indexed voter);
    event VoterReset(address indexed voter);
    event VoteCast(uint256 indexed candidateId, address indexed voter);
    event ElectionReset();
    event SystemReset();

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can add candidates");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    // =============================================================
    // Candidate Management (Admin)
    // =============================================================

    function addCandidate(string memory name) external onlyOwner {
        require(bytes(name).length > 0, "Candidate name cannot be empty");

        uint256 candidateId = candidates.length;

        candidates.push(
            Candidate({
                id: candidateId,
                name: name,
                voteCount: 0,
                exists: true
            })
        );

        emit CandidateAdded(candidateId, name);
    }

    function editCandidate(uint256 candidateId, string memory newName) external onlyOwner {
        require(candidateId < candidates.length, "Invalid candidate ID");
        require(candidates[candidateId].exists, "Candidate does not exist");
        require(bytes(newName).length > 0, "Candidate name cannot be empty");

        candidates[candidateId].name = newName;
        emit CandidateUpdated(candidateId, newName);
    }

    function deleteCandidate(uint256 candidateId) external onlyOwner {
        require(candidateId < candidates.length, "Invalid candidate ID");
        require(candidates[candidateId].exists, "Candidate does not exist");

        candidates[candidateId].exists = false;
        emit CandidateDeleted(candidateId);
    }

    function candidateCount() external view returns (uint256) {
        return candidates.length;
    }

    function getCandidate(
        uint256 candidateId
    )
        external
        view
        returns (uint256 id, string memory name, uint256 voteCount, bool exists)
    {
        require(candidateId < candidates.length, "Invalid candidate ID");

        Candidate storage candidate = candidates[candidateId];

        return (candidate.id, candidate.name, candidate.voteCount, candidate.exists);
    }

    // =============================================================
    // Voting Logic
    // =============================================================

    function vote(uint256 candidateId) external {
        require(candidateId < candidates.length, "Invalid candidate ID");
        require(candidates[candidateId].exists, "Candidate does not exist");
        require(!hasVoted[msg.sender], "Already voted");

        hasVoted[msg.sender] = true;
        votedAddressesList.push(msg.sender);
        candidates[candidateId].voteCount += 1;

        if (voters[msg.sender].isRegistered) {
            voters[msg.sender].hasVoted = true;
            voters[msg.sender].votedCandidateId = candidateId;
        }

        emit VoteCast(candidateId, msg.sender);
    }

    // =============================================================
    // Voter Management (Admin)
    // =============================================================

    function addVoter(address voterAddress, string memory name) external onlyOwner {
        require(voterAddress != address(0), "Invalid voter address");
        require(bytes(name).length > 0, "Voter name cannot be empty");

        if (!voters[voterAddress].isRegistered) {
            registeredVotersList.push(voterAddress);
        }

        voters[voterAddress] = Voter({
            voterAddress: voterAddress,
            name: name,
            isRegistered: true,
            hasVoted: hasVoted[voterAddress],
            votedCandidateId: voters[voterAddress].votedCandidateId
        });

        emit VoterAdded(voterAddress, name);
    }

    function editVoter(address voterAddress, string memory newName) external onlyOwner {
        require(voters[voterAddress].isRegistered, "Voter not registered");
        require(bytes(newName).length > 0, "Voter name cannot be empty");

        voters[voterAddress].name = newName;
        emit VoterUpdated(voterAddress, newName);
    }

    function deleteVoter(address voterAddress) external onlyOwner {
        require(voters[voterAddress].isRegistered, "Voter not registered");

        voters[voterAddress].isRegistered = false;

        // Remove from registeredVotersList
        for (uint256 i = 0; i < registeredVotersList.length; i++) {
            if (registeredVotersList[i] == voterAddress) {
                registeredVotersList[i] = registeredVotersList[registeredVotersList.length - 1];
                registeredVotersList.pop();
                break;
            }
        }

        emit VoterDeleted(voterAddress);
    }

    function resetVoterStatus(address voterAddress) external onlyOwner {
        require(hasVoted[voterAddress], "Voter has not voted");

        hasVoted[voterAddress] = false;
        if (voters[voterAddress].isRegistered) {
            voters[voterAddress].hasVoted = false;
            uint256 candidateId = voters[voterAddress].votedCandidateId;
            if (candidateId < candidates.length && candidates[candidateId].voteCount > 0) {
                candidates[candidateId].voteCount -= 1;
            }
        }

        emit VoterReset(voterAddress);
    }

    function voterCount() external view returns (uint256) {
        return registeredVotersList.length;
    }

    function getVoter(uint256 index) external view returns (
        address voterAddress,
        string memory name,
        bool isRegistered,
        bool voted
    ) {
        require(index < registeredVotersList.length, "Index out of bounds");
        address addr = registeredVotersList[index];
        Voter storage v = voters[addr];
        return (v.voterAddress, v.name, v.isRegistered, hasVoted[addr]);
    }

    // =============================================================
    // System Reset Functions (Admin)
    // =============================================================

    // Reset votes only: zero out vote counts and clear hasVoted for all voters
    function resetElection() external onlyOwner {
        for (uint256 i = 0; i < candidates.length; i++) {
            candidates[i].voteCount = 0;
        }

        for (uint256 i = 0; i < votedAddressesList.length; i++) {
            hasVoted[votedAddressesList[i]] = false;
            if (voters[votedAddressesList[i]].isRegistered) {
                voters[votedAddressesList[i]].hasVoted = false;
            }
        }
        delete votedAddressesList;

        emit ElectionReset();
    }

    // Factory reset: clear all candidates, voters, and vote history completely
    function resetAll() external onlyOwner {
        delete candidates;

        for (uint256 i = 0; i < votedAddressesList.length; i++) {
            hasVoted[votedAddressesList[i]] = false;
        }
        delete votedAddressesList;

        for (uint256 i = 0; i < registeredVotersList.length; i++) {
            delete voters[registeredVotersList[i]];
        }
        delete registeredVotersList;

        emit SystemReset();
    }
}
