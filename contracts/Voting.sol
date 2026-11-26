// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract Voting {
    struct Candidate {
        uint256 id;
        string name;
        uint256 voteCount;
    }

    address public owner;
    uint256 public candidateCount;
    mapping(uint256 => Candidate) public candidates;
    mapping(address => bool) public hasVoted;
    mapping(bytes32 => bool) private candidateNameExists;

    event CandidateAdded(uint256 indexed candidateId, string name);
    event VoteCast(address indexed voter, uint256 indexed candidateId);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can perform this action");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function _hasNonWhitespace(string memory _str) private pure returns (bool) {
        bytes memory b = bytes(_str);
        for (uint256 i = 0; i < b.length; i++) {
            bytes1 ch = b[i];
            if (ch != 0x20 && ch != 0x09 && ch != 0x0A && ch != 0x0D) {
                return true;
            }
        }
        return false;
    }

    function _toLowerHash(string memory _str) private pure returns (bytes32) {
        bytes memory b = bytes(_str);
        bytes memory lower = new bytes(b.length);
        for (uint256 i = 0; i < b.length; i++) {
            bytes1 ch = b[i];
            if (ch >= 0x41 && ch <= 0x5A) {
                lower[i] = bytes1(uint8(ch) + 32);
            } else {
                lower[i] = ch;
            }
        }
        return keccak256(lower);
    }

    function addCandidate(string memory _name) public onlyOwner {
        require(bytes(_name).length > 0 && _hasNonWhitespace(_name), "Candidate name cannot be empty");
        bytes32 nameHash = _toLowerHash(_name);
        require(!candidateNameExists[nameHash], "Candidate already exists");

        candidateNameExists[nameHash] = true;
        candidateCount++;
        candidates[candidateCount] = Candidate(candidateCount, _name, 0);
        emit CandidateAdded(candidateCount, _name);
    }

    function vote(uint256 _candidateId) public {
        require(!hasVoted[msg.sender], "You have already voted");
        require(_candidateId > 0 && _candidateId <= candidateCount, "Invalid candidate ID");

        hasVoted[msg.sender] = true;
        candidates[_candidateId].voteCount++;
        emit VoteCast(msg.sender, _candidateId);
    }
}
