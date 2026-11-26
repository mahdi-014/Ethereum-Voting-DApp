import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("VotingModule", (m) => {
  const voting = m.contract("Voting");

  const addAlice = m.call(voting, "addCandidate", ["Alice"], {
    id: "add_alice",
  });

  m.call(voting, "addCandidate", ["Bob"], {
    id: "add_bob",
    after: [addAlice],
  });

  return { voting };
});
