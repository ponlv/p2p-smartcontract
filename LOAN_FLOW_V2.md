# 📋 Luồng Vay P2P Lending - Version 2

## 🔄 Tổng quan luồng mới

### **Luồng 4 bước:**
1. **User Request** → Tạo yêu cầu vay, trả phí
2. **Admin Approve** → Admin duyệt hạn mức tối đa
3. **User Confirm** → User chọn số tiền muốn vay (≤ hạn mức)
4. **Lender Fund** → Người cho vay giải ngân

---

## 📊 Loan Status

```solidity
enum LoanStatus {
    Requested,  // ✨ Yêu cầu mới, chờ approve
    Approved,   // ✨ Đã approve max amount, chờ user confirm
    Pending,    // User đã confirm, chờ người cho vay
    Active,     // Đang hoạt động
    Completed,  // Hoàn thành
    Defaulted   // Vỡ nợ
}
```

---

## 🏗️ Loan Struct (Cập nhật)

```solidity
struct Loan {
    uint256 id;
    string loanId;
    address borrower;
    address lender;
    uint256 maxApprovedAmount;  // ✨ MỚI: Hạn mức tối đa từ admin
    uint256 amount;              // Số tiền thực tế user confirm
    uint256 interestRate;
    uint256 duration;
    uint256 fundedAt;
    uint256 nextPaymentDue;
    uint256 totalPaid;
    uint256 availableForWithdrawal;
    uint256 fixedEMI;           // Tính khi user confirm
    LoanStatus status;
}
```

---

## 🔥 Các thay đổi chính

### ❌ **Đã bỏ:**
- ❌ `userCreditScore` mapping
- ❌ `userCreditLimit` mapping
- ❌ `updateCreditScore()` function
- ❌ `batchUpdateCreditScore()` function
- ❌ Event `CreditScoreUpdated`

### ✅ **Đã thêm:**
- ✅ `maxApprovedAmount` field trong Loan struct
- ✅ Status `Approved` 
- ✅ Function `confirmLoan(loanId, desiredAmount)`
- ✅ Event `LoanConfirmed`
- ✅ Function `canConfirmLoan(loanId, desiredAmount)`
- ✅ Error `ExceedsMaxAmount`, `LoanNotApproved`, `UnauthorizedBorrower`

---

## 📝 Chi tiết từng bước

### **Bước 1: User Request Loan**

**Function:** `requestLoan(string loanIdString)`

```solidity
function requestLoan(string memory loanIdString) 
    external 
    whenNotPaused 
    nonReentrant 
    returns (uint256)
```

**Điều kiện:**
- User phải trong whitelist
- Không có loan active/pending/requested/approved

**Hành động:**
- User trả phí khởi tạo: **5 USDT** (cố định)
- Tạo loan với status: `Requested`
- `maxApprovedAmount = 0` (chưa approve)
- `amount = 0` (chưa confirm)

**Event emitted:**
```solidity
event LoanRequested(
    uint256 indexed loanId,
    string loanIdString,
    address indexed borrower,
    uint256 feePaid,
    uint256 timestamp
);
```

---

### **Bước 2: Admin Approve Request**

**Function:** `approveLoanRequest(uint256 loanId, uint256 maxAmount, uint256 duration)`

```solidity
function approveLoanRequest(uint256 loanId, uint256 maxAmount, uint256 duration) 
    external 
    onlyOwner
```

**Backend workflow:**
1. Listen event `LoanRequested`
2. Lấy thông tin user từ database
3. Tính toán credit score dựa trên:
   - KYC status
   - Payment history
   - Credit history
4. Xác định `maxAmount` (hạn mức tối đa)
5. Call smart contract: `approveLoanRequest(loanId, maxAmount, duration)`

**Điều kiện:**
- Loan phải ở status `Requested`
- `MIN_LOAN_AMOUNT ≤ maxAmount ≤ MAX_LOAN_AMOUNT`
- `1 ≤ duration ≤ 36` (tháng)

**Hành động:**
- Set `maxApprovedAmount = maxAmount`
- Set `duration`
- Chuyển status: `Requested` → `Approved`
- **CHƯA tính** `interestRate` và `fixedEMI`

**Event emitted:**
```solidity
event LoanApproved(
    uint256 indexed loanId,
    string loanIdString,
    address indexed borrower,
    uint256 maxApprovedAmount,
    uint256 duration
);
```

---

### **Bước 3: User Confirm Loan**

**Function:** `confirmLoan(uint256 loanId, uint256 desiredAmount)`

```solidity
function confirmLoan(uint256 loanId, uint256 desiredAmount) 
    external 
    whenNotPaused 
    nonReentrant
```

**Điều kiện:**
- Loan phải ở status `Approved`
- `msg.sender` phải là borrower
- `MIN_LOAN_AMOUNT ≤ desiredAmount ≤ maxApprovedAmount`

**Hành động:**
- Set `amount = desiredAmount`
- **Tính** `interestRate = calculateInterestRate(desiredAmount)`
- **Tính** `fixedEMI = calculateEMI(desiredAmount, interestRate, duration)`
- Chuyển status: `Approved` → `Pending`

