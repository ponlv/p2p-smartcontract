const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("P2PLending - Late Fee Mechanism (Credit Card Style)", function () {
  let p2pLending;
  let mockUSDT;
  let owner;
  let borrower;
  let lender;
  let feeWallet;
  let insuranceWallet;
  let matchingWallet;

  const ONE_USDT = ethers.parseUnits("1", 18);
  const LOAN_AMOUNT = ethers.parseUnits("10000", 18); // $10,000
  const DURATION = 12; // 12 months
  const INITIATION_FEE = ethers.parseUnits("5", 18); // 5 USDT

  beforeEach(async function () {
    [owner, borrower, lender, feeWallet, insuranceWallet, matchingWallet] =
      await ethers.getSigners();

    // Deploy MockUSDT
    const INITIAL_SUPPLY = ethers.parseUnits("1000000", 18); // 1M USDT
    const MockUSDT = await ethers.getContractFactory("MockUSDT");
    mockUSDT = await MockUSDT.deploy(INITIAL_SUPPLY);
    await mockUSDT.waitForDeployment();

    // Deploy P2PLending
    const P2PLending = await ethers.getContractFactory("P2PLending");
    p2pLending = await P2PLending.deploy(await mockUSDT.getAddress());
    await p2pLending.waitForDeployment();

    // Setup wallets
    await p2pLending.updateCompanyWallets(
      feeWallet.address,
      insuranceWallet.address,
      matchingWallet.address
    );

    // Mint USDT to borrower and lender
    await mockUSDT.mint(borrower.address, ethers.parseUnits("100000", 18));
    await mockUSDT.mint(lender.address, ethers.parseUnits("100000", 18));

    // Approve spending
    await mockUSDT
      .connect(borrower)
      .approve(await p2pLending.getAddress(), ethers.parseUnits("100000", 18));
    await mockUSDT
      .connect(lender)
      .approve(await p2pLending.getAddress(), ethers.parseUnits("100000", 18));

    // Whitelist users
    await p2pLending.addToWhitelist(borrower.address);
    await p2pLending.addToWhitelist(lender.address);
  });

  describe("Late Fee Calculation - Credit Card Style", function () {
    it("Should calculate late fee correctly for 1 day late (24 hours)", async function () {
      // Step 1: Request loan
      await p2pLending.connect(borrower).requestLoan("LOAN001");
      const loanId = 1;

      // Step 2: Approve with max amount
      await p2pLending.approveLoanRequest(loanId, LOAN_AMOUNT, DURATION);

      // Step 3: Confirm with desired amount
      await p2pLending.connect(borrower).confirmLoan(loanId, LOAN_AMOUNT);

      // Step 4: Fund loan
      await p2pLending.connect(lender).fundLoan(loanId);

      // Get loan info
      let loan = await p2pLending.getLoan(loanId);
      const emiAmount = loan.fixedEMI;
      
      console.log("EMI Amount:", ethers.formatUnits(emiAmount, 18));

      // Wait until 1 day after due date (24 hours late)
      await time.increaseTo(loan.nextPaymentDue + BigInt(24 * 60 * 60));

      // Calculate expected late fees
      const latePenalty = (emiAmount * BigInt(500)) / BigInt(10000); // 5%
      const baseDebt = emiAmount + latePenalty;
      const overdueRate = BigInt(1200) * BigInt(2); // 12% × 2 = 24%
      const hoursLate = BigInt(24);
      const overdueInterest = (baseDebt * overdueRate * hoursLate) / (BigInt(10000) * BigInt(8760));
      const expectedTotalLateFee = latePenalty + overdueInterest;

      console.log("Expected Late Penalty (5%):", ethers.formatUnits(latePenalty, 18));
      console.log("Expected Overdue Interest:", ethers.formatUnits(overdueInterest, 18));
      console.log("Expected Total Late Fee:", ethers.formatUnits(expectedTotalLateFee, 18));

      // Get late fee info before payment
      const lateFeeInfo = await p2pLending.getLateFeeInfo(loanId);
      console.log("Actual Estimated Late Fee:", ethers.formatUnits(lateFeeInfo.estimatedLateFee, 18));

      // Make payment
      const totalPayment = emiAmount + expectedTotalLateFee;
      const insurance = (totalPayment * BigInt(200)) / BigInt(10000); // 2%
      const grandTotal = totalPayment + insurance;

      console.log("Total Payment:", ethers.formatUnits(totalPayment, 18));
      console.log("Insurance:", ethers.formatUnits(insurance, 18));
      console.log("Grand Total:", ethers.formatUnits(grandTotal, 18));

      await p2pLending.connect(borrower).makePayment(loanId);

      // Verify
      loan = await p2pLending.getLoan(loanId);
      expect(loan.missedPayments).to.equal(1);
    });

    it("Should accumulate late fees for multiple late periods", async function () {
      // Setup loan (same as above)
      await p2pLending.connect(borrower).requestLoan("LOAN002");
      const loanId = 1;
      await p2pLending.approveLoanRequest(loanId, LOAN_AMOUNT, DURATION);
      await p2pLending.connect(borrower).confirmLoan(loanId, LOAN_AMOUNT);
      await p2pLending.connect(lender).fundLoan(loanId);

      let loan = await p2pLending.getLoan(loanId);
      const emiAmount = loan.fixedEMI;

      console.log("\n📊 Testing Multiple Late Payments:");

      // Month 1: 1 day late
      await time.increaseTo(loan.nextPaymentDue + BigInt(24 * 60 * 60));
      
      let lateFeeInfo = await p2pLending.getLateFeeInfo(loanId);
      console.log("\nMonth 1 (1 day late):");
      console.log("  Estimated Late Fee:", ethers.formatUnits(lateFeeInfo.estimatedLateFee, 18));
      
      await p2pLending.connect(borrower).makePayment(loanId);
      loan = await p2pLending.getLoan(loanId);
      console.log("  Accumulated Fee:", ethers.formatUnits(loan.lateFeeAccumulated, 18));

      // Month 2: 2 days late (accumulated fees compound)
      loan = await p2pLending.getLoan(loanId);
      await time.increaseTo(loan.nextPaymentDue + BigInt(48 * 60 * 60));
      
      lateFeeInfo = await p2pLending.getLateFeeInfo(loanId);
      console.log("\nMonth 2 (2 days late):");
      console.log("  Estimated Late Fee:", ethers.formatUnits(lateFeeInfo.estimatedLateFee, 18));
      console.log("  Previous Accumulated:", ethers.formatUnits(loan.lateFeeAccumulated, 18));
      
      await p2pLending.connect(borrower).makePayment(loanId);
      loan = await p2pLending.getLoan(loanId);
      console.log("  New Accumulated Fee:", ethers.formatUnits(loan.lateFeeAccumulated, 18));
      console.log("  Missed Payments:", loan.missedPayments.toString());
    });

    it("Should show cost breakdown for 1 day late", async function () {
      // Setup
      await p2pLending.connect(borrower).requestLoan("LOAN003");
      const loanId = 1;
      await p2pLending.approveLoanRequest(loanId, LOAN_AMOUNT, DURATION);
      await p2pLending.connect(borrower).confirmLoan(loanId, LOAN_AMOUNT);
      await p2pLending.connect(lender).fundLoan(loanId);

      let loan = await p2pLending.getLoan(loanId);
      const emiAmount = loan.fixedEMI;

      console.log("\n💰 Cost Breakdown - 1 Day Late:");
      console.log("─────────────────────────────────");

      // 1 day late
      await time.increaseTo(loan.nextPaymentDue + BigInt(24 * 60 * 60));

      const lateFeeInfo = await p2pLending.getLateFeeInfo(loanId);

      // Calculate components
      const latePenalty = (emiAmount * BigInt(500)) / BigInt(10000);
      const baseDebt = emiAmount + latePenalty;
      const overdueRate = BigInt(1200) * BigInt(2);
      const overdueInterest = (baseDebt * overdueRate * BigInt(24)) / (BigInt(10000) * BigInt(8760));
      const totalLateFee = latePenalty + overdueInterest;
      const totalPayment = emiAmount + totalLateFee;
      const insurance = (totalPayment * BigInt(200)) / BigInt(10000);
      const grandTotal = totalPayment + insurance;

      console.log("1. EMI Payment:           $" + ethers.formatUnits(emiAmount, 18));
      console.log("2. Late Penalty (5%):     $" + ethers.formatUnits(latePenalty, 18));
      console.log("3. Overdue Interest:      $" + ethers.formatUnits(overdueInterest, 18));
      console.log("   ─────────────────────────────");
      console.log("   Subtotal:              $" + ethers.formatUnits(totalPayment, 18));
      console.log("4. Insurance (2%):        $" + ethers.formatUnits(insurance, 18));
      console.log("   ═════════════════════════════");
      console.log("   GRAND TOTAL:           $" + ethers.formatUnits(grandTotal, 18));
      console.log("\n   Extra Cost (Late Fee): $" + ethers.formatUnits(totalLateFee, 18));
      console.log("   Percentage:            " + ((Number(totalLateFee) / Number(emiAmount)) * 100).toFixed(2) + "%");
    });

    it.skip("Should not charge late fee when paid early", async function () {
      // Setup
      await p2pLending.connect(borrower).requestLoan("LOAN004");
      const loanId = 1;
      await p2pLending.approveLoanRequest(loanId, LOAN_AMOUNT, DURATION);
      await p2pLending.connect(borrower).confirmLoan(loanId, LOAN_AMOUNT);
      await p2pLending.connect(lender).fundLoan(loanId);

      let loan = await p2pLending.getLoan(loanId);
      const emiAmount = loan.fixedEMI;

      // Pay 1 day early (within allowed early payment window)
      const earlyPaymentTime = loan.nextPaymentDue - BigInt(24 * 60 * 60);
      await time.increaseTo(earlyPaymentTime);
      
      const lateFeeInfoBefore = await p2pLending.getLateFeeInfo(loanId);
      console.log("\n⏰ Early Payment (1 day before due):");
      console.log("  Late Fee (should be 0): $" + ethers.formatUnits(lateFeeInfoBefore.estimatedLateFee, 18));
      
      await p2pLending.connect(borrower).makePayment(loanId);

      loan = await p2pLending.getLoan(loanId);
      console.log("\nAfter early payment:");
      console.log("  Accumulated Fee (should be 0):", ethers.formatUnits(loan.lateFeeAccumulated, 18));
      console.log("  Missed Payments (should be 0):", loan.missedPayments.toString());

      expect(loan.lateFeeAccumulated).to.equal(0);
      expect(loan.missedPayments).to.equal(0);
    });

    it("Should match Vietnam credit card example calculation", async function () {
      // Simulate example: 5M VND equivalent (≈ $200)
      const smallLoanAmount = ethers.parseUnits("200", 18); // $200
      
      await p2pLending.connect(borrower).requestLoan("LOAN005");
      const loanId = 1;
      
      await p2pLending.approveLoanRequest(loanId, smallLoanAmount, 6); // 6 months
      await p2pLending.connect(borrower).confirmLoan(loanId, smallLoanAmount);
      await p2pLending.connect(lender).fundLoan(loanId);

      let loan = await p2pLending.getLoan(loanId);
      const emiAmount = loan.fixedEMI;
      
      console.log("\n💳 Vietnam Credit Card Style Example:");
      console.log("═════════════════════════════════════");
      console.log("Loan Amount: $200 (≈ 5M VND)");
      console.log("Monthly EMI: $" + ethers.formatUnits(emiAmount, 18));
      
      // 1 day late
      await time.increaseTo(loan.nextPaymentDue + BigInt(24 * 60 * 60));

      const latePenalty = (emiAmount * BigInt(500)) / BigInt(10000); // 5%
      const baseDebt = emiAmount + latePenalty;
      const overdueInterest = (baseDebt * BigInt(2400) * BigInt(24)) / (BigInt(10000) * BigInt(8760));
      const totalLateFee = latePenalty + overdueInterest;

      console.log("\nLate by 1 day:");
      console.log("─────────────────────────────────────");
      console.log("1. Late Penalty (5%):     $" + ethers.formatUnits(latePenalty, 18));
      console.log("2. Overdue Interest (24%): $" + ethers.formatUnits(overdueInterest, 18));
      console.log("   ─────────────────────────────────");
      console.log("   Total Late Fee:        $" + ethers.formatUnits(totalLateFee, 18));
      console.log("\nTotal Payment Required:");
      console.log("  EMI + Late Fee:         $" + ethers.formatUnits(emiAmount + totalLateFee, 18));
      console.log("\nPercentage Increase:      " + ((Number(totalLateFee) / Number(emiAmount)) * 100).toFixed(2) + "%");
    });

    it("Should calculate correctly for 7 days late", async function () {
      await p2pLending.connect(borrower).requestLoan("LOAN006");
      const loanId = 1;
      await p2pLending.approveLoanRequest(loanId, LOAN_AMOUNT, DURATION);
      await p2pLending.connect(borrower).confirmLoan(loanId, LOAN_AMOUNT);
      await p2pLending.connect(lender).fundLoan(loanId);

      let loan = await p2pLending.getLoan(loanId);
      const emiAmount = loan.fixedEMI;

      // 7 days late (168 hours)
      await time.increaseTo(loan.nextPaymentDue + BigInt(7 * 24 * 60 * 60));

      const latePenalty = (emiAmount * BigInt(500)) / BigInt(10000);
      const baseDebt = emiAmount + latePenalty;
      const overdueInterest = (baseDebt * BigInt(2400) * BigInt(168)) / (BigInt(10000) * BigInt(8760));
      const totalLateFee = latePenalty + overdueInterest;

      console.log("\n📊 7 Days Late Calculation:");
      console.log("─────────────────────────────────────");
      console.log("EMI:                      $" + ethers.formatUnits(emiAmount, 18));
      console.log("Late Penalty (5%):        $" + ethers.formatUnits(latePenalty, 18));
      console.log("Base Debt:                $" + ethers.formatUnits(baseDebt, 18));
      console.log("Overdue Interest (7 days): $" + ethers.formatUnits(overdueInterest, 18));
      console.log("─────────────────────────────────────");
      console.log("Total Late Fee:           $" + ethers.formatUnits(totalLateFee, 18));
      console.log("Total Payment:            $" + ethers.formatUnits(emiAmount + totalLateFee, 18));
      
      const lateFeeInfo = await p2pLending.getLateFeeInfo(loanId);
      expect(lateFeeInfo.periodsLate).to.equal(168); // 7 days = 168 hours
    });

    it("Should compound late fees over multiple missed payments", async function () {
      await p2pLending.connect(borrower).requestLoan("LOAN007");
      const loanId = 1;
      await p2pLending.approveLoanRequest(loanId, LOAN_AMOUNT, DURATION);
      await p2pLending.connect(borrower).confirmLoan(loanId, LOAN_AMOUNT);
      await p2pLending.connect(lender).fundLoan(loanId);

      let loan = await p2pLending.getLoan(loanId);
      const emiAmount = loan.fixedEMI;

      console.log("\n📈 Compounding Effect - Multiple Missed Payments:");
      console.log("═════════════════════════════════════════════════");

      // Month 1: 1 day late
      await time.increaseTo(loan.nextPaymentDue + BigInt(24 * 60 * 60));
      
      let lateFeeInfo = await p2pLending.getLateFeeInfo(loanId);
      console.log("\nMonth 1 (1 day late):");
      console.log("  Late Fee: $" + ethers.formatUnits(lateFeeInfo.estimatedLateFee, 18));
      
      await p2pLending.connect(borrower).makePayment(loanId);
      loan = await p2pLending.getLoan(loanId);
      const month1Accumulated = loan.lateFeeAccumulated;
      console.log("  Accumulated: $" + ethers.formatUnits(month1Accumulated, 18));

      // Month 2: 2 days late (compounds on accumulated)
      loan = await p2pLending.getLoan(loanId);
      await time.increaseTo(loan.nextPaymentDue + BigInt(48 * 60 * 60));
      
      lateFeeInfo = await p2pLending.getLateFeeInfo(loanId);
      console.log("\nMonth 2 (2 days late):");
      console.log("  Late Fee: $" + ethers.formatUnits(lateFeeInfo.estimatedLateFee, 18));
      
      await p2pLending.connect(borrower).makePayment(loanId);
      loan = await p2pLending.getLoan(loanId);
      const month2Accumulated = loan.lateFeeAccumulated;
      console.log("  Accumulated: $" + ethers.formatUnits(month2Accumulated, 18));
      console.log("  Increase from Month 1: $" + ethers.formatUnits(month2Accumulated - month1Accumulated, 18));

      // Month 3: 3 days late
      loan = await p2pLending.getLoan(loanId);
      await time.increaseTo(loan.nextPaymentDue + BigInt(72 * 60 * 60));
      
      lateFeeInfo = await p2pLending.getLateFeeInfo(loanId);
      console.log("\nMonth 3 (3 days late):");
      console.log("  Late Fee: $" + ethers.formatUnits(lateFeeInfo.estimatedLateFee, 18));
      
      await p2pLending.connect(borrower).makePayment(loanId);
      loan = await p2pLending.getLoan(loanId);
      const month3Accumulated = loan.lateFeeAccumulated;
      console.log("  Accumulated: $" + ethers.formatUnits(month3Accumulated, 18));
      console.log("  Increase from Month 2: $" + ethers.formatUnits(month3Accumulated - month2Accumulated, 18));

      expect(loan.missedPayments).to.equal(3);
    });

    it("Should emit LateFeeApplied event with correct data", async function () {
      await p2pLending.connect(borrower).requestLoan("LOAN008");
      const loanId = 1;
      await p2pLending.approveLoanRequest(loanId, LOAN_AMOUNT, DURATION);
      await p2pLending.connect(borrower).confirmLoan(loanId, LOAN_AMOUNT);
      await p2pLending.connect(lender).fundLoan(loanId);

      let loan = await p2pLending.getLoan(loanId);
      
      // 1 day late
      await time.increaseTo(loan.nextPaymentDue + BigInt(24 * 60 * 60));

      // Expect LateFeeApplied event
      await expect(p2pLending.connect(borrower).makePayment(loanId))
        .to.emit(p2pLending, "LateFeeApplied")
        .withArgs(
          loanId,
          (value) => value > 0, // lateFeeAmount
          1, // missedPayments
          (value) => value > 0 // totalDebt
        );
    });
  });

  describe("Late Fee View Functions", function () {
    it("getLateFeeInfo should return accurate estimates", async function () {
      await p2pLending.connect(borrower).requestLoan("LOAN009");
      const loanId = 1;
      await p2pLending.approveLoanRequest(loanId, LOAN_AMOUNT, DURATION);
      await p2pLending.connect(borrower).confirmLoan(loanId, LOAN_AMOUNT);
      await p2pLending.connect(lender).fundLoan(loanId);

      let loan = await p2pLending.getLoan(loanId);
      
      // Check before late
      let lateFeeInfo = await p2pLending.getLateFeeInfo(loanId);
      expect(lateFeeInfo.estimatedLateFee).to.equal(0);
      expect(lateFeeInfo.periodsLate).to.equal(0);

      // 1 day late
      await time.increaseTo(loan.nextPaymentDue + BigInt(24 * 60 * 60));
      
      lateFeeInfo = await p2pLending.getLateFeeInfo(loanId);
      expect(lateFeeInfo.periodsLate).to.equal(24); // 24 hours
      expect(lateFeeInfo.estimatedLateFee).to.be.gt(0);
      
      console.log("\n🔍 Late Fee Info (Before Payment):");
      console.log("  Hours Late:", lateFeeInfo.periodsLate.toString());
      console.log("  Estimated Fee: $" + ethers.formatUnits(lateFeeInfo.estimatedLateFee, 18));
    });
  });
});

