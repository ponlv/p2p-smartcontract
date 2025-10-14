const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Fixed EMI Test", function () {
  let p2pLending;
  let usdtToken;
  let owner;
  let borrower;
  let lender;
  let feeWallet;
  let insuranceWallet;
  let matchingWallet;

  const LOAN_AMOUNT = ethers.parseUnits("10000", 18); // 10000 USDT
  const LOAN_DURATION = 12; // 12 months
  const EXPECTED_EMI = ethers.parseUnits("888.487887", 18); // Expected EMI

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

  describe("Fixed EMI Functionality", function () {
    it("Should calculate and store fixed EMI when creating loan", async function () {
      // Create loan
      await p2pLending.connect(borrower).createLoan("FIXED_EMI_TEST_001", LOAN_AMOUNT, LOAN_DURATION);
      
      // Get loan details
      const loan = await p2pLending.getLoan(1);
      console.log("Loan amount:", ethers.formatUnits(loan.amount, 18), "USDT");
      console.log("Interest rate:", loan.interestRate.toString(), "basis points (", Number(loan.interestRate) / 100, "%)");
      console.log("Duration:", loan.duration.toString(), "months");
      
      // Get fixed EMI
      const fixedEMI = await p2pLending.getFixedEMI(1);
      console.log("Fixed EMI:", ethers.formatUnits(fixedEMI, 18), "USDT");
      console.log("Expected EMI:", ethers.formatUnits(EXPECTED_EMI, 18), "USDT");
      
      // Check if fixed EMI matches expected value
      const difference = fixedEMI > EXPECTED_EMI ? fixedEMI - EXPECTED_EMI : EXPECTED_EMI - fixedEMI;
      console.log("Difference:", ethers.formatUnits(difference, 18), "USDT");
      expect(difference).to.be.lte(ethers.parseUnits("0.000002", 18)); // Allow up to 0.000002 USDT difference
      
      // Verify that fixedEMI is stored in loan struct
      expect(loan.fixedEMI).to.equal(fixedEMI);
    });

    it("Should use fixed EMI for all payments", async function () {
      // Create and fund loan
      await p2pLending.connect(borrower).createLoan("FIXED_EMI_TEST_002", LOAN_AMOUNT, LOAN_DURATION);
      await p2pLending.connect(lender).fundLoan(1);
      
      const fixedEMI = await p2pLending.getFixedEMI(1);
      console.log("Fixed EMI for this loan:", ethers.formatUnits(fixedEMI, 18), "USDT");

      // Make first payment
      await ethers.provider.send("evm_increaseTime", [29 * 24 * 60 * 60]); // 29 days
      await ethers.provider.send("evm_mine");
      
      await p2pLending.connect(borrower).makePayment(1);
      
      // Check that available withdrawal equals fixed EMI
      const availableWithdrawal = await p2pLending.getAvailableWithdrawal(1);
      expect(availableWithdrawal).to.equal(fixedEMI);
      console.log("First payment amount:", ethers.formatUnits(availableWithdrawal, 18), "USDT");

      // Make second payment
      await ethers.provider.send("evm_increaseTime", [30 * 24 * 60 * 60]); // 30 days
      await ethers.provider.send("evm_mine");
      
      await p2pLending.connect(borrower).makePayment(1);
      
      // Check that available withdrawal equals 2 * fixed EMI
      const availableWithdrawal2 = await p2pLending.getAvailableWithdrawal(1);
      expect(availableWithdrawal2).to.equal(fixedEMI * 2n);
      console.log("Second payment amount:", ethers.formatUnits(fixedEMI, 18), "USDT");
      console.log("Total available:", ethers.formatUnits(availableWithdrawal2, 18), "USDT");

      // Make third payment
      await ethers.provider.send("evm_increaseTime", [30 * 24 * 60 * 60]); // 30 days
      await ethers.provider.send("evm_mine");
      
      await p2pLending.connect(borrower).makePayment(1);
      
      // Check that available withdrawal equals 3 * fixed EMI
      const availableWithdrawal3 = await p2pLending.getAvailableWithdrawal(1);
      expect(availableWithdrawal3).to.equal(fixedEMI * 3n);
      console.log("Third payment amount:", ethers.formatUnits(fixedEMI, 18), "USDT");
      console.log("Total available:", ethers.formatUnits(availableWithdrawal3, 18), "USDT");
    });

    it("Should maintain fixed EMI consistency across multiple loans", async function () {
      // Create multiple loans with same parameters
      await p2pLending.connect(borrower).createLoan("FIXED_EMI_TEST_003", LOAN_AMOUNT, LOAN_DURATION);
      await p2pLending.connect(borrower).createLoan("FIXED_EMI_TEST_004", LOAN_AMOUNT, LOAN_DURATION);
      await p2pLending.connect(borrower).createLoan("FIXED_EMI_TEST_005", LOAN_AMOUNT, LOAN_DURATION);
      
      // Get fixed EMI for each loan
      const fixedEMI1 = await p2pLending.getFixedEMI(1);
      const fixedEMI2 = await p2pLending.getFixedEMI(2);
      const fixedEMI3 = await p2pLending.getFixedEMI(3);
      
      console.log("Loan 1 Fixed EMI:", ethers.formatUnits(fixedEMI1, 18), "USDT");
      console.log("Loan 2 Fixed EMI:", ethers.formatUnits(fixedEMI2, 18), "USDT");
      console.log("Loan 3 Fixed EMI:", ethers.formatUnits(fixedEMI3, 18), "USDT");
      
      // All loans with same parameters should have same fixed EMI
      expect(fixedEMI1).to.equal(fixedEMI2);
      expect(fixedEMI2).to.equal(fixedEMI3);
      expect(fixedEMI1).to.equal(fixedEMI3);
    });

    it("Should show different fixed EMI for different loan parameters", async function () {
      // Create first loan: 10000 USDT, 12 months
      await p2pLending.connect(borrower).createLoan("FIXED_EMI_TEST_006", LOAN_AMOUNT, LOAN_DURATION);
      
      // Create second loan: 5000 USDT, 12 months
      const differentAmount = ethers.parseUnits("5000", 18); // 5000 USDT
      await p2pLending.connect(borrower).createLoan("FIXED_EMI_TEST_007", differentAmount, LOAN_DURATION);
      
      // Create third loan: 10000 USDT, 6 months
      const differentDuration = 6; // 6 months
      await p2pLending.connect(borrower).createLoan("FIXED_EMI_TEST_008", LOAN_AMOUNT, differentDuration);
      
      // Get loan details for debugging
      const loan1 = await p2pLending.getLoan(1);
      const loan2 = await p2pLending.getLoan(2);
      const loan3 = await p2pLending.getLoan(3);
      
      console.log("Loan 1 - Amount:", ethers.formatUnits(loan1.amount, 18), "Rate:", loan1.interestRate.toString(), "Duration:", loan1.duration.toString());
      console.log("Loan 2 - Amount:", ethers.formatUnits(loan2.amount, 18), "Rate:", loan2.interestRate.toString(), "Duration:", loan2.duration.toString());
      console.log("Loan 3 - Amount:", ethers.formatUnits(loan3.amount, 18), "Rate:", loan3.interestRate.toString(), "Duration:", loan3.duration.toString());
      
      // Get fixed EMI for each loan
      const fixedEMI1 = await p2pLending.getFixedEMI(1); // 10000 USDT, 12 months
      const fixedEMI2 = await p2pLending.getFixedEMI(2); // 5000 USDT, 12 months
      const fixedEMI3 = await p2pLending.getFixedEMI(3); // 10000 USDT, 6 months
      
      console.log("Loan 1 (10k, 12m) Fixed EMI:", ethers.formatUnits(fixedEMI1, 18), "USDT");
      console.log("Loan 2 (5k, 12m) Fixed EMI:", ethers.formatUnits(fixedEMI2, 18), "USDT");
      console.log("Loan 3 (10k, 6m) Fixed EMI:", ethers.formatUnits(fixedEMI3, 18), "USDT");
      
      // Different parameters should result in different fixed EMI
      expect(fixedEMI1).to.not.equal(fixedEMI2); // Different amounts
      expect(fixedEMI1).to.not.equal(fixedEMI3); // Different durations
      expect(fixedEMI2).to.not.equal(fixedEMI3); // Both different
      
      // All EMI values should be greater than 0
      expect(fixedEMI1).to.be.gt(0);
      expect(fixedEMI2).to.be.gt(0);
      expect(fixedEMI3).to.be.gt(0);
      
      // Loan 2 should have smaller EMI than Loan 1 (smaller amount, same duration)
      expect(fixedEMI2).to.be.lt(fixedEMI1);
      
      // Loan 3 should have larger EMI than Loan 1 (same amount, shorter duration)
      expect(fixedEMI3).to.be.gt(fixedEMI1);
    });
  });
});
