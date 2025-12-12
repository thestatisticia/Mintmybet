# QIE Network Setup Guide

## QIE Mainnet Network Details

- **Network Name:** QIEMainnet
- **Chain ID:** 1990
- **Currency Symbol:** QIEV3
- **RPC URLs:**
  - Primary: `https://rpc1mainnet.qie.digital/`
  - Backup 1: `https://rpc2mainnet.qie.digital/`
  - Backup 2: `https://rpc5mainnet.qie.digital/`
- **Block Explorer:** `https://mainnet.qie.digital/`

## MetaMask Setup

### Option 1: Automatic (Recommended)

The app includes a function to automatically add QIE network to MetaMask. Users can click a "Connect to QIE" button that will prompt MetaMask to add the network.

### Option 2: Manual Setup

1. Open MetaMask
2. Click network dropdown (top of extension)
3. Click "Add Network" or "Add Network Manually"
4. Enter the following details:
   - **Network Name:** QIEMainnet
   - **RPC URL:** `https://rpc1mainnet.qie.digital/`
   - **Chain ID:** 1990
   - **Currency Symbol:** QIEV3
   - **Block Explorer URL:** `https://mainnet.qie.digital/`
5. Save and switch to QIEMainnet

## QIE Wallet Support

QIE has its own wallet that natively supports the QIE network. Users can:
- Use QIE Wallet for transactions
- Connect QIE Wallet to the dApp (if it supports WalletConnect or similar)
- Use MetaMask as an alternative

## Getting QIEV3 Tokens

You'll need QIEV3 tokens for:
- **Gas fees** (for all transactions)
- **Minting resolved NFTs** (0.1 QIEV3 per NFT)

### How to Get QIEV3:
1. Purchase from exchanges that support QIE
2. Bridge from other networks (if bridge available)
3. Receive from other QIE users

## Contract Deployment

### Prerequisites

1. Install Hardhat:
   ```bash
   npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox
   ```

2. Set up `.env` file:
   ```bash
   cp .env.example .env
   # Edit .env and add your DEPLOYER_PRIVATE_KEY
   ```

3. Fund your deployer account with QIEV3 for gas

### Deploy Contract

```bash
npx hardhat run scripts/deploy.js --network qieMainnet
```

The script will:
- Deploy the contract
- Save deployment info to `deployments/qieMainnet.json`
- Update `.env` with contract address
- Display next steps

### Verify Contract

```bash
npx hardhat run scripts/verify.js --network qieMainnet
```

### After Deployment

1. Update `CONTRACT_ADDRESS` in `src/utils/contract.js`
2. Verify contract on block explorer: `https://mainnet.qie.digital/address/YOUR_CONTRACT_ADDRESS`
3. Test all contract functions
4. Update frontend to use new contract address

## Testing Checklist

Before going live:
- [ ] Test contract deployment
- [ ] Verify oracle addresses are correct
- [ ] Test minting predictions (should be free, gas only)
- [ ] Test resolution (should be free)
- [ ] Test final mint (should cost 0.1 QIEV3)
- [ ] Test daily claim functionality
- [ ] Test leaderboard updates
- [ ] Verify frontend connects properly
- [ ] Test with both MetaMask and QIE Wallet (if applicable)

## Network RPC Endpoints

The app is configured to use multiple RPC endpoints for redundancy:
- Primary: `rpc1mainnet.qie.digital`
- Backup 1: `rpc2mainnet.qie.digital`
- Backup 2: `rpc5mainnet.qie.digital`

If one RPC is down, the app can fallback to others.

