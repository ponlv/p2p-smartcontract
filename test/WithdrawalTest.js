const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Withdrawal Logic Test", function () {
  let p2pLending;
  let usdtToken;
  let owner;
  let borrower;
  let lender;
  let feeWallet;
  let insuranceWallet;
  let matchingWallet;

  const LOAN_AMOUNT = ethers.parseUnits("5000", 18); // 5000 USDT
  const LOAN_DURATION = 12; // 12 months

  beforeEach(async function () {
    [owner, borrower, lender, feeWallet, insuranceWallet, matchingWallet] = await ethers.getSigners();

    // Deploy MockUSDT
    const MockUSDT = await ethers.getContractFactory("MockUSDT");
    usdtToken = await MockUSDT.deploy(ethers.parseUnits("1000000", 18)); // 1M USDT initial supply
    await usdtToken.waitForDeployment();

    // Deploy P2PLending
    const P2PLending = await ethers.getContractFactory("P2PLending");
    p2pLending = await P2PLending.deploy(await usdtToken.getAddress());
    await p2pLending.waitForDeployment();

    // Set company wallets
    await p2pLending.updateCompanyWallets(
      feeWallet.address,
      insuranceWallet.address,
      matchingWallet.address
    );

    // Add borrower and lender to whitelist
    await p2pLending.addToWhitelist(borrower.address);
    await p2pLending.addToWhitelist(lender.address);

    // Mint USDT tokens
    await usdtToken.mint(borrower.address, ethers.parseUnits("100000", 18)); // 100k USDT for borrower
    await usdtToken.mint(lender.address, ethers.parseUnits("100000", 18)); // 100k USDT for lender

    // Approve USDT spending
    await usdtToken.connect(borrower).approve(await p2pLending.getAddress(), ethers.parseUnits("100000", 18));
    await usdtToken.connect(lender).approve(await p2pLending.getAddress(), ethers.parseUnits("100000", 18));
  });

  describe("Withdrawal Logic", function () {
    it("Should track available withdrawal correctly through multiple payments", async function () {
      // Create and fund loan
      await p2pLending.connect(borrower).createLoan("WITHDRAWAL_TEST_001", LOAN_AMOUNT, LOAN_DURATION);
      await p2pLending.connect(lender).fundLoan(1);

      const loan = await p2pLending.getLoan(1);
      console.log("Loan funded with amount:", ethers.formatUnits(loan.amount, 18), "USDT");

      // Check initial available withdrawal (should be 0)
      let availableWithdrawal = await p2pLending.getAvailableWithdrawal(1);
      expect(availableWithdrawal).to.equal(0);

      // Make first payment
      await ethers.provider.send("evm_increaseTime", [29 * 24 * 60 * 60]); // 29 days
      await ethers.provider.send("evm_mine");

      const emiAmount = await p2pLending.getFixedEMI(1);
      console.log("EMI amount:", ethers.formatUnits(emiAmount, 18), "USDT");

      await p2pLending.connect(borrower).makePayment(1);

      // Check available withdrawal after first payment
      availableWithdrawal = await p2pLending.getAvailableWithdrawal(1);
      expect(availableWithdrawal).to.equal(emiAmount);
      console.log("Available withdrawal after first payment:", ethers.formatUnits(availableWithdrawal, 18), "USDT");

      // Lender claims first payment
      const lenderBalanceBefore = await usdtToken.balanceOf(lender.address);
      await p2pLending.connect(lender).claimInterest(1);
      const lenderBalanceAfter = await usdtToken.balanceOf(lender.address);

      expect(lenderBalanceAfter - lenderBalanceBefore).to.equal(availableWithdrawal);
      console.log("Lender received:", ethers.formatUnits(lenderBalanceAfter - lenderBalanceBefore, 18), "USDT");

      // Check available withdrawal is reset to 0
      availableWithdrawal = await p2pLending.getAvailableWithdrawal(1);
      expect(availableWithdrawal).to.equal(0);

      // Make second payment
      await ethers.provider.send("evm_increaseTime", [30 * 24 * 60 * 60]); // 30 days
      await ethers.provider.send("evm_mine");

      await p2pLending.connect(borrower).makePayment(1);

      // Check available withdrawal after second payment
      availableWithdrawal = await p2pLending.getAvailableWithdrawal(1);
      expect(availableWithdrawal).to.equal(emiAmount);
      console.log("Available withdrawal after second payment:", ethers.formatUnits(availableWithdrawal, 18), "USDT");

      // Lender claims second payment
      const lenderBalanceBefore2 = await usdtToken.balanceOf(lender.address);
      await p2pLending.connect(lender).claimInterest(1);
      const lenderBalanceAfter2 = await usdtToken.balanceOf(lender.address);

      expect(lenderBalanceAfter2 - lenderBalanceBefore2).to.equal(availableWithdrawal);

      // Check available withdrawal is reset to 0 again
      availableWithdrawal = await p2pLending.getAvailableWithdrawal(1);
      expect(availableWithdrawal).to.equal(0);
    });

    it("Should accumulate multiple payments if lender doesn't claim", async function () {
      // Create and fund loan
      await p2pLending.connect(borrower).createLoan(LOAN_AMOUNT, LOAN_DURATION);
      await p2pLending.connect(lender).fundLoan(1);

      const emiAmount = await p2pLending.getFixedEMI(1);

      // Make first payment
      await ethers.provider.send("evm_increaseTime", [29 * 24 * 60 * 60]); // 29 days
      await ethers.provider.send("evm_mine");
      await p2pLending.connect(borrower).makePayment(1);

      let availableWithdrawal = await p2pLending.getAvailableWithdrawal(1);
      expect(availableWithdrawal).to.equal(emiAmount);

      // Make second payment without claiming first
      await ethers.provider.send("evm_increaseTime", [30 * 24 * 60 * 60]); // 30 days
      await ethers.provider.send("evm_mine");
      await p2pLending.connect(borrower).makePayment(1);

      // Available withdrawal should now be 2 * EMI
      availableWithdrawal = await p2pLending.getAvailableWithdrawal(1);
      expect(availableWithdrawal).to.equal(emiAmount * 2n);

      // Make third payment without claiming
      await ethers.provider.send("evm_increaseTime", [30 * 24 * 60 * 60]); // 30 days
      await ethers.provider.send("evm_mine");
      await p2pLending.connect(borrower).makePayment(1);

      // Available withdrawal should now be 3 * EMI
      availableWithdrawal = await p2pLending.getAvailableWithdrawal(1);
      expect(availableWithdrawal).to.equal(emiAmount * 3n);

      // Lender claims all accumulated payments at once
      const lenderBalanceBefore = await usdtToken.balanceOf(lender.address);
      await p2pLending.connect(lender).claimInterest(1);
      const lenderBalanceAfter = await usdtToken.balanceOf(lender.address);

      expect(lenderBalanceAfter - lenderBalanceBefore).to.equal(emiAmount * 3n);

      // Available withdrawal should be reset to 0
      availableWithdrawal = await p2pLending.getAvailableWithdrawal(1);
      expect(availableWithdrawal).to.equal(0);
    });

    it("Should not allow claim when no payment available", async function () {
      // Create and fund loan
      await p2pLending.connect(borrower).createLoan(LOAN_AMOUNT, LOAN_DURATION);
      await p2pLending.connect(lender).fundLoan(1);

      // Try to claim without making any payment
      await expect(
        p2pLending.connect(lender).claimInterest(1)
      ).to.be.revertedWithCustomError(p2pLending, "NoInterestToClaim");

      // Make payment and claim
      await ethers.provider.send("evm_increaseTime", [29 * 24 * 60 * 60]); // 29 days
      await ethers.provider.send("evm_mine");
      await p2pLending.connect(borrower).makePayment(1);
      await p2pLending.connect(lender).claimInterest(1);

      // Try to claim again without making new payment
      await expect(
        p2pLending.connect(lender).claimInterest(1)
      ).to.be.revertedWithCustomError(p2pLending, "NoInterestToClaim");
    });

    it("Should only allow lender to claim their own loan", async function () {
      // Create another lender
      const [, , , , , , anotherLender] = await ethers.getSigners();
      await p2pLending.addToWhitelist(anotherLender.address);
      await usdtToken.mint(anotherLender.address, ethers.parseUnits("100000", 18));
      await usdtToken.connect(anotherLender).approve(await p2pLending.getAddress(), ethers.parseUnits("100000", 18));

      // Create and fund loan
      await p2pLending.connect(borrower).createLoan(LOAN_AMOUNT, LOAN_DURATION);
      await p2pLending.connect(lender).fundLoan(1);

      // Make payment
      await ethers.provider.send("evm_increaseTime", [29 * 24 * 60 * 60]); // 29 days
      await ethers.provider.send("evm_mine");
      await p2pLending.connect(borrower).makePayment(1);

      // Another lender tries to claim
      await expect(
        p2pLending.connect(anotherLender).claimInterest(1)
      ).to.be.revertedWithCustomError(p2pLending, "NotWhitelisted");

      // Original lender can claim
      await p2pLending.connect(lender).claimInterest(1);
    });
  });
});
