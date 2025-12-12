import { createWalletClient, http, createPublicClient, formatEther } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { readFileSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { config } from 'dotenv'

config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// QIE Network configuration
const QIE_RPC_URL = process.env.QIE_RPC_URL_1 || 'https://rpc1mainnet.qie.digital/'
const QIE_CHAIN_ID = parseInt(process.env.QIE_CHAIN_ID || '1990')
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY

if (!DEPLOYER_PRIVATE_KEY) {
  console.error('❌ DEPLOYER_PRIVATE_KEY not found in .env file')
  process.exit(1)
}

// Define QIE network
const qieNetwork = {
  id: QIE_CHAIN_ID,
  name: 'QIEMainnet',
  nativeCurrency: {
    decimals: 18,
    name: 'QIE',
    symbol: 'QIEV3',
  },
  rpcUrls: {
    default: {
      http: [QIE_RPC_URL],
    },
  },
  blockExplorers: {
    default: {
      name: 'QIE Explorer',
      url: process.env.QIE_BLOCK_EXPLORER || 'https://mainnet.qie.digital/',
    },
  },
}

async function deployContract() {
  try {
    console.log('🚀 Starting deployment to QIE Mainnet...\n')

    // Create account from private key
    const account = privateKeyToAccount(`0x${DEPLOYER_PRIVATE_KEY.replace('0x', '')}`)
    console.log('📝 Deployer address:', account.address)

    // Create clients
    const publicClient = createPublicClient({
      chain: qieNetwork,
      transport: http(QIE_RPC_URL),
    })

    const walletClient = createWalletClient({
      account,
      chain: qieNetwork,
      transport: http(QIE_RPC_URL),
    })

    // Get balance
    const balance = await publicClient.getBalance({ address: account.address })
    console.log('💰 Balance:', formatEther(balance), 'QIE\n')

    if (balance === 0n) {
      console.error('❌ Insufficient balance. Please fund your deployer address.')
      process.exit(1)
    }

    // Read compiled contract
    // Note: For Viem deployment, we need the bytecode and ABI
    // This assumes you've compiled with Hardhat first
    const artifactsPath = join(__dirname, '../artifacts/contracts/MintMyBet.sol/MintMyBet.json')
    
    let contractArtifact
    try {
      const artifactContent = readFileSync(artifactsPath, 'utf-8')
      contractArtifact = JSON.parse(artifactContent)
    } catch (error) {
      console.error('❌ Contract artifact not found. Please compile the contract first:')
      console.error('   npx hardhat compile')
      process.exit(1)
    }

    const bytecode = contractArtifact.bytecode
    const abi = contractArtifact.abi

    if (!bytecode) {
      console.error('❌ Bytecode not found in artifact')
      process.exit(1)
    }

    console.log('📦 Deploying MintMyBet contract...')
    console.log('   Bytecode size:', (bytecode.length - 2) / 2, 'bytes\n')

    // Deploy contract
    const hash = await walletClient.deployContract({
      abi,
      bytecode: bytecode.startsWith('0x') ? bytecode : `0x${bytecode}`,
    })

    console.log('⏳ Transaction hash:', hash)
    console.log('⏳ Waiting for confirmation...\n')

    // Wait for transaction receipt
    const receipt = await publicClient.waitForTransactionReceipt({ hash })

    if (!receipt.contractAddress) {
      console.error('❌ Contract deployment failed - no contract address in receipt')
      process.exit(1)
    }

    console.log('✅ Contract deployed successfully!')
    console.log('📍 Contract address:', receipt.contractAddress)
    console.log('🔗 Explorer:', `${qieNetwork.blockExplorers.default.url}/address/${receipt.contractAddress}`)
    console.log('📊 Block:', receipt.blockNumber)
    console.log('⛽ Gas used:', receipt.gasUsed.toString(), '\n')

    // Update .env file with contract address
    const envPath = join(__dirname, '../.env')
    let envContent = ''
    try {
      envContent = readFileSync(envPath, 'utf-8')
    } catch (error) {
      // .env doesn't exist, create it
      envContent = ''
    }

    // Update or add CONTRACT_ADDRESS
    const contractAddressLine = `CONTRACT_ADDRESS=${receipt.contractAddress}`
    if (envContent.includes('CONTRACT_ADDRESS=')) {
      envContent = envContent.replace(/CONTRACT_ADDRESS=.*/g, contractAddressLine)
    } else {
      envContent += `\n${contractAddressLine}\n`
    }

    // Write updated .env
    const { writeFileSync } = await import('fs')
    writeFileSync(envPath, envContent)

    console.log('✅ Updated .env file with contract address')
    console.log('\n🎉 Deployment complete!')
    console.log('\nNext steps:')
    console.log('1. Update CONTRACT_ADDRESS in src/utils/contract.js')
    console.log('2. Test the contract functions')
    console.log('3. Verify the contract on the block explorer (if supported)')

  } catch (error) {
    console.error('❌ Deployment failed:', error)
    if (error.message) {
      console.error('   Error message:', error.message)
    }
    process.exit(1)
  }
}

deployContract()
