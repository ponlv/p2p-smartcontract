// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

/**
 * @title P2PLending
 * @dev A peer-to-peer lending platform contract
 * @author Your Name
 */
contract P2PLending is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;
    using Math for uint256;

    // Structs
    struct Loan {
        address borrower;  // Người vay
        address lender;  // Người cho vay
        uint256 amount; // Số tiền vay thực tế (user confirm)
        uint256 interestRate; // Annual percentage rate (APR) in basis points (100 = 1%)
        uint256 nextPaymentDue; // Thời gian thanh toán lãi hàng tháng
        uint256 totalPaid; // Tổng số tiền đã trả
        uint256 availableForWithdrawal; // Số tiền người cho vay có thể rút
        uint256 lateFeeAccumulated; // Phí phạt trễ hạn tích lũy
        uint16 duration; // Duration in months (uint16 để tiết kiệm)
        uint16 missedPayments; // Số kỳ thanh toán bị trễ (uint16)
        LoanStatus status; // Trạng thái khoản vay
    }
    
    // Separate mapping for extended loan data
    struct LoanExtended {
        uint256 id;
        string loanId;
        uint256 maxApprovedAmount;
        uint256 fixedEMI;
    }
    
    // View struct for frontend (chỉ thông tin cần thiết)
    struct LoanView {
        address borrower;
        address lender;
        uint256 amount;
        uint256 interestRate;
        uint256 nextPaymentDue;
        uint256 totalPaid;
        uint256 fixedEMI;
        uint256 lateFeeAccumulated;
        uint256 missedPayments;
        LoanStatus status;
    }
    
    mapping(uint256 => LoanExtended) public loanExtended;

    struct CompanyWallets {
        address feeWallet; // Ví nhận phí khởi tạo khoản vay
        address insuranceWallet; // Ví bảo hiểm khoản vay (2%)
        address matchingWallet; // Ví matching (0.1%)
    }

    enum LoanStatus {
        Requested,  // Yêu cầu mới, chờ approve
        Approved,   // Đã approve max amount, chờ user confirm
        Pending,    // User đã confirm, chờ người cho vay
        Active,     // Đang hoạt động
        Completed,  // Hoàn thành
        Defaulted   // Vỡ nợ
    }

    // State variables
    IERC20 public immutable usdtToken;
    CompanyWallets public companyWallets;
    
    uint256 public constant ONE_USDT = 10**18;
    uint256 public constant BASIS_POINTS = 10000; // 100.00%
    uint256 public constant INSURANCE_RATE = 200; // 2% bảo hiểm
    uint256 public constant MATCHING_FEE_RATE = 10; // 0.1% phí matching
    uint256 public constant LATE_PENALTY_RATE = 500; // 5% phí phạt quá hạn (giống thẻ tín dụng VN)
    uint256 public constant OVERDUE_INTEREST_MULTIPLIER = 2; // Lãi suất quá hạn gấp đôi lãi suất gốc
    uint256 public constant MIN_LOAN_AMOUNT = 100 * ONE_USDT; // 100 USDT
    uint256 public constant MAX_LOAN_AMOUNT = 1000 * ONE_USDT; // 1000 USDT
    uint256 public constant DURATION = 1 hours;
    uint256 public constant DURATION_PAYMENT = 1 hours;
    uint256 public constant HOURS_PER_YEAR = 8760; // 365 days × 24 hours

    uint256 public loanCounter;
    uint256 public totalLoans;
    uint256 public totalVolume;

    // Mappings
    mapping(uint256 => Loan) public loans;
    mapping(address => bool) public whitelisted; // Whitelist chung cho cả borrower và lender
    mapping(address => uint256[]) public borrowerLoans;
    mapping(address => uint256[]) public lenderLoans;
    mapping(uint256 => uint256[]) public loanPaymentHistory;
    mapping(address => uint256) public userActiveLoan; // ID của loan active hiện tại (0 = không có)

    // Events
    event LoanRequested(
        uint256 indexed loanId,
        string loanIdString,
        address indexed borrower,
        uint256 feePaid,
        uint256 timestamp
    );

    event LoanApproved(
        uint256 indexed loanId,
        string loanIdString,
        address indexed borrower,
        uint256 maxApprovedAmount,
        uint256 duration
    );

    event LoanConfirmed(
        uint256 indexed loanId,
        string loanIdString,
        address indexed borrower,
        uint256 confirmedAmount,
        uint256 interestRate,
        uint256 fixedEMI
    );

    event LoanFunded(
        uint256 indexed loanId,
        address indexed lender,
        uint256 amount,
        uint256 insuranceAmount,
        uint256 matchingFee,
        uint256 disbursedAmount,
        uint256 nextPaymentDue
    );

    event PaymentMade(
        uint256 indexed loanId,
        address indexed payer,
        uint256 totalAmount,
        uint256 lateFee,
        bool isCompleted
    );

    event LateFeeApplied(
        uint256 indexed loanId,
        uint256 lateFeeAmount,
        uint256 missedPayments,
        uint256 totalDebt
    );

    event InterestClaimed(
        uint256 indexed loanId,
        address indexed lender,
        uint256 interestAmount,
        uint256 timestamp
    );

    event LoanCompleted(
        uint256 indexed loanId,
        uint256 totalPaid
    );

    event FeeCollected(
        uint256 indexed loanId,
        string feeType,
        uint256 amount,
        address indexed recipient,
        uint256 timestamp
    );

    event AddressWhitelisted(address indexed user);
    event AddressRemoved(address indexed user);

    event CompanyWalletsUpdated(
        address indexed feeWallet,
        address indexed insuranceWallet,
        address indexed matchingWallet
    );

    // Errors
    error NotWhitelisted();
    error InvalidAmount();
    error InvalidInterestRate();
    error InvalidDuration();
    error LoanNotFound();
    error LoanNotPending();
    error LoanNotActive();
    error InsufficientBalance();
    error PaymentNotDue();
    error NoInterestToClaim();
    error AlreadyPaid();
    error InvalidWallet();
    error HasActiveLoan();
    error ExceedsMaxAmount();
    error LoanNotApproved();
    error UnauthorizedBorrower();

    constructor(address _usdtToken) Ownable(msg.sender) {
        require(_usdtToken != address(0), "Invalid USDT token address");
        usdtToken = IERC20(_usdtToken);
    }

    /**
     * @dev Tạo yêu cầu vay mới 
     * @param loanIdString ID string từ database
     */
    function requestLoan(string memory loanIdString) 
        external 
        whenNotPaused 
        nonReentrant 
        returns (uint256) 
    {
        if (!whitelisted[msg.sender]) revert NotWhitelisted();
        
        uint256 activeLoanId = userActiveLoan[msg.sender];
        if (activeLoanId != 0) {
            LoanStatus status = loans[activeLoanId].status;
            if (status == LoanStatus.Requested || status == LoanStatus.Approved ||
                status == LoanStatus.Active || status == LoanStatus.Pending) {
                revert HasActiveLoan();
            }
        }

        usdtToken.safeTransferFrom(msg.sender, companyWallets.feeWallet, 2 * ONE_USDT);

        uint256 loanId = ++loanCounter;
        emit FeeCollected(loanId, "initiation", 2 * ONE_USDT, companyWallets.feeWallet, block.timestamp);
        
        _createLoanRecord(loanId, loanIdString, msg.sender);

        borrowerLoans[msg.sender].push(loanId);
        totalLoans++;
        userActiveLoan[msg.sender] = loanId;

        emit LoanRequested(loanId, loanIdString, msg.sender, 5 * ONE_USDT, block.timestamp);
        return loanId;
    }

    /**
     * @dev Tạo loan record
     */
    function _createLoanRecord(uint256 loanId, string memory loanIdString, address borrower) internal {
        loans[loanId].borrower = borrower;
        loans[loanId].status = LoanStatus.Requested;
        
        loanExtended[loanId].id = loanId;
        loanExtended[loanId].loanId = loanIdString;
    }

    /**
     * @dev Owner approve loan request với max amount
     * @param loanId ID của loan request
     * @param maxAmount Số tiền tối đa được approve (hạn mức)
     * @param duration Thời hạn vay (tháng)
     */
    function approveLoanRequest(uint256 loanId, uint256 maxAmount, uint256 duration) 
        external 
        onlyOwner 
        whenNotPaused 
    {
        Loan storage loan = loans[loanId];
        if (loanExtended[loanId].id == 0) revert LoanNotFound();
        if (loan.status != LoanStatus.Requested) revert InvalidAmount();
        
        // Validate maxAmount và duration
        if (maxAmount < MIN_LOAN_AMOUNT || maxAmount > MAX_LOAN_AMOUNT) revert InvalidAmount();
        if (duration < 1 || duration > 36) revert InvalidDuration();
        
        // Cập nhật loan với max amount và duration
        loanExtended[loanId].maxApprovedAmount = maxAmount;
        loan.duration = uint16(duration);
        loan.status = LoanStatus.Approved;
        
        emit LoanApproved(loanId, loanExtended[loanId].loanId, loan.borrower, maxAmount, duration);
    }

    /**
     * @dev User confirm số tiền muốn vay (phải <= maxApprovedAmount)
     * @param loanId ID của loan
     * @param desiredAmount Số tiền user muốn vay
     */
    function confirmLoan(uint256 loanId, uint256 desiredAmount) 
        external 
        whenNotPaused 
        nonReentrant 
    {
        Loan storage loan = loans[loanId];
        if (loanExtended[loanId].id == 0) revert LoanNotFound();
        if (loan.status != LoanStatus.Approved) revert LoanNotApproved();
        if (msg.sender != loan.borrower) revert UnauthorizedBorrower();
        if (desiredAmount < MIN_LOAN_AMOUNT) revert InvalidAmount();
        if (desiredAmount > loanExtended[loanId].maxApprovedAmount) revert ExceedsMaxAmount();
        
        // Cập nhật loan
        loan.amount = desiredAmount;
        loan.interestRate = calculateInterestRate(desiredAmount);
        loanExtended[loanId].fixedEMI = calculateEMI(desiredAmount, loan.interestRate, loan.duration);
        loan.status = LoanStatus.Pending;
        
        emit LoanConfirmed(loanId, loanExtended[loanId].loanId, msg.sender, desiredAmount, loan.interestRate, loanExtended[loanId].fixedEMI);
    }


    /**
     * @dev Người cho vay xác nhận và chuyển tiền
     * @param loanId ID của khoản vay
     */
    function fundLoan(uint256 loanId) external whenNotPaused nonReentrant {
        if (!whitelisted[msg.sender]) revert NotWhitelisted();
        
        Loan storage loan = loans[loanId];
        if (loanExtended[loanId].id == 0) revert LoanNotFound();
        if (loan.status != LoanStatus.Pending) revert LoanNotPending();
        if (loan.lender != address(0)) revert AlreadyPaid();

        uint256 matchingFee = (loan.amount * MATCHING_FEE_RATE) / BASIS_POINTS;
        
        // Transfer USDT từ người cho vay
        usdtToken.safeTransferFrom(msg.sender, address(this), loan.amount);
        usdtToken.safeTransfer(companyWallets.matchingWallet, matchingFee);
        usdtToken.safeTransfer(loan.borrower, loan.amount - matchingFee);

        emit FeeCollected(loanId, "matching", matchingFee, companyWallets.matchingWallet, block.timestamp);

        // Cập nhật thông tin khoản vay
        loan.lender = msg.sender;
        loan.nextPaymentDue = block.timestamp + DURATION;
        loan.status = LoanStatus.Active;

        lenderLoans[msg.sender].push(loanId);
        totalVolume += loan.amount;

        emit LoanFunded(loanId, msg.sender, loan.amount, 0, matchingFee, loan.amount - matchingFee, loan.nextPaymentDue);
    }

    /**
     * @dev Trả lãi hàng tháng (có tính phí phạt trễ hạn)
     * @param loanId ID của khoản vay
     */
    function makePayment(uint256 loanId) external whenNotPaused nonReentrant {
        Loan storage loan = loans[loanId];
        if (loanExtended[loanId].id == 0) revert LoanNotFound();
        if (loan.status != LoanStatus.Active) revert LoanNotActive();
        if (msg.sender != loan.borrower) revert NotWhitelisted();
        
        // Cho phép trả sớm hoặc đúng hạn
        if (block.timestamp < loan.nextPaymentDue) {
            if (loan.nextPaymentDue - block.timestamp > DURATION_PAYMENT) {
                revert PaymentNotDue();
            }
        }

        uint256 remainingBalance = loan.amount - loan.totalPaid;
        bool isLastPayment = remainingBalance <= loanExtended[loanId].fixedEMI;
        
        // Tính late fee và process payment
        uint256 totalLateFee = _processLateFee(loan, loanId);
        uint256 paymentAmount = _calculatePaymentAmount(loan, loanId, isLastPayment, totalLateFee);
        
        // Transfer và emit events
        _transferPayment(loanId, paymentAmount, totalLateFee);
        
        // Update loan state
        _updateLoanAfterPayment(loan, loanId, isLastPayment, paymentAmount, totalLateFee, remainingBalance);
    }

    /**
     * @dev Xử lý tính toán late fee
     */
    function _processLateFee(Loan storage loan, uint256 loanId) internal returns (uint256) {
        if (block.timestamp <= loan.nextPaymentDue) return 0;
        
        uint256 periodsLate = (block.timestamp - loan.nextPaymentDue) / 1 hours;
        uint256 fixedEMI = loanExtended[loanId].fixedEMI;
        uint256 latePenalty = 0;
        
        // Phí phạt 5% (lần đầu)
        if (loan.missedPayments == 0) {
            latePenalty = (fixedEMI * LATE_PENALTY_RATE) / BASIS_POINTS;
            loan.lateFeeAccumulated += latePenalty;
        }
        
        // Lãi quá hạn
        uint256 baseDebt = fixedEMI + loan.lateFeeAccumulated;
        uint256 overdueInterest = (baseDebt * loan.interestRate * OVERDUE_INTEREST_MULTIPLIER * periodsLate) / (BASIS_POINTS * HOURS_PER_YEAR);
        
        uint256 totalLateFee = latePenalty + overdueInterest;
        loan.lateFeeAccumulated += overdueInterest;
        loan.missedPayments += 1;
        
        emit LateFeeApplied(loanId, totalLateFee, loan.missedPayments, baseDebt + overdueInterest);
        
        return totalLateFee;
    }

    /**
     * @dev Tính số tiền phải trả
     */
    function _calculatePaymentAmount(Loan storage loan, uint256 loanId, bool isLastPayment, uint256 totalLateFee) internal view returns (uint256) {
        if (isLastPayment) {
            return (loan.amount - loan.totalPaid) + loan.lateFeeAccumulated;
        }
        return loanExtended[loanId].fixedEMI + totalLateFee;
    }

    /**
     * @dev Transfer payment và emit events
     */
    function _transferPayment(uint256 loanId, uint256 paymentAmount, uint256 totalLateFee) internal {
        // Insurance fee được trừ từ payment, không cộng thêm
        uint256 insuranceAmount = (paymentAmount * INSURANCE_RATE) / BASIS_POINTS;
    
        // Người vay chỉ trả paymentAmount (không cộng insurance)
        usdtToken.safeTransferFrom(msg.sender, address(this), paymentAmount);
        
        // Trừ insurance fee và chuyển cho insurance wallet
        usdtToken.safeTransfer(companyWallets.insuranceWallet, insuranceAmount);
        
        emit FeeCollected(loanId, "insurance", insuranceAmount, companyWallets.insuranceWallet, block.timestamp);
        
        if (totalLateFee > 0) {
            emit FeeCollected(loanId, "late_fee", totalLateFee, address(this), block.timestamp);
        }
    }

    /**
     * @dev Update loan state after payment
     */
    function _updateLoanAfterPayment(
        Loan storage loan, 
        uint256 loanId, 
        bool isLastPayment, 
        uint256 paymentAmount,
        uint256 totalLateFee,
        uint256 remainingBalance
    ) internal {
        uint256 fixedEMI = loanExtended[loanId].fixedEMI;
        loan.totalPaid += (isLastPayment ? remainingBalance : fixedEMI);
        
        // Insurance fee được trừ từ payment trước khi add vào availableForWithdrawal
        uint256 insuranceAmount = (paymentAmount * INSURANCE_RATE) / BASIS_POINTS;
        loan.availableForWithdrawal += (paymentAmount - insuranceAmount);
        
        bool isLate = block.timestamp > loan.nextPaymentDue;
        uint256 periodsLate = isLate ? (block.timestamp - loan.nextPaymentDue) / 1 hours : 0;
        
        if (!isLate || isLastPayment) {
            loan.lateFeeAccumulated = 0;
            loan.missedPayments = 0;
        }

        loanPaymentHistory[loanId].push(paymentAmount);

        if (isLastPayment) {
            loan.status = LoanStatus.Completed;
            userActiveLoan[loan.borrower] = 0;
            emit PaymentMade(loanId, msg.sender, paymentAmount, totalLateFee, true);
            emit LoanCompleted(loanId, loan.totalPaid);
        } else {
            loan.nextPaymentDue += DURATION;
            emit PaymentMade(loanId, msg.sender, paymentAmount, totalLateFee, false);
        }
    }

    /**
     * @dev Tính lãi quá hạn
     * @param principal Số nợ gốc
     * @param annualRate Lãi suất hàng năm (basis points)
     * @param hoursLate Số giờ trễ
     * @return Tiền lãi quá hạn
     */
    function calculateOverdueInterest(
        uint256 principal,
        uint256 annualRate,
        uint256 hoursLate
    ) internal pure returns (uint256) {
        if (hoursLate == 0) return 0;
        
        // Interest = Principal × Rate × (Hours / HoursPerYear)
        // Rate in basis points, so divide by BASIS_POINTS
        return (principal * annualRate * hoursLate) / (BASIS_POINTS * HOURS_PER_YEAR);
    }

    /**
     * @dev Người cho vay claim lãi
     * @param loanId ID của khoản vay
     */
    function claimInterest(uint256 loanId) external whenNotPaused nonReentrant {
        Loan storage loan = loans[loanId];
        if (loanExtended[loanId].id == 0) revert LoanNotFound();
        if (loan.status != LoanStatus.Active && loan.status != LoanStatus.Completed) {
            revert LoanNotActive();
        }
        if (msg.sender != loan.lender) revert NotWhitelisted();

        if (loan.availableForWithdrawal == 0) revert NoInterestToClaim();

        uint256 amountToWithdraw = loan.availableForWithdrawal;
        
        // Reset số tiền có thể rút về 0
        loan.availableForWithdrawal = 0;

        // Transfer tiền cho người cho vay
        usdtToken.safeTransfer(msg.sender, amountToWithdraw);

        emit InterestClaimed(loanId, msg.sender, amountToWithdraw, block.timestamp);
    }


    /**
     * @dev Tính lãi suất dựa trên số tiền vay (6-22.5%)
     */
    function calculateInterestRate(uint256 amount) public pure returns (uint256) {
        if (amount <= 1000 * ONE_USDT) return 600; // 6% cho <= $1000
        if (amount <= 5000 * ONE_USDT) return 900; // 9% cho <= $5000
        if (amount <= 10000 * ONE_USDT) return 1200; // 12% cho <= $10000
        if (amount <= 25000 * ONE_USDT) return 1500; // 15% cho <= $25000
        if (amount <= 50000 * ONE_USDT) return 1800; // 18% cho <= $50000
        return 2250; // 22.5% cho > $50000
    }

    /**
     * @dev Tính phí khởi tạo khoản vay (5 USDT cố định)
     */
    function calculateInitiationFee() public pure returns (uint256) {
        return 5 * ONE_USDT; // 5 USDT
    }

    /**
     * @dev Tính EMI chính xác theo công thức: M = P x [r(1 + r)^n] / [(1 + r)^n - 1]
     * Sử dụng decimal 18 cho precision cao
     * @param principal Số tiền gốc (USDT với 18 decimals)
     * @param annualRate Lãi suất hàng năm (basis points)
     * @param monthsInLoan Số tháng vay
     */
    function calculateEMI(uint256 principal, uint256 annualRate, uint256 monthsInLoan) public pure returns (uint256) {
        if (annualRate == 0) {
            return principal / monthsInLoan;
        }
        
        // Chuyển lãi suất hàng năm thành lãi suất hàng tháng (basis points)
        uint256 monthlyRate = annualRate / 12;
        
        // Chuyển basis points thành decimal với 18 decimals precision
        uint256 monthlyRateDecimal = (monthlyRate * 1e18) / BASIS_POINTS;
        
        // Tính (1 + r)^n với precision cao
        uint256 onePlusRate = 1e18 + monthlyRateDecimal;
        uint256 powerTerm = calculatePower(onePlusRate, monthsInLoan);
        
        // Tính EMI: M = P * [r(1+r)^n] / [(1+r)^n - 1]
        uint256 numerator = (principal * monthlyRateDecimal * powerTerm) / 1e18;
        uint256 denominator = powerTerm - 1e18;
        
        if (denominator == 0) {
            return principal / monthsInLoan;
        }
        
        uint256 emi18 = numerator / denominator;
        
        // Chuyển kết quả từ 18 decimals về 6 decimals (USDT)
        return emi18;
    }

    /**
     * @dev Tính lũy thừa (1 + r)^n sử dụng binary exponentiation với precision cao
     */
    function calculatePower(uint256 base, uint256 exponent) internal pure returns (uint256) {
        uint256 result = 1e18;
        uint256 currentBase = base;
        
        while (exponent > 0) {
            if (exponent % 2 == 1) {
                result = (result * currentBase) / 1e18;
            }
            currentBase = (currentBase * currentBase) / 1e18;
            exponent = exponent / 2;
        }
        
        return result;
    }

    /**
     * @dev Tính EMI cho khoản vay
     */
    function calculateLoanEMI(uint256 loanId) public view returns (uint256) {
        return loanExtended[loanId].fixedEMI;
    }


    /**
     * @dev Tính lãi từ EMI dựa trên số dư còn lại
     */
    function calculateInterestFromEMI(uint256 loanId, uint256 paymentAmount) public view returns (uint256) {
        Loan memory loan = loans[loanId];
        uint256 remainingPrincipal = loan.amount - loan.totalPaid;
        
        // Tính lãi suất hàng tháng
        uint256 monthlyRate = loan.interestRate / 12; // basis points per month
        
        // Tính lãi từ số dư còn lại
        uint256 interestFromRemaining = (remainingPrincipal * monthlyRate) / BASIS_POINTS;
        
        // Trả về phần lãi trong EMI (nếu EMI lớn hơn lãi thì phần còn lại là gốc)
        return interestFromRemaining > paymentAmount ? paymentAmount : interestFromRemaining;
    }

    /**
     * @dev Kiểm tra xem có phải lần trả cuối không
     * Dựa trên số tiền còn lại thay vì thời gian
     */
    function isFinalPayment(uint256 loanId) public view returns (bool) {
        Loan memory loan = loans[loanId];
        if (loan.status != LoanStatus.Active) return false;
        
        uint256 remainingBalance = loan.amount - loan.totalPaid;
        uint256 emi = loanExtended[loanId].fixedEMI;
        
        // Nếu số tiền còn lại <= EMI, đây là lần trả cuối
        return remainingBalance <= emi;
    }

    /**
     * @dev Lấy số tiền có thể rút cho người cho vay
     */
    function getAvailableWithdrawal(uint256 loanId) public view returns (uint256) {
        Loan memory loan = loans[loanId];
        return loan.availableForWithdrawal;
    }

    /**
     * @dev Lấy thông tin phí phạt trễ hạn
     */
    function getLateFeeInfo(uint256 loanId) public view returns (
        uint256 lateFeeAccumulated,
        uint256 missedPayments,
        uint256 periodsLate,
        uint256 estimatedLateFee
    ) {
        Loan memory loan = loans[loanId];
        lateFeeAccumulated = loan.lateFeeAccumulated;
        missedPayments = loan.missedPayments;
        
        if (block.timestamp > loan.nextPaymentDue) {
            periodsLate = (block.timestamp - loan.nextPaymentDue) / 1 hours;
            
            // Tính phí phạt ước tính nếu thanh toán bây giờ
            uint256 penalty = 0;
            uint256 overdueInt = 0;
            
            if (missedPayments == 0) {
                // Lần đầu trễ: Phí phạt 5% EMI
                penalty = (loanExtended[loanId].fixedEMI * LATE_PENALTY_RATE) / BASIS_POINTS;
            }
            
            // Lãi quá hạn tích lũy
            uint256 baseDebt = loanExtended[loanId].fixedEMI + lateFeeAccumulated + penalty;
            uint256 overdueRate = loan.interestRate * OVERDUE_INTEREST_MULTIPLIER;
            overdueInt = calculateOverdueInterest(baseDebt, overdueRate, periodsLate);
            
            estimatedLateFee = penalty + overdueInt;
        } else {
            periodsLate = 0;
            estimatedLateFee = 0;
        }
    }

    /**
     * @dev Lấy EMI cố định của khoản vay
     */
    function getFixedEMI(uint256 loanId) public view returns (uint256) {
        return loanExtended[loanId].fixedEMI;
    }

    /**
     * @dev Tính lãi có thể claim (deprecated - sử dụng getAvailableWithdrawal)
     */
    function calculateAvailableInterest(uint256 loanId) public view returns (uint256) {
        return getAvailableWithdrawal(loanId);
    }

    // ============ OWNER FUNCTIONS ============

    /**
     * @dev Thêm địa chỉ vào whitelist (cho cả borrower và lender)
     */
    function addToWhitelist(address user) external onlyOwner {
        require(user != address(0), "Invalid address");
        whitelisted[user] = true;
        emit AddressWhitelisted(user);
    }

    /**
     * @dev Xóa địa chỉ khỏi whitelist
     */
    function removeFromWhitelist(address user) external onlyOwner {
        whitelisted[user] = false;
        emit AddressRemoved(user);
    }

    /**
     * @dev Kiểm tra địa chỉ có trong whitelist không
     */
    function isWhitelisted(address user) external view returns (bool) {
        return whitelisted[user];
    }

    /**
     * @dev Cập nhật các ví của công ty
     */
    function updateCompanyWallets(
        address _feeWallet,
        address _insuranceWallet,
        address _matchingWallet
    ) external onlyOwner {
        require(_feeWallet != address(0), "Invalid fee wallet");
        require(_insuranceWallet != address(0), "Invalid insurance wallet");
        require(_matchingWallet != address(0), "Invalid matching wallet");
        
        companyWallets = CompanyWallets({
            feeWallet: _feeWallet,
            insuranceWallet: _insuranceWallet,
            matchingWallet: _matchingWallet
        });

        emit CompanyWalletsUpdated(_feeWallet, _insuranceWallet, _matchingWallet);
    }

    /**
     * @dev Tạm dừng contract
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @dev Tiếp tục contract
     */
    function unpause() external onlyOwner {
        _unpause();
    }


    // ============ VIEW FUNCTIONS ============

    /**
     * @dev Lấy thông tin cơ bản của loan (cho UI hiển thị)
     */
    function getLoan(uint256 loanId) external view returns (LoanView memory) {
        Loan storage loan = loans[loanId];
        
        return LoanView({
            borrower: loan.borrower,
            lender: loan.lender,
            amount: loan.amount,
            interestRate: loan.interestRate,
            nextPaymentDue: loan.nextPaymentDue,
            totalPaid: loan.totalPaid,
            fixedEMI: loanExtended[loanId].fixedEMI,
            lateFeeAccumulated: loan.lateFeeAccumulated,
            missedPayments: loan.missedPayments,
            status: loan.status
        });
    }

    /**
     * @dev Lấy thông tin chi tiết của loan
     */
    function getLoanDetails(uint256 loanId) external view returns (
        uint256 duration,
        uint256 missedPayments,
        uint256 availableForWithdrawal,
        string memory loanIdString,
        uint256 maxApprovedAmount
    ) {
        Loan storage loan = loans[loanId];
        LoanExtended storage ext = loanExtended[loanId];
        
        return (
            loan.duration,
            loan.missedPayments,
            loan.availableForWithdrawal,
            ext.loanId,
            ext.maxApprovedAmount
        );
    }

    /**
     * @dev Lấy danh sách khoản vay của người vay
     */
    function getBorrowerLoans(address borrower) external view returns (uint256[] memory) {
        return borrowerLoans[borrower];
    }

    /**
     * @dev Lấy danh sách khoản vay của người cho vay
     */
    function getLenderLoans(address lender) external view returns (uint256[] memory) {
        return lenderLoans[lender];
    }

    /**
     * @dev Lấy lịch sử thanh toán của khoản vay
     */
    function getLoanPaymentHistory(uint256 loanId) external view returns (uint256[] memory) {
        return loanPaymentHistory[loanId];
    }

    /**
     * @dev Lấy active loan info của user
     */
    function getUserActiveLoan(address user) external view returns (
        uint256 activeLoanId,
        bool hasActiveLoan,
        LoanStatus loanStatus
    ) {
        activeLoanId = userActiveLoan[user];
        if (activeLoanId != 0) {
            loanStatus = loans[activeLoanId].status;
            hasActiveLoan = (loanStatus == LoanStatus.Requested ||
                             loanStatus == LoanStatus.Approved ||
                             loanStatus == LoanStatus.Active || 
                             loanStatus == LoanStatus.Pending);
        } else {
            hasActiveLoan = false;
            loanStatus = LoanStatus.Completed; // Default
        }
    }

    /**
     * @dev Kiểm tra xem user có thể tạo loan request không
     */
    function canRequestLoan(address user) external view returns (
        bool canRequest,
        string memory reason
    ) {
        if (!whitelisted[user]) {
            return (false, "Not whitelisted");
        }
        
        uint256 activeLoanId = userActiveLoan[user];
        if (activeLoanId != 0) {
            Loan storage activeLoan = loans[activeLoanId];
            if (activeLoan.status == LoanStatus.Requested ||
                activeLoan.status == LoanStatus.Approved ||
                activeLoan.status == LoanStatus.Active || 
                activeLoan.status == LoanStatus.Pending) {
                return (false, "Has active loan or pending request");
            }
        }
        
        return (true, "Can request loan");
    }

    /**
     * @dev Kiểm tra loan request có thể approve không
     */
    function canApproveLoan(uint256 loanId, uint256 maxAmount) external view returns (
        bool canApprove,
        string memory reason
    ) {
        Loan storage loan = loans[loanId];
        
        if (loanExtended[loanId].id == 0) {
            return (false, "Loan not found");
        }
        
        if (loan.status != LoanStatus.Requested) {
            return (false, "Loan is not in requested status");
        }
        
        if (maxAmount < MIN_LOAN_AMOUNT || maxAmount > MAX_LOAN_AMOUNT) {
            return (false, "Invalid max amount");
        }
        
        return (true, "Can approve loan");
    }

    /**
     * @dev Kiểm tra user có thể confirm loan không
     */
    function canConfirmLoan(uint256 loanId, uint256 desiredAmount) external view returns (
        bool canConfirm,
        string memory reason
    ) {
        Loan storage loan = loans[loanId];
        
        if (loanExtended[loanId].id == 0) {
            return (false, "Loan not found");
        }
        
        if (loan.status != LoanStatus.Approved) {
            return (false, "Loan is not approved yet");
        }
        
        if (desiredAmount < MIN_LOAN_AMOUNT) {
            return (false, "Amount below minimum");
        }
        
        if (desiredAmount > loanExtended[loanId].maxApprovedAmount) {
            return (false, "Amount exceeds max approved");
        }
        
        return (true, "Can confirm loan");
    }

    /**
     * @dev Lấy thống kê tổng quan
     */
    function getStats() external view returns (
        uint256 _totalLoans,
        uint256 _totalVolume,
        uint256 _activeLoans
    ) {
        _totalLoans = totalLoans;
        _totalVolume = totalVolume;
        
        uint256 active = 0;
        for (uint256 i = 1; i <= loanCounter; i++) {
            if (loans[i].status == LoanStatus.Active) {
                active++;
            }
        }
        _activeLoans = active;
    }
}
