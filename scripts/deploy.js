const { ethers } = require("hardhat");

async function main() {
  console.log("Deploying P2P Lending Contract...");

  // Lấy signer
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", (await deployer.getBalance()).toString());

  // Địa chỉ USDT token (cần thay đổi theo network)
  // Testnet USDT: 0x337610d27c682E347C9cD60BD4b3b107C9d34dDd (BSC Testnet)
  // Mainnet USDT: 0x55d398326f99059fF775485246999027B3197955 (BSC Mainnet)
  const USDT_ADDRESS = "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd"; // BSC Testnet

  // Deploy contract
  const P2PLending = await ethers.getContractFactory("P2PLending");
  const p2pLending = await P2PLending.deploy(USDT_ADDRESS);

  await p2pLending.deployed();

  console.log("P2P Lending Contract deployed to:", p2pLending.address);

  // Thiết lập các ví của công ty
  const feeWallet = "0x742d35Cc6634C0532925a3b8D0e0d1b6b7e5f4e3";
  const insuranceWallet = "0x1234567890123456789012345678901234567890";
  const matchingWallet = "0x9876543210987654321098765432109876543210";

  console.log("Setting up company wallets...");
  await p2pLending.updateCompanyWallets(feeWallet, insuranceWallet, matchingWallet);
  console.log("Company wallets configured successfully");

  // Thêm một số địa chỉ vào whitelist để test
  const testBorrower = "0x1111111111111111111111111111111111111111";
  const testLender = "0x2222222222222222222222222222222222222222";

  console.log("Adding test addresses to whitelist...");
  await p2pLending.addBorrowerToWhitelist(testBorrower);
  await p2pLending.addLenderToWhitelist(testLender);
  console.log("Test addresses added to whitelist");

  console.log("Deployment completed successfully!");
  console.log("Contract address:", p2pLending.address);
  console.log("Owner address:", deployer.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
