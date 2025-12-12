// Oracle utility functions for QIE Oracle integration
// QIE Oracle uses Chainlink AggregatorV3Interface standard
// 
// To use these functions, you'll need ethers.js:
// npm install ethers

/**
 * Get the latest price from QIE Oracle
 * @param {string} assetSymbol - Asset symbol (BTC, ETH, XRP, SOL, QIE)
 * @param {Object} provider - Ethers.js provider instance
 * @returns {Promise<number>} - Latest price in USD
 * 
 * Example usage:
 * import { ethers } from 'ethers'
 * import { getLatestPrice } from './utils/oracle'
 * 
 * const provider = new ethers.JsonRpcProvider('YOUR_RPC_URL')
 * const price = await getLatestPrice('BTC', provider)
 */
export async function getLatestPrice(assetSymbol, provider) {
  try {
    const { getOracleAddress, ORACLE_ABI } = await import('../config/oracle.js')
    const { ethers } = await import('ethers')
    
    const oracleAddress = getOracleAddress(assetSymbol)
    
    if (!oracleAddress) {
      throw new Error(`Oracle address not found for ${assetSymbol}`)
    }

    const oracleContract = new ethers.Contract(oracleAddress, ORACLE_ABI, provider)
    const roundData = await oracleContract.latestRoundData()
    const decimals = await oracleContract.decimals()
    
    // Validate round data
    if (!roundData || roundData.answer === undefined) {
      throw new Error(`Invalid round data received for ${assetSymbol}`)
    }
    
    // Check if price is stale (updated more than 1 hour ago)
    const updatedAt = Number(roundData.updatedAt)
    const now = Math.floor(Date.now() / 1000)
    if (updatedAt && (now - updatedAt) > 3600) {
      console.warn(`Price for ${assetSymbol} may be stale (last updated ${Math.floor((now - updatedAt) / 60)} minutes ago)`)
    }
    
    // Price is returned as int256 (BigInt), convert to number
    // Handle both BigInt and number types
    const answer = typeof roundData.answer === 'bigint' 
      ? Number(roundData.answer) 
      : Number(roundData.answer)
    const decimalsNum = typeof decimals === 'bigint' 
      ? Number(decimals) 
      : Number(decimals)
    
    if (answer <= 0) {
      throw new Error(`Invalid price received for ${assetSymbol}: ${answer}`)
    }
    
    const price = answer / Math.pow(10, decimalsNum)
    
    // Round to 8 decimal places to match contract precision
    return Math.round(price * 100000000) / 100000000
  } catch (error) {
    console.error(`Error fetching price for ${assetSymbol}:`, error)
    throw error
  }
}

/**
 * Format price with appropriate decimals
 * @param {number} price - Price value
 * @param {string} assetSymbol - Asset symbol
 * @returns {string} - Formatted price string
 */
export function formatPrice(price, assetSymbol) {
  if (!price || isNaN(price)) return '0.00'
  
  // Different assets need different decimal places
  const decimals = {
    BTC: 2,
    ETH: 2,
    XRP: 4,
    SOL: 2,
    QIE: 4,
  }
  
  const decimalPlaces = decimals[assetSymbol] || 2
  return price.toLocaleString(undefined, {
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces,
  })
}

/**
 * Calculate price change percentage
 * @param {number} entryPrice - Entry price
 * @param {number} currentPrice - Current price
 * @returns {number} - Percentage change
 */
export function calculatePriceChange(entryPrice, currentPrice) {
  if (!entryPrice || entryPrice === 0) return 0
  return ((currentPrice - entryPrice) / entryPrice) * 100
}

