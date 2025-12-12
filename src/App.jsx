import { useMemo, useState, useEffect, useRef, memo } from 'react'
import './App.css'

const allAssets = ['QIE', 'XRP', 'BTC', 'SOL', 'ETH']
const round1Assets = ['ETH', 'QIE', 'BTC']
const round2Assets = ['XRP', 'SOL']
const predictionOptions = [
  { key: 'UP', label: 'Price Up', detail: 'Price moves upward' },
  { key: 'DOWN', label: 'Price Down', detail: 'Price moves downward' },
]
const durations = [
  { key: '10m', label: '10 min' },
  { key: '30m', label: '30 min' },
  { key: '1h', label: '1 hour' },
]

// Initial empty prices - will be fetched from oracle
const initialPrices = {
  QIE: 0,
  XRP: 0,
  BTC: 0,
  SOL: 0,
  ETH: 0,
}

function App() {
  const [activePage, setActivePage] = useState('home')
  const [selectedAsset, setSelectedAsset] = useState('QIE')
  const [selectedPrediction, setSelectedPrediction] = useState('UP')
  const [selectedDuration, setSelectedDuration] = useState('30m')
  const [currentRound, setCurrentRound] = useState(1)
  const [timeRemaining, setTimeRemaining] = useState(3600)
  const [claimCooldown, setClaimCooldown] = useState(0)
  const [contractActiveAssets, setContractActiveAssets] = useState([])
  const [prices, setPrices] = useState(initialPrices)
  const [walletAddress, setWalletAddress] = useState(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [walletBalance, setWalletBalance] = useState('0.00')
  const [nftCount, setNftCount] = useState(0)
  const [userStats, setUserStats] = useState(null)
  // Removed isLoadingPrices to reduce re-renders - prices update silently
  const [priceChanges, setPriceChanges] = useState({}) // Track price changes for each asset
  const previousPricesRef = useRef(initialPrices) // Use ref to track previous prices without causing re-renders
  const [activePredictions, setActivePredictions] = useState([])
  const [resolvedPredictions, setResolvedPredictions] = useState([])
  const [leaderboard, setLeaderboard] = useState([])
  const [isMinting, setIsMinting] = useState(false)
  const [isResolving, setIsResolving] = useState(false)
  const [isMintingNFT, setIsMintingNFT] = useState({})
  const [selectedPredictionView, setSelectedPredictionView] = useState(null)
  const [currentPriceForView, setCurrentPriceForView] = useState(null)
  const [hiddenNFTs, setHiddenNFTs] = useState(new Set())
  // Footer is always visible now
  const [showDocs, setShowDocs] = useState(false)

  // Fetch current round and active assets from contract
  const fetchRoundData = async () => {
    try {
      const { ethers } = await import('ethers')
      const { CONTRACT_ADDRESS, CONTRACT_ABI, QIE_RPC_URL } = await import('./utils/contract.js')
      
      const provider = new ethers.JsonRpcProvider(QIE_RPC_URL)
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider)
      
      // Fetch current round from contract
      const round = await contract.getCurrentRound()
      setCurrentRound(Number(round))
      
      // Fetch active assets from contract
      const activeAssets = await contract.getActiveAssets()
      setContractActiveAssets(activeAssets)
      
      // Calculate time until next round
      const timeUntilNextRound = await contract.getTimeUntilNextRound()
      setTimeRemaining(Number(timeUntilNextRound))
    } catch (error) {
      console.error('Error fetching round data:', error)
      // Fallback to local calculation if contract call fails
      const now = new Date()
      const hour = now.getHours()
      const round = (hour % 2) + 1
      setCurrentRound(round)
      setContractActiveAssets(round === 1 ? round1Assets : round2Assets)
    }
  }

  // Update round data periodically
  useEffect(() => {
    fetchRoundData()
    const interval = setInterval(fetchRoundData, 10000) // Update every 10 seconds
    return () => clearInterval(interval)
  }, [])

  // Get active assets for current round (use contract data if available, otherwise fallback)
  const activeAssets = contractActiveAssets.length > 0 
    ? contractActiveAssets 
    : (currentRound === 1 ? round1Assets : round2Assets)
  const nextRoundAssets = currentRound === 1 ? round2Assets : round1Assets

  // Ensure selected asset is active, if not switch to first active asset
  useEffect(() => {
    if (activeAssets.length > 0 && !activeAssets.includes(selectedAsset)) {
      setSelectedAsset(activeAssets[0])
    }
  }, [activeAssets, selectedAsset])

  // Fetch real-time oracle prices
  useEffect(() => {
    let isMounted = true
    
    const fetchPrices = async () => {
      if (!isMounted) return
      
      try {
        const { ethers } = await import('ethers')
        const { getLatestPrice } = await import('./utils/oracle.js')
        const { QIE_RPC_URL } = await import('./utils/contract.js')
        
        const provider = new ethers.JsonRpcProvider(QIE_RPC_URL)
        const newPrices = {}
        const newPriceChanges = {}
        let hasChanges = false
        
        // Get previous prices from ref for comparison
        const prevPrices = previousPricesRef.current
        
        // Fetch prices for all assets in parallel for better performance
        const pricePromises = allAssets.map(async (asset) => {
          try {
            const price = await getLatestPrice(asset, provider)
            if (price && price > 0) {
              return { asset, price, error: null }
            } else {
              return { asset, price: null, error: new Error('Invalid price') }
            }
          } catch (error) {
            return { asset, price: null, error }
          }
        })
        
        const priceResults = await Promise.all(pricePromises)
        
        // Process results and only update if prices actually changed
        for (const { asset, price, error } of priceResults) {
          if (error || price === null || price === 0) {
            // Keep previous price if fetch fails
            newPrices[asset] = prevPrices[asset] || 0
            newPriceChanges[asset] = {
              percentage: 0,
              isUp: false,
              isDown: false,
              isNeutral: true
            }
          } else {
            // Only update if price changed significantly (more than 0.01% to prevent micro-updates)
            const prevPrice = prevPrices[asset] || 0
            const priceDiff = prevPrice > 0 ? Math.abs((price - prevPrice) / prevPrice) : 1
            
            if (priceDiff > 0.0001 || prevPrice === 0) {
              newPrices[asset] = price
              hasChanges = true
              
              // Calculate price change if we have a previous price
              if (prevPrice > 0) {
                const change = ((price - prevPrice) / prevPrice) * 100
                newPriceChanges[asset] = {
                  percentage: change,
                  isUp: change > 0,
                  isDown: change < 0,
                  isNeutral: Math.abs(change) < 0.001 // Consider very small changes as neutral
                }
              } else {
                newPriceChanges[asset] = {
                  percentage: 0,
                  isUp: false,
                  isDown: false,
                  isNeutral: true
                }
              }
            } else {
              // Price hasn't changed significantly, keep previous values
              newPrices[asset] = prevPrice
              newPriceChanges[asset] = priceChanges[asset] || {
                percentage: 0,
                isUp: false,
                isDown: false,
                isNeutral: true
              }
            }
          }
        }
        
        if (isMounted && hasChanges) {
          // Update ref with new prices before setting state
          previousPricesRef.current = { ...newPrices }
          // Use requestAnimationFrame to batch updates and prevent screen shaking
          requestAnimationFrame(() => {
            if (isMounted) {
              setPrices(newPrices)
              setPriceChanges(newPriceChanges)
            }
          })
        }
      } catch (error) {
        console.error('Error fetching prices:', error)
      }
    }

    // Fetch immediately
    fetchPrices()
    
    // Then fetch every 15 seconds to reduce re-renders and prevent screen shaking
    const interval = setInterval(fetchPrices, 15000)
    
    return () => {
      isMounted = false
      clearInterval(interval)
    }
  }, []) // Empty dependency array - using ref to avoid dependency issues


  // Fetch claim cooldown from contract
  const fetchClaimCooldown = async () => {
    if (!walletAddress) {
      setClaimCooldown(0)
      return
    }

    try {
      const { ethers } = await import('ethers')
      const { CONTRACT_ADDRESS, CONTRACT_ABI, QIE_RPC_URL } = await import('./utils/contract.js')
      
      const provider = new ethers.JsonRpcProvider(QIE_RPC_URL)
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider)
      
      const cooldown = await contract.getTimeUntilNextClaim(walletAddress)
      setClaimCooldown(Number(cooldown))
    } catch (error) {
      console.error('Error fetching claim cooldown:', error)
      // Fallback to local calculation
      const now = new Date()
      const utcNow = new Date(now.getTime() + (now.getTimezoneOffset() * 60000))
      const midnight = new Date(utcNow)
      midnight.setUTCHours(24, 0, 0, 0)
      const diff = Math.floor((midnight - utcNow) / 1000)
      setClaimCooldown(diff > 0 ? diff : 0)
    }
  }

  // Update claim cooldown periodically
  useEffect(() => {
    fetchClaimCooldown()
    const interval = setInterval(fetchClaimCooldown, 1000)
    return () => clearInterval(interval)
  }, [walletAddress])

  // Detect wallet provider (QIE Wallet or MetaMask)
  const getWalletProvider = () => {
    // Check for QIE Wallet first
    if (window.qie && window.qie.isQieWallet) {
      return window.qie
    }
    // Fallback to MetaMask or other EIP-1193 providers
    if (window.ethereum) {
      return window.ethereum
    }
    return null
  }

  // Connect to QIE network
  const connectToQieNetwork = async () => {
    const provider = getWalletProvider()
    if (!provider) {
      alert('Please install MetaMask or QIE Wallet to connect')
      return false
    }

    try {
      const { addQieNetworkToMetaMask } = await import('./utils/contract.js')
      
      // For QIE Wallet, it should already be on QIE network
      if (window.qie && window.qie.isQieWallet) {
        // QIE Wallet is native to QIE network, just verify chain
        try {
          const chainId = await provider.request({ method: 'eth_chainId' })
          if (chainId !== '0x7c6') {
            alert('Please switch to QIE Mainnet in your QIE Wallet')
            return false
          }
          return true
        } catch (error) {
          console.error('Error checking QIE Wallet chain:', error)
          return true // Assume QIE Wallet is on correct network
        }
      }
      
      // For MetaMask, try to switch to QIE network
      try {
        await provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: '0x7c6' }], // 1990 in hex
        })
      } catch (switchError) {
        // If network doesn't exist, add it
        if (switchError.code === 4902) {
          await addQieNetworkToMetaMask()
        } else {
          throw switchError
        }
      }
      return true
    } catch (error) {
      console.error('Error connecting to QIE network:', error)
      alert('Failed to connect to QIE network. Please add it manually in your wallet.')
      return false
    }
  }

  // Connect wallet function
  const connectWallet = async () => {
    if (isConnecting) return
    
    const provider = getWalletProvider()
    if (!provider) {
      alert('Please install MetaMask or QIE Wallet to connect your wallet.')
      return
    }

    setIsConnecting(true)
    try {
      // First, ensure we're on QIE network
      const networkConnected = await connectToQieNetwork()
      if (!networkConnected) {
        setIsConnecting(false)
        return
      }

      // Request account access
      const accounts = await provider.request({ 
        method: 'eth_requestAccounts' 
      })
      
      if (accounts && accounts.length > 0) {
        setWalletAddress(accounts[0])
        console.log('Wallet connected:', accounts[0], provider.isQieWallet ? '(QIE Wallet)' : '(MetaMask)')
      }
    } catch (error) {
      console.error('Error connecting wallet:', error)
      if (error.code === 4001) {
        alert('Please approve the connection request in your wallet.')
      } else {
        alert('Failed to connect wallet. Please try again.')
      }
    } finally {
      setIsConnecting(false)
    }
  }

  // Disconnect wallet function
  const disconnectWallet = () => {
    setWalletAddress(null)
    setWalletBalance('0.00')
    setNftCount(0)
    setUserStats(null)
    setActivePredictions([])
    setResolvedPredictions([])
    setClaimCooldown(0)
    console.log('Wallet disconnected')
  }

  // Fetch wallet statistics
  const fetchWalletStats = async () => {
    const walletProvider = getWalletProvider()
    if (!walletAddress || !walletProvider) {
      setWalletBalance('0.00')
      setNftCount(0)
      setUserStats(null)
      return
    }

    try {
      const { ethers } = await import('ethers')
      const { CONTRACT_ADDRESS, CONTRACT_ABI, formatPoints } = await import('./utils/contract.js')
      
      const provider = new ethers.BrowserProvider(walletProvider)
      
      // Fetch wallet balance
      const balance = await provider.getBalance(walletAddress)
      const balanceInQIE = ethers.formatEther(balance)
      const newBalance = parseFloat(balanceInQIE).toFixed(2)
      
      // Fetch NFT count from contract
      try {
        // Use provider directly for read operations
        const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider)
        const count = await contract.balanceOf(walletAddress)
        const newNftCount = Number(count)
        
        // Fetch user stats
        const stats = await contract.getUserStats(walletAddress)
        const newUserStats = {
          points: formatPoints(stats.points),
          wins: Number(stats.wins),
          losses: Number(stats.losses),
          streak: Number(stats.streak),
          winRate: (Number(stats.winRate) / 100).toFixed(1),
        }
        
        // Batch updates using requestAnimationFrame to prevent shaking
        requestAnimationFrame(() => {
          setWalletBalance(newBalance)
          setNftCount(newNftCount)
          setUserStats(newUserStats)
        })
      } catch (error) {
        console.error('Error fetching contract data:', error)
        requestAnimationFrame(() => {
          setNftCount(0)
          setUserStats(null)
        })
      }
    } catch (error) {
      console.error('Error fetching wallet stats:', error)
    }
  }

  // Fetch predictions from contract
  const fetchPredictions = async () => {
    const walletProvider = getWalletProvider()
    if (!walletAddress || !walletProvider) {
      setActivePredictions([])
      setResolvedPredictions([])
      return
    }

    try {
      const { ethers } = await import('ethers')
      const { CONTRACT_ADDRESS, CONTRACT_ABI, formatTimeRemaining } = await import('./utils/contract.js')
      
      const provider = new ethers.BrowserProvider(walletProvider)
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider)
      
      // Get user's NFT count
      const balance = await contract.balanceOf(walletAddress)
      const tokenCount = Number(balance)
      
      const active = []
      const resolved = []
      
      // Since we don't have tokenOfOwnerByIndex, we'll check a reasonable range
      // In production, you'd want to track token IDs from events or use a different approach
      // For now, check tokens 0-1000 (adjust based on your needs)
      const maxTokenId = 1000
      
      for (let tokenId = 0; tokenId < maxTokenId && (active.length + resolved.length) < tokenCount; tokenId++) {
        try {
          const owner = await contract.ownerOf(tokenId)
          if (owner.toLowerCase() === walletAddress.toLowerCase()) {
            const prediction = await contract.getPrediction(tokenId)
            
            const predictionData = {
              tokenId: tokenId,
              asset: prediction.asset,
              prediction: prediction.predictionType,
              entryPrice: ethers.formatUnits(prediction.entryPrice, 8), // Oracle prices use 8 decimals
              resultPrice: prediction.resultPrice ? ethers.formatUnits(prediction.resultPrice, 8) : null,
              resolveTime: Number(prediction.resolveTime),
              outcome: prediction.outcome,
              rarity: prediction.rarity,
              resolved: prediction.resolved,
              mintedToWallet: prediction.mintedToWallet,
            }
            
            // Calculate duration from resolveTime
            const durationMs = (predictionData.resolveTime * 1000) - Date.now()
            const durationMinutes = Math.floor(durationMs / 60000)
            predictionData.duration = durationMinutes === 10 ? '10m' : durationMinutes === 30 ? '30m' : '1h'
            
            // Format resolve time
            if (predictionData.resolveTime > Date.now() / 1000) {
              const secondsRemaining = predictionData.resolveTime - Math.floor(Date.now() / 1000)
              predictionData.resolveTimeText = formatTimeRemaining(secondsRemaining)
            } else {
              predictionData.resolveTimeText = 'Resolved'
              // Format resolution timestamp in UTC
              const resolveDate = new Date(predictionData.resolveTime * 1000)
              const hours = resolveDate.getUTCHours().toString().padStart(2, '0')
              const minutes = resolveDate.getUTCMinutes().toString().padStart(2, '0')
              predictionData.resolvedAt = `Resolved at ${hours}:${minutes} UTC`
            }
            
            if (prediction.resolved) {
              // Calculate delta percentage
              if (predictionData.resultPrice && predictionData.entryPrice) {
                const delta = ((Number(predictionData.resultPrice) - Number(predictionData.entryPrice)) / Number(predictionData.entryPrice)) * 100
                predictionData.delta = delta >= 0 ? `+${delta.toFixed(2)}%` : `${delta.toFixed(2)}%`
              }
              resolved.push(predictionData)
            } else {
              active.push(predictionData)
            }
          }
        } catch (error) {
          // Token doesn't exist or error fetching, continue
          continue
        }
      }
      
      setActivePredictions(active)
      setResolvedPredictions(resolved)
    } catch (error) {
      console.error('Error fetching predictions:', error)
      setActivePredictions([])
      setResolvedPredictions([])
    }
  }

  // Fetch leaderboard from contract
  const fetchLeaderboard = async () => {
    try {
      const { ethers } = await import('ethers')
      const { CONTRACT_ADDRESS, CONTRACT_ABI, formatPoints, formatWinRate } = await import('./utils/contract.js')
      const { QIE_RPC_URL } = await import('./utils/contract.js')
      
      const provider = new ethers.JsonRpcProvider(QIE_RPC_URL)
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider)
      
      const leaderboardData = await contract.getLeaderboard()
      
      const formatted = leaderboardData.map((entry, index) => ({
        address: `${entry.user.slice(0, 6)}...${entry.user.slice(-4)}`,
        fullAddress: entry.user,
        points: parseFloat(formatPoints(entry.points)),
        winRate: formatWinRate(entry.winRate),
        rank: index + 1,
      }))
      
      setLeaderboard(formatted)
    } catch (error) {
      console.error('Error fetching leaderboard:', error)
      setLeaderboard([])
    }
  }

  // Check if wallet is already connected on mount and fetch stats
  useEffect(() => {
    const checkWalletConnection = async () => {
      const provider = getWalletProvider()
      if (!provider) return

      try {
        const accounts = await provider.request({ 
          method: 'eth_accounts' 
        })
        
        if (accounts && accounts.length > 0) {
          setWalletAddress(accounts[0])
        }

        // Listen for account changes
        provider.on('accountsChanged', (accounts) => {
          if (accounts.length > 0) {
            setWalletAddress(accounts[0])
          } else {
            setWalletAddress(null)
          }
        })

        // Listen for chain changes
        provider.on('chainChanged', () => {
          // Reload page when chain changes
          window.location.reload()
        })
      } catch (error) {
        console.error('Error checking wallet connection:', error)
      }
    }

    checkWalletConnection()

    // Cleanup listeners on unmount
    return () => {
      const provider = getWalletProvider()
      if (provider) {
        provider.removeAllListeners('accountsChanged')
        provider.removeAllListeners('chainChanged')
      }
    }
  }, [])

  // Fetch wallet stats, predictions, and leaderboard when wallet address changes
  useEffect(() => {
    fetchWalletStats()
    fetchPredictions()
    fetchLeaderboard()
    
    // Refresh data every 30 seconds
    const interval = setInterval(() => {
      fetchWalletStats()
      fetchPredictions()
      fetchLeaderboard()
    }, 30000)
    return () => clearInterval(interval)
  }, [walletAddress])


  // Fetch leaderboard on mount and periodically
  useEffect(() => {
    fetchLeaderboard()
    const interval = setInterval(fetchLeaderboard, 60000) // Every minute
    return () => clearInterval(interval)
  }, [])

  // Handle daily claim
  const handleDailyClaim = async () => {
    if (claimCooldown > 0 || !walletAddress) return
    
    const walletProvider = getWalletProvider()
    if (!walletProvider) {
      alert('Please connect your wallet to claim daily bonus')
      return
    }
    
    try {
      await connectToQieNetwork()
      const { ethers } = await import('ethers')
      const { CONTRACT_ADDRESS, CONTRACT_ABI } = await import('./utils/contract.js')
      
      const provider = new ethers.BrowserProvider(walletProvider)
      const signer = await provider.getSigner()
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer)
      
      const tx = await contract.claimDailyBonus()
      await tx.wait()
      
      alert('Daily bonus claimed! +1 point added to your account.')
      await fetchWalletStats()
      await fetchLeaderboard()
      await fetchClaimCooldown() // Refresh cooldown
    } catch (error) {
      console.error('Error claiming daily bonus:', error)
      if (error.code === 4001) {
        alert('Transaction was rejected.')
      } else {
      alert('Failed to claim daily bonus. Please try again.')
      }
    }
  }

  // Handle mint prediction
  const handleMintPrediction = async () => {
    if (!walletAddress || isMinting) {
      if (!walletAddress) {
        alert('Please connect your wallet first')
      }
      return
    }

    // Validate asset is active before minting
    if (!activeAssets.includes(selectedAsset)) {
      alert(`Asset ${selectedAsset} is not active in the current round. Please select an active asset: ${activeAssets.join(', ')}`)
      return
    }

    try {
      setIsMinting(true)
      await connectToQieNetwork()

      const walletProvider = getWalletProvider()
      const { ethers } = await import('ethers')
      const { CONTRACT_ADDRESS, CONTRACT_ABI } = await import('./utils/contract.js')
      
      const provider = new ethers.BrowserProvider(walletProvider)
      const signer = await provider.getSigner()
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer)
      
      // Double-check asset is active on-chain before minting
      const isActive = await contract.isAssetActive(selectedAsset)
      if (!isActive) {
        alert(`Asset ${selectedAsset} is not active in the current round. Please refresh and select an active asset.`)
        await fetchRoundData() // Refresh round data
        setIsMinting(false)
        return
      }
      
      // Convert duration to minutes
      const durationMinutes = selectedDuration === '10m' ? 10 : selectedDuration === '30m' ? 30 : 60
      
      const tx = await contract.mintPrediction(selectedAsset, selectedPrediction, durationMinutes)
      await tx.wait()
      
      alert('Prediction NFT minted successfully!')
      await fetchPredictions()
      await fetchWalletStats()
      await fetchRoundData() // Refresh round data
    } catch (error) {
      console.error('Error minting prediction:', error)
      if (error.code === 4001) {
        alert('Transaction was rejected.')
      } else if (error.reason && error.reason.includes('Asset not active')) {
        alert(`Asset ${selectedAsset} is not active in the current round. Please select an active asset.`)
        await fetchRoundData() // Refresh round data
      } else {
        alert(`Failed to mint prediction: ${error.reason || error.message || 'Please try again.'}`)
      }
    } finally {
      setIsMinting(false)
    }
  }

  // Handle resolve prediction
  const handleResolvePrediction = async (tokenId) => {
    if (!walletAddress || isResolving) return

    try {
      setIsResolving(true)
      await connectToQieNetwork()

      const walletProvider = getWalletProvider()
      const { ethers } = await import('ethers')
      const { CONTRACT_ADDRESS, CONTRACT_ABI } = await import('./utils/contract.js')
      
      const provider = new ethers.BrowserProvider(walletProvider)
      const signer = await provider.getSigner()
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer)
      
      // Get prediction before resolving to check rarity
      const predictionBefore = await contract.getPrediction(tokenId)
      
      const tx = await contract.resolvePrediction(tokenId)
      const receipt = await tx.wait()
      
      // Get prediction after resolving to check outcome
      const predictionAfter = await contract.getPrediction(tokenId)
      const outcome = predictionAfter.outcome
      
      // Calculate points based on rarity
      let pointsAwarded = 0
      if (outcome === 'WIN') {
        if (predictionBefore.rarity === 'Common') pointsAwarded = 1
        else if (predictionBefore.rarity === 'Rare') pointsAwarded = 2
        else if (predictionBefore.rarity === 'Epic') pointsAwarded = 3
        alert(`🎉 WIN! Prediction resolved successfully! +${pointsAwarded} points awarded!`)
      } else {
        alert('Prediction resolved. LOSE - 0.5 points deducted.')
      }
      
      await fetchPredictions()
      await fetchWalletStats()
      await fetchLeaderboard()
    } catch (error) {
      console.error('Error resolving prediction:', error)
      if (error.code === 4001) {
        alert('Transaction was rejected.')
      } else {
        alert('Failed to resolve prediction. Please try again.')
      }
    } finally {
      setIsResolving(false)
    }
  }

  // Handle mint resolved NFT to wallet
  const handleMintResolvedNFT = async (tokenId) => {
    if (!walletAddress || isMintingNFT[tokenId]) return

    try {
      setIsMintingNFT(prev => ({ ...prev, [tokenId]: true }))
      await connectToQieNetwork()

      const walletProvider = getWalletProvider()
      const { ethers } = await import('ethers')
      const { CONTRACT_ADDRESS, CONTRACT_ABI } = await import('./utils/contract.js')
      
      const provider = new ethers.BrowserProvider(walletProvider)
      const signer = await provider.getSigner()
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer)
      
      // 0.1 QIE = 0.1 ether
      const mintFee = ethers.parseEther('0.1')
      
      const tx = await contract.mintResolvedNFT(tokenId, { value: mintFee })
      await tx.wait()
      
      alert('NFT minted to wallet successfully!')
      await fetchPredictions()
      await fetchWalletStats()
    } catch (error) {
      console.error('Error minting resolved NFT:', error)
      if (error.code === 4001) {
        alert('Transaction was rejected.')
      } else {
        alert('Failed to mint NFT. Please try again.')
      }
    } finally {
      setIsMintingNFT(prev => ({ ...prev, [tokenId]: false }))
    }
  }

  // Format claim cooldown
  const formatClaimCooldown = (seconds) => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  // Get rarity style
  const getRarityStyle = (rarity) => {
    switch (rarity) {
      case 'Common':
        return { color: '#9fb2d7', border: 'rgba(159, 178, 215, 0.3)' }
      case 'Rare':
        return { color: '#4fd1c5', border: 'rgba(79, 209, 197, 0.5)' }
      case 'Epic':
        return { color: '#a855f7', border: 'rgba(168, 85, 247, 0.5)' }
      default:
        return { color: '#ffffff', border: 'rgba(255, 255, 255, 0.1)' }
    }
  }

  // Format countdown
  const countdownText = useMemo(() => {
    const hours = Math.floor(timeRemaining / 3600)
    const minutes = Math.floor((timeRemaining % 3600) / 60)
    const seconds = timeRemaining % 60
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }, [timeRemaining])

  const livePrice = prices[selectedAsset]
  const resolveInText = useMemo(() => {
    if (selectedDuration === '10m') return 'in 10 minutes'
    if (selectedDuration === '30m') return 'in 30 minutes'
    return 'in 1 hour'
  }, [selectedDuration])

  return (
    <div className="page">
      <header className="nav">
        <div className="brand">
          <div>
            <div className="brand-title">MintMyBet</div>
            <div className="brand-sub">Prediction NFTs on QIE</div>
          </div>
        </div>
        {activePage !== 'home' && (
        <div className="nav-links">
          <a
            href="#dashboard"
            className={activePage === 'dashboard' ? 'active' : ''}
            onClick={(e) => {
              e.preventDefault()
              setActivePage('dashboard')
            }}
          >
            Dashboard
          </a>
          <a
            href="#play"
            className={activePage === 'play' ? 'active' : ''}
            onClick={(e) => {
              e.preventDefault()
              setActivePage('play')
            }}
          >
            Play
          </a>
          <a
            href="#mypredictions"
            className={activePage === 'mypredictions' ? 'active' : ''}
            onClick={(e) => {
              e.preventDefault()
              setActivePage('mypredictions')
            }}
          >
            My Predictions
          </a>
          <a
            href="#leaderboard"
            className={activePage === 'leaderboard' ? 'active' : ''}
            onClick={(e) => {
              e.preventDefault()
              setActivePage('leaderboard')
            }}
          >
            Leaderboard
        </a>
      </div>
        )}
        <div className="nav-actions">
          {activePage === 'home' ? (
            <button 
              className="btn primary" 
              onClick={() => setActivePage('dashboard')}
            >
              Launch App
            </button>
          ) : walletAddress ? (
            <div className="wallet-address-container">
              <button className="btn primary" disabled>
                {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
              </button>
              <button 
                className="btn wallet-disconnect-btn"
                onClick={() => disconnectWallet()}
                title="Disconnect wallet"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M8 2L2 8l6 6M2 8h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
          ) : (
            <button 
              className="btn primary" 
              onClick={connectWallet}
              disabled={isConnecting}
            >
              {isConnecting ? 'Connecting...' : 'Connect Wallet'}
            </button>
          )}
        </div>
      </header>

      {activePage === 'home' ? (
        <main className="homepage">
          <div className="homepage-hero hero-left hero-full">
            <h1 className="homepage-title">
              PREDICT, WIN, MINT, REPEAT
              </h1>
            <p className="homepage-lede">
              Free on-chain price calls powered by QIE oracles. Lock your prediction, let it resolve,
              then mint the outcome as your own tradable NFT receipt.
            </p>
              </div>
          
          <div className="homepage-steps-wrapper">
            <div className="homepage-steps-card">
              <h2 className="steps-title">How It Works</h2>
              <div className="steps-grid">
                <div className="step-item">
                  <div className="step-number">Step 1</div>
                  <div className="step-content">
                    <h3>Make Your Prediction</h3>
                    <p>Pick an asset, choose UP or DOWN, and lock your call for a set duration. No fees to enter.</p>
            </div>
            </div>
                <div className="step-item">
                  <div className="step-number">Step 2</div>
                  <div className="step-content">
                    <h3>Wait for Resolution</h3>
                    <p>Oracle snapshots at expiry. Your result is verified on-chain for full transparency.</p>
            </div>
            </div>
                <div className="step-item">
                  <div className="step-number">Step 3</div>
                  <div className="step-content">
                    <h3>Mint Your NFT</h3>
                    <p>After it settles, mint the prediction as an NFT to your wallet—proof you called it first.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="homepage-about about-left">
            <div className="homepage-about-card">
              <h2 className="about-title">About the App</h2>
              <div className="about-content">
                <p>
                  Built for QIE Network, this app makes price calls simple: free entry, oracle-verified outcomes,
                  and NFTs you can mint to prove your market reads.
                </p>
                <p>
                  Every prediction is tracked on-chain. When it settles, you decide to mint—turning your call into a collectible,
                  shareable NFT that captures the exact entry, result, and outcome.
                </p>
                <p>
                  Live oracle feeds keep everything transparent; the leaderboard keeps it competitive.
                  Call the move, mint the proof, and build your streak.
                </p>
              </div>
            </div>
          </div>
        </main>
      ) : activePage === 'dashboard' ? (
        <main className="content">
          {!walletAddress ? (
            <div className="connect-gate">
              <h2>Connect your wallet</h2>
              <p>Connect to view personalized dashboard stats.</p>
              <button 
                className="btn primary large"
                onClick={connectWallet}
                disabled={isConnecting}
              >
                {isConnecting ? 'Connecting...' : 'Connect Wallet'}
              </button>
            </div>
          ) : (
          <div className="dashboard-grid">
            <section className="dashboard-section oracle-feed">
              <div className="section-header">
                <h3>Live Oracle Feed</h3>
                <span className="pulse-indicator"></span>
              </div>
              <div className="oracle-grid">
                {allAssets.map((asset) => {
                  const priceChange = priceChanges[asset] || { percentage: 0, isUp: false, isDown: false, isNeutral: true }
                  const changeColor = priceChange.isUp ? '#22c55e' : priceChange.isDown ? '#ef4444' : '#9fb2d7'
                  const changeText = priceChange.isNeutral 
                    ? '0.00%' 
                    : priceChange.isUp 
                      ? `+${priceChange.percentage.toFixed(2)}%` 
                      : `${priceChange.percentage.toFixed(2)}%`
                  
                  return (
                  <div key={asset} className="oracle-item">
                    <div className="oracle-asset">{asset}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'space-between', minHeight: '32px' }}>
                    <div className="oracle-price" style={{ minWidth: '100px', transition: 'none' }}>
                          {prices[asset] ? (
                            `$${prices[asset].toLocaleString(undefined, { maximumFractionDigits: 4 })}`
                          ) : (
                            <span style={{ color: '#9fb2d7' }}>Loading...</span>
                          )}
                        </div>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '12px',
                          fontWeight: 600,
                          color: changeColor,
                          padding: '2px 6px',
                          borderRadius: '4px',
                          backgroundColor: `${changeColor}15`,
                          minWidth: priceChange.isNeutral ? '0px' : '50px',
                          opacity: priceChange.isNeutral ? 0 : 1,
                          transition: 'opacity 0.2s ease, min-width 0.2s ease',
                          overflow: 'hidden'
                        }}>
                          <span>{priceChange.isUp ? '↑' : priceChange.isDown ? '↓' : ''}</span>
                          <span>{changeText}</span>
                        </div>
                    </div>
                    <div className="oracle-chart" style={{ display: 'block', visibility: 'visible', transition: 'none' }}>
                      <svg width="100" height="24" viewBox="0 0 100 24" preserveAspectRatio="none" style={{ display: 'block' }}>
                        <path
                            d={priceChange.isUp 
                              ? "M 0,20 Q 10,15 20,12 T 40,8 T 60,6 T 80,4 T 100,2"
                              : priceChange.isDown
                                ? "M 0,4 Q 10,6 20,8 T 40,12 T 60,14 T 80,18 T 100,20"
                                : "M 0,12 Q 10,12 20,12 T 40,12 T 60,12 T 80,12 T 100,12"
                            }
                          fill="none"
                            stroke={changeColor}
                          strokeWidth="1.5"
                          strokeLinecap="round"
                            opacity={0.8}
                            style={{ transition: 'stroke 0.3s ease' }}
                        />
                      </svg>
                    </div>
                  </div>
                  )
                })}
              </div>
            </section>

            <section className="dashboard-section wallet-snapshot">
              <div className="section-header">
                <h3>Wallet Snapshot</h3>
                {!walletAddress && (
                  <span className="pill muted" style={{ fontSize: '12px' }}>
                    Connect wallet to view stats
                  </span>
                )}
              </div>
              <div className="wallet-stats">
                <div className="wallet-stat">
                  <div className="wallet-label">Balance</div>
                  <div className="wallet-value">
                    {walletAddress ? `${parseFloat(walletBalance).toLocaleString()} QIE` : '--'}
                  </div>
                </div>
                <div className="wallet-stat">
                  <div className="wallet-label">Total NFTs</div>
                  <div className="wallet-value">
                    {walletAddress ? nftCount : '--'}
                  </div>
                </div>
                <div className="wallet-stat">
                  <div className="wallet-label">Points</div>
                  <div className="wallet-value">
                    {userStats ? `${userStats.points} pts` : '--'}
                </div>
              </div>
              </div>
              {userStats && (
                <div style={{ marginTop: '12px', fontSize: '12px', color: '#9fb2d7' }}>
                  {userStats.wins}W / {userStats.losses}L · {userStats.winRate}% win rate · Streak: {userStats.streak}
                </div>
              )}
            </section>

            <section className="dashboard-section mint-window">
              <div className="section-header">
                <h3>Mint New Prediction</h3>
              </div>
              <div className="mint-content">
                <p className="mint-desc">Make your next prediction with live oracle data</p>
                <div className="active-assets">
                  <div className="label">Active Assets (Round {currentRound})</div>
                  <div className="asset-badges">
                    {activeAssets.map((asset) => (
                      <span key={asset} className="asset-badge active">{asset}</span>
                    ))}
                  </div>
                </div>
                <div className="next-round">
                  <div className="label">Next Round in</div>
                  <div className="countdown">{countdownText}</div>
                  <div className="next-assets">
                    {nextRoundAssets.map((asset) => (
                      <span key={asset} className="asset-badge">{asset}</span>
                    ))}
                  </div>
                </div>
                <button className="btn primary" onClick={() => setActivePage('play')}>
                  Start Minting
                </button>
              </div>
            </section>

            <section className="dashboard-section recent-performance">
              <div className="section-header">
                <h3>Recent NFT Performance</h3>
                <button className="btn-link" onClick={() => setActivePage('mypredictions')}>
                  View all →
                </button>
              </div>
              <div className="performance-list">
                {resolvedPredictions.length === 0 ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#9fb2d7' }}>
                    {walletAddress ? 'No resolved predictions yet' : 'Connect wallet to view your performance'}
                  </div>
                ) : (
                  resolvedPredictions.slice(0, 4).map((item) => {
                    const delta = item.resultPrice && item.entryPrice 
                      ? (((Number(item.resultPrice) - Number(item.entryPrice)) / Number(item.entryPrice)) * 100).toFixed(2)
                      : '0.00'
                    const deltaText = delta >= 0 ? `+${delta}%` : `${delta}%`
                    
                    return (
                      <div key={item.tokenId} className="performance-item">
                    <div className="performance-left">
                      <div className="performance-asset">{item.asset}</div>
                      <div className="performance-prediction">
                        {item.prediction}
                      </div>
                    </div>
                    <div className="performance-right">
                          <div className="performance-delta">{deltaText}</div>
                      <div className="performance-rarity">{item.rarity}</div>
                    </div>
                  </div>
                    )
                  })
                )}
              </div>
            </section>
          </div>
          )}
        </main>
      ) : activePage === 'play' ? (
        <main className="content">
          {!walletAddress ? (
            <div className="connect-gate">
              <h2>Connect your wallet</h2>
              <p>Connect to mint and view your predictions.</p>
              <button 
                className="btn primary large"
                onClick={connectWallet}
                disabled={isConnecting}
              >
                {isConnecting ? 'Connecting...' : 'Connect Wallet'}
              </button>
            </div>
          ) : (
            <>
          <section className="panel-grid" id="play">
            <div className="panel">
              <div className="panel-head">
                <div>
                  <p className="label">Step 1</p>
                  <h3>Select asset</h3>
                </div>
                <span className="pill muted">Round {currentRound} Active</span>
              </div>
              <div className="pill-row">
                {allAssets.map((asset) => {
                  const isActive = activeAssets.includes(asset)
                  const isSelected = selectedAsset === asset
                  
                  return (
                  <button
                    key={asset}
                      className={`pill ${isSelected ? 'active' : ''} ${!isActive ? 'disabled' : ''}`}
                      onClick={() => isActive && setSelectedAsset(asset)}
                      disabled={!isActive}
                      title={!isActive ? `Available in Round ${currentRound === 1 ? 2 : 1}` : ''}
                    >
                      {asset} {!isActive && '(Next)'}
                  </button>
                  )
                })}
              </div>
              <div className="panel-footer">
                Round {currentRound} assets are active. Next round starts in {countdownText}
              </div>
            </div>

            <div className="panel">
              <div className="panel-head">
                <div>
                  <p className="label">Step 2</p>
                  <h3>Choose prediction</h3>
                </div>
                <span className="pill muted">Directional picks</span>
              </div>
              <div className="card-list">
                {predictionOptions.map((p) => (
                  <div
                    key={p.key}
                    className={`option-card ${
                      selectedPrediction === p.key ? 'selected' : ''
                    }`}
                    onClick={() => setSelectedPrediction(p.key)}
                  >
                    <div className="option-top">
                      <div className="option-key">{p.key}</div>
                      {selectedPrediction === p.key && (
                        <div className="option-badge">Selected</div>
                      )}
                    </div>
                    <div className="option-label">{p.label}</div>
                    <div className="option-detail">{p.detail}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel">
              <div className="panel-head">
                <div>
                  <p className="label">Step 3</p>
                  <h3>Set duration</h3>
                </div>
                <span className="pill muted">Quick choices</span>
              </div>
              <div className="pill-row">
                {durations.map((d) => (
                  <button
                    key={d.key}
                    className={`pill ${selectedDuration === d.key ? 'active' : ''}`}
                    onClick={() => setSelectedDuration(d.key)}
                  >
                    {d.label}
        </button>
                ))}
              </div>
              <div className="panel-footer">
                Resolution time locks at mint; oracle snapshot triggers the NFT
                update.
              </div>
            </div>
          </section>

          <section className="panel mint-preview" id="mint">
            <div className="panel-head">
              <div>
                <p className="label">Ready to mint</p>
                <h3>Your Prediction NFT</h3>
              </div>
            </div>
            <div className="mint-preview-content">
              <div className="mint-preview-grid">
                <div className="mint-preview-item">
                  <div className="label">Asset</div>
                  <div className="value-lg">{selectedAsset}</div>
                </div>
                <div className="mint-preview-item">
                  <div className="label">Entry Price</div>
                  <div className="value-lg">
                    ${livePrice?.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                  </div>
                </div>
                <div className="mint-preview-item">
                  <div className="label">Prediction</div>
                  <div className="value-lg">{selectedPrediction}</div>
                </div>
                <div className="mint-preview-item">
                  <div className="label">Duration</div>
                  <div className="value-lg">{selectedDuration}</div>
                </div>
                <div className="mint-preview-item">
                  <div className="label">Resolves</div>
                  <div className="value-lg">{resolveInText}</div>
                </div>
              </div>
              <div className="mint-cta-section">
                {!activeAssets.includes(selectedAsset) && (
                  <div style={{ 
                    padding: '12px', 
                    marginBottom: '12px', 
                    backgroundColor: 'rgba(255, 193, 7, 0.1)', 
                    border: '1px solid rgba(255, 193, 7, 0.3)',
                    borderRadius: '8px',
                    color: '#ffc107',
                    fontSize: '14px'
                  }}>
                    ⚠️ {selectedAsset} is not active in Round {currentRound}. Active assets: {activeAssets.join(', ')}
                  </div>
                )}
                <button 
                  className="btn primary large" 
                  onClick={handleMintPrediction}
                  disabled={isMinting || !walletAddress || !activeAssets.includes(selectedAsset)}
                >
                  {isMinting ? 'Minting...' : !walletAddress ? 'Connect Wallet to Mint' : !activeAssets.includes(selectedAsset) ? 'Select Active Asset' : 'Mint Prediction NFT'}
                </button>
                <p className="mint-note">Gas fees paid in QIE. NFT updates after resolution.</p>
              </div>
            </div>
          </section>
          </>
          )}
        </main>
      ) : activePage === 'mypredictions' ? (
        <main className="content">
          {!walletAddress ? (
            <div className="connect-gate">
              <h2>Connect your wallet</h2>
              <p>Connect to view your predictions and NFTs.</p>
              <button 
                className="btn primary large"
                onClick={connectWallet}
                disabled={isConnecting}
              >
                {isConnecting ? 'Connecting...' : 'Connect Wallet'}
              </button>
            </div>
          ) : (
            <>
          <section className="page-header compact">
            <div>
              <h2>My Predictions</h2>
            </div>
          </section>
          <section className="split" id="mypredictions">
            <div className="panel">
              <div className="panel-head">
                <div>
                  <p className="label">Active</p>
                  <h3>Pending predictions</h3>
                </div>
              </div>
              <div className="list">
                {activePredictions.length === 0 ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#9fb2d7' }}>
                    {walletAddress ? 'No active predictions' : 'Connect wallet to view your predictions'}
                  </div>
                ) : (
                  activePredictions.map((item) => (
                    <div 
                      className="list-row" 
                      key={item.tokenId}
                      onClick={() => setSelectedPredictionView(item)}
                      style={{ cursor: 'pointer' }}
                    >
                    <div className="row-left">
                      <div className="row-title">
                        {item.asset} · {item.prediction}
                      </div>
                      <div className="row-sub">
                          Entry ${item.entryPrice} · Resolves {item.resolveTimeText}
                      </div>
                    </div>
                    <div className="row-right">
                      <span className="pill muted">{item.duration}</span>
                        <button 
                          className="btn subtle" 
                          onClick={(e) => {
                            e.stopPropagation()
                            handleResolvePrediction(item.tokenId)
                          }}
                          disabled={isResolving || item.resolveTime > Date.now() / 1000}
                        >
                          {isResolving ? 'Resolving...' : item.resolveTime > Date.now() / 1000 ? 'Not ready' : 'Check result'}
                        </button>
                    </div>
                  </div>
                  ))
                )}
              </div>
            </div>

            <div className="panel">
              <div className="panel-head">
                <div>
                  <p className="label">Resolved</p>
                  <h3>Outcome gallery</h3>
                  {hiddenNFTs.size > 0 && (
                    <span style={{ fontSize: '12px', color: '#9fb2d7', marginTop: '4px', display: 'block' }}>
                      {hiddenNFTs.size} NFT{hiddenNFTs.size > 1 ? 's' : ''} hidden
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span className="pill muted">Resolved NFTs</span>
                {hiddenNFTs.size > 0 && (
                  <button
                    onClick={() => setHiddenNFTs(new Set())}
                    style={{
                      background: 'transparent',
                      border: '1px solid rgba(255, 255, 255, 0.2)',
                      borderRadius: '6px',
                      color: '#9fb2d7',
                      fontSize: '11px',
                      padding: '4px 10px',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.background = 'rgba(255, 255, 255, 0.1)'
                      e.target.style.color = '#fff'
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.background = 'transparent'
                      e.target.style.color = '#9fb2d7'
                    }}
                  >
                    Show All
                  </button>
                )}
                </div>
              </div>
              <div className="resolved-grid">
                {resolvedPredictions.length === 0 ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#9fb2d7' }}>
                    {walletAddress ? 'No resolved predictions' : 'Connect wallet to view your resolved predictions'}
                  </div>
                ) : (
                  resolvedPredictions
                    .filter(item => !hiddenNFTs.has(item.tokenId))
                    .map((item) => {
                  const rarityStyle = getRarityStyle(item.rarity)
                    const delta = item.resultPrice && item.entryPrice 
                      ? (((Number(item.resultPrice) - Number(item.entryPrice)) / Number(item.entryPrice)) * 100).toFixed(2)
                      : '0.00'
                    const deltaText = delta >= 0 ? `+${delta}%` : `${delta}%`
                    const isWin = item.outcome === 'WIN'
                    const outcomeColor = isWin ? '#22c55e' : '#ef4444'
                    const outcomeBg = isWin ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)'
                    
                    // Format resolution timestamp
                    let resolvedAtText = ''
                    if (item.resolveTime && item.resolveTime <= Date.now() / 1000) {
                      const resolveDate = new Date(item.resolveTime * 1000)
                      const hours = resolveDate.getUTCHours().toString().padStart(2, '0')
                      const minutes = resolveDate.getUTCMinutes().toString().padStart(2, '0')
                      resolvedAtText = `Resolved at ${hours}:${minutes} UTC`
                    }
                    
                  return (
                    <div 
                      className={`resolved-card premium ${item.outcome.toLowerCase()}`} 
                        key={item.tokenId}
                          style={{ 
                          borderColor: isWin ? 'rgba(34, 197, 94, 0.4)' : 'rgba(239, 68, 68, 0.4)',
                          cursor: 'pointer',
                          background: isWin 
                            ? 'linear-gradient(135deg, rgba(34, 197, 94, 0.05) 0%, rgba(0, 0, 0, 0.5) 100%)'
                            : 'linear-gradient(135deg, rgba(239, 68, 68, 0.05) 0%, rgba(0, 0, 0, 0.5) 100%)'
                        }}
                        onClick={() => setSelectedPredictionView(item)}
                      >
                        {/* Header */}
                        <div style={{ 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center',
                          padding: '12px 16px',
                          borderBottom: '1px solid rgba(255, 255, 255, 0.1)'
                        }}>
                          <div style={{ 
                            fontSize: '14px', 
                            fontWeight: 600,
                            color: '#fff'
                          }}>
                            {item.asset}
                          </div>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            {item.mintedToWallet && (
                              <div style={{ 
                                fontSize: '10px', 
                                padding: '3px 8px',
                                borderRadius: '4px',
                                backgroundColor: 'rgba(79, 209, 197, 0.2)',
                                border: '1px solid rgba(79, 209, 197, 0.5)',
                                color: '#4fd1c5',
                                fontWeight: 600,
                                textTransform: 'uppercase',
                                letterSpacing: '0.5px'
                              }}>
                                ✓ Minted
                              </div>
                            )}
                            <div style={{ 
                              fontSize: '12px', 
                              padding: '4px 10px',
                              borderRadius: '6px',
                              backgroundColor: rarityStyle.border.replace('0.5', '0.15'),
                              border: `1px solid ${rarityStyle.border}`,
                              color: rarityStyle.color
                            }}>
                          {item.rarity}
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setHiddenNFTs(prev => {
                              const newSet = new Set(prev)
                              newSet.add(item.tokenId)
                              return newSet
                            })
                          }}
                          style={{
                            background: 'transparent',
                            border: '1px solid rgba(255, 255, 255, 0.2)',
                            borderRadius: '4px',
                            color: '#9fb2d7',
                            fontSize: '10px',
                            padding: '4px 8px',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease'
                          }}
                          onMouseEnter={(e) => {
                            e.target.style.background = 'rgba(255, 255, 255, 0.1)'
                            e.target.style.color = '#fff'
                          }}
                          onMouseLeave={(e) => {
                            e.target.style.background = 'transparent'
                            e.target.style.color = '#9fb2d7'
                          }}
                        >
                          Hide
                        </button>
                      </div>
                        </div>

                        {/* Main Content */}
                        <div style={{ 
                          padding: '12px',
                          textAlign: 'center',
                          position: 'relative',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'center',
                          alignItems: 'center',
                          gap: '6px'
                        }}>
                          {/* Outcome Badge */}
                          <div style={{
                            display: 'inline-block',
                            padding: '3px 10px',
                            borderRadius: '20px',
                            backgroundColor: outcomeBg,
                            border: `1px solid ${outcomeColor}`,
                            fontSize: '10px',
                            fontWeight: 600,
                            color: outcomeColor,
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px'
                          }}>
                            {item.outcome === 'WIN' ? 'WIN NFT' : 'LOSE NFT'}
                          </div>

                          {/* Icon */}
                          <div style={{ 
                            fontSize: '28px',
                            filter: isWin ? 'drop-shadow(0 0 10px rgba(34, 197, 94, 0.5))' : 'drop-shadow(0 0 10px rgba(239, 68, 68, 0.3))'
                          }}>
                            {item.outcome === 'WIN' ? '🏆' : '🤡'}
                          </div>

                          {/* Entry and Final Price Side by Side */}
                          <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: '12px',
                            width: '100%',
                            padding: '0 8px'
                          }}>
                            {/* Entry Price */}
                            <div style={{ flex: 1 }}>
                              <div style={{ 
                                fontSize: '9px', 
                                color: '#9fb2d7',
                                marginBottom: '2px'
                              }}>
                                Entry Price
                        </div>
                              <div style={{ 
                                fontSize: '13px', 
                                fontWeight: 600,
                                color: '#fff'
                              }}>
                                ${Number(item.entryPrice || 0).toFixed(4)}
                      </div>
                            </div>

                            {/* Arrow */}
                            <div style={{ 
                              fontSize: '16px', 
                              color: '#9fb2d7',
                              paddingTop: '12px'
                            }}>
                              →
                            </div>

                            {/* Final Price */}
                            <div style={{ flex: 1 }}>
                              <div style={{ 
                                fontSize: '9px', 
                                color: '#9fb2d7',
                                marginBottom: '2px'
                              }}>
                                Final Price
                              </div>
                              <div style={{ 
                                fontSize: '13px', 
                                fontWeight: 700,
                                color: outcomeColor
                              }}>
                                ${Number(item.resultPrice || 0).toFixed(4)}
                              </div>
                            </div>
                          </div>

                          {/* Price Change */}
                          <div style={{
                            padding: '4px 10px',
                            borderRadius: '6px',
                            backgroundColor: isWin ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                            border: `1px solid ${outcomeColor}40`,
                            marginTop: '4px'
                          }}>
                            <div style={{ 
                              fontSize: '12px', 
                              fontWeight: 700,
                              color: outcomeColor
                            }}>
                              {deltaText}
                            </div>
                          </div>
                        </div>

                        {/* Footer */}
                        <div style={{ 
                          padding: '10px 12px',
                          borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                          backgroundColor: 'rgba(0, 0, 0, 0.3)'
                        }}>
                          {resolvedAtText && (
                            <div style={{ 
                              fontSize: '10px', 
                              color: '#9fb2d7',
                              marginBottom: '6px',
                              textAlign: 'center'
                            }}>
                              {resolvedAtText}
                            </div>
                          )}
                          <div style={{ 
                            display: 'flex', 
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: '6px'
                          }}>
                            <div style={{ 
                              fontSize: '9px', 
                              color: '#9fb2d7',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '3px'
                            }}>
                              <span>✓</span>
                              <span>Oracle Verified</span>
                            </div>
                            <div style={{ 
                              fontSize: '9px', 
                              color: '#9fb2d7'
                            }}>
                              #{item.tokenId}
                            </div>
                          </div>
                          {item.mintedToWallet ? (
                            <div style={{
                              width: '100%',
                              padding: '10px',
                              textAlign: 'center',
                              fontSize: '12px',
                              color: '#4fd1c5',
                              backgroundColor: 'rgba(79, 209, 197, 0.1)',
                              border: '1px solid rgba(79, 209, 197, 0.3)',
                              borderRadius: '8px',
                              fontWeight: 600
                            }}>
                              ✓ Minted to Wallet
                            </div>
                          ) : (
                            <button 
                              className="btn primary mint-nft-btn" 
                              onClick={(e) => {
                                e.stopPropagation()
                                handleMintResolvedNFT(item.tokenId)
                              }}
                              disabled={isMintingNFT[item.tokenId]}
                              style={{
                                width: '100%',
                                fontSize: '12px',
                                padding: '8px 12px'
                              }}
                            >
                              {isMintingNFT[item.tokenId] 
                                ? 'Minting...' 
                                : 'Mint to Wallet (0.1 QIE)'
                              }
                            </button>
                          )}
                      </div>
                    </div>
                  )
                  })
                )}
              </div>
            </div>
          </section>
          </>
          )}
        </main>
      ) : (
        <main className="content">
          {!walletAddress ? (
            <div className="connect-gate">
              <h2>Connect your wallet</h2>
              <p>Connect to view the leaderboard and compete.</p>
              <button 
                className="btn primary large"
                onClick={connectWallet}
                disabled={isConnecting}
              >
                {isConnecting ? 'Connecting...' : 'Connect Wallet'}
              </button>
            </div>
          ) : (
            <>
          <section className="leaderboard-header">
            <div className="leaderboard-header-left">
              <h2 className="leaderboard-title">Points Leaderboard</h2>
              <p className="leaderboard-description">
                Earn points by making predictions and winning. Points start at 0 when you connect.
              </p>
            </div>
            <div className="leaderboard-header-right">
              <button className="season-pill">Season 1</button>
            </div>
          </section>
          <section className="leaderboard-table-section">
            <div className="leaderboard-table-header">
              <div className="leaderboard-col-rank">RANK</div>
              <div className="leaderboard-col-address">ADDRESS</div>
              <div className="leaderboard-col-points">POINTS</div>
            </div>
            <div className="leaderboard-table-body">
              {leaderboard.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#9fb2d7' }}>
                  Loading leaderboard...
                </div>
              ) : (
                leaderboard.map((r, index) => {
                  const isTopRank = r.rank === 1
                  return (
                    <div 
                      key={r.fullAddress} 
                      className={`leaderboard-row ${isTopRank ? 'top-rank' : ''}`}
                    >
                      <div className="leaderboard-col-rank">
                        <span className={isTopRank ? 'rank-highlight' : ''}>{r.rank}</span>
                      </div>
                      <div className="leaderboard-col-address">
                        <span className={isTopRank ? 'address-highlight' : ''}>{r.address}</span>
                      </div>
                      <div className="leaderboard-col-points">
                        <span className={isTopRank ? 'points-highlight' : ''}>{r.points}</span>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </section>
          <section className="leaderboard-actions" style={{ marginTop: '32px', padding: '0 24px' }}>
            <button 
              className="btn primary" 
              onClick={handleDailyClaim}
              disabled={claimCooldown > 0}
            >
              {claimCooldown > 0 
                ? `Claim in ${formatClaimCooldown(claimCooldown)}`
                : 'Claim Daily Bonus (+1 pt)'
              }
            </button>
          </section>
          </>
          )}
        </main>
      )}

      {/* Prediction Detail Modal */}
      {selectedPredictionView && (
        <PredictionDetailModal
          prediction={selectedPredictionView}
          currentPrice={currentPriceForView || prices[selectedPredictionView.asset]}
          onClose={() => {
            setSelectedPredictionView(null)
            setCurrentPriceForView(null)
          }}
          onResolve={handleResolvePrediction}
          onMint={handleMintResolvedNFT}
          isResolving={isResolving}
          isMinting={isMintingNFT[selectedPredictionView.tokenId]}
          prices={prices}
          getRarityStyle={getRarityStyle}
        />
      )}

      {/* Docs Modal */}
      {showDocs && (
        <DocsModal onClose={() => setShowDocs(false)} />
      )}

      {/* Footer - always visible */}
      <footer className="app-footer">
        <div className="footer-separator"></div>
        <div className="footer-content">
          <div className="footer-left">
            <p>© 2025 QieLand All rights reserved</p>
          </div>
          <div className="footer-right">
            <a href="https://t.me" target="_blank" rel="noopener noreferrer" className="footer-link">Telegram</a>
            <a href="https://x.com" target="_blank" rel="noopener noreferrer" className="footer-link">X</a>
            <a href="https://discord.com" target="_blank" rel="noopener noreferrer" className="footer-link">Discord</a>
            <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="footer-link">
              GitHub
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ marginLeft: '4px', display: 'inline-block', verticalAlign: 'middle' }}>
                <rect x="2" y="2" width="8" height="8" fill="currentColor" opacity="0.4"/>
              </svg>
            </a>
            <button 
              onClick={() => setShowDocs(true)}
              className="footer-link"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, font: 'inherit' }}
            >
              Docs
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ marginLeft: '4px', display: 'inline-block', verticalAlign: 'middle' }}>
                <path d="M2 2h2v2H2V2zm0 3h2v2H2V5zm0 3h2v2H2V8zm3-6h5v1H5V2zm0 3h5v1H5V5zm0 3h5v1H5V8z" fill="currentColor" opacity="0.4"/>
              </svg>
            </button>
          </div>
        </div>
      </footer>
    </div>
  )
}

