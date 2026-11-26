import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import App from './App.jsx';

// Shared simulated on-chain & MetaMask state for deterministic UI tests
const chainState = {
  chainId: 31337,
  bytecode: '0x60806040',
  candidates: [
    { id: 1n, name: 'Alice', voteCount: 0n },
    { id: 2n, name: 'Bob', voteCount: 0n },
  ],
  voted: new Set(),
  balances: {},
  authorizedAccounts: [],
  nextBlock: 10,
  nextVoteError: null,
  hardhatRpcSend: null,
};

function resetChainState() {
  chainState.chainId = 31337;
  chainState.bytecode = '0x60806040';
  chainState.candidates = [
    { id: 1n, name: 'Alice', voteCount: 0n },
    { id: 2n, name: 'Bob', voteCount: 0n },
  ];
  chainState.voted = new Set();
  chainState.balances = {
    '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266': '10000.0',
    '0x70997970c51812dc3a010c7d01b50e0d17dc79c8': '10000.0',
    '0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc': '10000.0',
    '0x90f79bf6eb2c4f870365e785982e1f101e93b906': '10000.0',
  };
  chainState.authorizedAccounts = [];
  chainState.nextBlock = 10;
  chainState.nextVoteError = null;
  chainState.hardhatRpcSend = null;
}

vi.mock('ethers', () => {
  class MockProvider {
    constructor(isRpc = false) {
      this.isRpc = isRpc;
    }
    async getNetwork() {
      return { chainId: BigInt(this.isRpc ? 31337 : chainState.chainId) };
    }
    async listAccounts() {
      return chainState.authorizedAccounts.map((address) => ({ address }));
    }
    async getCode() {
      return chainState.bytecode;
    }
    async getBalance(addr) {
      return chainState.balances[addr.toLowerCase()] || '10000.0';
    }
    async getSigner(addr) {
      return {
        address: addr || chainState.authorizedAccounts[0],
        getAddress: async () => addr || chainState.authorizedAccounts[0],
      };
    }
    async send(method, params) {
      if (chainState.hardhatRpcSend) {
        return chainState.hardhatRpcSend(method, params);
      }
      throw new Error(`Unsupported mock RPC method: ${method}`);
    }
    destroy() {}
  }

  class MockContract {
    constructor(_addr, _abi, signerOrProvider) {
      this.signerOrProvider = signerOrProvider;
    }
    async candidateCount() {
      return BigInt(chainState.candidates.length);
    }
    async candidates(id) {
      const idx = Number(id) - 1;
      return chainState.candidates[idx];
    }
    async hasVoted(addr) {
      return chainState.voted.has(addr.toLowerCase());
    }
    async vote(candidateId) {
      if (chainState.nextVoteError) {
        const err = chainState.nextVoteError;
        chainState.nextVoteError = null;
        throw err;
      }
      const voter = (await this.signerOrProvider.getAddress()).toLowerCase();
      if (chainState.voted.has(voter)) {
        const err = new Error('execution reverted: You have already voted');
        err.reason = 'You have already voted';
        throw err;
      }
      const target = chainState.candidates.find((c) => Number(c.id) === Number(candidateId));
      if (!target) {
        const err = new Error('execution reverted: Invalid candidate ID');
        err.reason = 'Invalid candidate ID';
        throw err;
      }
      chainState.voted.add(voter);
      target.voteCount += 1n;
      const hash = `0xmocktx${chainState.nextBlock}`;
      const blockNumber = chainState.nextBlock++;
      return {
        hash,
        wait: async () => ({ blockNumber, status: 1 }),
      };
    }
  }

  return {
    ethers: {
      BrowserProvider: class extends MockProvider {
        constructor() {
          super(false);
        }
      },
      JsonRpcProvider: class extends MockProvider {
        constructor() {
          super(true);
        }
      },
      Contract: MockContract,
      formatEther: (val) => String(val),
    },
  };
});

function createMockEthereum(initialAccounts = []) {
  const listeners = {};
  chainState.authorizedAccounts = [...initialAccounts];

  return {
    request: vi.fn(async ({ method, params }) => {
      if (method === 'eth_requestAccounts') {
        if (chainState.authorizedAccounts.length === 0) {
          chainState.authorizedAccounts = ['0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266'];
        }
        return chainState.authorizedAccounts;
      }
      if (method === 'eth_accounts') {
        return chainState.authorizedAccounts;
      }
      if (method === 'wallet_switchEthereumChain') {
        const hex = params?.[0]?.chainId;
        chainState.chainId = parseInt(hex, 16);
        return null;
      }
      if (method === 'wallet_addEthereumChain') {
        chainState.chainId = 31337;
        return null;
      }
      return null;
    }),
    on: vi.fn((event, cb) => {
      listeners[event] = listeners[event] || [];
      listeners[event].push(cb);
    }),
    removeListener: vi.fn((event, cb) => {
      if (!listeners[event]) return;
      listeners[event] = listeners[event].filter((fn) => fn !== cb);
    }),
    emit(event, payload) {
      (listeners[event] || []).forEach((cb) => cb(payload));
    },
  };
}

