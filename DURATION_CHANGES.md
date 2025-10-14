# Thay đổi kỳ hạn từ ngày sang tháng và sử dụng Decimal 18

## 🔄 Các thay đổi chính

### 1. **Thay đổi đơn vị kỳ hạn từ ngày sang tháng**

#### Trước đây:
- Kỳ hạn vay được tính theo ngày
- `duration` trong struct Loan là số ngày
- Validation: 30-365 ngày (1 tháng - 1 năm)

#### Bây giờ:
- Kỳ hạn vay được tính theo tháng
- `duration` trong struct Loan là số tháng
- Validation: 1-36 tháng (1 tháng - 3 năm)

#### Code changes:
```solidity
// Trước
uint256 duration; // Duration in days
if (duration < 30 || duration > 365) revert InvalidDuration(); // 30 ngày đến 1 năm

// Sau
uint256 duration; // Duration in months
if (duration < 1 || duration > 36) revert InvalidDuration(); // 1 tháng đến 3 năm
```

### 2. **Cập nhật logic tính toán EMI**

#### Trước đây:
```solidity
function calculateLoanEMI(uint256 loanId) public view returns (uint256) {
    Loan memory loan = loans[loanId];
    uint256 monthsInLoan = loan.duration / 30; // Chuyển ngày thành tháng
    return calculateEMI(loan.amount, loan.interestRate, monthsInLoan);
}
```

#### Bây giờ:
```solidity
function calculateLoanEMI(uint256 loanId) public view returns (uint256) {
    Loan memory loan = loans[loanId];
    return calculateEMI(loan.amount, loan.interestRate, loan.duration); // Trực tiếp sử dụng tháng
}
```

### 3. **Cập nhật logic kiểm tra thanh toán cuối kỳ**

#### Trước đây:
```solidity
function isFinalPayment(uint256 loanId) public view returns (bool) {
    Loan memory loan = loans[loanId];
    return block.timestamp >= loan.fundedAt + (loan.duration * 1 days);
}
```

#### Bây giờ:
```solidity
function isFinalPayment(uint256 loanId) public view returns (bool) {
    Loan memory loan = loans[loanId];
    return block.timestamp >= loan.fundedAt + (loan.duration * 30 days); // Tháng * 30 ngày
}
```

### 4. **Sử dụng Decimal 18 cho precision cao**

#### Trước đây:
- Tính toán EMI với precision thấp
- Có thể gây sai số trong tính toán phức tạp

#### Bây giờ:
```solidity
function calculateEMI(uint256 principal, uint256 annualRate, uint256 monthsInLoan) public pure returns (uint256) {
    // Chuyển principal từ 6 decimals sang 18 decimals để tính toán chính xác
    uint256 principal18 = principal * 1e12; // 6 decimals -> 18 decimals
    
    // Tính toán với 18 decimals precision
    uint256 monthlyRateDecimal = (monthlyRate * 1e18) / BASIS_POINTS;
    uint256 onePlusRate = 1e18 + monthlyRateDecimal;
    uint256 powerTerm = calculatePower(onePlusRate, monthsInLoan);
    
    // Tính EMI với precision cao
    uint256 numerator = (principal18 * monthlyRateDecimal * powerTerm) / 1e18;
    uint256 denominator = powerTerm - 1e18;
    uint256 emi18 = numerator / denominator;
    
    // Chuyển kết quả từ 18 decimals về 6 decimals (USDT)
    return emi18 / 1e12;
}
```

## 📊 So sánh trước và sau

### Ví dụ: Khoản vay $10,000 trong 12 tháng với lãi suất 12% APR

#### Trước đây:
- Input: `duration = 360` (ngày)
- Tính: `monthsInLoan = 360 / 30 = 12` (tháng)
- EMI: $888.487886 USDT

#### Bây giờ:
- Input: `duration = 12` (tháng)
- Tính: Trực tiếp sử dụng `duration = 12`
- EMI: $888.487886 USDT (chính xác hơn với decimal 18)

## 🧪 Tests được cập nhật

1. **EMI Test**: Sử dụng `LOAN_DURATION = 12` (tháng) thay vì `360` (ngày)
2. **Main Tests**: Sử dụng `LOAN_DURATION = 3` (tháng) thay vì `90` (ngày)
3. **Duration Validation**: Test với 0 tháng và 37 tháng (> 36)
4. **Final Payment**: Tính thời gian maturity theo tháng

## 🎯 Lợi ích của thay đổi

### Cho người dùng:
- ✅ **Rõ ràng hơn**: Tháng dễ hiểu hơn ngày
- ✅ **Linh hoạt hơn**: Có thể vay từ 1-36 tháng
- ✅ **Chính xác hơn**: Decimal 18 cho kết quả chính xác

### Cho developer:
- ✅ **Đơn giản hơn**: Không cần chuyển đổi ngày-tháng
- ✅ **Consistent**: Tất cả tính toán đều dùng tháng
- ✅ **Precision cao**: Decimal 18 tránh lỗi làm tròn

## 📋 Checklist hoàn thành

- ✅ Thay đổi struct Loan để sử dụng tháng
- ✅ Cập nhật validation duration (1-36 tháng)
- ✅ Sửa hàm `calculateLoanEMI()` để dùng trực tiếp tháng
- ✅ Cập nhật hàm `isFinalPayment()` để tính theo tháng
- ✅ Nâng cấp hàm `calculateEMI()` với decimal 18
- ✅ Cập nhật tất cả tests (26 tests pass)
- ✅ Biên dịch thành công
- ✅ Tài liệu hóa các thay đổi

## 🚀 Sẵn sàng sử dụng

Contract hiện tại sử dụng tháng làm đơn vị chính và decimal 18 cho tính toán chính xác, sẵn sàng để deploy và sử dụng trong production.
