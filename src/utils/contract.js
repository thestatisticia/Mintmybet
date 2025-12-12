// Contract interaction utilities
// This file provides helper functions to interact with the MintMyBet contract

// Contract ABI (simplified - you'll need the full ABI after deployment)
export const CONTRACT_ABI = [
  // ERC721 functions
  "function balanceOf(address owner) view returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function tokenURI(uint256 tokenId) view returns (string)",
  
  // Prediction functions
  "function mintPrediction(string memory asset, string memory predictionType, uint256 durationMinutes)",
  "function resolvePrediction(uint256 tokenId)",
  "function mintResolvedNFT(uint256 tokenId) payable",
  "function getPrediction(uint256 tokenId) view returns (tuple(string asset, uint256 entryPrice, uint256 resultPrice, uint256 resolveTime, string predictionType, string outcome, string rarity, bool resolved, bool mintedToWallet))",
  
  // Points and leaderboard
  "function claimDailyBonus()",
  "function getUserStats(address user) view returns (uint256 points, uint256 wins, uint256 losses, uint256 streak, uint256 winRate, uint256 nextClaimTime)",
  "function getLeaderboard() view returns (tuple(address user, uint256 points, uint256 winRate)[])",
  "function getTimeUntilNextClaim(address user) view returns (uint256)",
  
  // Round and asset functions
  "function getCurrentRound() view returns (uint256)",
  "function getActiveAssets() view returns (string[])",
  "function isAssetActive(string memory asset) view returns (bool)",
  "function getTimeUntilNextRound() view returns (uint256)",
  "function getLatestPrice(string memory assetSymbol) view returns (int256)",
  
  // Events
  "event PredictionMinted(uint256 indexed tokenId, address indexed user, string asset, uint256 entryPrice, uint256 resolveTime, string rarity)",
  "event PredictionResolved(uint256 indexed tokenId, string outcome, uint256 resultPrice)",
  "event DailyClaimed(address indexed user, uint256 timestamp)",
];

// Contract address (set after deployment)
export const CONTRACT_ADDRESS = "0x63a459ad1629d2e9c5994c97192f637ca712bbde"; // Updated with fixed 0% change logic

// QIE Network Configuration - Mainnet
export const QIE_NETWORK = {
  chainId: 1990,
  name: "QIEMainnet",
  symbol: "QIEV3",
  rpcUrls: [
    "https://rpc1mainnet.qie.digital/",
    "https://rpc2mainnet.qie.digital/",
    "https://rpc5mainnet.qie.digital/",
  ],
  blockExplorer: "https://mainnet.qie.digital/",
};

// Primary RPC URL (fallback to first if needed)
export const QIE_RPC_URL = QIE_NETWORK.rpcUrls[0];

/**
 * Get MetaMask network configuration
 */
export function getMetaMaskNetworkConfig() {
  return {
    chainId: `0x${QIE_NETWORK.chainId.toString(16)}`, // Convert to hex
    chainName: QIE_NETWORK.name,
    nativeCurrency: {
      name: QIE_NETWORK.symbol,
      symbol: QIE_NETWORK.symbol,
      decimals: 18,
    },
    rpcUrls: QIE_NETWORK.rpcUrls,
    blockExplorerUrls: [QIE_NETWORK.blockExplorer],
  };
}

/**
 * Add QIE network to MetaMask
 */
export async function addQieNetworkToMetaMask() {
  if (typeof window.ethereum === 'undefined') {
    throw new Error('MetaMask is not installed');
  }

  try {
    await window.ethereum.request({
      method: 'wallet_addEthereumChain',
      params: [getMetaMaskNetworkConfig()],
    });
  } catch (error) {
    console.error('Error adding QIE network:', error);
    throw error;
  }
}

/**
 * Get contract instance
 */
export async function getContract(provider) {
  const { ethers } = await import('ethers');
  // Handle both BrowserProvider and JsonRpcProvider
  const signerOrProvider = provider.getSigner ? await provider.getSigner() : provider;
  return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signerOrProvider);
}

/**
 * Format points (contract stores as integers * 10)
 */
export function formatPoints(points) {
  return (Number(points) / 10).toFixed(1);
}

/**
 * Format win rate (stored as basis points, 10000 = 100%)
 */
export function formatWinRate(winRate) {
  return (Number(winRate) / 100).toFixed(1);
}

/**
 * Format time remaining
 */
export function formatTimeRemaining(seconds) {
  if (seconds === 0) return "Ready";
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}

/**
 * Get rarity color/style
 */
export function getRarityStyle(rarity) {
  switch (rarity) {
    case "Common":
      return { color: "#9fb2d7", border: "rgba(159, 178, 215, 0.3)" };
    case "Rare":
      return { color: "#4fd1c5", border: "rgba(79, 209, 197, 0.5)" };
    case "Epic":
      return { color: "#a855f7", border: "rgba(168, 85, 247, 0.5)" };
    default:
      return { color: "#ffffff", border: "rgba(255, 255, 255, 0.1)" };
  }
}

