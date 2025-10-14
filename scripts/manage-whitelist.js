const { ethers } = require("hardhat");

async function main() {
  const [owner] = await ethers.getSigners();
  
  // Địa chỉ contract đã deploy
  const CONTRACT_ADDRESS = process.env.P2P_CONTRACT_ADDRESS || "0x..."; // Thay bằng địa chỉ thực tế
  
  console.log("🔧 Managing P2P Lending Whitelist...");
  console.log("📝 Using account:", owner.address);
  console.log("📍 Contract address:", CONTRACT_ADDRESS);

  const P2PLending = await ethers.getContractFactory("P2PLending");
  const p2pLending = P2PLending.attach(CONTRACT_ADDRESS);

  const action = process.argv[2];
  const address = process.argv[3];
  const type = process.argv[4]; // "borrower" or "lender"

  if (!action || !address || !type) {
    console.log("❌ Usage: npx hardhat run scripts/manage-whitelist.js --network <network> <action> <address> <type>");
    console.log("   Actions: add, remove");
    console.log("   Types: borrower, lender");
    console.log("   Example: npx hardhat run scripts/manage-whitelist.js --network bscTestnet add 0x123... borrower");
    process.exit(1);
  }

  if (!ethers.isAddress(address)) {
    console.log("❌ Invalid address format");
    process.exit(1);
  }

  try {
    if (action === "add") {
      if (type === "borrower") {
        await p2pLending.addBorrowerToWhitelist(address);
        console.log("✅ Added borrower to whitelist:", address);
      } else if (type === "lender") {
        await p2pLending.addLenderToWhitelist(address);
        console.log("✅ Added lender to whitelist:", address);
      } else {
        console.log("❌ Invalid type. Use 'borrower' or 'lender'");
        process.exit(1);
      }
    } else if (action === "remove") {
      if (type === "borrower") {
        await p2pLending.removeBorrowerFromWhitelist(address);
        console.log("✅ Removed borrower from whitelist:", address);
      } else if (type === "lender") {
        await p2pLending.removeLenderFromWhitelist(address);
        console.log("✅ Removed lender from whitelist:", address);
      } else {
        console.log("❌ Invalid type. Use 'borrower' or 'lender'");
        process.exit(1);
      }
    } else {
      console.log("❌ Invalid action. Use 'add' or 'remove'");
      process.exit(1);
    }

    // Verify the change
    if (type === "borrower") {
      const isWhitelisted = await p2pLending.whitelistedBorrowers(address);
      console.log("🔍 Borrower whitelist status:", isWhitelisted);
    } else {
      const isWhitelisted = await p2pLending.whitelistedLenders(address);
      console.log("🔍 Lender whitelist status:", isWhitelisted);
    }

  } catch (error) {
    console.log("❌ Error:", error.message);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
