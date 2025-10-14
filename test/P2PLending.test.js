const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("P2P Lending Contract", function () {
  let p2pLending;
  let usdtToken;
  let owner;
  let borrower;
  let lender;
  let feeWallet;
  let insuranceWallet;
  let matchingWallet;

  const INITIAL_SUPPLY = ethers.parseUnits("1000000", 18); // 1M USDT
  const LOAN_AMOUNT = ethers.parseUnits("1000", 18); // 1000 USDT
  const LOAN_DURATION = 3; // 3 months

  beforeEach(async function () {
    [owner, borrower, lender, feeWallet, insuranceWallet, matchingWallet] = await ethers.getSigners();

    // Deploy mock USDT token
    const USDT = await ethers.getContractFactory("MockUSDT");
    usdtToken = await USDT.deploy(INITIAL_SUPPLY);
    await usdtToken.waitForDeployment();

    // Deploy P2P Lending contract
    const P2PLending = await ethers.getContractFactory("P2PLending");
    p2pLending = await P2PLending.deploy(await usdtToken.getAddress());
    await p2pLending.waitForDeployment();

    // Setup company wallets
    await p2pLending.updateCompanyWallets(
      feeWallet.address,
      insuranceWallet.address,
      matchingWallet.address
    );

    // Add addresses to whitelist
    await p2pLending.addToWhitelist(borrower.address);
    await p2pLending.addToWhitelist(lender.address);

    // Distribute USDT tokens
    await usdtToken.transfer(borrower.address, ethers.parseUnits("10000", 18));
    await usdtToken.transfer(lender.address, ethers.parseUnits("10000", 18));

    // Approve tokens
    await usdtToken.connect(borrower).approve(await p2pLending.getAddress(), ethers.parseUnits("10000", 18));
    await usdtToken.connect(lender).approve(await p2pLending.getAddress(), ethers.parseUnits("10000", 18));
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await p2pLending.owner()).to.equal(owner.address);
    });

    it("Should set the USDT token address", async function () {
      expect(await p2pLending.usdtToken()).to.equal(await usdtToken.getAddress());
    });

    it("Should set company wallets correctly", async function () {
      const wallets = await p2pLending.companyWallets();
      expect(wallets.feeWallet).to.equal(feeWallet.address);
      expect(wallets.insuranceWallet).to.equal(insuranceWallet.address);
      expect(wallets.matchingWallet).to.equal(matchingWallet.address);
    });
  });

  describe("Whitelist Management", function () {
    it("Should add address to whitelist", async function () {
      const newUser = ethers.Wallet.createRandom().address;
      await p2pLending.addToWhitelist(newUser);
      expect(await p2pLending.whitelisted(newUser)).to.be.true;
    });

    it("Should remove address from whitelist", async function () {
      await p2pLending.removeFromWhitelist(borrower.address);
      expect(await p2pLending.whitelisted(borrower.address)).to.be.false;
    });

    it("Should check if address is whitelisted", async function () {
      expect(await p2pLending.isWhitelisted(borrower.address)).to.be.true;
      expect(await p2pLending.isWhitelisted(lender.address)).to.be.true;
    });

    it("Should only allow owner to manage whitelist", async function () {
      await expect(
        p2pLending.connect(borrower).addToWhitelist(borrower.address)
      ).to.be.revertedWithCustomError(p2pLending, "OwnableUnauthorizedAccount");
    });
  });

  describe("Loan Creation", function () {
    it("Should create a loan successfully", async function () {
      const feeWalletBalanceBefore = await usdtToken.balanceOf(feeWallet.address);
      const expectedFee = LOAN_AMOUNT * 50n / 10000n; // 0.5%

      const tx = await p2pLending.connect(borrower).createLoan("LOAN001", LOAN_AMOUNT, LOAN_DURATION);
      const receipt = await tx.wait();

      const loanId = 1;
      const loan = await p2pLending.getLoan(loanId);

      expect(loan.id).to.equal(loanId);
      expect(loan.borrower).to.equal(borrower.address);
      expect(loan.amount).to.equal(LOAN_AMOUNT);
      expect(loan.duration).to.equal(LOAN_DURATION);
      expect(loan.status).to.equal(0); // Pending

      // Check fee was transferred
      const feeWalletBalanceAfter = await usdtToken.balanceOf(feeWallet.address);
      expect(feeWalletBalanceAfter - feeWalletBalanceBefore).to.equal(expectedFee);
    });

    it("Should reject loan creation for non-whitelisted borrower", async function () {
      // Remove borrower from whitelist first
      await p2pLending.removeFromWhitelist(borrower.address);
      
      await expect(
        p2pLending.connect(borrower).createLoan("LOAN_TEST", LOAN_AMOUNT, LOAN_DURATION)
      ).to.be.revertedWithCustomError(p2pLending, "NotWhitelisted");
      
      // Re-add borrower to whitelist for other tests
      await p2pLending.addToWhitelist(borrower.address);
    });

    it("Should reject loan creation with invalid amount", async function () {
      const tooSmallAmount = ethers.parseUnits("50", 18); // 50 USDT
      const tooLargeAmount = ethers.parseUnits("200000", 18); // 200,000 USDT

      await expect(
        p2pLending.connect(borrower).createLoan("LOAN_SMALL", tooSmallAmount, LOAN_DURATION)
      ).to.be.revertedWithCustomError(p2pLending, "InvalidAmount");

      await expect(
        p2pLending.connect(borrower).createLoan("LOAN_LARGE", tooLargeAmount, LOAN_DURATION)
      ).to.be.revertedWithCustomError(p2pLending, "InvalidAmount");
    });

    it("Should reject loan creation with invalid duration", async function () {
      await expect(
        p2pLending.connect(borrower).createLoan("LOAN_ZERO", LOAN_AMOUNT, 0) // 0 months
      ).to.be.revertedWithCustomError(p2pLending, "InvalidDuration");

      await expect(
        p2pLending.connect(borrower).createLoan("LOAN_37", LOAN_AMOUNT, 37) // 37 months (> 36)
      ).to.be.revertedWithCustomError(p2pLending, "InvalidDuration");
    });

    it("Should calculate interest rate correctly", async function () {
      const smallAmount = ethers.parseUnits("500", 18); // $500
      const mediumAmount = ethers.parseUnits("5000", 18); // $5000
      const largeAmount = ethers.parseUnits("50000", 18); // $50000
      const veryLargeAmount = ethers.parseUnits("60000", 18); // $60000

      expect(await p2pLending.calculateInterestRate(smallAmount)).to.equal(600); // 6%
      expect(await p2pLending.calculateInterestRate(mediumAmount)).to.equal(900); // 9%
      expect(await p2pLending.calculateInterestRate(largeAmount)).to.equal(1800); // 18%
      expect(await p2pLending.calculateInterestRate(veryLargeAmount)).to.equal(2250); // 22.5%
    });
  });

  describe("Loan Funding", function () {
    beforeEach(async function () {
      // Create a loan first
      await p2pLending.connect(borrower).createLoan("LOAN_FUND_TEST", LOAN_AMOUNT, LOAN_DURATION);
    });

    it("Should fund loan successfully", async function () {
      const borrowerBalanceBefore = await usdtToken.balanceOf(borrower.address);
      const insuranceWalletBalanceBefore = await usdtToken.balanceOf(insuranceWallet.address);
      const matchingWalletBalanceBefore = await usdtToken.balanceOf(matchingWallet.address);

      await p2pLending.connect(lender).fundLoan(1);

      const loan = await p2pLending.getLoan(1);
      expect(loan.lender).to.equal(lender.address);
      expect(loan.status).to.equal(1); // Active
      expect(loan.fundedAt).to.be.gt(0);

      // Check disbursement
      const borrowerBalanceAfter = await usdtToken.balanceOf(borrower.address);
      const disbursedAmount = borrowerBalanceAfter - borrowerBalanceBefore;
      
      const expectedMatchingFee = LOAN_AMOUNT * 10n / 10000n; // 0.1%
      const expectedDisbursed = LOAN_AMOUNT - expectedMatchingFee;

      expect(disbursedAmount).to.equal(expectedDisbursed);

      // Check matching fee (insurance fee will be paid later with EMI)
      const insuranceWalletBalanceAfter = await usdtToken.balanceOf(insuranceWallet.address);
      const matchingWalletBalanceAfter = await usdtToken.balanceOf(matchingWallet.address);

      expect(insuranceWalletBalanceAfter - insuranceWalletBalanceBefore).to.equal(0); // No insurance fee upfront
      expect(matchingWalletBalanceAfter - matchingWalletBalanceBefore).to.equal(expectedMatchingFee);
    });

    it("Should reject funding by non-whitelisted lender", async function () {
      const [, , , nonWhitelistedLender] = await ethers.getSigners();
      await usdtToken.transfer(nonWhitelistedLender.address, ethers.parseUnits("1000", 18));
      await usdtToken.connect(nonWhitelistedLender).approve(await p2pLending.getAddress(), ethers.parseUnits("1000", 18));

      await expect(
        p2pLending.connect(nonWhitelistedLender).fundLoan(1)
      ).to.be.revertedWithCustomError(p2pLending, "NotWhitelisted");
    });

    it("Should reject funding already funded loan", async function () {
      await p2pLending.connect(lender).fundLoan(1);

      await expect(
        p2pLending.connect(lender).fundLoan(1)
      ).to.be.revertedWithCustomError(p2pLending, "LoanNotPending");
    });
  });

  describe("Payment and Interest", function () {
    beforeEach(async function () {
      // Create and fund a loan
      await p2pLending.connect(borrower).createLoan("LOAN_PAYMENT_TEST", LOAN_AMOUNT, LOAN_DURATION);
      await p2pLending.connect(lender).fundLoan(1);
    });

    it("Should calculate EMI correctly", async function () {
      const emiAmount = await p2pLending.getFixedEMI(1);
      const loan = await p2pLending.getLoan(1);
      
      // EMI should be greater than simple interest calculation
      const simpleInterest = loan.amount * loan.interestRate / (10000n * 12n);
      
      expect(emiAmount).to.be.gt(simpleInterest);
      expect(emiAmount).to.be.gt(0);
    });

    it("Should allow early payment with EMI and insurance fee", async function () {
      const emiAmount = await p2pLending.getFixedEMI(1);
      
      // Fast forward to 1 day before payment due to allow early payment
      await ethers.provider.send("evm_increaseTime", [29 * 24 * 60 * 60]); // 29 days
      await ethers.provider.send("evm_mine");
      
      // Check insurance wallet balance before payment
      const insuranceWalletBalanceBefore = await usdtToken.balanceOf(insuranceWallet.address);
      
      await p2pLending.connect(borrower).makePayment(1);

      const loan = await p2pLending.getLoan(1);
      expect(loan.totalPaid).to.equal(emiAmount);
      
      // Check that insurance fee was paid
      const insuranceWalletBalanceAfter = await usdtToken.balanceOf(insuranceWallet.address);
      const expectedInsuranceFee = emiAmount * 200n / 10000n; // 2% of EMI
      expect(insuranceWalletBalanceAfter - insuranceWalletBalanceBefore).to.equal(expectedInsuranceFee);
    });

    it("Should allow lender to claim interest", async function () {
      const emiAmount = await p2pLending.getFixedEMI(1);
      
      // Fast forward to allow payment
      await ethers.provider.send("evm_increaseTime", [29 * 24 * 60 * 60]); // 29 days
      await ethers.provider.send("evm_mine");
      
      // Make a payment first
      await p2pLending.connect(borrower).makePayment(1);

      // Check available withdrawal amount
      const availableWithdrawal = await p2pLending.getAvailableWithdrawal(1);
      expect(availableWithdrawal).to.equal(emiAmount);

      const lenderBalanceBefore = await usdtToken.balanceOf(lender.address);
      await p2pLending.connect(lender).claimInterest(1);
      const lenderBalanceAfter = await usdtToken.balanceOf(lender.address);

      expect(lenderBalanceAfter - lenderBalanceBefore).to.equal(availableWithdrawal);
      
      // Check that available withdrawal is reset to 0
      const availableAfterWithdrawal = await p2pLending.getAvailableWithdrawal(1);
      expect(availableAfterWithdrawal).to.equal(0);
    });

    it("Should reject claim when no payment available", async function () {
      // Try to claim without making any payment first
      await expect(
        p2pLending.connect(lender).claimInterest(1)
      ).to.be.revertedWithCustomError(p2pLending, "NoInterestToClaim");
    });

    it("Should complete loan after final payment", async function () {
      // Create a new loan for this test
      await p2pLending.connect(borrower).createLoan("LOAN_COMPLETE_TEST", LOAN_AMOUNT, LOAN_DURATION);
      await p2pLending.connect(lender).fundLoan(2);
      
      // Fast forward time to loan maturity (3 months = 90 days)
      await ethers.provider.send("evm_increaseTime", [90 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine");

      const loan = await p2pLending.getLoan(2);

      await p2pLending.connect(borrower).makePayment(2);

      const updatedLoan = await p2pLending.getLoan(2);
      expect(updatedLoan.status).to.equal(2); // Completed
      expect(updatedLoan.totalPaid).to.equal(loan.amount); // Total paid should equal loan amount
    });
  });

  describe("Pause/Unpause", function () {
    it("Should allow owner to pause contract", async function () {
      await p2pLending.pause();
      expect(await p2pLending.paused()).to.be.true;
    });

    it("Should allow owner to unpause contract", async function () {
      await p2pLending.pause();
      await p2pLending.unpause();
      expect(await p2pLending.paused()).to.be.false;
    });

    it("Should reject operations when paused", async function () {
      await p2pLending.pause();
      
      await expect(
        p2pLending.connect(borrower).createLoan(LOAN_AMOUNT, LOAN_DURATION)
      ).to.be.revertedWithCustomError(p2pLending, "EnforcedPause");
    });
  });

  describe("Statistics", function () {
    it("Should return correct statistics", async function () {
      // Create and fund a loan
      await p2pLending.connect(borrower).createLoan(LOAN_AMOUNT, LOAN_DURATION);
      await p2pLending.connect(lender).fundLoan(1);

      const stats = await p2pLending.getStats();
      expect(stats[0]).to.equal(1); // totalLoans
      expect(stats[1]).to.equal(LOAN_AMOUNT); // totalVolume
      expect(stats[2]).to.equal(1); // activeLoans
    });
  });
});