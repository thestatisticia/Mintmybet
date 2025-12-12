# Deployment Guide

## Prerequisites

1. **Node.js** (v18 or higher)
2. **QIEV3 tokens** in your deployer wallet for gas fees
3. **Private key** of the deployer account (keep this secure!)

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Install Hardhat (if not already installed)

```bash
npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox
```

### 3. Configure Environment

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and add your deployer private key:
   ```
   DEPLOYER_PRIVATE_KEY=your_private_key_here
   ```

   **⚠️ WARNING:** Never commit your `.env` file to version control! It's already in `.gitignore`.

### 4. Fund Your Deployer Account

Make sure your deployer account has QIEV3 tokens for:
- Contract deployment gas fees
- Initial testing transactions

## Deploy Contract

### Deploy to QIE Mainnet

```bash
npm run deploy
```

Or directly with Hardhat:

```bash
npx hardhat run scripts/deploy.js --network qieMainnet
```

### What Happens During Deployment

1. Contract is compiled
2. Contract is deployed to QIE Mainnet
3. Deployment info is saved to `deployments/qieMainnet.json`
4. Contract address is automatically added to `.env`
5. Deployment details are displayed in console

### After Deployment

1. **Update Frontend:**
   - Open `src/utils/contract.js`
   - Update `CONTRACT_ADDRESS` with your deployed address

2. **Verify Contract (Optional):**
   ```bash
   npm run verify
   ```

3. **Test Contract:**
   - Test minting predictions
   - Test resolution
   - Test final minting
   - Test daily claims
   - Test leaderboard

## Environment Variables

### Required

- `DEPLOYER_PRIVATE_KEY` - Your wallet private key (for deployment)

### Optional (with defaults)

- `QIE_CHAIN_ID` - Chain ID (default: 1990)
- `QIE_RPC_URL_1` - Primary RPC URL
- `QIE_RPC_URL_2` - Backup RPC URL 1
- `QIE_RPC_URL_3` - Backup RPC URL 2
- `QIE_BLOCK_EXPLORER` - Block explorer URL
- `CONTRACT_ADDRESS` - Deployed contract address (auto-filled after deployment)

## Network Configuration

The deployment uses the following QIE Mainnet settings:

- **Chain ID:** 1990
- **Network Name:** QIEMainnet
- **Currency:** QIEV3
- **RPC URLs:**
  - `https://rpc1mainnet.qie.digital/`
  - `https://rpc2mainnet.qie.digital/`
  - `https://rpc5mainnet.qie.digital/`
- **Block Explorer:** `https://mainnet.qie.digital/`

## Troubleshooting

### "Insufficient balance"
- Make sure your deployer account has QIEV3 tokens
- Check balance on block explorer

### "Network not found"
- Verify RPC URLs in `.env` are correct
- Check network connectivity

### "Contract deployment failed"
- Check gas price settings in `hardhat.config.js`
- Verify private key is correct
- Ensure account has sufficient balance

### "Cannot read property 'getAddress'"
- Make sure you're using Hardhat v2.0+ (uses `getAddress()` instead of `address`)

## Security Best Practices

1. **Never commit `.env` file** - It contains your private key
2. **Use a separate deployer account** - Don't use your main wallet
3. **Verify contract after deployment** - Helps users trust your contract
4. **Test on testnet first** - If QIE has a testnet available
5. **Keep private keys secure** - Use hardware wallet if possible

## Next Steps

After successful deployment:

1. ✅ Update `CONTRACT_ADDRESS` in frontend
2. ✅ Verify contract on block explorer
3. ✅ Test all contract functions
4. ✅ Update frontend to use contract
5. ✅ Deploy frontend to hosting (Vercel, Netlify, etc.)

## Support

For issues or questions:
- Check QIE documentation: `https://mainnet.qie.digital/`
- Review contract code in `contracts/MintMyBet.sol`
- Check deployment logs in console











