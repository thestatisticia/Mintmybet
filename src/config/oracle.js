// QIE Oracle Contract Addresses
// QIE Oracle follows Chainlink AggregatorV3Interface standard

export const ORACLE_ADDRESSES = {
  BTC: '0x9E596d809a20A272c788726f592c0d1629755440',
  ETH: '0x4bb7012Fbc79fE4Ae9B664228977b442b385500d',
  XRP: '0x804582B1f8Fea73919e7c737115009f668f97528',
  SOL: '0xe86999c8e6C8eeF71bebd35286bCa674E0AD7b21',
  QIE: '0x3Bc617cF3A4Bb77003e4c556B87b13D556903D17',
}

export const ASSET_INFO = {
  BTC: {
    name: 'Bitcoin',
    symbol: 'BTC',
    address: ORACLE_ADDRESSES.BTC,
  },
  ETH: {
    name: 'Ethereum',
    symbol: 'ETH',
    address: ORACLE_ADDRESSES.ETH,
  },
  XRP: {
    name: 'Ripple',
    symbol: 'XRP',
    address: ORACLE_ADDRESSES.XRP,
  },
  SOL: {
    name: 'Solana',
    symbol: 'SOL',
    address: ORACLE_ADDRESSES.SOL,
  },
  QIE: {
    name: 'QIE Native',
    symbol: 'QIE',
    address: ORACLE_ADDRESSES.QIE,
  },
}

// Oracle Interface ABI (AggregatorV3Interface)
export const ORACLE_ABI = [
  {
    inputs: [],
    name: 'latestRoundData',
    outputs: [
      { internalType: 'uint80', name: 'roundId', type: 'uint80' },
      { internalType: 'int256', name: 'answer', type: 'int256' },
      { internalType: 'uint256', name: 'startedAt', type: 'uint256' },
      { internalType: 'uint256', name: 'updatedAt', type: 'uint256' },
      { internalType: 'uint80', name: 'answeredInRound', type: 'uint80' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'decimals',
    outputs: [{ internalType: 'uint8', name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
]

// Helper function to get oracle address for an asset
export const getOracleAddress = (assetSymbol) => {
  return ORACLE_ADDRESSES[assetSymbol] || null
}

// Helper function to get asset info
export const getAssetInfo = (assetSymbol) => {
  return ASSET_INFO[assetSymbol] || null
}











