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
  exists: boolean;
}

interface VoterRecord {
  address: string;
  name: string;
  isRegistered: boolean;
  hasVoted: boolean;
}

interface TestAccount {
  label: string;
  address: string;
  privateKey: string;
  role: "owner" | "voter";
}

const CONTRACT_ADDRESS = "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9";
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
  const [selectedLocalIndex, setSelectedLocalIndex] = useState<number>(0);
  const [currentView, setCurrentView] = useState<"ballot" | "admin">("ballot");

  // State
  const [account, setAccount] = useState<string>(LOCAL_TEST_ACCOUNTS[0].address);
  const [contractOwner, setContractOwner] = useState<string>("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [votersList, setVotersList] = useState<VoterRecord[]>([]);
  const [userVoted, setUserVoted] = useState<boolean>(false);
  const [busy, setBusy] = useState<boolean>(false);
  const [alert, setAlert] = useState<AlertMessage>({
    type: "info",
    text: "Welcome to the Blockchain Voting DApp. You can vote or use the Admin Console to manage candidates & voters.",
  });

  // Admin form inputs
  const [newCandidateName, setNewCandidateName] = useState<string>("");
  const [editingCandidate, setEditingCandidate] = useState<{ id: number; name: string } | null>(null);

  const [newVoterAddress, setNewVoterAddress] = useState<string>("");
  const [newVoterName, setNewVoterName] = useState<string>("");
  const [editingVoter, setEditingVoter] = useState<{ address: string; name: string } | null>(null);

  // Reset modal state
  const [confirmModal, setConfirmModal] = useState<{
    open: boolean;
    title: string;
    message: string;
    action: () => Promise<void>;
  }>({
    open: false,
    title: "",
    message: "",
    action: async () => {},
  });

  // Extract human-friendly error messages
  function extractError(error: unknown, defaultMsg: string): string {
    if (error && typeof error === "object") {
      const err = error as { shortMessage?: string; reason?: string; message?: string };
      return err.shortMessage || err.reason || err.message || defaultMsg;
    }
    return defaultMsg;
  }

  // Provider for read-only calls
  const getReadProvider = useCallback(() => {
    if (window.ethereum) {
      return new BrowserProvider(window.ethereum);
    }
    return new JsonRpcProvider(LOCAL_RPC_URL);
  }, []);

  // Load all on-chain data
  const loadData = useCallback(async (currentAccount?: string) => {
    try {
      const provider = getReadProvider();
      const voting = new Contract(CONTRACT_ADDRESS, ABI, provider);

      // Fetch candidates, owner, and voter count
      const [count, owner, vCount] = await Promise.all([
        voting.candidateCount(),
        voting.owner(),
        voting.voterCount(),
      ]);

      setContractOwner(owner);

      // Load candidates
      const cItems: Candidate[] = [];
      for (let id = 0n; id < count; id++) {
        const c = await voting.getCandidate(id);
        cItems.push({
          id: Number(c.id),
          name: c.name,
          voteCount: c.voteCount.toString(),
          exists: Boolean(c.exists),
        });
      }
      setCandidates(cItems);

      // Load registered voters
      const vItems: VoterRecord[] = [];
      for (let i = 0n; i < vCount; i++) {
        const v = await voting.getVoter(i);
        vItems.push({
          address: v.voterAddress,
          name: v.name,
          isRegistered: Boolean(v.isRegistered),
          hasVoted: Boolean(v.voted),
        });
      }
      setVotersList(vItems);

      // Check current account's voting status
      const targetAddress = currentAccount || account;
      if (targetAddress) {
        const voted = await voting.hasVoted(targetAddress);
        setUserVoted(voted);
      }
    } catch (err) {
      console.error("Failed to load blockchain data:", err);
      setAlert({
        type: "error",
        text: "Could not connect to Hardhat local blockchain. Please ensure 'npm run node' is running.",
      });
    }
  }, [getReadProvider, account]);

  // Initial mount data load
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Signer selector based on authMode
  async function getActiveSigner(): Promise<Signer> {
    if (authMode === "metamask" && window.ethereum) {
      const provider = new BrowserProvider(window.ethereum);
      return await provider.getSigner();
    }
    const current = LOCAL_TEST_ACCOUNTS[selectedLocalIndex];
    const rpcProvider = new JsonRpcProvider(LOCAL_RPC_URL);
    return new Wallet(current.privateKey, rpcProvider);
  }

  // Connect MetaMask
  async function connectMetaMask() {
    try {
      setBusy(true);
      if (!window.ethereum) {
        setAlert({
          type: "warning",
          text: "MetaMask is not detected. Please install the extension or use Local Node Accounts.",
        });
        return;
      }

      const provider = new BrowserProvider(window.ethereum);
      const network = await provider.getNetwork();

      if (network.chainId !== CHAIN_ID) {
        setAlert({
          type: "warning",
          text: `Please switch MetaMask to Hardhat Local (Chain ID: 31337). Connected to: ${network.chainId}`,
        });
        return;
      }

      const accounts = await provider.send("eth_requestAccounts", []);
      const userAddr = accounts[0];
      setAccount(userAddr);
      await loadData(userAddr);

      setAlert({
        type: "success",
        text: `Connected with MetaMask: ${userAddr.slice(0, 6)}...${userAddr.slice(-4)}`,
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

  // Connect Local Dev Account
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
        text: extractError(err, "Failed to switch account."),
      });
    }
  }

  // =============================================================
  // Voting Action
  // =============================================================
  async function castVote(candidateId: number, candidateName: string) {
    if (!account) {
      setAlert({
        type: "warning",
        text: "Please connect a wallet or activate a Local Dev Account first.",
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
        text: "Transaction submitted. Awaiting block confirmation...",
        txHash: tx.hash,
      });

      await tx.wait();

      setAlert({
        type: "success",
        text: `Vote for ${candidateName} confirmed on-chain!`,
        txHash: tx.hash,
      });

      await loadData(account);
    } catch (err) {
      setAlert({
        type: "error",
        text: extractError(err, "Voting transaction failed."),
      });
    } finally {
      setBusy(false);
    }
  }

  // =============================================================
  // Admin: Candidate Management
  // =============================================================
  async function handleAddCandidate(e: React.FormEvent) {
    e.preventDefault();
    if (!newCandidateName.trim()) return;

    try {
      setBusy(true);
      setAlert({ type: "info", text: `Registering candidate "${newCandidateName}"...` });

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
        text: extractError(err, "Failed to add candidate. Ensure current account is Owner."),
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleEditCandidate(e: React.FormEvent) {
    e.preventDefault();
    if (!editingCandidate || !editingCandidate.name.trim()) return;

    try {
      setBusy(true);
      setAlert({ type: "info", text: `Updating candidate #${editingCandidate.id}...` });

      const signer = await getActiveSigner();
      const voting = new Contract(CONTRACT_ADDRESS, ABI, signer);

      const tx = await voting.editCandidate(editingCandidate.id, editingCandidate.name.trim());
      await tx.wait();

      setAlert({
        type: "success",
        text: `Candidate #${editingCandidate.id} updated to "${editingCandidate.name}"!`,
        txHash: tx.hash,
      });

      setEditingCandidate(null);
      await loadData(account);
    } catch (err) {
      setAlert({
        type: "error",
        text: extractError(err, "Failed to edit candidate."),
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteCandidate(candidateId: number, name: string) {
    try {
      setBusy(true);
      setAlert({ type: "info", text: `Removing candidate #${candidateId} (${name})...` });

      const signer = await getActiveSigner();
      const voting = new Contract(CONTRACT_ADDRESS, ABI, signer);

      const tx = await voting.deleteCandidate(candidateId);
      await tx.wait();

      setAlert({
        type: "success",
        text: `Candidate #${candidateId} (${name}) deactivated from ballot.`,
        txHash: tx.hash,
      });

      await loadData(account);
    } catch (err) {
      setAlert({
        type: "error",
        text: extractError(err, "Failed to delete candidate."),
      });
    } finally {
      setBusy(false);
    }
  }

  // =============================================================
  // Admin: Voter Management
  // =============================================================
  async function handleAddVoter(e: React.FormEvent) {
    e.preventDefault();
    if (!newVoterAddress.trim() || !newVoterName.trim()) return;

    try {
      setBusy(true);
      setAlert({ type: "info", text: `Registering voter "${newVoterName}"...` });

      const signer = await getActiveSigner();
      const voting = new Contract(CONTRACT_ADDRESS, ABI, signer);

      const tx = await voting.addVoter(newVoterAddress.trim(), newVoterName.trim());
      await tx.wait();

      setAlert({
        type: "success",
        text: `Voter "${newVoterName}" (${newVoterAddress.slice(0, 8)}...) registered!`,
        txHash: tx.hash,
      });

      setNewVoterAddress("");
      setNewVoterName("");
      await loadData(account);
    } catch (err) {
      setAlert({
        type: "error",
        text: extractError(err, "Failed to add voter."),
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleEditVoter(e: React.FormEvent) {
    e.preventDefault();
    if (!editingVoter || !editingVoter.name.trim()) return;

    try {
      setBusy(true);
      setAlert({ type: "info", text: `Updating voter name for ${editingVoter.address.slice(0, 8)}...` });

      const signer = await getActiveSigner();
      const voting = new Contract(CONTRACT_ADDRESS, ABI, signer);

      const tx = await voting.editVoter(editingVoter.address, editingVoter.name.trim());
      await tx.wait();

      setAlert({
        type: "success",
        text: `Voter name updated to "${editingVoter.name}"!`,
        txHash: tx.hash,
      });

      setEditingVoter(null);
      await loadData(account);
    } catch (err) {
      setAlert({
        type: "error",
        text: extractError(err, "Failed to edit voter."),
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteVoter(voterAddr: string) {
    try {
      setBusy(true);
      setAlert({ type: "info", text: `Unregistering voter ${voterAddr.slice(0, 8)}...` });

      const signer = await getActiveSigner();
      const voting = new Contract(CONTRACT_ADDRESS, ABI, signer);

      const tx = await voting.deleteVoter(voterAddr);
      await tx.wait();

      setAlert({
        type: "success",
        text: `Voter ${voterAddr.slice(0, 8)}... deleted from registry.`,
        txHash: tx.hash,
      });

      await loadData(account);
    } catch (err) {
      setAlert({
        type: "error",
        text: extractError(err, "Failed to delete voter."),
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleResetVoter(voterAddr: string) {
    try {
      setBusy(true);
      setAlert({ type: "info", text: `Resetting voting status for ${voterAddr.slice(0, 8)}...` });

      const signer = await getActiveSigner();
      const voting = new Contract(CONTRACT_ADDRESS, ABI, signer);

      const tx = await voting.resetVoterStatus(voterAddr);
      await tx.wait();

      setAlert({
        type: "success",
        text: `Voting status for ${voterAddr.slice(0, 8)}... reset! They may vote again.`,
        txHash: tx.hash,
      });

      await loadData(account);
    } catch (err) {
      setAlert({
        type: "error",
        text: extractError(err, "Failed to reset voter status."),
      });
    } finally {
      setBusy(false);
    }
  }

  // Quick helper to fill voter form from test account
  function quickFillVoter(acc: TestAccount) {
    setNewVoterAddress(acc.address);
    setNewVoterName(acc.label.split("(")[1].replace(")", ""));
  }

  // =============================================================
  // Admin: System Reset Operations
  // =============================================================
  async function executeResetElection() {
    try {
      setBusy(true);
      setAlert({ type: "info", text: "Resetting all election votes on-chain..." });

      const signer = await getActiveSigner();
      const voting = new Contract(CONTRACT_ADDRESS, ABI, signer);

      const tx = await voting.resetElection();
      await tx.wait();

      setAlert({
        type: "success",
        text: "Election votes successfully reset! All candidate tallies are 0 and voters may re-vote.",
        txHash: tx.hash,
      });

      setConfirmModal({ ...confirmModal, open: false });
      await loadData(account);
    } catch (err) {
      setAlert({
        type: "error",
        text: extractError(err, "Failed to reset election votes."),
      });
    } finally {
      setBusy(false);
    }
  }

  async function executeFactoryReset() {
    try {
      setBusy(true);
      setAlert({ type: "info", text: "Performing full system factory reset on-chain..." });

      const signer = await getActiveSigner();
      const voting = new Contract(CONTRACT_ADDRESS, ABI, signer);

      const tx = await voting.resetAll();
      await tx.wait();

      setAlert({
        type: "success",
        text: "Factory reset complete! All candidates, voters, and tallies have been cleared.",
        txHash: tx.hash,
      });

      setConfirmModal({ ...confirmModal, open: false });
      await loadData(account);
    } catch (err) {
      setAlert({
        type: "error",
        text: extractError(err, "Failed to factory reset system."),
      });
    } finally {
      setBusy(false);
    }
  }

  // =============================================================
  // Statistics Calculations
  // =============================================================
  const activeCandidates = candidates.filter((c) => c.exists);
  const totalVotes = activeCandidates.reduce((sum, c) => sum + Number(c.voteCount), 0);
  const leadingCandidate = activeCandidates.length > 0
    ? [...activeCandidates].sort((a, b) => Number(b.voteCount) - Number(a.voteCount))[0]
    : null;

  const isOwner = Boolean(
    account && contractOwner && account.toLowerCase() === contractOwner.toLowerCase()
  );

  return (
    <div className="dapp-container">
      {/* Top Header */}
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

      {/* Main View Switcher */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
        <div className="view-tabs">
          <button
            className={`view-tab ${currentView === "ballot" ? "active" : ""}`}
            onClick={() => setCurrentView("ballot")}
          >
            🗳️ Official Ballot
          </button>
          <button
            className={`view-tab ${currentView === "admin" ? "active" : ""}`}
            onClick={() => setCurrentView("admin")}
          >
            👑 Admin Console {isOwner && <span style={{ fontSize: "0.7rem", background: "#ef4444", color: "#fff", padding: "0.15rem 0.45rem", borderRadius: "999px" }}>Owner</span>}
          </button>
        </div>

        <button
          className="btn-secondary"
          onClick={() => loadData()}
          disabled={busy}
        >
          ↻ Refresh All State
        </button>
      </div>

      {/* Wallet & Account Authentication Panel */}
      <section className="wallet-panel">
        <div className="wallet-header">
          <h2 className="wallet-title">
            <span>🔑</span> Active Wallet & Signer
          </h2>

          <div className="mode-tabs">
            <button
              className={`mode-tab ${authMode === "local" ? "active" : ""}`}
              onClick={() => {
                setAuthMode("local");
                connectLocalAccount(selectedLocalIndex);
              }}
            >
              💻 Local Node Accounts
            </button>
            <button
              className={`mode-tab ${authMode === "metamask" ? "active" : ""}`}
              onClick={() => {
                setAuthMode("metamask");
                if (hasMetaMask) connectMetaMask();
              }}
            >
              🦊 MetaMask Mode
            </button>
          </div>
        </div>

        {/* Local Node Accounts Mode */}
        {authMode === "local" && (
          <div className="account-selector-box">
            <span className="selector-label">Choose a pre-funded Hardhat Test Account to interact with the contract:</span>
            <div className="selector-controls">
              <select
                className="account-select"
                value={selectedLocalIndex}
                onChange={(e) => connectLocalAccount(Number(e.target.value))}
                disabled={busy}
              >
                {LOCAL_TEST_ACCOUNTS.map((acc, idx) => (
                  <option key={acc.address} value={idx}>
                    {acc.label} — {acc.address.slice(0, 10)}... ({acc.role === "owner" ? "Owner/Admin" : "Voter"})
                  </option>
                ))}
              </select>
              <button
                className="btn-primary"
                onClick={() => connectLocalAccount(selectedLocalIndex)}
                disabled={busy}
              >
                Switch Account
              </button>
            </div>
          </div>
        )}

        {/* MetaMask Mode Content */}
        {authMode === "metamask" && (
          <div>
            {!hasMetaMask ? (
              <div className="metamask-banner">
                <div className="banner-header">
                  <span>⚠️</span> MetaMask Extension Not Detected in this Browser
                </div>
                <p className="banner-body">
                  To use MetaMask, install the official browser extension or switch to <strong>Local Node Accounts</strong> above to test and vote immediately without installing anything!
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

        {/* Active Account Information Display */}
        {account && (
          <div className="connected-info">
            <div className="account-address">
              <span>👤 Address:</span>
              <strong>{account}</strong>
            </div>

            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <span className={`role-badge ${isOwner ? "role-owner" : "role-voter"}`}>
                {isOwner ? "👑 Contract Owner (Admin)" : "🗳️ Standard Voter"}
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

      {/* =============================================================
          VIEW 1: OFFICIAL BALLOT (Voting View)
          ============================================================= */}
      {currentView === "ballot" && (
        <>
          {/* Election Stats Grid */}
          <section className="stats-grid">
            <div className="stat-card">
              <div className="stat-number">{activeCandidates.length}</div>
              <div className="stat-label">Active Candidates</div>
            </div>

            <div className="stat-card">
              <div className="stat-number">{votersList.length}</div>
              <div className="stat-label">Registered Voters</div>
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
              <span style={{ fontSize: "0.88rem", color: "#94a3b8" }}>
                Select a candidate and click vote to cast your on-chain ballot.
              </span>
            </div>

            {activeCandidates.length === 0 ? (
              <div className="admin-card" style={{ textAlign: "center", padding: "2.5rem" }}>
                <p style={{ margin: 0, color: "#94a3b8", fontSize: "1.1rem" }}>
                  No active candidates available on this ballot.
                </p>
                {isOwner && (
                  <button
                    className="btn-primary"
                    style={{ margin: "1rem auto 0 auto" }}
                    onClick={() => setCurrentView("admin")}
                  >
                    Go to Admin Console to Add Candidates
                  </button>
                )}
              </div>
            ) : (
              <div className="candidates-grid">
                {activeCandidates.map((candidate) => {
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
            )}
          </section>
        </>
      )}

      {/* =============================================================
          VIEW 2: ADMIN CONSOLE (Candidate, Voter & Reset Management)
          ============================================================= */}
      {currentView === "admin" && (
        <section className="admin-section">
          {!isOwner && (
            <div className="status-banner status-warning">
              <span>⚠️ Notice: You are currently connected with a non-owner account (<code>{account.slice(0, 10)}...</code>). Switch to Account #0 (Deployer/Admin) above to execute admin operations.</span>
            </div>
          )}

          {/* 1. Candidate Management Card */}
          <div className="admin-card">
            <div className="admin-card-header">
              <h3 className="admin-card-title">
                <span>👥</span> Candidate Management (Add, Edit, Delete)
              </h3>
              <span className="badge">Total Candidates: {candidates.length}</span>
            </div>

            {/* Add Candidate Form */}
            <form className="admin-form" onSubmit={handleAddCandidate}>
              <input
                type="text"
                className="input-text"
                placeholder="Enter new candidate name (e.g. Charlie, Diana)"
                value={newCandidateName}
                onChange={(e) => setNewCandidateName(e.target.value)}
                disabled={busy || !isOwner}
              />
              <button
                className="btn-primary"
                type="submit"
                disabled={busy || !isOwner || !newCandidateName.trim()}
              >
                + Add Candidate
              </button>
            </form>

            {/* Candidates Table */}
            <div className="table-responsive">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Name</th>
                    <th>Votes</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ textAlign: "center", color: "#94a3b8" }}>
                        No candidates registered yet.
                      </td>
                    </tr>
                  ) : (
                    candidates.map((c) => (
                      <tr key={c.id}>
                        <td><strong>#{c.id}</strong></td>
                        <td>
                          {editingCandidate?.id === c.id ? (
                            <form
                              style={{ display: "flex", gap: "0.5rem" }}
                              onSubmit={handleEditCandidate}
                            >
                              <input
                                type="text"
                                className="input-text"
                                style={{ padding: "0.3rem 0.6rem" }}
                                value={editingCandidate.name}
                                onChange={(e) =>
                                  setEditingCandidate({ ...editingCandidate, name: e.target.value })
                                }
                                autoFocus
                              />
                              <button className="btn-primary" type="submit" disabled={busy}>
                                Save
                              </button>
                              <button
                                className="btn-secondary"
                                type="button"
                                onClick={() => setEditingCandidate(null)}
                              >
                                Cancel
                              </button>
                            </form>
                          ) : (
                            <span style={{ fontWeight: 600 }}>{c.name}</span>
                          )}
                        </td>
                        <td>{c.voteCount}</td>
                        <td>
                          <span
                            className="role-badge"
                            style={{
                              background: c.exists ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
                              color: c.exists ? "#6ee7b7" : "#f87171",
                            }}
                          >
                            {c.exists ? "Active" : "Deleted"}
                          </span>
                        </td>
                        <td>
                          <div className="table-actions">
                            {c.exists && editingCandidate?.id !== c.id && (
                              <button
                                className="btn-warning"
                                onClick={() => setEditingCandidate({ id: c.id, name: c.name })}
                                disabled={busy || !isOwner}
                              >
                                ✏️ Edit
                              </button>
                            )}
                            {c.exists && (
                              <button
                                className="btn-danger"
                                onClick={() => handleDeleteCandidate(c.id, c.name)}
                                disabled={busy || !isOwner}
                              >
                                🗑️ Delete
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* 2. Voter Management Card */}
          <div className="admin-card">
            <div className="admin-card-header">
              <h3 className="admin-card-title">
                <span>🪪</span> Voter Management (Add, Edit, Reset, Delete)
              </h3>
              <span className="badge">Registered Voters: {votersList.length}</span>
            </div>

            {/* Quick-fill helper */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <span style={{ fontSize: "0.82rem", color: "#94a3b8" }}>
                Quick-populate with local test accounts:
              </span>
              <div className="quick-buttons-row">
                {LOCAL_TEST_ACCOUNTS.slice(1).map((acc) => (
                  <button
                    key={acc.address}
                    type="button"
                    className="quick-btn"
                    onClick={() => quickFillVoter(acc)}
                  >
                    + {acc.label.split("(")[0]}
                  </button>
                ))}
              </div>
            </div>

            {/* Add Voter Form */}
            <form className="admin-form" onSubmit={handleAddVoter}>
              <input
                type="text"
                className="input-text"
                placeholder="Voter Ethereum Address (0x...)"
                value={newVoterAddress}
                onChange={(e) => setNewVoterAddress(e.target.value)}
                disabled={busy || !isOwner}
              />
              <input
                type="text"
                className="input-text"
                placeholder="Voter Full Name"
                value={newVoterName}
                onChange={(e) => setNewVoterName(e.target.value)}
                disabled={busy || !isOwner}
              />
              <button
                className="btn-primary"
                type="submit"
                disabled={busy || !isOwner || !newVoterAddress.trim() || !newVoterName.trim()}
              >
                + Register Voter
              </button>
            </form>

            {/* Voters Table */}
            <div className="table-responsive">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Voter Name</th>
                    <th>Wallet Address</th>
                    <th>Vote Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {votersList.length === 0 ? (
                    <tr>
                      <td colSpan={4} style={{ textAlign: "center", color: "#94a3b8" }}>
                        No voters registered yet. Use the form above to add voters.
                      </td>
                    </tr>
                  ) : (
                    votersList.map((v) => (
                      <tr key={v.address}>
                        <td>
                          {editingVoter?.address === v.address ? (
                            <form
                              style={{ display: "flex", gap: "0.5rem" }}
                              onSubmit={handleEditVoter}
                            >
                              <input
                                type="text"
                                className="input-text"
                                style={{ padding: "0.3rem 0.6rem" }}
                                value={editingVoter.name}
                                onChange={(e) =>
                                  setEditingVoter({ ...editingVoter, name: e.target.value })
                                }
                                autoFocus
                              />
                              <button className="btn-primary" type="submit" disabled={busy}>
                                Save
                              </button>
                              <button
                                className="btn-secondary"
                                type="button"
                                onClick={() => setEditingVoter(null)}
                              >
                                Cancel
                              </button>
                            </form>
                          ) : (
                            <span style={{ fontWeight: 600 }}>{v.name}</span>
                          )}
                        </td>
                        <td style={{ fontFamily: "monospace", color: "#38bdf8" }}>
                          {v.address.slice(0, 10)}...{v.address.slice(-6)}
                        </td>
                        <td>
                          <span
                            className="role-badge"
                            style={{
                              background: v.hasVoted ? "rgba(239, 68, 68, 0.15)" : "rgba(16, 185, 129, 0.15)",
                              color: v.hasVoted ? "#f87171" : "#6ee7b7",
                            }}
                          >
                            {v.hasVoted ? "✓ Has Voted" : "○ Eligible"}
                          </span>
                        </td>
                        <td>
                          <div className="table-actions">
                            {editingVoter?.address !== v.address && (
                              <button
                                className="btn-warning"
                                onClick={() => setEditingVoter({ address: v.address, name: v.name })}
                                disabled={busy || !isOwner}
                              >
                                ✏️ Edit
                              </button>
                            )}
                            {v.hasVoted && (
                              <button
                                className="btn-secondary"
                                style={{ color: "#38bdf8", borderColor: "#38bdf8" }}
                                onClick={() => handleResetVoter(v.address)}
                                disabled={busy || !isOwner}
                                title="Reset vote status to allow re-voting"
                              >
                                🔄 Reset Vote
                              </button>
                            )}
                            <button
                              className="btn-danger"
                              onClick={() => handleDeleteVoter(v.address)}
                              disabled={busy || !isOwner}
                            >
                              🗑️ Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* 3. System Reset & Maintenance Card */}
          <div className="admin-card" style={{ borderColor: "rgba(239, 68, 68, 0.4)" }}>
            <div className="admin-card-header">
              <h3 className="admin-card-title" style={{ color: "#f87171" }}>
                <span>⚙️</span> System Reset & Election Maintenance
              </h3>
              <span className="badge" style={{ color: "#f87171", borderColor: "rgba(239, 68, 68, 0.3)" }}>
                Danger Zone
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1.25rem" }}>
              {/* Option A: Reset Votes Only */}
              <div
                style={{
                  background: "rgba(11, 19, 41, 0.6)",
                  padding: "1.25rem",
                  borderRadius: "10px",
                  border: "1px solid var(--border-color)",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  gap: "1rem",
                }}
              >
                <div>
                  <h4 style={{ margin: "0 0 0.5rem 0", color: "#fbbf24" }}>
                    🔄 Reset Votes Only
                  </h4>
                  <p style={{ margin: 0, fontSize: "0.85rem", color: "#94a3b8", lineHeight: 1.4 }}>
                    Zeros out all candidate vote counts and clears the voting history. <strong>Candidates and registered voters remain intact</strong> for a fresh election round.
                  </p>
                </div>
                <button
                  className="btn-warning"
                  style={{ width: "fit-content" }}
                  disabled={busy || !isOwner}
                  onClick={() =>
                    setConfirmModal({
                      open: true,
                      title: "Confirm Reset Votes",
                      message: "Are you sure you want to reset all vote counts to zero? Candidates and voters will be kept.",
                      action: executeResetElection,
                    })
                  }
                >
                  Reset Election Votes
                </button>
              </div>

              {/* Option B: Factory Reset All */}
              <div
                style={{
                  background: "rgba(11, 19, 41, 0.6)",
                  padding: "1.25rem",
                  borderRadius: "10px",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  gap: "1rem",
                }}
              >
                <div>
                  <h4 style={{ margin: "0 0 0.5rem 0", color: "#f87171" }}>
                    ⚠️ Full Factory Reset
                  </h4>
                  <p style={{ margin: 0, fontSize: "0.85rem", color: "#94a3b8", lineHeight: 1.4 }}>
                    Permanently clears <strong>ALL candidates, voters, and vote tallies</strong> on the blockchain. The contract will revert to an empty factory state.
                  </p>
                </div>
                <button
                  className="btn-danger-solid"
                  style={{ width: "fit-content" }}
                  disabled={busy || !isOwner}
                  onClick={() =>
                    setConfirmModal({
                      open: true,
                      title: "Confirm Full Factory Reset",
                      message: "WARNING: This will permanently delete all candidates, registered voters, and voting records on-chain. This action cannot be undone.",
                      action: executeFactoryReset,
                    })
                  }
                >
                  Factory Reset Entire System
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Confirmation Modal */}
      {confirmModal.open && (
        <div className="modal-overlay">
          <div className="modal-box">
            <div className="modal-header">
              <h3 className="modal-title">{confirmModal.title}</h3>
              <button
                className="btn-secondary"
                style={{ padding: "0.2rem 0.5rem" }}
                onClick={() => setConfirmModal({ ...confirmModal, open: false })}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">{confirmModal.message}</div>
            <div className="modal-footer">
              <button
                className="btn-secondary"
                onClick={() => setConfirmModal({ ...confirmModal, open: false })}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                className="btn-danger-solid"
                onClick={confirmModal.action}
                disabled={busy}
              >
                {busy ? "Executing..." : "Confirm & Execute"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hardhat Network Quick Reference */}
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

      {/* Footer */}
      <footer>
        <div>Department of Computer Information Systems (CIS) · IBA · DIU</div>
        <div>Smart Contract: <code>{CONTRACT_ADDRESS}</code> · Hardhat 3 · ethers.js v6</div>
      </footer>
    </div>
  );
}

export default App;
