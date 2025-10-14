const { ethers } = require("hardhat");

async function main() {
  console.log("🚀 Deploying P2P Lending Contract to Production...");

  // Lấy signer
  const [deployer] = await ethers.getSigners();
  console.log("📝 Deploying contracts with the account:", deployer.address);
  console.log("💰 Account balance:", ethers.formatEther(await deployer.provider.getBalance(deployer.address)), "BNB");

  // Địa chỉ USDT token trên BSC Mainnet
  const USDT_ADDRESS = process.env.USDT_MAINNET || "0x55d398326f99059fF775485246999027B3197955";

  // Deploy contract
  console.log("🔨 Deploying P2P Lending contract...");
  const P2PLending = await ethers.getContractFactory("P2PLending");
  const p2pLending = await P2PLending.deploy(USDT_ADDRESS);

  await p2pLending.waitForDeployment();
  const contractAddress = await p2pLending.getAddress();

  console.log("✅ P2P Lending Contract deployed to:", contractAddress);

  // Thiết lập các ví của công ty
  const feeWallet = process.env.FEE_WALLET || "0x742d35Cc6634C0532925a3b8D0e0d1b6b7e5f4e3";
  const insuranceWallet = process.env.INSURANCE_WALLET || "0x1234567890123456789012345678901234567890";
  const matchingWallet = process.env.MATCHING_WALLET || "0x9876543210987654321098765432109876543210";

  console.log("🏢 Setting up company wallets...");
  console.log("   Fee Wallet:", feeWallet);
  console.log("   Insurance Wallet:", insuranceWallet);
  console.log("   Matching Wallet:", matchingWallet);
  
  await p2pLending.updateCompanyWallets(feeWallet, insuranceWallet, matchingWallet);
  console.log("✅ Company wallets configured successfully");

  // Verify contract (nếu có BSCSCAN_API_KEY)
  if (process.env.BSCSCAN_API_KEY) {
    console.log("🔍 Verifying contract on BSCScan...");
    try {
      await hre.run("verify:verify", {
        address: contractAddress,
        constructorArguments: [USDT_ADDRESS],
      });
      console.log("✅ Contract verified successfully on BSCScan");
    } catch (error) {
      console.log("⚠️  Contract verification failed:", error.message);
    }
  }

  console.log("\n🎉 Deployment completed successfully!");
  console.log("📋 Summary:");
  console.log("   Contract Address:", contractAddress);
  console.log("   Owner Address:", deployer.address);
  console.log("   USDT Token:", USDT_ADDRESS);
  console.log("   Network:", hre.network.name);
  
  console.log("\n📝 Next steps:");
  console.log("   1. Add borrowers and lenders to whitelist");
  console.log("   2. Test the contract with small amounts");
  console.log("   3. Monitor contract events and transactions");
  console.log("   4. Set up monitoring and alerting");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });
