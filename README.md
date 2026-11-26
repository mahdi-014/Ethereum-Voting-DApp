# Blockchain Voting DApp

A decentralized, transparent, and tamper-proof Ethereum Voting Application built with **Hardhat 3**, **Solidity**, **ethers.js v6**, and **React + Vite**.

This decentralized application allows users to view registered candidates and cast their vote directly on an Ethereum blockchain through MetaMask. The underlying smart contract enforces strict access control, ensures that each wallet address can cast only one vote, and prevents voting for non-existent candidates.

---

## Features

- **Decentralized Voting**: Votes are immutably recorded on the Ethereum blockchain.
- **Single-Vote Enforcement**: The contract tracks voter addresses to ensure each wallet can only vote once.
- **Pre-Registered Candidates**: Automatically initializes candidate #1 (**Alice**) and candidate #2 (**Bob**) with 0 votes upon deployment.
- **MetaMask Integration**: Secure browser-based transaction signing using ethers.js v6.
- **Automatic Network Validation**: Detects whether MetaMask is connected to the local development network (Chain ID: `31337`)—even before connecting a wallet—and offers one-click network switching or addition.
- **Real-Time Blockchain Reads**: Bypasses MetaMask's internal RPC cache using a direct `ethers.JsonRpcProvider` (`cacheTimeout: -1`) to read candidate counts, names, vote counts, and voting status accurately.
- **Automatic Nonce Sync & Vote Reset**: Automatically syncs the local Hardhat node nonce via `hardhat_setNonce` on `Nonce too high` errors, and includes `npm run reset` to reset elections to `0 / 0` without restarting the node.
- **Comprehensive Test Suite**: 16 Hardhat Mocha/Chai contract tests and 8 Vitest UI/integration tests covering deployment, owner privileges, candidate validation, voting flow, event emissions, double-voting prevention, error diagnostics, and live vote totals.

---

## Technology Stack

- **Smart Contract**: Solidity `^0.8.24` (compiled with `solc 0.8.34`)
- **Development Environment**: Hardhat `3.22.0` (with EDR simulated runtime)
- **Toolbox & Testing**: `@nomicfoundation/hardhat-toolbox-mocha-ethers`, Mocha `12.0.3`, Chai `6.3.0`
- **Deployment**: Hardhat Ignition `3.1.10`
- **Web3 Library**: ethers.js `6.17.0`
- **Frontend**: React 18, Vite 6, JavaScript, CSS3, Vitest + Testing Library (`jsdom`)
- **Runtime Environment**: Node.js 22 LTS, Ubuntu 24.04 LTS (WSL2)

---

## Project Structure

```
VotingDApp/
├── contracts/
│   └── Voting.sol                     # Voting smart contract
├── ignition/
│   ├── modules/
│   │   └── Voting.ts                  # Hardhat Ignition deployment module
│   └── deployments/                   # Ignition deployment artifacts
│       └── chain-31337/
│           └── deployed_addresses.json
├── test/
│   └── Voting.ts                      # 16 Mocha/Chai unit tests
├── scripts/
│   ├── cast-vote.js                   # CLI voting script (Account index 2)
│   ├── reset-votes.ts                 # Redeploys fresh 0/0 contract using Account #19
│   ├── verify-voting.ts               # Local contract verification script
│   └── final-verification.sh          # Full test, build & verification runner
├── frontend/                          # React + Vite frontend application
│   ├── index.html
│   ├── vite.config.js
│   ├── package.json
│   └── src/
│       ├── main.jsx
│       ├── App.jsx                    # DApp user interface & MetaMask logic
│       ├── App.test.jsx               # 8 Vitest UI & integration tests
│       ├── index.css                  # Responsive UI styling
│       └── contracts/
│           ├── Voting.json            # Contract ABI for frontend
│           └── contractConfig.js      # Contract address & network constants
├── hardhat.config.ts                  # Hardhat 3 configuration
├── tsconfig.json                      # TypeScript configuration
├── package.json                       # Backend dependencies & npm scripts
└── README.md                          # Project documentation
```

---

## Current Local Deployment Details

- **Contract Address**: `0x5FbDB2315678afecb367f032d93F642f64180aa3`
- **Network Name**: Hardhat Local
- **RPC URL**: `http://127.0.0.1:8545`
- **Chain ID**: `31337` (`0x7a69`)
- **Currency Symbol**: `ETH`

> [!WARNING]
> **State Reset Notice**: The local Hardhat node stores state in memory. If you stop or restart `npx hardhat node`, all blockchain data (blocks, transactions, and votes) is erased. You will need to re-run the Ignition deployment command.

---

## Security & Safety Notice

> [!CAUTION]
> **Test Accounts Only**: The private keys and seed phrases output by `npx hardhat node` are publicly known development defaults. **NEVER** transfer real mainnet cryptocurrencies to these addresses, and **NEVER** use real private keys for local testing.

---

## Prerequisites

1. **Operating System**: Windows 11 with WSL2 (Ubuntu 24.04 LTS) or native Linux/macOS.
2. **Node.js**: Node.js 22 LTS (installed via NVM) and `npm`.
3. **Browser**: Google Chrome, Brave, or Firefox with the **MetaMask** extension installed.

---

## Installation & Setup

### 1. Clone & Install Dependencies

In your Ubuntu terminal, navigate to the project directory and install the backend and frontend dependencies:

```bash
cd ~/BlockchainProjects/VotingDApp

# Install backend & Hardhat dependencies
npm install

# Install frontend dependencies
cd frontend
npm install
cd ..
```

---

## Running the Application & Demonstration Workflow

To run and demonstrate the application, open **three terminal tabs or windows**:

```
┌───────────────────────────────────────┬───────────────────────────────────────┬───────────────────────────────────────┐
│              TERMINAL 1               │              TERMINAL 2               │              TERMINAL 3               │
│         Local Hardhat Node            │     Contract Deploy & CLI Actions     │        React + Vite Frontend          │
│                                       │                                       │                                       │
│  $ cd ~/BlockchainProjects/VotingDApp │  $ cd ~/BlockchainProjects/VotingDApp │  $ cd ~/BlockchainProjects/VotingDApp │
│  $ npx hardhat node                   │  $ npx hardhat ignition deploy ...    │  $ cd frontend && npm run dev         │
└───────────────────────────────────────┴───────────────────────────────────────┴───────────────────────────────────────┘
```

### Step 1: Terminal 1 — Start the Local Hardhat Blockchain

```bash
cd ~/BlockchainProjects/VotingDApp
npx hardhat node
```

*Keep this terminal running. It hosts the local Ethereum node (RPC: `http://127.0.0.1:8545`, Chain ID: `31337`), provides 20 pre-funded test accounts with 10,000 ETH each, and logs all blocks, transactions, and RPC calls in real time.*

### Step 2: Terminal 2 — Deploy the Smart Contract

In a second terminal, deploy the `Voting` contract and initialize candidates Alice (#1) and Bob (#2):

```bash
cd ~/BlockchainProjects/VotingDApp
npx hardhat ignition deploy ignition/modules/Voting.ts --network localhost
```

Verify that the deployment was successful and matches the expected on-chain state:

```bash
npx hardhat run --network localhost scripts/verify-voting.ts
```

*Expected output: Contract deployed at `0x5FbDB2315678afecb367f032d93F642f64180aa3`, candidate count 2, Alice (0 votes), Bob (0 votes).*

### Step 3: Terminal 2 — Verify Frontend Contract Address

Confirm that `frontend/src/contracts/contractConfig.js` points to the deployed address:

```bash
cat frontend/src/contracts/contractConfig.js
```

*The active deployment address on Hardhat local is `0x5FbDB2315678afecb367f032d93F642f64180aa3`.*

### Step 4: Terminal 3 — Start the React Frontend

In a third terminal, start the Vite development server:

```bash
cd ~/BlockchainProjects/VotingDApp/frontend
npm run dev
```

The frontend will start at:  
👉 **`http://localhost:5173/`**

---

## Configuring MetaMask for Demonstration

### 1. Add the Hardhat Local Network to MetaMask

- **Network Name**: `Hardhat Local`
- **New RPC URL**: `http://127.0.0.1:8545`
- **Chain ID**: `31337`
- **Currency Symbol**: `ETH`

*(The frontend also features an automatic **Switch to Hardhat Local** button that prompts MetaMask to add/switch to this network automatically).*

### 2. Import Pre-Funded Test Accounts

1. In **Terminal 1** (`npx hardhat node`), locate the printed list of test accounts and private keys:
   - **Account #0** (`0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`): Contract Owner
   - **Account #1** (`0x70997970C51812dc3A010C7d01b50e0d17dc79C8`): Test Voter 1
   - **Account #2** (`0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65`): Test Voter 2
2. In MetaMask:
   - Click your account avatar/selector at the top.
   - Click **Add account or hardware wallet** > **Import account**.
   - Paste the test account's private key and click **Import**.
3. The imported account will immediately display an initial balance of `10,000 ETH`.

---

## Demonstration Steps (Supervisor Presentation)

### 1. Connect Wallet and View Candidates
1. Open **`http://localhost:5173/`** in Google Chrome / Brave.
2. Click **Connect MetaMask**. The UI displays the connected wallet address and ETH balance.
3. Observe the **Registered Candidates**:
   - **Alice** (Candidate ID: 1, Vote Count: 0)
   - **Bob** (Candidate ID: 2, Vote Count: 0)
4. Point out the absence of any administrative Add Candidate UI — the interface is strictly focused on voting.

### 2. Cast a Vote (Voter 1)
1. With Account #0 (or Account #1) connected, click **Vote for Alice**.
2. Confirm the transaction in MetaMask.
3. Observe:
   - Transaction status box turns yellow (*"Waiting for block confirmation..."*).
   - Once mined, status turns green (*"Success! Your vote for Alice has been recorded in block #..."*).
   - Alice's vote count increments from `0` to `1`.
   - The vote buttons become disabled, and a notice appears: *"You have already voted. Each wallet address is permitted exactly one vote."*

### 3. Demonstrate Duplicate-Vote Prevention
1. Note that the vote buttons are now disabled and labeled *"Already Voted"*.
2. Even if a direct transaction were attempted from this account, the Solidity contract will revert with `"You have already voted"`.

### 4. Switch Accounts & Cast a Second Vote (Voter 2)
1. In MetaMask, switch to **Account #1** (or another imported test account).
2. The frontend automatically detects the account switch without a page refresh:
   - Displays the new wallet address and balance.
   - Re-checks on-chain eligibility (`hasVoted` is false for this new account).
   - Re-enables the vote buttons.
3. Click **Vote for Bob** and confirm in MetaMask.
4. Bob's vote count updates to `1`.

### 5. (Optional) Command-Line Voting Demonstration
To demonstrate CLI-based interaction as an alternative to MetaMask:
In **Terminal 2**, execute:

```bash
npm run vote
```

The script automatically connects with Account index 2, checks eligibility, submits a vote for Alice, and prints the transaction hash, confirmation receipt, and updated vote counts.

### 6. (Optional) Reset Votes to `0 / 0` Without Restarting the Node
To start a fresh election without restarting `npx hardhat node` or clearing MetaMask activity data:

```bash
npm run reset
```

This deploys a fresh `Voting` contract via Account #19, initializes `Alice` and `Bob` with 0 votes, and automatically updates `frontend/src/contracts/contractConfig.js` and `ignition/deployments/chain-31337/deployed_addresses.json`.

---

## Running Unit Tests

To run the complete smart contract test suite:

```bash
cd ~/BlockchainProjects/VotingDApp
npx hardhat test
```

All 16 unit tests run against Hardhat's in-memory simulated environment:
- Owner deployment verification & initial candidate count
- Candidate initialization (`Alice` #1, `Bob` #2) & zero initial vote counts
- Vote casting, `VoteCast` event emission, and vote count increments
- Double-voting & cross-candidate double-voting prevention
- Invalid candidate ID & zero-candidate voting rejection
- Non-owner candidate addition rejection
- Empty/whitespace-only and case-insensitive duplicate candidate name rejection
- Multi-voter (5+ voters across 4 candidates) election accuracy

To run the frontend UI & integration tests (8 Vitest tests):

```bash
npm --prefix frontend test
```

To typecheck the TypeScript files:

```bash
npx tsc --noEmit
```

---

## Troubleshooting

### 1. "Nonce too high" or "MetaMask Nonce Mismatch" (NONCE_MISMATCH)
- **Cause**: Restarting `npx hardhat node` resets the blockchain's transaction count back to block 0, while MetaMask's internal database remembers previous nonces for that account.
- **Automatic Recovery**: On Hardhat Local, the frontend automatically detects `Nonce too high`, calls `hardhat_setNonce` to match MetaMask's cached nonce, and retries the transaction.
- **Manual Fallback**: If a nonce mismatch persists (e.g., `Nonce too low`), open MetaMask **Settings > Advanced > Clear activity tab data**. Your accounts and private keys are preserved.

### 2. "Wrong Network" Warning in Frontend
- **Cause**: MetaMask is connected to Ethereum Mainnet, Sepolia, or another network.
- **Solution**: Click the **Switch to Hardhat Local** button in the warning banner, or switch manually to the network with Chain ID `31337`.

### 3. "Contract Address Mismatch" or Failed Calls
- **Cause**: The local node was restarted, and a new contract was deployed to a different address than configured.
- **Solution**:
  1. Check `ignition/deployments/chain-31337/deployed_addresses.json` for the new address.
  2. Update `frontend/src/contracts/contractConfig.js` with the matching address.

### 4. "Port 8545 or 5173 already in use"
- **Cause**: A previous node or dev server process is still running in the background.
- **Solution**: Stop running node processes using `Ctrl + C` or terminate the lingering process on port 8545/5173.

---

## License

This project is open source and available under the **MIT License**.
