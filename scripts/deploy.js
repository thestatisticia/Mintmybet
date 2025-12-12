import { ethers } from "hardhat";
import { config } from "dotenv";
import fs from "fs";
import path from "path";

config();

async function main() {
  console.log("Deploying MintMyBet contract to QIE Mainnet...\n");

  // Get the deployer account
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);
  
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "QIEV3\n");

  if (balance === 0n) {
    throw new Error("Insufficient balance. Please fund your deployer account with QIEV3.");
  }

  // Deploy the contract
  const MintMyBet = await ethers.getContractFactory("MintMyBet");
  console.log("Deploying MintMyBet...");
  
  const mintMyBet = await MintMyBet.deploy();
  await mintMyBet.waitForDeployment();

  const contractAddress = await mintMyBet.getAddress();
  console.log("\n✅ MintMyBet deployed to:", contractAddress);
  console.log("Block Explorer:", `${process.env.QIE_BLOCK_EXPLORER}/address/${contractAddress}\n`);

  // Save deployment info
  const deploymentInfo = {
    network: "qieMainnet",
    chainId: process.env.QIE_CHAIN_ID || "1990",
    contractAddress: contractAddress,
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
    transactionHash: mintMyBet.deploymentTransaction()?.hash,
  };

  const deploymentPath = path.join(process.cwd(), "deployments", "qieMainnet.json");
  const deploymentDir = path.dirname(deploymentPath);
  
  if (!fs.existsSync(deploymentDir)) {
    fs.mkdirSync(deploymentDir, { recursive: true });
  }

  fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));
  console.log("Deployment info saved to:", deploymentPath);

  // Update .env file with contract address
  const envPath = path.join(process.cwd(), ".env");
  if (fs.existsSync(envPath)) {
    let envContent = fs.readFileSync(envPath, "utf8");
    
    if (envContent.includes("CONTRACT_ADDRESS=")) {
      envContent = envContent.replace(
        /CONTRACT_ADDRESS=.*/,
        `CONTRACT_ADDRESS=${contractAddress}`
      );
    } else {
      envContent += `\nCONTRACT_ADDRESS=${contractAddress}\n`;
    }
    
    fs.writeFileSync(envPath, envContent);
    console.log("✅ Updated .env file with contract address");
  }

  console.log("\n📝 Next steps:");
  console.log("1. Update CONTRACT_ADDRESS in src/utils/contract.js");
  console.log("2. Verify contract on block explorer (if supported)");
  console.log("3. Test all contract functions");
  console.log("4. Update frontend to use new contract address\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });











