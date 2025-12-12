# QIE Oracle Integration Guide

## Overview

QIE Oracle follows the **Chainlink AggregatorV3Interface** standard, making it compatible with existing Chainlink integrations. All price-fetching functions are read-only (view functions), meaning they consume minimal gas and are safe for frequent calls.

## Asset Oracle Addresses

| Asset | Symbol | Contract Address |
|-------|--------|------------------|
| Bitcoin | BTC | `0x9E596d809a20A272c788726f592c0d1629755440` |
| Ethereum | ETH | `0x4bb7012Fbc79fE4Ae9B664228977b442b385500d` |
| Ripple | XRP | `0x804582B1f8Fea73919e7c737115009f668f97528` |
| Solana | SOL | `0xe86999c8e6C8eeF71bebd35286bCa674E0AD7b21` |
| QIE Native | QIE | `0x3Bc617cF3A4Bb77003e4c556B87b13D556903D17` |

## Smart Contract Integration

### 1. Import the Oracle Interface

```solidity
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
```

QIE Oracle is compatible with Chainlink's AggregatorV3Interface standard.

### 2. Instantiate the Oracle

```solidity
AggregatorV3Interface public priceFeed;

constructor(address oracleAddress) {
    priceFeed = AggregatorV3Interface(oracleAddress);
}
```

Replace `oracleAddress` with the specific QIE Oracle address for your asset (see table above).

### 3. Fetch Latest Price

```solidity
function getLatestPrice() public view returns (int256) {
    (
        , 
        int256 price,
        , 
        , 
    ) = priceFeed.latestRoundData();

    return price;
}
```

This function is read-only (view) and consumes minimal gas.

## Gas Efficiency

✅ **All price-fetching functions are non-state-changing (read-only)**

- No transaction needs to be sent
- No gas is spent reading data (unless used inside a transaction)
- Safe to use in frequent or lightweight calls
- Perfect for real-time price updates

## Frontend Integration

The app includes oracle configuration and utility functions:

- **`src/config/oracle.js`** - Oracle addresses and ABI
- **`src/utils/oracle.js`** - Helper functions for fetching prices

### Example Usage

```javascript
import { getLatestPrice } from './utils/oracle'
import { ethers } from 'ethers'

const provider = new ethers.JsonRpcProvider('YOUR_QIE_RPC_URL')
const btcPrice = await getLatestPrice('BTC', provider)
console.log(`BTC Price: $${btcPrice}`)
```

## Integration Checklist

- [ ] Import AggregatorV3Interface in your contract
- [ ] Set oracle address in constructor/initializer
- [ ] Implement `latestRoundData()` call
- [ ] Handle price decimals correctly (usually 8 for USD pairs)
- [ ] Add error handling for oracle failures
- [ ] Test with QIE testnet before mainnet deployment

## Notes

- QIE Oracle follows Chainlink standards for maximum compatibility
- Prices are returned as `int256` - convert to `uint256` if needed
- Always check `updatedAt` timestamp to ensure fresh data
- Consider implementing a staleness threshold for production use











