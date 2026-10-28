import { useState, useEffect, useCallback } from "react";
import { BrowserProvider, JsonRpcProvider, Contract, Wallet, type Eip1193Provider, type Signer } from "ethers";
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

interface TestAccount {
  label: string;
  address: string;
  privateKey: string;
  role: "owner" | "voter";
}

const CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const LOCAL_RPC_URL = "http://127.0.0.1:8545";
const CHAIN_ID = 31337n;
const ABI = votingArtifact.abi;

// Deterministic Hardhat node test accounts
const LOCAL_TEST_ACCOUNTS: TestAccount[] = [
  {
    label: "Account #0 (Deployer / Admin)",
    address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    role: "owner",
  },
  {
    label: "Account #1 (Voter 1)",
    address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    privateKey: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
    role: "voter",
  },
  {
    label: "Account #2 (Voter 2)",
    address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    privateKey: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
    role: "voter",
  },
  {
    label: "Account #3 (Voter 3)",
    address: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
    privateKey: "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
    role: "voter",
  },
  {
    label: "Account #4 (Voter 4)",
    address: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
    privateKey: "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a",
    role: "voter",
  },
];

interface AlertMessage {
  type: "info" | "success" | "error" | "warning";
  text: string;
  txHash?: string;
}

function App() {
  const isMetaMaskAvailable = typeof window !== "undefined" && Boolean(window.ethereum);
  const [hasMetaMask] = useState<boolean>(isMetaMaskAvailable);
  const [authMode, setAuthMode] = useState<"metamask" | "local">(
    isMetaMaskAvailable ? "metamask" : "local"
  );
  const [selectedLocalIndex, setSelectedLocalIndex] = useState<number>(1);
  const [account, setAccount] = useState<string>("");
  const [contractOwner, setContractOwner] = useState<string>("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [userVoted, setUserVoted] = useState<boolean>(false);
  const [busy, setBusy] = useState<boolean>(false);
  const [alert, setAlert] = useState<AlertMessage>({
    type: "info",
    text: "Welcome to the Blockchain Voting DApp. Connect a wallet to cast your vote.",
  });
  const [newCandidateName, setNewCandidateName] = useState<string>("");

  // Helper to extract clean error messages
  function extractError(error: unknown, defaultMsg: string): string {
    if (error && typeof error === "object") {
      const err = error as { shortMessage?: string; reason?: string; message?: string };
      return err.shortMessage || err.reason || err.message || defaultMsg;
    }
    return defaultMsg;
  }

  // Get a read-only provider for initial data fetching
  const getReadProvider = useCallback(() => {
    if (window.ethereum) {
      return new BrowserProvider(window.ethereum);
    }
    return new JsonRpcProvider(LOCAL_RPC_URL);
  }, []);

  // Fetch candidate list, owner, and voting status
  const loadData = useCallback(async (currentAccount?: string) => {
    try {
      const provider = getReadProvider();
      const voting = new Contract(CONTRACT_ADDRESS, ABI, provider);

      // Fetch candidates & owner
      const [count, owner] = await Promise.all([
        voting.candidateCount(),
        voting.owner(),
      ]);

      setContractOwner(owner);

      const items: Candidate[] = [];
      for (let id = 0n; id < count; id++) {
        const c = await voting.getCandidate(id);
        items.push({
          id: Number(c.id),
          name: c.name,
          voteCount: c.voteCount.toString(),
        });
      }
      setCandidates(items);

      // Check voting status for current account
      const targetAddress = currentAccount || account;
      if (targetAddress) {
        const voted = await voting.hasVoted(targetAddress);
        setUserVoted(voted);
      }
    } catch (err) {
      console.error("Failed to load blockchain data:", err);
      setAlert({
        type: "error",
        text: "Could not connect to Hardhat local blockchain. Make sure 'npm run node' is running.",
      });
    }
  }, [getReadProvider, account]);

  // Initial mount load
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Connect MetaMask
  async function connectMetaMask() {
    try {
      setBusy(true);
      if (!window.ethereum) {
        setAlert({
          type: "warning",
          text: "MetaMask extension is not installed. You can install it or switch to Local Dev Accounts below.",
        });
        return;
      }

      const provider = new BrowserProvider(window.ethereum);
      const network = await provider.getNetwork();

      if (network.chainId !== CHAIN_ID) {
        setAlert({
          type: "warning",
          text: `Please switch MetaMask to Hardhat Local (Chain ID: 31337). Currently connected to: ${network.name} (${network.chainId})`,
        });
        return;
      }

      const accounts = await provider.send("eth_requestAccounts", []);
      const userAddr = accounts[0];
      setAccount(userAddr);
      await loadData(userAddr);

      setAlert({
        type: "success",
        text: `MetaMask connected successfully: ${userAddr.slice(0, 6)}...${userAddr.slice(-4)}`,
      });
    } catch (err) {
      setAlert({
        type: "error",
        text: extractError(err, "MetaMask connection failed."),
      });
    } finally {
      setBusy(false);
    }
  }

  // Connect using a local Hardhat test account
  async function connectLocalAccount(index: number) {
    try {
      const selected = LOCAL_TEST_ACCOUNTS[index];
      setSelectedLocalIndex(index);
      setAccount(selected.address);
      await loadData(selected.address);
      setAlert({
        type: "success",
        text: `Switched to ${selected.label}: ${selected.address.slice(0, 6)}...${selected.address.slice(-4)}`,
      });
    } catch (err) {
      setAlert({
        type: "error",
        text: extractError(err, "Failed to switch local account."),
      });
    }
  }

  // Get active signer based on current mode
  async function getActiveSigner(): Promise<Signer> {
    if (authMode === "metamask" && window.ethereum) {
      const provider = new BrowserProvider(window.ethereum);
      return await provider.getSigner();
    }
    // Local dev mode: use selected private key
    const current = LOCAL_TEST_ACCOUNTS[selectedLocalIndex];
    const rpcProvider = new JsonRpcProvider(LOCAL_RPC_URL);
    return new Wallet(current.privateKey, rpcProvider);
  }

  // Cast vote for a candidate
  async function castVote(candidateId: number, candidateName: string) {
    if (!account) {
      setAlert({
        type: "warning",
        text: "Please connect MetaMask or select a Local Dev Account before voting.",
      });
      return;
    }

    try {
      setBusy(true);
      setAlert({
        type: "info",
        text: `Submitting vote for ${candidateName} to the blockchain...`,
      });

      const signer = await getActiveSigner();
      const voting = new Contract(CONTRACT_ADDRESS, ABI, signer);

      // Pre-check hasVoted
      const alreadyVoted = await voting.hasVoted(await signer.getAddress());
      if (alreadyVoted) {
        setUserVoted(true);
        setAlert({
          type: "error",
          text: "This wallet has already voted. Each address may only vote once.",
        });
        return;
      }

      const tx = await voting.vote(candidateId);
      setAlert({
        type: "info",
        text: `Transaction submitted! Waiting for block confirmation...`,
        txHash: tx.hash,
      });

      await tx.wait();

      setAlert({
        type: "success",
        text: `Vote for ${candidateName} successfully confirmed on-chain!`,
        txHash: tx.hash,
      });

      await loadData(account);
    } catch (err) {
      setAlert({
        type: "error",
        text: extractError(err, "Vote transaction failed."),
      });
    } finally {
      setBusy(false);
    }
  }

  // Add Candidate (Owner Only)
  async function handleAddCandidate(e: React.FormEvent) {
    e.preventDefault();
    if (!newCandidateName.trim()) return;

    try {
      setBusy(true);
      setAlert({
        type: "info",
        text: `Registering candidate "${newCandidateName}"...`,
      });

      const signer = await getActiveSigner();
      const voting = new Contract(CONTRACT_ADDRESS, ABI, signer);

      const tx = await voting.addCandidate(newCandidateName.trim());
      await tx.wait();

      setAlert({
        type: "success",
        text: `Candidate "${newCandidateName}" successfully registered on the blockchain!`,
        txHash: tx.hash,
      });

      setNewCandidateName("");
      await loadData(account);
    } catch (err) {
      setAlert({
        type: "error",
        text: extractError(err, "Failed to add candidate. Ensure current account is the contract owner."),
      });
    } finally {
      setBusy(false);
    }
  }

  // Calculate election statistics
  const totalVotes = candidates.reduce((sum, c) => sum + Number(c.voteCount), 0);
  const leadingCandidate = candidates.length > 0
    ? [...candidates].sort((a, b) => Number(b.voteCount) - Number(a.voteCount))[0]
    : null;

  const isOwner = Boolean(
    account && contractOwner && account.toLowerCase() === contractOwner.toLowerCase()
  );

  return (
    <div className="dapp-container">
      {/* Top Navigation */}
      <header className="top-nav">
        <div className="brand-section">
          <div className="brand-icon">🗳️</div>
          <div>
            <h1 className="brand-title">Ethereum Voting DApp</h1>
            <p className="brand-subtitle">IBA, CIS, DIU · Midterm Project</p>
          </div>
        </div>

        <div className="nav-badges">
          <div className="badge badge-network">
            <span className="network-dot"></span>
            Hardhat Local (31337)
          </div>
          <div className="badge">
            Contract: {CONTRACT_ADDRESS.slice(0, 6)}...{CONTRACT_ADDRESS.slice(-4)}
          </div>
        </div>
      </header>

      {/* Hero Card */}
      <section className="hero-card">
        <h1>Decentralized Ballot System</h1>
        <p>
          A trustless, transparent voting application running on the Ethereum blockchain.
          Votes are immutably recorded in smart contract storage with single-vote enforcement.
        </p>
      </section>

      {/* Wallet & Account Authentication Panel */}
      <section className="wallet-panel">
        <div className="wallet-header">
          <h2 className="wallet-title">
            <span>🔑</span> Wallet & Account Authentication
          </h2>

          <div className="mode-tabs">
            <button
              className={`mode-tab ${authMode === "metamask" ? "active" : ""}`}
              onClick={() => {
                setAuthMode("metamask");
                if (hasMetaMask) connectMetaMask();
              }}
            >
              🦊 MetaMask Mode
            </button>
            <button
              className={`mode-tab ${authMode === "local" ? "active" : ""}`}
              onClick={() => {
                setAuthMode("local");
                connectLocalAccount(selectedLocalIndex);
              }}
            >
              💻 Local Node Accounts
            </button>
          </div>
        </div>

        {/* MetaMask Mode Content */}
        {authMode === "metamask" && (
          <div>
            {!hasMetaMask ? (
              <div className="metamask-banner">
                <div className="banner-header">
                  <span>⚠️</span> MetaMask Extension Not Detected in this Browser
                </div>
                <p className="banner-body">
                  To use MetaMask, install the official browser extension or switch to <strong>Local Node Accounts</strong> to test and vote immediately without installing anything!
                </p>
                <div className="banner-actions">
                  <a
                    href="https://addons.mozilla.org/en-US/firefox/addon/ether-metamask/"
                    target="_blank"
                    rel="noreferrer"
                    className="btn-addon"
                  >
                    🦊 Install MetaMask for Firefox
                  </a>
                  <button
                    className="btn-secondary"
                    onClick={() => {
                      setAuthMode("local");
                      connectLocalAccount(selectedLocalIndex);
                    }}
                  >
                    Use Local Dev Accounts Instead
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
                <button
                  className="btn-primary"
                  onClick={connectMetaMask}
                  disabled={busy}
                >
                  {account ? "🔄 Reconnect MetaMask" : "🦊 Connect MetaMask"}
                </button>
                {account && (
                  <span style={{ fontSize: "0.9rem", color: "#34d399" }}>
                    ✓ MetaMask Connected
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Local Node Accounts Mode Content */}
        {authMode === "local" && (
          <div className="account-selector-box">
            <span className="selector-label">Select a pre-funded Hardhat Test Account:</span>
            <div className="selector-controls">
              <select
                className="account-select"
                value={selectedLocalIndex}
                onChange={(e) => connectLocalAccount(Number(e.target.value))}
                disabled={busy}
              >
                {LOCAL_TEST_ACCOUNTS.map((acc, idx) => (
                  <option key={acc.address} value={idx}>
                    {acc.label} — {acc.address.slice(0, 10)}... ({acc.role})
                  </option>
                ))}
              </select>
              <button
                className="btn-primary"
                onClick={() => connectLocalAccount(selectedLocalIndex)}
                disabled={busy}
              >
                Activate Account
              </button>
            </div>
          </div>
        )}

        {/* Active Connected Account Information */}
        {account && (
          <div className="connected-info">
            <div className="account-address">
              <span>👤 Active Account:</span>
              <strong>{account}</strong>
            </div>

            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <span className={`role-badge ${isOwner ? "role-owner" : "role-voter"}`}>
                {isOwner ? "👑 Contract Owner" : "🗳️ Voter"}
              </span>
              <span className={`role-badge ${userVoted ? "role-owner" : "role-voter"}`}>
                {userVoted ? "✓ Already Voted" : "○ Not Yet Voted"}
              </span>
            </div>
          </div>
        )}
      </section>

      {/* Dynamic Status / Alert Banner */}
      {alert && (
        <div className={`status-banner status-${alert.type}`}>
          <div>
            <span>{alert.type === "success" ? "✓" : alert.type === "error" ? "✕" : "ℹ"}</span>{" "}
            {alert.text}
            {alert.txHash && (
              <div style={{ marginTop: "0.3rem", fontSize: "0.8rem", fontFamily: "monospace" }}>
                Tx: {alert.txHash}
              </div>
            )}
          </div>
          <button
            className="btn-secondary"
            style={{ padding: "0.25rem 0.6rem", fontSize: "0.75rem" }}
            onClick={() => loadData()}
            disabled={busy}
          >
            Refresh
          </button>
        </div>
      )}

      {/* Election Overview Statistics */}
      <section className="stats-grid">
        <div className="stat-card">
          <div className="stat-number">{candidates.length}</div>
          <div className="stat-label">Total Candidates</div>
        </div>

        <div className="stat-card">
          <div className="stat-number">{totalVotes}</div>
          <div className="stat-label">Total Votes Cast</div>
        </div>

        <div className="stat-card">
          <div className="stat-number" style={{ color: "#38bdf8" }}>
            {leadingCandidate && totalVotes > 0 ? leadingCandidate.name : "—"}
          </div>
          <div className="stat-label">Leading Candidate</div>
        </div>
      </section>

      {/* Candidate Ballot Cards */}
      <section style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        <div className="section-header">
          <h2 className="section-title">Official Ballot Candidates</h2>
          <button
            className="btn-secondary"
            onClick={() => loadData()}
            disabled={busy}
          >
            ↻ Refresh Tallies
          </button>
        </div>

        <div className="candidates-grid">
          {candidates.map((candidate) => {
            const count = Number(candidate.voteCount);
            const percentage = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;

            return (
              <article className="candidate-card" key={candidate.id}>
                <div className="candidate-top">
                  <div className="candidate-avatar">
                    {candidate.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="candidate-id-badge">ID #{candidate.id}</span>
                </div>

                <div className="candidate-info">
                  <h2>{candidate.name}</h2>
                </div>

                <div className="vote-tally-box">
                  <div className="vote-numbers">
                    <span className="vote-count">{candidate.voteCount} {count === 1 ? "Vote" : "Votes"}</span>
                    <span className="vote-percentage">{percentage}%</span>
                  </div>
                  <div className="progress-track">
                    <div
                      className="progress-fill"
                      style={{ width: `${percentage}%` }}
                    ></div>
                  </div>
                </div>

                <button
                  className="btn-vote"
                  onClick={() => castVote(candidate.id, candidate.name)}
                  disabled={!account || userVoted || busy}
                >
                  {userVoted
                    ? "✓ You Already Voted"
                    : !account
                    ? "Connect Wallet to Vote"
                    : busy
                    ? "Processing..."
                    : `Vote for ${candidate.name}`}
                </button>
              </article>
            );
          })}
        </div>
      </section>

      {/* Admin Panel: Add Candidate (Visible for Owner) */}
      {isOwner && (
        <section className="admin-card">
          <div className="admin-header">
            <span>👑</span> Admin Panel (Contract Owner Only)
          </div>
          <p style={{ margin: 0, fontSize: "0.88rem", color: "#94a3b8" }}>
            As the contract deployer (<code>{contractOwner.slice(0, 10)}...</code>), you have permission to register new election candidates.
          </p>
          <form className="admin-form" onSubmit={handleAddCandidate}>
            <input
              type="text"
              className="admin-input"
              placeholder="Enter candidate name (e.g. Charlie)"
              value={newCandidateName}
              onChange={(e) => setNewCandidateName(e.target.value)}
              disabled={busy}
            />
            <button className="btn-primary" type="submit" disabled={busy || !newCandidateName.trim()}>
              + Register Candidate
            </button>
          </form>
        </section>
      )}

      {/* MetaMask Configuration Details */}
      <details className="setup-guide-box">
        <summary>📘 Hardhat Local Network Parameters for MetaMask</summary>
        <div className="guide-content">
          <div className="guide-item">
            <strong>Network Name</strong>
            <code>Hardhat Local</code>
          </div>
          <div className="guide-item">
            <strong>RPC URL</strong>
            <code>http://127.0.0.1:8545</code>
          </div>
          <div className="guide-item">
            <strong>Chain ID</strong>
            <code>31337</code>
          </div>
          <div className="guide-item">
            <strong>Currency Symbol</strong>
            <code>ETH</code>
          </div>
        </div>
      </details>

      {/* Academic Footer */}
      <footer>
        <div>Department of Computer Information Systems (CIS) · IBA · DIU</div>
        <div>Smart Contract: <code>{CONTRACT_ADDRESS}</code> · Hardhat 3 · ethers.js v6</div>
      </footer>
    </div>
  );
}

export default App;
