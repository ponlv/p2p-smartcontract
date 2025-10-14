const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("EMI Calculation Test", function () {
  let p2pLending;
  let usdtToken;
  let owner;
  let borrower;
  let lender;
  let feeWallet;
  let insuranceWallet;
  let matchingWallet;

  const INITIAL_SUPPLY = ethers.parseUnits("1000000", 18); // 1M USDT
const LOAN_AMOUNT = ethers.parseUnits("10000", 18); // 10,000 USDT
const LOAN_DURATION = 12; // 12 months
const EXPECTED_EMI = ethers.parseUnits("888.487887", 18); // Expected EMI (rounded to 18 decimals)

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
    await usdtToken.transfer(borrower.address, ethers.parseUnits("50000", 18));
    await usdtToken.transfer(lender.address, ethers.parseUnits("50000", 18));

    // Approve tokens
    await usdtToken.connect(borrower).approve(await p2pLending.getAddress(), ethers.parseUnits("50000", 18));
    await usdtToken.connect(lender).approve(await p2pLending.getAddress(), ethers.parseUnits("50000", 18));
  });

  it("Should calculate EMI correctly for 10,000 USDT loan at 12% APR for 12 months", async function () {
    // Create loan
    await p2pLending.connect(borrower).createLoan("EMI_TEST_001", LOAN_AMOUNT, LOAN_DURATION);
    
    // Fund loan
    await p2pLending.connect(lender).fundLoan(1);
    
    // Get loan details
    const loan = await p2pLending.getLoan(1);
    console.log("Loan amount:", ethers.formatUnits(loan.amount, 18), "USDT");
    console.log("Interest rate:", loan.interestRate.toString(), "basis points (", Number(loan.interestRate) / 100, "%)");
    console.log("Duration:", loan.duration.toString(), "months");
    
           // Get fixed EMI
           const calculatedEMI = await p2pLending.getFixedEMI(1);
    console.log("Calculated EMI:", ethers.formatUnits(calculatedEMI, 18), "USDT");
    console.log("Expected EMI:", ethers.formatUnits(EXPECTED_EMI, 18), "USDT");
    
    // Test if EMI is correct (allow small tolerance for rounding)
    const tolerance = ethers.parseUnits("0.01", 18); // 0.01 USDT tolerance
    const difference = calculatedEMI > EXPECTED_EMI ? 
      calculatedEMI - EXPECTED_EMI : 
      EXPECTED_EMI - calculatedEMI;
    
    console.log("Difference:", ethers.formatUnits(difference, 18), "USDT");
    
    expect(difference).to.be.lte(tolerance);
  });

  it("Should calculate EMI using direct function call", async function () {
    // Test direct EMI calculation with exact parameters
    const principal = LOAN_AMOUNT;
    const annualRate = 1200; // 12% = 1200 basis points
    const monthsInLoan = 12;
    
    const directEMI = await p2pLending.calculateEMI(principal, annualRate, monthsInLoan);
    console.log("Direct EMI calculation:", ethers.formatUnits(directEMI, 18), "USDT");
    console.log("Expected EMI:", ethers.formatUnits(EXPECTED_EMI, 18), "USDT");
    
    // Test if EMI is correct
    const tolerance = ethers.parseUnits("0.01", 18);
    const difference = directEMI > EXPECTED_EMI ? 
      directEMI - EXPECTED_EMI : 
      EXPECTED_EMI - directEMI;
    
    expect(difference).to.be.lte(tolerance);
  });

  it("Should calculate EMI components correctly", async function () {
    const principal = LOAN_AMOUNT;
    const annualRate = 1200; // 12% = 1200 basis points
    const monthsInLoan = 12;
    
    // Calculate components manually
    const monthlyRate = annualRate / 12; // 100 basis points per month
    const monthlyInterest = (principal * BigInt(monthlyRate)) / BigInt(10000);
    const monthlyPrincipal = principal / BigInt(monthsInLoan);
    const expectedEMI = monthlyPrincipal + monthlyInterest;
    
    console.log("Monthly principal:", ethers.formatUnits(monthlyPrincipal, 18), "USDT");
    console.log("Monthly interest:", ethers.formatUnits(monthlyInterest, 18), "USDT");
    console.log("Expected EMI (simple):", ethers.formatUnits(expectedEMI, 18), "USDT");
    console.log("Expected EMI (complex):", ethers.formatUnits(EXPECTED_EMI, 18), "USDT");
    
    // The complex EMI formula should give us the correct result
    // M = P * [r(1+r)^n] / [(1+r)^n - 1]
    // Where r = monthly rate, n = number of months
  });
});