// Prediction Detail Modal Component
function PredictionDetailModal({ 
  prediction, 
  currentPrice, 
  onClose, 
  onResolve, 
  onMint, 
  isResolving, 
  isMinting,
  prices,
  getRarityStyle
}) {
  const [livePrice, setLivePrice] = useState(null)
  const [isLoadingPrice, setIsLoadingPrice] = useState(false)
  const [lastPriceUpdate, setLastPriceUpdate] = useState(null)

  // Fetch and update live price for unresolved predictions
  useEffect(() => {
    if (!prediction.resolved) {
      const fetchLivePrice = async () => {
        try {
          setIsLoadingPrice(true)
          const { ethers } = await import('ethers')
          const { getLatestPrice } = await import('./utils/oracle.js')
          const { QIE_RPC_URL } = await import('./utils/contract.js')
          
          const provider = new ethers.JsonRpcProvider(QIE_RPC_URL)
          const price = await getLatestPrice(prediction.asset, provider)
          
          // Only update if we got a valid price
          if (price && price > 0) {
            setLivePrice(price)
            setLastPriceUpdate(Date.now())
          } else {
            console.warn(`Invalid price received for ${prediction.asset}:`, price)
            // Fallback to prices from main feed
            if (prices[prediction.asset] && prices[prediction.asset] > 0) {
              setLivePrice(prices[prediction.asset])
            }
          }
        } catch (error) {
          console.error('Error fetching live price:', error)
          // Fallback to prices from main feed
          if (prices[prediction.asset] && prices[prediction.asset] > 0) {
            setLivePrice(prices[prediction.asset])
          }
        } finally {
          setIsLoadingPrice(false)
        }
      }

      // Fetch immediately
      fetchLivePrice()
      // Update every 15 seconds to reduce re-renders
      const interval = setInterval(fetchLivePrice, 15000)
      return () => clearInterval(interval)
    } else {
      // For resolved predictions, clear live price
      setLivePrice(null)
    }
  }, [prediction.resolved, prediction.asset, prices])

  const entryPrice = Number(prediction.entryPrice)
  // Use livePrice if available, otherwise fallback to prices feed, then currentPrice
  const currentPriceValue = prediction.resolved 
    ? Number(prediction.resultPrice || 0)
    : (livePrice !== null && livePrice > 0 
        ? livePrice 
        : (prices[prediction.asset] && prices[prediction.asset] > 0 
            ? prices[prediction.asset] 
            : (currentPrice || 0)))
  
  const priceChange = entryPrice > 0 
    ? ((currentPriceValue - entryPrice) / entryPrice) * 100
    : 0
  
  const priceChangeAbs = Math.abs(priceChange)
  const isPriceUp = currentPriceValue > entryPrice
  const isPriceDown = currentPriceValue < entryPrice
  
  // Determine if prediction is currently winning (for unresolved)
  let isCurrentlyWinning = null
  if (!prediction.resolved) {
    const predictedUp = prediction.prediction === 'UP'
    isCurrentlyWinning = (predictedUp && isPriceUp) || (!predictedUp && isPriceDown)
  }

  const rarityStyle = getRarityStyle(prediction.rarity)
  const priceChangeColor = isPriceUp ? '#4fd1c5' : isPriceDown ? '#ff6b6b' : '#9fb2d7'
  const priceChangeText = priceChange >= 0 ? `+${priceChange.toFixed(2)}%` : `${priceChange.toFixed(2)}%`

  return (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div 
        className="panel"
        style={{
          maxWidth: '600px',
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          backgroundColor: '#0a0e27',
          border: '1px solid rgba(255, 255, 255, 0.1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="panel-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p className="label">Prediction NFT</p>
            <h3>#{prediction.tokenId}</h3>
          </div>
          <button 
            className="btn subtle"
            onClick={onClose}
            style={{ fontSize: '24px', padding: '0 12px' }}
          >
            ×
          </button>
        </div>
        
        <div style={{ padding: '24px' }}>
          {/* Real-time Price Comparison Section */}
          <div style={{ 
            padding: '20px', 
            backgroundColor: 'rgba(255, 255, 255, 0.05)', 
            borderRadius: '12px',
            marginBottom: '24px',
            border: `2px solid ${!prediction.resolved && isCurrentlyWinning !== null ? (isCurrentlyWinning ? 'rgba(79, 209, 197, 0.3)' : 'rgba(255, 107, 107, 0.3)') : 'rgba(255, 255, 255, 0.1)'}`
          }}>
            <div style={{ fontSize: '12px', color: '#9fb2d7', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '1px' }}>
              {prediction.resolved ? 'Final Result' : 'Live Trade Status'}
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <div style={{ fontSize: '12px', color: '#9fb2d7', marginBottom: '4px' }}>Entry Price</div>
                <div style={{ fontSize: '24px', fontWeight: 600 }}>${entryPrice.toFixed(4)}</div>
              </div>
              <div style={{ fontSize: '32px', color: '#9fb2d7' }}>→</div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '12px', color: '#9fb2d7', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {prediction.resolved ? 'Result Price' : 'Current Price'}
                  {!prediction.resolved && (
                    <>
                      {isLoadingPrice && (
                        <span style={{ fontSize: '10px' }}>🔄</span>
                      )}
                      {!isLoadingPrice && livePrice !== null && lastPriceUpdate && (
                        <span style={{ fontSize: '9px', opacity: 0.6 }}>
                          ({Math.floor((Date.now() - lastPriceUpdate) / 1000)}s ago)
                        </span>
                      )}
                    </>
                  )}
                </div>
                <div style={{ fontSize: '24px', fontWeight: 600, color: priceChangeColor }}>
                  {currentPriceValue > 0 
                    ? `$${currentPriceValue.toFixed(4)}` 
                    : isLoadingPrice 
                      ? 'Loading...' 
                      : 'N/A'}
                </div>
              </div>
            </div>

            <div style={{ 
              padding: '12px', 
              backgroundColor: 'rgba(0, 0, 0, 0.3)', 
              borderRadius: '8px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <div style={{ fontSize: '12px', color: '#9fb2d7', marginBottom: '4px' }}>Price Change</div>
                <div style={{ fontSize: '20px', fontWeight: 600, color: priceChangeColor }}>
                  {priceChangeText}
                </div>
              </div>
              {!prediction.resolved && isCurrentlyWinning !== null && (
                <div style={{
                  padding: '8px 16px',
                  backgroundColor: isCurrentlyWinning ? 'rgba(79, 209, 197, 0.2)' : 'rgba(255, 107, 107, 0.2)',
                  borderRadius: '8px',
                  border: `1px solid ${isCurrentlyWinning ? '#4fd1c5' : '#ff6b6b'}`
                }}>
                  <div style={{ fontSize: '10px', color: '#9fb2d7', marginBottom: '4px' }}>Status</div>
                  <div style={{ 
                    fontSize: '14px', 
                    fontWeight: 600,
                    color: isCurrentlyWinning ? '#4fd1c5' : '#ff6b6b'
                  }}>
                    {isCurrentlyWinning ? '✓ On Track' : '✗ Off Track'}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(2, 1fr)', 
            gap: '16px',
            marginBottom: '24px'
          }}>
            <div>
              <div style={{ fontSize: '12px', color: '#9fb2d7', marginBottom: '8px' }}>Asset</div>
              <div style={{ fontSize: '20px', fontWeight: 600 }}>{prediction.asset}</div>
            </div>
            <div>
              <div style={{ fontSize: '12px', color: '#9fb2d7', marginBottom: '8px' }}>Prediction</div>
              <div style={{ fontSize: '20px', fontWeight: 600 }}>{prediction.prediction}</div>
            </div>
            <div>
              <div style={{ fontSize: '12px', color: '#9fb2d7', marginBottom: '8px' }}>Duration</div>
              <div style={{ fontSize: '20px', fontWeight: 600 }}>{prediction.duration}</div>
            </div>
            <div>
              <div style={{ fontSize: '12px', color: '#9fb2d7', marginBottom: '8px' }}>Rarity</div>
              <div style={{ 
                fontSize: '20px', 
                fontWeight: 600,
                color: rarityStyle.color
              }}>
                {prediction.rarity}
              </div>
            </div>
            {prediction.resolved && (
              <div>
                <div style={{ fontSize: '12px', color: '#9fb2d7', marginBottom: '8px' }}>Outcome</div>
                <div style={{ 
                  fontSize: '20px', 
                  fontWeight: 600,
                  color: prediction.outcome === 'WIN' ? '#4fd1c5' : '#ff6b6b'
                }}>
                  {prediction.outcome}
                </div>
              </div>
            )}
          </div>

          {!prediction.resolved && (
            <div style={{ 
              padding: '16px', 
              backgroundColor: 'rgba(255, 255, 255, 0.05)', 
              borderRadius: '8px',
              marginBottom: '24px'
            }}>
              <div style={{ fontSize: '12px', color: '#9fb2d7', marginBottom: '8px' }}>Time Until Resolution</div>
              <div style={{ fontSize: '24px', fontWeight: 600 }}>
                {prediction.resolveTimeText}
              </div>
              {prediction.resolveTime <= Date.now() / 1000 && (
                <div style={{ marginTop: '12px', color: '#4fd1c5' }}>
                  ✓ Ready to resolve
                </div>
              )}
            </div>
          )}

          {!prediction.resolved && prediction.resolveTime <= Date.now() / 1000 && (
            <button 
              className="btn primary"
              onClick={(e) => {
                e.stopPropagation()
                onResolve(prediction.tokenId)
                onClose()
              }}
              disabled={isResolving}
              style={{ width: '100%', marginBottom: '12px' }}
            >
              {isResolving ? 'Resolving...' : 'Resolve Prediction'}
            </button>
          )}

          {prediction.resolved && !prediction.mintedToWallet && (
            <button 
              className="btn primary"
              onClick={(e) => {
                e.stopPropagation()
                onMint(prediction.tokenId)
                onClose()
              }}
              disabled={isMinting}
              style={{ width: '100%', marginBottom: '12px' }}
            >
              {isMinting ? 'Minting...' : 'Mint to Wallet (0.1 QIE)'}
            </button>
          )}

          <div style={{ 
            display: 'flex', 
            gap: '12px',
            fontSize: '12px',
            color: '#9fb2d7'
          }}>
            <a
              href={`https://mainnet.qie.digital/address/0xf430212288e3d0922ea46a6003f6945a81cb85e4`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#4fd1c5', textDecoration: 'none' }}
            >
              View on Explorer →
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}

// Docs Modal Component
function DocsModal({ onClose }) {
  return (
    <div 
      className="docs-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="docs-modal">
        <div className="docs-modal-header">
          <h2>Documentation</h2>
          <button 
            className="docs-modal-close"
            onClick={onClose}
            aria-label="Close documentation"
          >
            ×
          </button>
        </div>
        <div className="docs-modal-content">
          <div className="docs-section">
            <h1>MintMyBet Documentation</h1>
            <p>Complete guide to using, deploying, and integrating with MintMyBet.</p>

            <h2>Table of Contents</h2>
            <ul>
              <li><a href="#overview">Overview</a></li>
              <li><a href="#network-setup">QIE Network Setup</a></li>
              <li><a href="#deployment">Deployment Guide</a></li>
              <li><a href="#contract">Contract Implementation</a></li>
              <li><a href="#oracle">Oracle Integration</a></li>
            </ul>

            <section id="overview">
              <h2>Overview</h2>
              <p>MintMyBet is an NFT-based prediction game built on the QIE network. Users can make predictions on cryptocurrency prices, earn points, compete on leaderboards, and mint NFTs based on their predictions.</p>
            </section>

            <section id="network-setup">
              <h2>QIE Network Setup Guide</h2>
              
              <h3>QIE Mainnet Network Details</h3>
              <ul>
                <li><strong>Network Name:</strong> QIEMainnet</li>
                <li><strong>Chain ID:</strong> 1990</li>
                <li><strong>Currency Symbol:</strong> QIEV3</li>
                <li><strong>RPC URLs:</strong>
                  <ul>
                    <li>Primary: <code>https://rpc1mainnet.qie.digital/</code></li>
                    <li>Backup 1: <code>https://rpc2mainnet.qie.digital/</code></li>
                    <li>Backup 2: <code>https://rpc5mainnet.qie.digital/</code></li>
                  </ul>
                </li>
                <li><strong>Block Explorer:</strong> <code>https://mainnet.qie.digital/</code></li>
              </ul>

              <h3>MetaMask Setup</h3>
              <h4>Option 1: Automatic (Recommended)</h4>
              <p>The app includes a function to automatically add QIE network to MetaMask. Users can click a "Connect to QIE" button that will prompt MetaMask to add the network.</p>

              <h4>Option 2: Manual Setup</h4>
              <ol>
                <li>Open MetaMask</li>
                <li>Click network dropdown (top of extension)</li>
                <li>Click "Add Network" or "Add Network Manually"</li>
                <li>Enter the following details:
                  <ul>
                    <li><strong>Network Name:</strong> QIEMainnet</li>
                    <li><strong>RPC URL:</strong> <code>https://rpc1mainnet.qie.digital/</code></li>
                    <li><strong>Chain ID:</strong> 1990</li>
                    <li><strong>Currency Symbol:</strong> QIEV3</li>
                    <li><strong>Block Explorer URL:</strong> <code>https://mainnet.qie.digital/</code></li>
                  </ul>
                </li>
                <li>Save and switch to QIEMainnet</li>
              </ol>

              <h3>Getting QIEV3 Tokens</h3>
              <p>You'll need QIEV3 tokens for:</p>
              <ul>
                <li><strong>Gas fees</strong> (for all transactions)</li>
                <li><strong>Minting resolved NFTs</strong> (0.1 QIEV3 per NFT)</li>
              </ul>
              <p><strong>How to Get QIEV3:</strong></p>
              <ol>
                <li>Purchase from exchanges that support QIE</li>
                <li>Bridge from other networks (if bridge available)</li>
                <li>Receive from other QIE users</li>
              </ol>
            </section>

            <section id="deployment">
              <h2>Deployment Guide</h2>
              
              <h3>Prerequisites</h3>
              <ol>
                <li><strong>Node.js</strong> (v18 or higher)</li>
                <li><strong>QIEV3 tokens</strong> in your deployer wallet for gas fees</li>
                <li><strong>Private key</strong> of the deployer account (keep this secure!)</li>
              </ol>

              <h3>Setup</h3>
              <h4>1. Install Dependencies</h4>
              <pre><code>npm install</code></pre>

              <h4>2. Install Hardhat (if not already installed)</h4>
              <pre><code>npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox</code></pre>

              <h4>3. Configure Environment</h4>
              <ol>
                <li>Copy the example environment file:
                  <pre><code>cp .env.example .env</code></pre>
                </li>
                <li>Edit <code>.env</code> and add your deployer private key:
                  <pre><code>DEPLOYER_PRIVATE_KEY=your_private_key_here</code></pre>
                  <p><strong>⚠️ WARNING:</strong> Never commit your <code>.env</code> file to version control! It's already in <code>.gitignore</code>.</p>
                </li>
              </ol>

              <h4>4. Fund Your Deployer Account</h4>
              <p>Make sure your deployer account has QIEV3 tokens for contract deployment gas fees and initial testing transactions.</p>

              <h3>Deploy Contract</h3>
              <h4>Deploy to QIE Mainnet</h4>
              <pre><code>npm run deploy</code></pre>
              <p>Or directly with Hardhat:</p>
              <pre><code>npx hardhat run scripts/deploy.js --network qieMainnet</code></pre>

              <h4>What Happens During Deployment</h4>
              <ol>
                <li>Contract is compiled</li>
                <li>Contract is deployed to QIE Mainnet</li>
                <li>Deployment info is saved to <code>deployments/qieMainnet.json</code></li>
                <li>Contract address is automatically added to <code>.env</code></li>
                <li>Deployment details are displayed in console</li>
              </ol>

              <h3>After Deployment</h3>
              <ol>
                <li><strong>Update Frontend:</strong>
                  <ul>
                    <li>Open <code>src/utils/contract.js</code></li>
                    <li>Update <code>CONTRACT_ADDRESS</code> with your deployed address</li>
                  </ul>
                </li>
                <li><strong>Verify Contract (Optional):</strong>
                  <pre><code>npm run verify</code></pre>
                </li>
                <li><strong>Test Contract:</strong>
                  <ul>
                    <li>Test minting predictions</li>
                    <li>Test resolution</li>
                    <li>Test final minting</li>
                    <li>Test daily claims</li>
                    <li>Test leaderboard</li>
                  </ul>
                </li>
              </ol>

              <h3>Security Best Practices</h3>
              <ol>
                <li><strong>Never commit <code>.env</code> file</strong> - It contains your private key</li>
                <li><strong>Use a separate deployer account</strong> - Don't use your main wallet</li>
                <li><strong>Verify contract after deployment</strong> - Helps users trust your contract</li>
                <li><strong>Test on testnet first</strong> - If QIE has a testnet available</li>
                <li><strong>Keep private keys secure</strong> - Use hardware wallet if possible</li>
              </ol>
            </section>

            <section id="contract">
              <h2>Contract Implementation Guide</h2>
              
              <h3>Overview</h3>
              <p>The <code>MintMyBet.sol</code> contract implements a complete NFT-based prediction game with points system, leaderboard, and QIE Oracle integration.</p>

              <h3>Key Features</h3>
              
              <h4>1. Prediction Minting</h4>
              <ul>
                <li><strong>FREE first mint</strong> - Users only pay gas (need QIE for gas fees)</li>
                <li>Asset must be active in current round</li>
                <li>Stores entry price from oracle</li>
                <li>Sets resolve time based on duration (10min, 30min, 60min)</li>
                <li>Assigns rarity: Common (10min), Rare (30min), Epic (60min)</li>
              </ul>

              <h4>2. Resolution System</h4>
              <ul>
                <li><strong>FREE resolution</strong> - Just updates metadata</li>
                <li>Checks if resolve time has passed</li>
                <li>Fetches current oracle price</li>
                <li>Determines WIN/LOSE outcome</li>
                <li>Awards/deducts points based on outcome and rarity</li>
              </ul>

              <h4>3. Final NFT Minting</h4>
              <ul>
                <li><strong>Costs 0.1 QIE</strong> - User pays to mint resolved NFT to wallet</li>
                <li>NFT becomes visible in MetaMask/OpenSea</li>
                <li>Includes complete metadata (image, attributes, rarity)</li>
              </ul>

              <h4>4. Points System</h4>
              <p><strong>Points Calculation:</strong></p>
              <ul>
                <li>Win: +1 point (Common), +2 points (Rare), +3 points (Epic)</li>
                <li>Loss: -0.5 points</li>
                <li>Daily Claim: +1 point (resets at midnight UTC)</li>
              </ul>
              <p><strong>Storage:</strong></p>
              <ul>
                <li>Points stored as integers × 10 for precision (10 = 1.0 point)</li>
                <li>Example: 45.5 points stored as 455</li>
              </ul>

              <h4>5. Leaderboard</h4>
              <p><strong>Features:</strong></p>
              <ul>
                <li>Top 50 players ranked by points</li>
                <li>Ties broken by win rate (higher win rate ranks higher)</li>
                <li>Sorted automatically after each update</li>
                <li>Weekly reset (anyone can call after 7 days)</li>
              </ul>

              <h4>6. Daily Claim System</h4>
              <ul>
                <li>Users can claim +1 point once per day</li>
                <li>Resets at 12:00 AM UTC (midnight)</li>
                <li>Requires MetaMask transaction</li>
                <li>Shows cooldown timer on button</li>
              </ul>

              <h4>7. Round System</h4>
              <p><strong>Round 1 (Even Hours: 0, 2, 4, 6...):</strong></p>
              <ul>
                <li>Active Assets: ETH, QIE, BTC</li>
              </ul>
              <p><strong>Round 2 (Odd Hours: 1, 3, 5, 7...):</strong></p>
              <ul>
                <li>Active Assets: XRP, SOL</li>
              </ul>
              <p><strong>Features:</strong></p>
              <ul>
                <li>Each round lasts 1 hour</li>
                <li>Automatic rotation based on block timestamp</li>
                <li>Countdown shows time until next round</li>
                <li>Only active assets can be minted</li>
              </ul>

              <h4>8. Rarity System</h4>
              <p><strong>Rarity Levels:</strong></p>
              <ul>
                <li><strong>Common</strong> (10 minutes): 1x points, gray/blue styling</li>
                <li><strong>Rare</strong> (30 minutes): 2x points, teal/cyan styling</li>
                <li><strong>Epic</strong> (60 minutes): 3x points, purple styling</li>
              </ul>

              <h3>Contract Functions</h3>
              <h4>Public Functions</h4>
              <pre><code>// Minting
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
getLatestPrice(assetSymbol) - Get current price from QIE Oracle</code></pre>
            </section>

            <section id="oracle">
              <h2>QIE Oracle Integration Guide</h2>
              
              <h3>Overview</h3>
              <p>QIE Oracle follows the <strong>Chainlink AggregatorV3Interface</strong> standard, making it compatible with existing Chainlink integrations. All price-fetching functions are read-only (view functions), meaning they consume minimal gas and are safe for frequent calls.</p>

              <h3>Asset Oracle Addresses</h3>
              <table>
                <thead>
                  <tr>
                    <th>Asset</th>
                    <th>Symbol</th>
                    <th>Contract Address</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Bitcoin</td>
                    <td>BTC</td>
                    <td><code>0x9E596d809a20A272c788726f592c0d1629755440</code></td>
                  </tr>
                  <tr>
                    <td>Ethereum</td>
                    <td>ETH</td>
                    <td><code>0x4bb7012Fbc79fE4Ae9B664228977b442b385500d</code></td>
                  </tr>
                  <tr>
                    <td>Ripple</td>
                    <td>XRP</td>
                    <td><code>0x804582B1f8Fea73919e7c737115009f668f97528</code></td>
                  </tr>
                  <tr>
                    <td>Solana</td>
                    <td>SOL</td>
                    <td><code>0xe86999c8e6C8eeF71bebd35286bCa674E0AD7b21</code></td>
                  </tr>
                  <tr>
                    <td>QIE Native</td>
                    <td>QIE</td>
                    <td><code>0x3Bc617cF3A4Bb77003e4c556B87b13D556903D17</code></td>
                  </tr>
                </tbody>
              </table>

              <h3>Smart Contract Integration</h3>
              <h4>1. Import the Oracle Interface</h4>
              <pre><code>import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";</code></pre>
              <p>QIE Oracle is compatible with Chainlink's AggregatorV3Interface standard.</p>

              <h4>2. Instantiate the Oracle</h4>
              <pre><code>{`AggregatorV3Interface public priceFeed;

constructor(address oracleAddress) {
    priceFeed = AggregatorV3Interface(oracleAddress);
}`}</code></pre>
              <p>Replace <code>oracleAddress</code> with the specific QIE Oracle address for your asset (see table above).</p>

              <h4>3. Fetch Latest Price</h4>
              <pre><code>{`function getLatestPrice() public view returns (int256) {
    (
        , 
        int256 price,
        , 
        , 
    ) = priceFeed.latestRoundData();

    return price;
}`}</code></pre>
              <p>This function is read-only (view) and consumes minimal gas.</p>

              <h3>Gas Efficiency</h3>
              <p>✅ <strong>All price-fetching functions are non-state-changing (read-only)</strong></p>
              <ul>
                <li>No transaction needs to be sent</li>
                <li>No gas is spent reading data (unless used inside a transaction)</li>
                <li>Safe to use in frequent or lightweight calls</li>
                <li>Perfect for real-time price updates</li>
              </ul>

              <h3>Frontend Integration</h3>
              <p>The app includes oracle configuration and utility functions:</p>
              <ul>
                <li><strong><code>src/config/oracle.js</code></strong> - Oracle addresses and ABI</li>
                <li><strong><code>src/utils/oracle.js</code></strong> - Helper functions for fetching prices</li>
              </ul>

              <h3>Integration Checklist</h3>
              <ul>
                <li>[ ] Import AggregatorV3Interface in your contract</li>
                <li>[ ] Set oracle address in constructor/initializer</li>
                <li>[ ] Implement <code>latestRoundData()</code> call</li>
                <li>[ ] Handle price decimals correctly (usually 8 for USD pairs)</li>
                <li>[ ] Add error handling for oracle failures</li>
                <li>[ ] Test with QIE testnet before mainnet deployment</li>
              </ul>

              <h3>Notes</h3>
              <ul>
                <li>QIE Oracle follows Chainlink standards for maximum compatibility</li>
                <li>Prices are returned as <code>int256</code> - convert to <code>uint256</code> if needed</li>
                <li>Always check <code>updatedAt</code> timestamp to ensure fresh data</li>
                <li>Consider implementing a staleness threshold for production use</li>
              </ul>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App