describe('Voting DApp UI & Integration Tests', () => {
  beforeEach(() => {
    resetChainState();
    delete window.ethereum;
  });

  afterEach(() => {
    cleanup();
    delete window.ethereum;
  });

  it('1. Renders warning banner and loads candidates via RPC when MetaMask is absent', async () => {
    render(<App />);

    expect(await screen.findByText(/MetaMask is not detected/i)).toBeInTheDocument();
    expect(await screen.findByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByTestId('total-votes')).toHaveTextContent('Total Votes: 0');

    const disabledVoteButtons = screen.getAllByRole('button', { name: /Connect Wallet to Vote/i });
    expect(disabledVoteButtons).toHaveLength(2);
    disabledVoteButtons.forEach((btn) => expect(btn).toBeDisabled());
  });

  it('2. Shows Wrong Network banner even before connecting, loads candidates via local RPC, and switches network on click', async () => {
    chainState.chainId = 1;
    window.ethereum = createMockEthereum([]);

    render(<App />);

    expect(await screen.findByText(/Wrong Network!/i)).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();

    const switchBtn = screen.getByRole('button', { name: /Switch to Hardhat Local/i });
    fireEvent.click(switchBtn);

    await waitFor(() => {
      expect(window.ethereum.request).toHaveBeenCalledWith({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0x7a69' }],
      });
      expect(screen.queryByText(/Wrong Network!/i)).not.toBeInTheDocument();
    });
  });

  it('3. Connects wallet, disconnects cleanly without auto-reconnecting, and reconnects on demand', async () => {
    window.ethereum = createMockEthereum(['0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266']);

    render(<App />);

    // Auto-connects on initial mount when MetaMask already authorized
    expect(await screen.findByText(/0xf39f\.\.\.2266/i)).toBeInTheDocument();
    expect(screen.getByText('10000.0000 ETH')).toBeInTheDocument();

    // Clicking Disconnect must stay disconnected (verifies useEffect hook fix)
    fireEvent.click(screen.getByRole('button', { name: /Disconnect/i }));
    expect(await screen.findByText(/Wallet disconnected from DApp session/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Connect MetaMask/i })).toBeInTheDocument();
    expect(screen.queryByText(/0xf39f\.\.\.2266/i)).not.toBeInTheDocument();

    // Reconnect manually
    fireEvent.click(screen.getByRole('button', { name: /Connect MetaMask/i }));
    expect(await screen.findByText(/0xf39f\.\.\.2266/i)).toBeInTheDocument();
  });

  it('4. Handles 4 sequential voter accounts voting, prevents double voting, and updates Total Votes', async () => {
    const accounts = [
      '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
      '0x70997970c51812dc3a010c7d01b50e0d17dc79c8',
      '0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc',
      '0x90f79bf6eb2c4f870365e785982e1f101e93b906',
    ];
    const mockEth = createMockEthereum([accounts[0]]);
    window.ethereum = mockEth;

    render(<App />);

    // Voter 0 votes for Alice
    const voteAliceBtn = await screen.findByRole('button', { name: /Vote for Alice/i });
    fireEvent.click(voteAliceBtn);

    expect(await screen.findByText(/Success! Your vote for Alice has been recorded/i)).toBeInTheDocument();
    expect(screen.getByText(/You have already voted\./i)).toBeInTheDocument();
    expect(screen.getByTestId('total-votes')).toHaveTextContent('Total Votes: 1');
    screen.getAllByRole('button', { name: /Already Voted/i }).forEach((btn) => {
      expect(btn).toBeDisabled();
    });

    // Switch to Voter 1 -> votes for Bob
    await act(async () => {
      chainState.authorizedAccounts = [accounts[1]];
      mockEth.emit('accountsChanged', [accounts[1]]);
    });
    const voteBobBtn = await screen.findByRole('button', { name: /Vote for Bob/i });
    expect(voteBobBtn).toBeEnabled();
    fireEvent.click(voteBobBtn);

    expect(await screen.findByText(/Success! Your vote for Bob has been recorded/i)).toBeInTheDocument();
    expect(screen.getByTestId('total-votes')).toHaveTextContent('Total Votes: 2');

    // Switch to Voter 2 -> votes for Alice
    await act(async () => {
      chainState.authorizedAccounts = [accounts[2]];
      mockEth.emit('accountsChanged', [accounts[2]]);
    });
    fireEvent.click(await screen.findByRole('button', { name: /Vote for Alice/i }));
    expect(await screen.findByTestId('total-votes')).toHaveTextContent('Total Votes: 3');

    // Switch to Voter 3 -> votes for Bob
    await act(async () => {
      chainState.authorizedAccounts = [accounts[3]];
      mockEth.emit('accountsChanged', [accounts[3]]);
    });
    fireEvent.click(await screen.findByRole('button', { name: /Vote for Bob/i }));
    expect(await screen.findByTestId('total-votes')).toHaveTextContent('Total Votes: 4');

    // Confirm final candidate card counts are 2 and 2 (still only 2 candidate cards, never 4)
    expect(screen.getAllByText(/Candidate ID:/i)).toHaveLength(2);
  });

  it('5. Renders diagnostic panel for MetaMask rejection, nonce mismatch, and missing contract bytecode', async () => {
    window.ethereum = createMockEthereum(['0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266']);
    render(<App />);

    const voteAliceBtn = await screen.findByRole('button', { name: /Vote for Alice/i });

    // User rejected transaction (4001)
    const rejectErr = new Error('User rejected the request.');
    rejectErr.code = 4001;
    chainState.nextVoteError = rejectErr;
    fireEvent.click(voteAliceBtn);
    expect(await screen.findByText('USER_REJECTED')).toBeInTheDocument();

    // Nonce mismatch
    chainState.nextVoteError = new Error('Nonce too high. Expected nonce to be 0 but got 3.');
    fireEvent.click(screen.getByRole('button', { name: /Vote for Alice/i }));
    expect(await screen.findByText('NONCE_MISMATCH')).toBeInTheDocument();

    // Missing contract bytecode -> BAD_DATA
    chainState.bytecode = '0x';
    fireEvent.click(screen.getByRole('button', { name: /Refresh Candidates/i }));
    expect(await screen.findByText('No Contract Bytecode')).toBeInTheDocument();
    expect(screen.getAllByText('BAD_DATA')).toHaveLength(2);
  });

  it('6. Syncs hasVoted state when contract reverts with already voted error and supports 4 candidates', async () => {
    chainState.candidates = [
      { id: 1n, name: 'Alice', voteCount: 1n },
      { id: 2n, name: 'Bob', voteCount: 2n },
      { id: 3n, name: 'Charlie', voteCount: 0n },
      { id: 4n, name: 'Diana', voteCount: 3n },
    ];
    window.ethereum = createMockEthereum(['0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266']);
    render(<App />);

    expect(await screen.findByText('Charlie')).toBeInTheDocument();
    expect(screen.getByText('Diana')).toBeInTheDocument();
    expect(screen.getByTestId('total-votes')).toHaveTextContent('Total Votes: 6');

    // Simulate external/stale already-voted revert when user tries to vote
    chainState.nextVoteError = new Error('You have already voted');
    fireEvent.click(screen.getByRole('button', { name: /Vote for Charlie/i }));

    expect(await screen.findByText('CONTRACT_REVERT')).toBeInTheDocument();
    expect(screen.getByText(/Each wallet address is permitted exactly one vote/i)).toBeInTheDocument();
    screen.getAllByRole('button', { name: /Already Voted/i }).forEach((btn) => {
      expect(btn).toBeDisabled();
    });
  });

  it('7. Reads live vote counts via direct RPC (bypassing MetaMask cache) and shows Alice 0 / Bob 3 after 3 votes for Bob', async () => {
    const accounts = [
      '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
      '0x70997970c51812dc3a010c7d01b50e0d17dc79c8',
      '0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc',
    ];
    const mockEth = createMockEthereum([accounts[0]]);
    window.ethereum = mockEth;

    render(<App />);

    for (let i = 0; i < accounts.length; i++) {
      if (i > 0) {
        await act(async () => {
          chainState.authorizedAccounts = [accounts[i]];
          mockEth.emit('accountsChanged', [accounts[i]]);
        });
      }
      const voteBobBtn = await screen.findByRole('button', { name: /Vote for Bob/i });
      fireEvent.click(voteBobBtn);
      await screen.findByText(/Success! Your vote for Bob has been recorded/i);
    }

    expect(screen.getByTestId('total-votes')).toHaveTextContent('Total Votes: 3');
    const voteNumbers = document.querySelectorAll('.vote-number');
    expect(voteNumbers[0].textContent).toBe('0'); // Alice
    expect(voteNumbers[1].textContent).toBe('3'); // Bob
  });

  it('8. Automatically syncs local Hardhat nonce via hardhat_setNonce on Nonce too high error and completes vote without clearing MetaMask', async () => {
    const voter = '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266';
    window.ethereum = createMockEthereum([voter]);
    const sendSpy = vi.fn(async () => null);
    chainState.hardhatRpcSend = sendSpy;

    const nonceErr = new Error('could not coalesce error');
    nonceErr.code = 'UNKNOWN_ERROR';
    nonceErr.info = {
      error: {
        code: -32000,
        message: 'Nonce too high. Expected nonce to be 0 but got 7. Note that transactions can\'t be queued when automining.',
      },
    };
    chainState.nextVoteError = nonceErr;

    render(<App />);

    const voteAliceBtn = await screen.findByRole('button', { name: /Vote for Alice/i });
    fireEvent.click(voteAliceBtn);

    expect(await screen.findByText(/Success! Your vote for Alice has been recorded/i)).toBeInTheDocument();
    expect(sendSpy).toHaveBeenCalledWith('hardhat_setNonce', [voter, '0x7']);
    expect(screen.getByTestId('total-votes')).toHaveTextContent('Total Votes: 1');
  });
});
