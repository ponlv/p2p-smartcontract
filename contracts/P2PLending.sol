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
        uint256 id;  // ID của khoản vay
        string loanId; // ID string từ database
        address borrower;  // Người vay
        address lender;  // Người cho vay
        uint256 amount; // Số tiền vay
        uint256 interestRate; // Annual percentage rate (APR) in basis points (100 = 1%)
        uint256 duration; // Duration in months
        uint256 fundedAt; // Thời gian giải ngân khoản vay
        uint256 nextPaymentDue; // Thời gian thanh toán lãi hàng tháng
        uint256 totalPaid; // Tổng số tiền đã trả
        uint256 availableForWithdrawal; // Số tiền người cho vay có thể rút
        uint256 fixedEMI; // EMI cố định hàng tháng
        LoanStatus status; // Trạng thái khoản vay
    }

    struct CompanyWallets {
        address feeWallet; // Ví nhận phí khởi tạo khoản vay
        address insuranceWallet; // Ví bảo hiểm khoản vay (2%)
        address matchingWallet; // Ví matching (0.1%)
    }

    enum LoanStatus {
        Pending,    // Chờ người cho vay
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
    uint256 public constant MIN_LOAN_AMOUNT = 100 * ONE_USDT; // 100 USDT
    uint256 public constant MAX_LOAN_AMOUNT = 100000 * ONE_USDT; // 100,000 USDT
    uint256 public constant DURATION = 1 days;

    uint256 public loanCounter;
    uint256 public totalLoans;
    uint256 public totalVolume;

    // Mappings
    mapping(uint256 => Loan) public loans;
    mapping(address => bool) public whitelisted; // Whitelist chung cho cả borrower và lender
    mapping(address => uint256[]) public borrowerLoans;
    mapping(address => uint256[]) public lenderLoans;
    mapping(uint256 => uint256[]) public loanPaymentHistory;
    
    // Credit score and limit management
    mapping(address => uint256) public userCreditScore; // Credit score của user (0-1000)
    mapping(address => uint256) public userCreditLimit; // Giới hạn vay tối đa dựa trên credit score
    mapping(address => uint256) public userActiveLoan; // ID của loan active hiện tại (0 = không có)

    // Events
    event LoanCreated(
        uint256 indexed loanId,
        string loanIdString,
        address indexed borrower,
        uint256 amount,
        uint256 interestRate,
        uint256 duration,
        uint256 feePaid
    );

    event LoanFunded(
        uint256 indexed loanId,
        address indexed lender,
        uint256 amount,
        uint256 insuranceAmount,
        uint256 matchingFee,
        uint256 disbursedAmount
    );

    event PaymentMade(
        uint256 indexed loanId,
        address indexed payer,
        uint256 totalAmount,
        uint256 daysLate,
        uint256 timestamp
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

    event AddressWhitelisted(address indexed user);
    event AddressRemoved(address indexed user);

    event CompanyWalletsUpdated(
        address indexed feeWallet,
        address indexed insuranceWallet,
        address indexed matchingWallet
    );
    
    event CreditScoreUpdated(address indexed user, uint256 creditScore, uint256 creditLimit);

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
    error ExceedsCreditLimit();
    error InvalidCreditScore();

    constructor(address _usdtToken) Ownable(msg.sender) {
        require(_usdtToken != address(0), "Invalid USDT token address");
        usdtToken = IERC20(_usdtToken);
    }

    /**
     * @dev Tạo yêu cầu vay mới
     * @param amount Số tiền muốn vay (USDT)
     * @param duration Thời hạn vay (tháng)
     */
    function createLoan(string memory loanIdString, uint256 amount, uint256 duration) 
        external 
        whenNotPaused 
        nonReentrant 
        returns (uint256) 
    {
        if (!whitelisted[msg.sender]) revert NotWhitelisted();
        
        // Kiểm tra user đã có active loan chưa
        uint256 activeLoanId = userActiveLoan[msg.sender];
        if (activeLoanId != 0) {
            Loan storage activeLoan = loans[activeLoanId];
            if (activeLoan.status == LoanStatus.Active || activeLoan.status == LoanStatus.Pending) {
                revert HasActiveLoan();
            }
        }
        
        // Kiểm tra credit limit
        uint256 creditLimit = userCreditLimit[msg.sender];
        if (creditLimit == 0) revert InvalidAmount(); // Chưa được set credit limit
        if (amount > creditLimit) revert ExceedsCreditLimit();
        
        if (amount < MIN_LOAN_AMOUNT || amount > MAX_LOAN_AMOUNT) revert InvalidAmount();
        if (duration < 1 || duration > 36) revert InvalidDuration(); // 1 tháng đến 3 năm

        uint256 interestRate = calculateInterestRate(amount);
        uint256 fee = calculateInitiationFee();
        
        // Transfer phí khởi tạo
        usdtToken.safeTransferFrom(msg.sender, companyWallets.feeWallet, fee);

        uint256 loanId = ++loanCounter;
        
        _createLoanRecord(loanId, loanIdString, msg.sender, amount, interestRate, duration);

        borrowerLoans[msg.sender].push(loanId);
        totalLoans++;
        
        // Set active loan cho user
        userActiveLoan[msg.sender] = loanId;

        emit LoanCreated(loanId, loanIdString, msg.sender, amount, interestRate, duration, fee);

        return loanId;
    }

    /**
     * @dev Tạo record khoản vay trong storage
     */
    function _createLoanRecord(
        uint256 loanId,
        string memory loanIdString,
        address borrower,
        uint256 amount,
        uint256 interestRate,
        uint256 duration
    ) internal {
        loans[loanId] = Loan({
            id: loanId,
            loanId: loanIdString,
            borrower: borrower,
            lender: address(0),
            amount: amount,
            interestRate: interestRate,
            duration: duration,
            fundedAt: 0,
            nextPaymentDue: 0,
            totalPaid: 0,
            availableForWithdrawal: 0,
            fixedEMI: calculateEMI(amount, interestRate, duration),
            status: LoanStatus.Pending
        });
    }

    /**
     * @dev Người cho vay xác nhận và chuyển tiền
     * @param loanId ID của khoản vay
     */
    function fundLoan(uint256 loanId) external whenNotPaused nonReentrant {
        if (!whitelisted[msg.sender]) revert NotWhitelisted();
        
        Loan storage loan = loans[loanId];
        if (loan.id == 0) revert LoanNotFound();
        if (loan.status != LoanStatus.Pending) revert LoanNotPending();
        if (loan.lender != address(0)) revert AlreadyPaid();

        uint256 amount = loan.amount;
        uint256 matchingFee = (amount * MATCHING_FEE_RATE) / BASIS_POINTS;
        uint256 disbursedAmount = amount - matchingFee;
        
        uint256 totalToTransfer = amount;

        // Transfer USDT từ người cho vay
        usdtToken.safeTransferFrom(msg.sender, address(this), totalToTransfer);
        
        // Chuyển phí matching vào ví matching (phí bảo hiểm sẽ được trả sau)
        usdtToken.safeTransfer(companyWallets.matchingWallet, matchingFee);
        
        // Chuyển số tiền giải ngân cho người vay (không trừ phí bảo hiểm)
        usdtToken.safeTransfer(loan.borrower, disbursedAmount);

        // Cập nhật thông tin khoản vay
        loan.lender = msg.sender;
        loan.fundedAt = block.timestamp;
        loan.nextPaymentDue = block.timestamp + DURATION; // Trả lãi hàng tháng
        loan.status = LoanStatus.Active;

        lenderLoans[msg.sender].push(loanId);
        totalVolume += amount;

        emit LoanFunded(
            loanId, 
            msg.sender, 
            amount, 
            0, // insuranceAmount = 0 vì chưa trừ
            matchingFee, 
            disbursedAmount
        );
    }

    /**
     * @dev Trả lãi hàng tháng
     * @param loanId ID của khoản vay
     */
    function makePayment(uint256 loanId) external whenNotPaused nonReentrant {
        Loan storage loan = loans[loanId];
        if (loan.id == 0) revert LoanNotFound();
        if (loan.status != LoanStatus.Active) revert LoanNotActive();
        if (msg.sender != loan.borrower) revert NotWhitelisted();
        
        // Cho phép trả sớm hoặc đúng hạn
        if (block.timestamp < loan.nextPaymentDue) {
            // Cho phép trả sớm ít nhất 1 ngày trước hạn
            if (loan.nextPaymentDue - block.timestamp > 1 days) {
                revert PaymentNotDue();
            }
        }

        // Sử dụng EMI cố định đã tính sẵn
        uint256 emiAmount = loan.fixedEMI;
        uint256 remainingBalance = loan.amount - loan.totalPaid;
        
        // Kiểm tra xem có phải lần trả cuối dựa trên số tiền còn lại
        bool isLastPayment = remainingBalance <= emiAmount;
        
        // Số tiền thực tế phải trả
        uint256 paymentAmount;
        if (isLastPayment) {
            // Nếu là lần trả cuối, trả hết số dư còn lại
            paymentAmount = remainingBalance;
        } else {
            // Các lần trả khác, trả EMI
            paymentAmount = emiAmount;
        }
        
        // Tính phí bảo hiểm từ số tiền thanh toán (2%)
        uint256 insuranceAmount = (paymentAmount * INSURANCE_RATE) / BASIS_POINTS;
        
        // Transfer USDT từ người vay (bao gồm cả phí bảo hiểm)
        uint256 totalToTransfer = paymentAmount + insuranceAmount;
        usdtToken.safeTransferFrom(msg.sender, address(this), totalToTransfer);
        
        // Chuyển phí bảo hiểm vào ví bảo hiểm
        usdtToken.safeTransfer(companyWallets.insuranceWallet, insuranceAmount);
        
        // Cập nhật thông tin khoản vay
        loan.totalPaid += paymentAmount;
        
        // Cộng tiền thanh toán vào số tiền có thể rút cho người cho vay
        loan.availableForWithdrawal += paymentAmount;
        
        // Tính số ngày trễ
        uint256 daysLate = 0;
        if (block.timestamp > loan.nextPaymentDue) {
            daysLate = (block.timestamp - loan.nextPaymentDue) / 1 days;
        }

        // Cập nhật lịch sử thanh toán
        loanPaymentHistory[loanId].push(paymentAmount);

        // Cập nhật trạng thái loan
        if (isLastPayment) {
            // Lần trả cuối - đánh dấu completed
            loan.status = LoanStatus.Completed;
            // Clear active loan khi hoàn thành
            userActiveLoan[loan.borrower] = 0;
            
            emit LoanCompleted(loanId, loan.totalPaid);
        } else {
            // Chưa phải lần cuối - cập nhật nextPaymentDue
            loan.nextPaymentDue += DURATION;
        }

        emit PaymentMade(
            loanId,
            msg.sender,
            paymentAmount,
            daysLate,
            block.timestamp
        );
    }

    /**
     * @dev Người cho vay claim lãi
     * @param loanId ID của khoản vay
     */
    function claimInterest(uint256 loanId) external whenNotPaused nonReentrant {
        Loan storage loan = loans[loanId];
        if (loan.id == 0) revert LoanNotFound();
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
        Loan memory loan = loans[loanId];
        return calculateEMI(loan.amount, loan.interestRate, loan.duration);
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
        uint256 emi = loan.fixedEMI;
        
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
     * @dev Lấy EMI cố định của khoản vay
     */
    function getFixedEMI(uint256 loanId) public view returns (uint256) {
        Loan memory loan = loans[loanId];
        return loan.fixedEMI;
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

    /**
     * @dev Cập nhật credit score và credit limit cho user
     * @param user Địa chỉ user
     * @param creditScore Điểm tín dụng (0-1000)
     * @param creditLimit Giới hạn vay tối đa (USDT)
     */
    function updateCreditScore(
        address user, 
        uint256 creditScore, 
        uint256 creditLimit
    ) external onlyOwner {
        if (creditScore > 1000) revert InvalidCreditScore();
        if (creditLimit < MIN_LOAN_AMOUNT) revert InvalidAmount();
        if (creditLimit > MAX_LOAN_AMOUNT) revert InvalidAmount();
        
        userCreditScore[user] = creditScore;
        userCreditLimit[user] = creditLimit;
        
        emit CreditScoreUpdated(user, creditScore, creditLimit);
    }

    /**
     * @dev Cập nhật credit score và limit cho nhiều users
     * @param users Mảng địa chỉ users
     * @param creditScores Mảng điểm tín dụng
     * @param creditLimits Mảng giới hạn vay
     */
    function batchUpdateCreditScore(
        address[] calldata users,
        uint256[] calldata creditScores,
        uint256[] calldata creditLimits
    ) external onlyOwner {
        require(users.length == creditScores.length, "Array length mismatch");
        require(users.length == creditLimits.length, "Array length mismatch");
        
        for (uint256 i = 0; i < users.length; i++) {
            if (creditScores[i] > 1000) revert InvalidCreditScore();
            if (creditLimits[i] < MIN_LOAN_AMOUNT || creditLimits[i] > MAX_LOAN_AMOUNT) {
                revert InvalidAmount();
            }
            
            userCreditScore[users[i]] = creditScores[i];
            userCreditLimit[users[i]] = creditLimits[i];
            
            emit CreditScoreUpdated(users[i], creditScores[i], creditLimits[i]);
        }
    }

    // ============ VIEW FUNCTIONS ============

    /**
     * @dev Lấy thông tin khoản vay
     */
    function getLoan(uint256 loanId) external view returns (Loan memory) {
        return loans[loanId];
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
     * @dev Lấy credit info của user
     */
    function getUserCreditInfo(address user) external view returns (
        uint256 creditScore,
        uint256 creditLimit,
        uint256 activeLoanId,
        bool hasActiveLoan
    ) {
        creditScore = userCreditScore[user];
        creditLimit = userCreditLimit[user];
        activeLoanId = userActiveLoan[user];
        hasActiveLoan = activeLoanId != 0 && 
            (loans[activeLoanId].status == LoanStatus.Active || 
             loans[activeLoanId].status == LoanStatus.Pending);
    }

    /**
     * @dev Kiểm tra xem user có thể tạo loan không
     */
    function canCreateLoan(address user, uint256 amount) external view returns (
        bool canCreate,
        string memory reason
    ) {
        if (!whitelisted[user]) {
            return (false, "Not whitelisted");
        }
        
        uint256 activeLoanId = userActiveLoan[user];
        if (activeLoanId != 0) {
            Loan storage activeLoan = loans[activeLoanId];
            if (activeLoan.status == LoanStatus.Active || activeLoan.status == LoanStatus.Pending) {
                return (false, "Has active loan");
            }
        }
        
        uint256 creditLimit = userCreditLimit[user];
        if (creditLimit == 0) {
            return (false, "No credit limit set");
        }
        
        if (amount > creditLimit) {
            return (false, "Exceeds credit limit");
        }
        
        if (amount < MIN_LOAN_AMOUNT || amount > MAX_LOAN_AMOUNT) {
            return (false, "Invalid amount");
        }
        
        return (true, "Can create loan");
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