**Event emitted:**
```solidity
event LoanConfirmed(
    uint256 indexed loanId,
    string loanIdString,
    address indexed borrower,
    uint256 confirmedAmount,
    uint256 interestRate,
    uint256 fixedEMI
);
```

---

### **Bước 4: Lender Fund Loan**

**Function:** `fundLoan(uint256 loanId)` - Không thay đổi

---

## 🔍 View Functions

### 1. **Kiểm tra có thể request loan**
```solidity
function canRequestLoan(address user) 
    external view 
    returns (bool canRequest, string memory reason)
```

### 2. **Kiểm tra có thể approve loan**
```solidity
function canApproveLoan(uint256 loanId, uint256 maxAmount) 
    external view 
    returns (bool canApprove, string memory reason)
```

### 3. **Kiểm tra có thể confirm loan** ✨ MỚI
```solidity
function canConfirmLoan(uint256 loanId, uint256 desiredAmount) 
    external view 
    returns (bool canConfirm, string memory reason)
```

### 4. **Lấy active loan của user** ✨ CẬP NHẬT
```solidity
function getUserActiveLoan(address user) 
    external view 
    returns (
        uint256 activeLoanId,
        bool hasActiveLoan,
        LoanStatus loanStatus
    )
```

---

## 🎯 Use Cases

### **Case 1: User muốn vay đúng hạn mức**
1. User request → Trả 5 USDT
2. Admin approve max: **$10,000**
3. User confirm: **$10,000** ✅
4. Lender fund: $10,000

### **Case 2: User muốn vay ít hơn hạn mức**
1. User request → Trả 5 USDT
2. Admin approve max: **$10,000**
3. User confirm: **$5,000** ✅ (Lãi suất thấp hơn)
4. Lender fund: $5,000

### **Case 3: User muốn vay nhiều hơn hạn mức**
1. User request → Trả 5 USDT
2. Admin approve max: **$5,000**
3. User confirm: **$10,000** ❌ `ExceedsMaxAmount` error
4. User phải confirm ≤ $5,000

---

## 🔐 Security & Validation

### **Request Stage:**
- ✅ Whitelist check
- ✅ No active loan check
- ✅ Fee payment required

### **Approve Stage:**
- ✅ Only owner
- ✅ Status must be `Requested`
- ✅ Amount within bounds

### **Confirm Stage:**
- ✅ Only borrower
- ✅ Status must be `Approved`
- ✅ Amount ≤ maxApprovedAmount
- ✅ Auto-calculate interest & EMI

---

## 📊 So sánh Version 1 vs Version 2

| Feature | V1 | V2 |
|---------|----|----|
| Credit Limit | On-chain mapping | Backend calculation |
| User input amount | Required at creation | After approval |
| EMI calculation | At creation | At confirmation |
| Number of steps | 2 (Create → Fund) | 4 (Request → Approve → Confirm → Fund) |
| Flexibility | Low | High |
| Admin control | Limited | Full control |

---

## 🚀 Backend Integration

### **Event Listeners cần thiết:**

#### 1. **Listen `LoanRequested`**
```javascript
contract.on("LoanRequested", async (loanId, loanIdString, borrower, feePaid, timestamp) => {
    // 1. Fetch user data from database
    const user = await getUserByAddress(borrower);
    
    // 2. Calculate credit score
    const creditScore = calculateCreditScore(user);
    
    // 3. Determine max amount based on score
    const maxAmount = determineMaxAmount(creditScore);
    
    // 4. Call approveLoanRequest
    await contract.approveLoanRequest(loanId, maxAmount, duration);
});
```

#### 2. **Listen `LoanApproved`**
```javascript
contract.on("LoanApproved", async (loanId, loanIdString, borrower, maxApprovedAmount, duration) => {
    // Update database: loan approved with max amount
    await updateLoanStatus(loanId, {
        status: 'approved',
        maxApprovedAmount,
        duration
    });
    
    // Notify user via email/notification
    await notifyUser(borrower, 'loan_approved', { maxApprovedAmount });
});
```

#### 3. **Listen `LoanConfirmed`**
```javascript
contract.on("LoanConfirmed", async (loanId, loanIdString, borrower, confirmedAmount, interestRate, fixedEMI) => {
    // Update database with final loan details
    await updateLoanStatus(loanId, {
        status: 'pending',
        amount: confirmedAmount,
        interestRate,
        fixedEMI
    });
    
    // Ready for lender matching
    await matchLender(loanId);
});
```

---

## ✅ Testing Checklist

- [ ] User can request loan with fee payment
- [ ] Admin can approve with max amount
- [ ] User can confirm with amount ≤ max
- [ ] User cannot confirm amount > max
- [ ] EMI calculated correctly at confirmation
- [ ] Status transitions correctly
- [ ] Events emitted properly
- [ ] Old loans still work (backward compatible)

---

## 📌 Notes

1. **Phí khởi tạo** vẫn cố định: **5 USDT**
2. **Lãi suất** tính theo amount mà user confirm (không phải max amount)
3. **EMI** chỉ tính khi user confirm, đảm bảo chính xác
4. **Linh hoạt**: User có thể vay ít hơn hạn mức để có lãi suất thấp hơn
5. **Backend** có toàn quyền kiểm soát hạn mức vay

---

**Version:** 2.0  
**Last Updated:** 2025-01-15  
**Contract:** P2PLending.sol


