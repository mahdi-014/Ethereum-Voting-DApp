import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("VotingModule", (m) => {
  const voting = m.contract("Voting");

  const addAlice = m.call(voting, "addCandidate", ["Alice"], {
    id: "AddAlice",
  });

  m.call(voting, "addCandidate", ["Bob"], {
    id: "AddBob",
    after: [addAlice],
  });

  return { voting };
});
