import React, { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import VotingAbi from './contracts/Voting.json';
import { CONTRACT_ADDRESS, CHAIN_ID, RPC_URL } from './contracts/contractConfig.js';

const TARGET_CHAIN_ID_HEX = '0x' + CHAIN_ID.toString(16); // 0x7a69 for 31337

/**
 * Diagnoses and categorizes errors from MetaMask and ethers.js v6.
 * Extracts nested RPC details and prevents generic or unhelpful messages.
 */
function diagnoseError(err) {
  if (!err) {
    return {
      category: 'UNKNOWN',
      title: 'Unknown Error',
      details: 'An unknown error occurred.',
      raw: {},
    };
  }

  const code = err.code || err.info?.error?.code || 'N/A';
  const shortMessage = err.shortMessage || '';
  const message = err.message || '';
  const reason = err.reason || '';
  const data = err.data || err.info?.error?.data || '';
  const info = err.info;
  const cause = err.cause;
  const nestedError = err.info?.error || err.error || err.cause;
  const nestedMsg = nestedError?.message || nestedError?.data?.message || '';

  const fullText = `${message} ${shortMessage} ${reason} ${nestedMsg} ${
    typeof data === 'string' ? data : JSON.stringify(data || '')
  }`.toLowerCase();

  const raw = {
    code,
    message,
    shortMessage,
    reason,
    data: typeof data === 'string' ? data : JSON.stringify(data || ''),
    info,
    cause,
  };

  // 1. User rejected action in MetaMask
  if (
    code === 4001 ||
    code === 'ACTION_REJECTED' ||
    fullText.includes('user rejected') ||
    fullText.includes('user denied') ||
    fullText.includes('rejected by user')
  ) {
    return {
      category: 'USER_REJECTED',
      title: 'Transaction Cancelled',
      details: 'Transaction was cancelled or rejected in MetaMask by user.',
      raw,
    };
  }

  // 2. BAD_DATA: Could not decode result data (empty response / missing contract)
  if (
    code === 'BAD_DATA' ||
    fullText.includes('could not decode result data') ||
    fullText.includes('bad_data')
  ) {
    const fnName = info?.method || reason || 'contract function';
    return {
      category: 'BAD_DATA',
      title: 'Contract Call Decode Error (BAD_DATA)',
      details: `The node returned empty data (0x) when calling ${fnName}. This typically indicates that no contract bytecode is deployed at ${CONTRACT_ADDRESS} on the active network, or function selector mismatch.`,
      raw,
    };
  }

  // 3. Wrong network connected
  if (
    code === 'WRONG_NETWORK' ||
    code === 4902 ||
    fullText.includes('wrong network') ||
    fullText.includes('chain id')
  ) {
    return {
      category: 'WRONG_NETWORK',
      title: 'Wrong Network',
      details: `MetaMask is connected to an unexpected network. Please switch to Hardhat Local (Chain ID: ${CHAIN_ID}).`,
      raw,
    };
  }

  // 4. Nonce mismatch (frequent on local node restarts)
  if (
    fullText.includes('nonce too high') ||
    fullText.includes('nonce too low') ||
    fullText.includes('nonce has already been used') ||
    fullText.includes('nonce mismatch')
  ) {
    return {
      category: 'NONCE_MISMATCH',
      title: 'MetaMask Nonce Mismatch',
      details: 'MetaMask transaction nonce is out of sync with the local node. Fix: In MetaMask, go to Settings > Advanced > Clear activity tab data.',
      raw,
    };
  }

  // 5. Insufficient funds
  if (
    fullText.includes('insufficient funds') ||
    fullText.includes('intrinsic transaction cost')
  ) {
    return {
      category: 'INSUFFICIENT_FUNDS',
      title: 'Insufficient Balance',
      details: 'Your wallet has insufficient ETH to cover the transaction gas cost on Hardhat Local.',
      raw,
    };
  }

  // 6. Contract revert with custom reason
  if (
    fullText.includes('already voted') ||
    fullText.includes('invalid candidate id')
  ) {
    let revertText = reason;
    if (!revertText) {
      if (fullText.includes('already voted')) revertText = 'You have already voted.';
      else if (fullText.includes('invalid candidate id')) revertText = 'Invalid candidate ID.';
    }
    return {
      category: 'CONTRACT_REVERT',
      title: 'Contract Execution Reverted',
      details: revertText || 'Smart contract transaction reverted.',
      raw,
    };
  }

  // 7. Gas estimation failure
  if (
    code === 'UNPREDICTABLE_GAS_LIMIT' ||
    fullText.includes('estimategas') ||
    fullText.includes('gas estimation failed')
  ) {
    return {
      category: 'GAS_ESTIMATION_FAILURE',
      title: 'Gas Estimation Failed',
      details: nestedMsg || reason || 'Gas estimation failed. The transaction would likely revert on-chain.',
      raw,
    };
  }

  // 8. RPC connection failure
  if (
    fullText.includes('failed to fetch') ||
    fullText.includes('could not detect network') ||
    fullText.includes('connection refused') ||
    fullText.includes('parse error')
  ) {
    return {
      category: 'RPC_CONNECTION_FAILURE',
      title: 'RPC Connection Error',
      details: `Cannot connect to Hardhat node at ${RPC_URL}. Ensure the local node is active.`,
      raw,
    };
  }

  // Fallback: extract nested error from ethers v6 "could not coalesce error"
  let fallbackText = nestedMsg || reason || shortMessage || message || 'Transaction failed.';
  if (fallbackText.includes('could not coalesce error') && nestedMsg) {
    fallbackText = nestedMsg;
  }

  return {
    category: 'GENERAL_ERROR',
    title: 'Transaction Error',
    details: fallbackText,
    raw,
  };
}

function App() {
  const [account, setAccount] = useState(null);
  const [accountBalance, setAccountBalance] = useState(null);
  const [currentChainId, setCurrentChainId] = useState(null);
  const [isMetaMaskInstalled, setIsMetaMaskInstalled] = useState(true);
  const [candidates, setCandidates] = useState([]);
  const [hasVoted, setHasVoted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isVoting, setIsVoting] = useState(false);
  const [txStatus, setTxStatus] = useState({
    type: 'idle',
    message: 'Ready — Connect MetaMask to cast your vote on the local blockchain.',
    hash: null,
    diag: null,
  });

  const isWrongNetwork = Boolean(account && currentChainId && currentChainId !== CHAIN_ID);

  // Shorten address for display
  const formatAddress = (addr) => {
    if (!addr) return '';
    return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;
  };

  // Fetch candidate list, balance, and voting eligibility from blockchain
  const loadBlockchainData = useCallback(async (currentAccount = account) => {
    setIsLoading(true);
    try {
      const provider = window.ethereum
        ? new ethers.BrowserProvider(window.ethereum)
        : new ethers.JsonRpcProvider(RPC_URL);

      // Verify contract bytecode exists at target address
      const code = await provider.getCode(CONTRACT_ADDRESS);
      if (code === '0x' || code.length <= 2) {
        setTxStatus({
          type: 'error',
          message: `No contract deployed at ${CONTRACT_ADDRESS} on Hardhat Local (Chain ID: ${CHAIN_ID}).`,
          hash: null,
          diag: {
            category: 'BAD_DATA',
            title: 'No Contract Bytecode',
            details: `The node returned empty bytecode (0x) for address ${CONTRACT_ADDRESS}. Please ensure your local node has the Voting contract deployed.`,
            raw: { code: 'BAD_DATA' },
          },
        });
        setIsLoading(false);
        return;
      }

      // Create read-only contract instance
      const contract = new ethers.Contract(CONTRACT_ADDRESS, VotingAbi, provider);

      // 1. Read candidateCount()
      let count = 0;
      try {
        const countBig = await contract.candidateCount();
        count = Number(countBig);
      } catch (countErr) {
        console.error('Error calling candidateCount():', countErr);
        const diag = diagnoseError(countErr);
        setTxStatus({
          type: 'error',
          message: `Failed reading candidateCount(): ${diag.details}`,
          hash: null,
          diag,
        });
        setIsLoading(false);
        return;
      }

      // 2. Read candidates(i)
      const items = [];
      for (let i = 1; i <= count; i++) {
        try {
          const c = await contract.candidates(i);
          items.push({
            id: Number(c.id),
            name: c.name,
            voteCount: Number(c.voteCount),
          });
        } catch (candErr) {
          console.error(`Error calling candidates(${i}):`, candErr);
          const diag = diagnoseError(candErr);
          setTxStatus({
            type: 'error',
            message: `Failed reading candidate #${i}: ${diag.details}`,
            hash: null,
            diag,
          });
          setIsLoading(false);
          return;
        }
      }

      setCandidates(items);

      // 3. Check voting eligibility and balance if account is connected
      if (currentAccount) {
        try {
          const voted = await contract.hasVoted(currentAccount);
          setHasVoted(voted);
        } catch (votedErr) {
          console.warn('Could not read hasVoted for account:', votedErr);
        }

        try {
          const bal = await provider.getBalance(currentAccount);
          setAccountBalance(ethers.formatEther(bal));
        } catch (balErr) {
          console.warn('Could not fetch account balance:', balErr);
          setAccountBalance(null);
        }
      } else {
        setHasVoted(false);
        setAccountBalance(null);
      }

      // If previous status was a load error, clear it
      setTxStatus((prev) => {
        if (prev.type === 'error' && prev.diag?.category === 'BAD_DATA') {
          return {
            type: 'idle',
            message: 'Ready — Connect MetaMask to cast your vote on the local blockchain.',
            hash: null,
            diag: null,
          };
        }
        return prev;
      });
    } catch (err) {
      console.error('Error loading blockchain data:', err);
      const diag = diagnoseError(err);
      setTxStatus({
        type: 'error',
        message: `Failed to load blockchain data: ${diag.details}`,
        hash: null,
        diag,
      });
    } finally {
      setIsLoading(false);
    }
  }, [account]);

  // Check MetaMask installation and initial connection
  useEffect(() => {
    if (!window.ethereum) {
      setIsMetaMaskInstalled(false);
      loadBlockchainData();
      return;
    }

    setIsMetaMaskInstalled(true);

    const provider = new ethers.BrowserProvider(window.ethereum);

    // Check currently connected network and accounts independently
    provider.getNetwork().then((net) => {
      setCurrentChainId(Number(net.chainId));
    }).catch(console.error);

    provider.listAccounts().then((accounts) => {
      if (accounts.length > 0) {
        const userAddr = accounts[0].address;
        setAccount(userAddr);
        loadBlockchainData(userAddr);
      } else {
        loadBlockchainData(null);
      }
    }).catch(console.error);

    // Event listeners
    const handleAccountsChanged = (accounts) => {
      if (accounts && accounts.length > 0) {
        const newAccount = accounts[0];
        setAccount(newAccount);
        setTxStatus({
          type: 'info',
          message: `Switched account to ${formatAddress(newAccount)}.`,
          hash: null,
          diag: null,
        });
        loadBlockchainData(newAccount);
      } else {
        setAccount(null);
        setHasVoted(false);
        setAccountBalance(null);
        setTxStatus({
          type: 'info',
          message: 'Wallet disconnected.',
          hash: null,
          diag: null,
        });
      }
    };

    const handleChainChanged = (hexChainId) => {
      const newChainId = parseInt(hexChainId, 16);
      setCurrentChainId(newChainId);
      window.location.reload();
    };

    window.ethereum.on('accountsChanged', handleAccountsChanged);
    window.ethereum.on('chainChanged', handleChainChanged);

    return () => {
      if (window.ethereum.removeListener) {
        window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
        window.ethereum.removeListener('chainChanged', handleChainChanged);
      }
    };
  }, [loadBlockchainData]);

  // Connect MetaMask (Separated from contract data loading)
  const connectWallet = async () => {
    if (!window.ethereum) {
      alert('MetaMask is not installed. Please install MetaMask to use this application.');
      return;
    }

    try {
      setTxStatus({ type: 'info', message: 'Connecting to MetaMask...', hash: null, diag: null });

      // 1. Request wallet permission independently
      const accounts = await window.ethereum.request({
        method: 'eth_requestAccounts',
      });

      if (!accounts || accounts.length === 0) {
        throw new Error('No accounts selected in MetaMask.');
      }

      const userAccount = accounts[0];
      setAccount(userAccount);

      // 2. Validate chain ID
      const provider = new ethers.BrowserProvider(window.ethereum);
      const net = await provider.getNetwork();
      const chain = Number(net.chainId);
      setCurrentChainId(chain);

      // 3. Mark wallet connection successful
      setTxStatus({
        type: 'success',
        message: `Connected wallet: ${formatAddress(userAccount)}`,
        hash: null,
        diag: null,
      });

      // 4. Trigger data loading independently
      loadBlockchainData(userAccount).catch((loadErr) => {
        console.warn('Non-fatal contract data loading error after wallet connection:', loadErr);
      });
    } catch (err) {
      console.error('Wallet connection error:', err);
      const diag = diagnoseError(err);
      setTxStatus({
        type: 'error',
        message: `Connection failed: ${diag.details}`,
        hash: null,
        diag,
      });
    }
  };

  // Disconnect UI action (resets local UI session)
  const disconnectWallet = () => {
    setAccount(null);
    setHasVoted(false);
    setAccountBalance(null);
    setTxStatus({
      type: 'idle',
      message: 'Wallet disconnected from DApp session.',
      hash: null,
      diag: null,
    });
  };

  // Switch to Hardhat Local network
  const switchNetwork = async () => {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: TARGET_CHAIN_ID_HEX }],
      });
      setCurrentChainId(CHAIN_ID);
      await loadBlockchainData(account);
    } catch (switchError) {
      if (
        switchError.code === 4902 ||
        switchError.data?.originalError?.code === 4902 ||
        (switchError.message && switchError.message.includes('4902'))
      ) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: TARGET_CHAIN_ID_HEX,
                chainName: 'Hardhat Local',
                rpcUrls: [RPC_URL],
                nativeCurrency: {
                  name: 'ETH',
                  symbol: 'ETH',
                  decimals: 18,
                },
              },
            ],
          });
          setCurrentChainId(CHAIN_ID);
          await loadBlockchainData(account);
        } catch (addError) {
          console.error('Failed to add network:', addError);
          const diag = diagnoseError(addError);
          setTxStatus({
            type: 'error',
            message: `Failed to add Hardhat Local network to MetaMask: ${diag.details}`,
            hash: null,
            diag,
          });
        }
      } else {
        console.error('Failed to switch network:', switchError);
        const diag = diagnoseError(switchError);
        setTxStatus({
          type: 'error',
          message: `Failed to switch network: ${diag.details}`,
          hash: null,
          diag,
        });
      }
    }
  };

  // Cast a vote for a candidate
  const handleVote = async (candidateId, candidateName) => {
    if (!window.ethereum) {
      alert('MetaMask is not installed or available.');
      return;
    }
    if (hasVoted) {
      alert('You have already cast your vote.');
      return;
    }
    if (isVoting) return;

    setIsVoting(true);
    setTxStatus({
      type: 'pending',
      message: `Preparing vote for ${candidateName} (ID: ${candidateId})...`,
      hash: null,
      diag: null,
    });

    try {
      const provider = new ethers.BrowserProvider(window.ethereum);

      // Verify network immediately before transaction
      const net = await provider.getNetwork();
      const activeChainId = Number(net.chainId);
      setCurrentChainId(activeChainId);
      if (activeChainId !== CHAIN_ID) {
        const err = new Error(`Wrong network: Connected to Chain ID ${activeChainId}. Expected Hardhat Local (${CHAIN_ID}).`);
        err.code = 'WRONG_NETWORK';
        throw err;
      }

      // Read active account immediately before transaction
      const activeAccounts = await window.ethereum.request({ method: 'eth_accounts' });
      let currentActiveAccount = activeAccounts && activeAccounts.length > 0 ? activeAccounts[0] : null;

      if (!currentActiveAccount) {
        const requested = await window.ethereum.request({ method: 'eth_requestAccounts' });
        if (requested && requested.length > 0) {
          currentActiveAccount = requested[0];
          setAccount(currentActiveAccount);
        } else {
          throw new Error('Please connect your MetaMask wallet before voting.');
        }
      }

      // Fresh signer and fresh contract instance bound to active account
      const signer = await provider.getSigner(currentActiveAccount);
      const contract = new ethers.Contract(CONTRACT_ADDRESS, VotingAbi, signer);

      setTxStatus({
        type: 'pending',
        message: `Voting for ${candidateName} (ID: ${candidateId}). Please confirm transaction in MetaMask...`,
        hash: null,
        diag: null,
      });

      const tx = await contract.vote(candidateId);

      setTxStatus({
        type: 'pending',
        message: `Transaction submitted! Hash: ${tx.hash}. Waiting for block confirmation...`,
        hash: tx.hash,
        diag: null,
      });

      const receipt = await tx.wait();

      setTxStatus({
        type: 'success',
        message: `Success! Your vote for ${candidateName} has been recorded in block #${receipt.blockNumber}.`,
        hash: tx.hash,
        diag: null,
      });

      // Refresh candidate votes, balance, and voting status
      await loadBlockchainData(currentActiveAccount);
    } catch (err) {
      console.error('Voting transaction failed:', err);
      const diag = diagnoseError(err);
      if (diag.details.includes('already voted')) {
        setHasVoted(true);
      }
      setTxStatus({
        type: 'error',
        message: `Vote failed: ${diag.details}`,
        hash: null,
        diag,
      });
    } finally {
      setIsVoting(false);
    }
  };

  return (
    <div className="app-container">
      {/* MetaMask Not Installed Alert */}
      {!isMetaMaskInstalled && (
        <div className="alert-banner alert-warning">
          <span>⚠️ MetaMask is not detected. Please install the <a href="https://metamask.io/download/" target="_blank" rel="noreferrer">MetaMask extension</a> to interact with this DApp.</span>
        </div>
      )}

      {/* Wrong Network Alert */}
      {isWrongNetwork && (
        <div className="alert-banner alert-error">
          <div className="alert-content">
            <span>⚠️ Wrong Network! Connected to Chain ID <strong>{currentChainId}</strong>. Expected <strong>Hardhat Local ({CHAIN_ID})</strong>.</span>
            <button className="btn btn-switch" onClick={switchNetwork}>
              Switch to Hardhat Local
            </button>
          </div>
        </div>
      )}

      <header className="app-header">
        <div className="header-content">
          <h1>Blockchain Voting DApp</h1>
          <p className="subtitle">
            A decentralized, transparent voting system secured by the Ethereum blockchain.
          </p>
        </div>
      </header>

      <main className="main-content">
        {/* Network & Wallet Status Bar */}
        <section className="status-bar">
          <div className="network-badge">
            <span className={`dot ${isWrongNetwork ? 'dot-warning' : 'dot-active'}`}></span>
            <span>
              Network: <strong>Hardhat Local</strong> (Chain ID: {CHAIN_ID})
            </span>
          </div>

          <div className="wallet-section">
            {account ? (
              <div className="wallet-connected-group">
                <span className="wallet-chip" title={account}>
                  <span className="account-dot"></span>
                  {formatAddress(account)}
                  {accountBalance !== null && (
                    <span className="wallet-balance">{parseFloat(accountBalance).toFixed(4)} ETH</span>
                  )}
                </span>
                <button
                  className="btn btn-disconnect"
                  onClick={disconnectWallet}
                  title="Disconnect from DApp interface"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <div className="wallet-disconnected-group">
                <span className="wallet-status">Status: <em>Not Connected</em></span>
                <button
                  className="btn btn-primary"
                  onClick={connectWallet}
                  disabled={!isMetaMaskInstalled}
                >
                  Connect MetaMask
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Already Voted Notice */}
        {hasVoted && (
          <div className="voted-banner">
            <span className="voted-icon">✅</span>
            <span><strong>You have already voted.</strong> Each wallet address is permitted exactly one vote.</span>
          </div>
        )}

        {/* Contract Info */}
        <section className="contract-bar">
          <span className="contract-label">Contract Address:</span>
          <code className="contract-address">{CONTRACT_ADDRESS}</code>
        </section>

        {/* Action Controls */}
        <div className="controls-bar">
          <h2>Registered Candidates</h2>
          <button
            className="btn btn-secondary"
            onClick={() => loadBlockchainData(account)}
            disabled={isLoading || isVoting}
            title="Refresh candidate vote counts from the blockchain"
          >
            {isLoading ? '⏳ Refreshing...' : '🔄 Refresh Candidates'}
          </button>
        </div>

        {/* Candidate Cards Grid */}
        <section className="candidates-grid">
          {candidates.map((candidate) => {
            const isVoteDisabled =
              !account ||
              isWrongNetwork ||
              hasVoted ||
              isVoting ||
              !isMetaMaskInstalled;

            let buttonText = `Vote for ${candidate.name}`;
            if (!account) buttonText = 'Connect Wallet to Vote';
            else if (isWrongNetwork) buttonText = 'Switch Network to Vote';
            else if (hasVoted) buttonText = 'Already Voted';
            else if (isVoting) buttonText = 'Submitting Vote...';

            return (
              <div key={candidate.id} className="candidate-card">
                <div className="card-badge">Candidate ID: {candidate.id}</div>
                <h3 className="candidate-name">{candidate.name}</h3>
                <div className="vote-count-container">
                  <span className="vote-number">{candidate.voteCount}</span>
                  <span className="vote-label">Votes</span>
                </div>
                <button
                  className="btn btn-vote"
                  onClick={() => handleVote(candidate.id, candidate.name)}
                  disabled={isVoteDisabled}
                  title={
                    !account
                      ? 'Connect MetaMask to vote'
                      : isWrongNetwork
                      ? 'Switch to Hardhat Local network'
                      : hasVoted
                      ? 'You have already voted'
                      : `Cast your vote for ${candidate.name}`
                  }
                >
                  {buttonText}
                </button>
              </div>
            );
          })}
        </section>

        {/* Transaction Status Area with Diagnostic Panel */}
        <section className="tx-status-section">
          <h3>Transaction Status</h3>
          <div className={`tx-status-box status-${txStatus.type}`}>
            <p className="status-message">{txStatus.message}</p>
            {txStatus.hash && (
              <p className="tx-hash">
                Transaction Hash: <code>{txStatus.hash}</code>
              </p>
            )}
            {txStatus.diag && txStatus.type === 'error' && (
              <div className="error-diagnostic-panel">
                <div className="diag-header">
                  <span className="diag-badge">{txStatus.diag.category}</span>
                  <strong>{txStatus.diag.title}</strong>
                </div>
                <p className="diag-details">{txStatus.diag.details}</p>
                {txStatus.diag.raw?.code && txStatus.diag.raw.code !== 'N/A' && (
                  <p className="diag-code">Error Code: <code>{String(txStatus.diag.raw.code)}</code></p>
                )}
              </div>
            )}
          </div>
        </section>
      </main>

      <footer className="app-footer">
        <p>Ethereum Voting DApp &bull; Hardhat Local Development Node ({RPC_URL})</p>
      </footer>
    </div>
  );
}

export default App;
