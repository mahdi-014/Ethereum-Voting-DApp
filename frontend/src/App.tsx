import { useState } from "react";
import { BrowserProvider, Contract, type Eip1193Provider } from "ethers";
import votingArtifact from "./contracts/Voting.json";
import "./App.css";

// Declare window.ethereum for TypeScript
declare global {
  interface Window {
    ethereum?: Eip1193Provider;
  }
}

interface Candidate {
  id: number;
  name: string;
  voteCount: string;
}

interface TxError {
  shortMessage?: string;
  reason?: string;
  message?: string;
}

function getErrorMessage(error: unknown, fallback: string = "The transaction failed."): string {
  if (error && typeof error === "object") {
    const err = error as TxError;
    return err.shortMessage || err.reason || err.message || fallback;
  }
  if (typeof error === "string") {
    return error;
  }
  return fallback;
}

const CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const ABI = votingArtifact.abi;

function App() {
  const [account, setAccount] = useState<string>("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [message, setMessage] = useState<string>("Connect your wallet to view candidates.");
  const [busy, setBusy] = useState<boolean>(false);

  async function connectWallet() {
    try {
      if (!window.ethereum) {
        setMessage("MetaMask is not detected. Please install it first.");
        return;
      }

      const provider = new BrowserProvider(window.ethereum);
      const network = await provider.getNetwork();

      if (network.chainId !== 31337n) {
        setMessage("Please switch MetaMask to Hardhat Local (Chain ID 31337).");
        return;
      }

      const accounts = await provider.send("eth_requestAccounts", []);
      setAccount(accounts[0]);
      await loadCandidates(provider);
      setMessage("Wallet connected successfully.");
    } catch (error: unknown) {
      setMessage(getErrorMessage(error, "Failed to connect wallet."));
    }
  }

  async function loadCandidates(existingProvider?: BrowserProvider) {
    try {
      if (!window.ethereum) return;
      const provider = existingProvider || new BrowserProvider(window.ethereum);
      const voting = new Contract(CONTRACT_ADDRESS, ABI, provider);

      const count = await voting.candidateCount();
      const result: Candidate[] = [];

      for (let id = 0n; id < count; id++) {
        const candidate = await voting.getCandidate(id);
        result.push({
          id: Number(candidate.id),
          name: candidate.name,
          voteCount: candidate.voteCount.toString(),
        });
      }

      setCandidates(result);
    } catch (error: unknown) {
      setMessage(getErrorMessage(error, "Failed to load candidates."));
    }
  }

  async function castVote(candidateId: number) {
    if (!window.ethereum) {
      setMessage("Please install MetaMask first.");
      return;
    }

    try {
      setBusy(true);
      setMessage("Please approve the transaction in MetaMask.");
      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const voting = new Contract(CONTRACT_ADDRESS, ABI, signer);

      const alreadyVoted = await voting.hasVoted(await signer.getAddress());
      if (alreadyVoted) {
        setMessage("This wallet has already voted.");
        return;
      }

      const tx = await voting.vote(candidateId);
      setMessage(`Transaction submitted: ${tx.hash}`);
      await tx.wait();
      setMessage("Vote confirmed successfully!");
      await loadCandidates(provider);
    } catch (error: unknown) {
      setMessage(getErrorMessage(error, "The transaction failed."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app">
      <h1>Blockchain Voting DApp</h1>
      <p>Vote for your preferred candidate on the local blockchain.</p>

      <button onClick={connectWallet} disabled={busy}>
        {account ? "Wallet Connected" : "Connect MetaMask"}
      </button>

      {account && (
        <p className="account">
          <strong>Account:</strong> {account}
        </p>
      )}

      <p className="message">{message}</p>

      <button
        className="refresh"
        onClick={() => loadCandidates()}
        disabled={busy}
      >
        Refresh Candidates
      </button>

      <section className="candidates">
        {candidates.map((candidate) => (
          <article className="candidate" key={candidate.id}>
            <h2>{candidate.name}</h2>
            <p>Candidate ID: {candidate.id}</p>
            <p>Votes: {candidate.voteCount}</p>
            <button
              onClick={() => castVote(candidate.id)}
              disabled={!account || busy}
            >
              Vote for {candidate.name}
            </button>
          </article>
        ))}
      </section>

      <footer>
        <small>Local development network · Chain ID 31337</small>
      </footer>
    </main>
  );
}

export default App;
