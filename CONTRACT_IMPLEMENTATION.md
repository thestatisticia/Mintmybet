# MintMyBet Contract Implementation Guide

## Overview

The `MintMyBet.sol` contract implements a complete NFT-based prediction game with points system, leaderboard, and QIE Oracle integration.

## Key Features

### 1. Prediction Minting
- **FREE first mint** - Users only pay gas (need QIE for gas fees)
- Asset must be active in current round
- Stores entry price from oracle
- Sets resolve time based on duration (10min, 30min, 60min)
- Assigns rarity: Common (10min), Rare (30min), Epic (60min)

### 2. Resolution System
- **FREE resolution** - Just updates metadata
- Checks if resolve time has passed
- Fetches current oracle price
- Determines WIN/LOSE outcome
- Awards/deducts points based on outcome and rarity

### 3. Final NFT Minting
- **Costs 0.1 QIE** - User pays to mint resolved NFT to wallet
- NFT becomes visible in MetaMask/OpenSea
- Includes complete metadata (image, attributes, rarity)

### 4. Points System

**Points Calculation:**
- Win: +1 point (Common), +2 points (Rare), +3 points (Epic)
- Loss: -0.5 points
- Daily Claim: +1 point (resets at midnight UTC)

**Storage:**
- Points stored as integers × 10 for precision (10 = 1.0 point)
- Example: 45.5 points stored as 455

### 5. Leaderboard

**Features:**
- Top 50 players ranked by points
- Ties broken by win rate (higher win rate ranks higher)
- Sorted automatically after each update
- Weekly reset (anyone can call after 7 days)

**Display:**
- Rank (#1, #2, etc.)
- Address (shortened)
- Points
- Win/Loss record
- Win rate percentage
- Current streak

### 6. Daily Claim System

**Functionality:**
- Users can claim +1 point once per day
- Resets at 12:00 AM UTC (midnight)
- Requires MetaMask transaction
- Shows cooldown timer on button

**Cooldown Display:**
- "Claim in HH:MM:SS" when on cooldown
- "Claim Daily Bonus (+1 pt)" when ready

### 7. Round System

**Round 1 (Even Hours: 0, 2, 4, 6...):**
- Active Assets: ETH, QIE, BTC

**Round 2 (Odd Hours: 1, 3, 5, 7...):**
- Active Assets: XRP, SOL

**Features:**
- Each round lasts 1 hour
- Automatic rotation based on block timestamp
- Countdown shows time until next round
- Only active assets can be minted

### 8. Rarity System

**Rarity Levels:**
- **Common** (10 minutes): 1x points, gray/blue styling
- **Rare** (30 minutes): 2x points, teal/cyan styling
- **Epic** (60 minutes): 3x points, purple styling

**Visual Effects:**
- Rarity badge on NFT card
- Border color matches rarity
- Background tint matches rarity

## Contract Functions

### Public Functions

```solidity
// Minting
mintPrediction(asset, predictionType, durationMinutes) - FREE (gas only)
mintResolvedNFT(tokenId) - Costs 0.1 QIE

// Resolution
resolvePrediction(tokenId) - FREE

// Points & Leaderboard
claimDailyBonus() - FREE (once per day)
getUserStats(user) - View user stats
getLeaderboard() - View top 50
resetLeaderboard() - Weekly reset (anyone can call after 7 days)

// Round & Asset Info
getCurrentRound() - Returns 1 or 2
getActiveAssets() - Returns active assets array
isAssetActive(asset) - Check if asset is active
getTimeUntilNextRound() - Seconds until next round

// Oracle
getLatestPrice(assetSymbol) - Get current price from QIE Oracle
```

## Frontend Integration

### Live Price Updates
- Updates every 5 seconds (best practice for crypto feeds)
- Fetches from QIE Oracle
- Updates all asset prices on dashboard
- Shows mini charts with price movements

### Dashboard Features
- Live Oracle Feed (all assets, real-time prices)
- Round Countdown (time until next round)
- Active Assets display
- Wallet Snapshot
- Recent NFT Performance

### Leaderboard Page
- Top 50 players displayed
- Claim button with cooldown timer
- MetaMask integration for claiming
- Shows points, win rate, streak

### NFT Display
- Rarity affects visual styling
- Border color matches rarity
- Rarity badge displayed
- Outcome clearly shown (WIN/LOSE)

## Deployment Checklist

1. **Deploy Contract**
   - Deploy to QIE network
   - Set contract address in `src/utils/contract.js`

2. **Update Configuration**
   - Update `CONTRACT_ADDRESS` in `src/utils/contract.js`
   - Update `QIE_RPC_URL` with actual RPC endpoint
   - Verify oracle addresses are correct

3. **Test Functions**
   - Test minting (should be free)
   - Test resolution
   - Test final mint (should cost 0.1 QIE)
   - Test daily claim
   - Test leaderboard updates

4. **Frontend Integration**
   - Connect MetaMask to QIE network
   - Test all contract interactions
   - Verify live price updates
   - Test claim button functionality

## Gas Optimization

- Read functions are view-only (no gas)
- Points stored as integers (no decimals)
- Leaderboard sorted on-chain (small array, efficient)
- Weekly reset clears array (gas-efficient)

## Security Considerations

- Only active assets can be minted
- Resolution only after time expires
- Oracle price validation
- Reentrancy protection (OpenZeppelin)
- Access controls for admin functions

## Future Enhancements

- IPFS metadata storage
- Dynamic NFT images based on outcome
- Batch operations for gas savings
- Off-chain leaderboard indexing
- Historical price data storage











