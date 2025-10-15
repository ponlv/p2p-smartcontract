# 💳 Cơ chế Phí Phạt Trễ Hạn - Theo Mô Hình Thẻ Tín Dụng Việt Nam

## 📋 Tổng quan

Hệ thống áp dụng cơ chế phí phạt giống **thẻ tín dụng Việt Nam**:
1. **Phí phạt quá hạn**: 5% (một lần)
2. **Lãi quá hạn**: Gấp đôi lãi suất gốc, tính theo giờ/ngày

---

## 🎯 Constants

```solidity
uint256 public constant LATE_PENALTY_RATE = 500;              // 5% phí phạt
uint256 public constant OVERDUE_INTEREST_MULTIPLIER = 2;      // Lãi x2
uint256 public constant HOURS_PER_YEAR = 8760;                // 365 × 24
```

---

## 💰 Ví dụ thực tế - Giống Thẻ Tín Dụng VN

### **Thẻ Tín Dụng VN (Tham khảo):**
```
Khoản vay: 5,000,000 VND
Hạn thanh toán: 05/06
Thanh toán: 06/06 (trễ 1 ngày)
Lãi suất gốc: 20%/năm
Lãi suất quá hạn: 40%/năm (gấp đôi)
Phí phạt: 5%

Chi phí phát sinh:
1. Phí phạt quá hạn = 5,000,000 × 5% = 250,000 VND
2. Lãi quá hạn = 250,000 × 40% / 365 × 1 = 274 VND
3. Tổng = 250,274 VND

Tổng phải trả = 5,000,000 + 250,274 = 5,250,274 VND
```

### **P2P Lending (Áp dụng tương tự):**

#### **Giả sử:**
- **Loan Amount**: $10,000
- **Duration**: 12 tháng
- **Interest Rate (APR)**: 12%/năm
- **Monthly EMI**: $888.49
- **Payment Due**: Jan 15, 2025
- **Payment Time**: Jan 16, 2025 (**Trễ 1 ngày = 24 giờ**)

#### **Tính toán:**

**1. Phí phạt quá hạn (Late Penalty) - 5% EMI:**
```
Late Penalty = EMI × 5%
             = $888.49 × 5%
             = $44.42
```

**2. Lãi quá hạn (Overdue Interest):**
```
Base Debt = EMI + Late Penalty
          = $888.49 + $44.42
          = $932.91

Overdue Annual Rate = Original Rate × 2
                    = 12% × 2
                    = 24%/năm

Overdue Interest = Base Debt × Rate × (Hours / 8760)
                 = $932.91 × 24% × (24 / 8760)
                 = $932.91 × 0.24 × 0.00274
                 = $0.61
```

**3. Tổng chi phí phát sinh:**
```
Total Late Fee = Late Penalty + Overdue Interest
               = $44.42 + $0.61
               = $45.03
```

**4. Tổng số tiền phải trả:**
```
Total Payment = EMI + Total Late Fee
              = $888.49 + $45.03
              = $933.52

+ Insurance (2%) = $933.52 × 2% = $18.67

Grand Total = $933.52 + $18.67 = $952.19
```

---

## 📊 Bảng so sánh chi tiết

### **Kịch bản 1: Trễ 1 ngày (24 giờ)**

| Khoản mục | Công thức | Số tiền (USD) |
|-----------|-----------|---------------|
| EMI Payment | Fixed | $888.49 |
| Late Penalty (5%) | $888.49 × 5% | **$44.42** |
| Base Debt | $888.49 + $44.42 | $932.91 |
| Overdue Interest | $932.91 × 24% × (24/8760) | **$0.61** |
| **Total Late Fee** | $44.42 + $0.61 | **$45.03** |
| **Total Payment** | $888.49 + $45.03 | **$933.52** |
| Insurance (2%) | $933.52 × 2% | $18.67 |
| **Grand Total** | $933.52 + $18.67 | **$952.19** |

**→ Trễ 1 ngày phải trả thêm: $45.03 (~5.07%)**

---

### **Kịch bản 2: Trễ 7 ngày (168 giờ)**

| Khoản mục | Công thức | Số tiền (USD) |
|-----------|-----------|---------------|
| EMI Payment | Fixed | $888.49 |
| Late Penalty (5%) | $888.49 × 5% | **$44.42** |
| Base Debt | $888.49 + $44.42 | $932.91 |
| Overdue Interest | $932.91 × 24% × (168/8760) | **$4.30** |
| **Total Late Fee** | $44.42 + $4.30 | **$48.72** |
| **Total Payment** | $888.49 + $48.72 | **$937.21** |
| Insurance (2%) | $937.21 × 2% | $18.74 |
| **Grand Total** | $937.21 + $18.74 | **$955.95** |

**→ Trễ 7 ngày phải trả thêm: $48.72 (~5.48%)**

---

### **Kịch bản 3: Trễ 30 ngày (720 giờ)**

| Khoản mục | Công thức | Số tiền (USD) |
|-----------|-----------|---------------|
| EMI Payment | Fixed | $888.49 |
| Late Penalty (5%) | $888.49 × 5% | **$44.42** |
| Base Debt | $888.49 + $44.42 | $932.91 |
| Overdue Interest | $932.91 × 24% × (720/8760) | **$18.42** |
| **Total Late Fee** | $44.42 + $18.42 | **$62.84** |
| **Total Payment** | $888.49 + $62.84 | **$951.33** |
| Insurance (2%) | $951.33 × 2% | $19.03 |
| **Grand Total** | $951.33 + $19.03 | **$970.36** |

**→ Trễ 30 ngày phải trả thêm: $62.84 (~7.07%)**

---

## 🔄 Trễ nhiều kỳ liên tiếp

### **Tháng 1: Trễ 1 ngày**
```
EMI: $888.49
Late Penalty: $44.42 (5% - lần đầu)
Overdue Interest: $0.61
Total Payment: $933.52
Accumulated Fee: $45.03
```

### **Tháng 2: Tiếp tục trễ 1 ngày**
```
EMI: $888.49
Previous Accumulated: $45.03
Late Penalty: $0 (chỉ tính 1 lần)
Base Debt: $888.49 + $45.03 = $933.52
Overdue Interest: $933.52 × 24% × (24/8760) = $0.61
Total Late Fee: $45.03 + $0.61 = $45.64
Total Payment: $888.49 + $45.64 = $934.13
```

### **Tháng 3: Tiếp tục trễ 1 ngày**
```
EMI: $888.49
Previous Accumulated: $45.64
Late Penalty: $0
Base Debt: $888.49 + $45.64 = $934.13
Overdue Interest: $934.13 × 24% × (24/8760) = $0.61
Total Late Fee: $45.64 + $0.61 = $46.25
Total Payment: $888.49 + $46.25 = $934.74
```

**→ Chi phí tích lũy tăng dần mỗi kỳ!**

---

## 💡 Logic Implementation

### **makePayment() - Phần tính Late Fee:**

```solidity
if (isLate) {
    // 1. Phí phạt 5% - Chỉ tính lần đầu trễ
    if (loan.missedPayments == 0) {
        latePenalty = (emiAmount * LATE_PENALTY_RATE) / BASIS_POINTS; // 5%
        loan.lateFeeAccumulated += latePenalty;
    }
    
    // 2. Lãi quá hạn - Tính theo giờ trễ
    uint256 baseDebt = emiAmount + loan.lateFeeAccumulated;
    uint256 overdueRate = loan.interestRate * OVERDUE_INTEREST_MULTIPLIER; // x2
    
    // Interest = Debt × Rate × (Hours / 8760)
    overdueInterest = (baseDebt * overdueRate * periodsLate) / (BASIS_POINTS * HOURS_PER_YEAR);
    
    // 3. Tổng phí
    totalLateFee = latePenalty + overdueInterest;
    loan.lateFeeAccumulated += overdueInterest;
    loan.missedPayments += 1;
}
```

### **calculateOverdueInterest() Function:**

```solidity
function calculateOverdueInterest(
    uint256 principal,
    uint256 annualRate,
    uint256 hoursLate
) internal pure returns (uint256) {
    if (hoursLate == 0) return 0;
    
    // Formula: Principal × Rate × (Hours / HoursPerYear)
    return (principal * annualRate * hoursLate) / (BASIS_POINTS * HOURS_PER_YEAR);
}
```

**Ví dụ:**
```
principal = $932.91
annualRate = 2400 (24%)
hoursLate = 24

result = ($932.91 × 2400 × 24) / (10000 × 8760)
       = 53,735,424 / 87,600,000
       = $0.61
```

---

## 📈 Bảng tính nhanh - Các mức trễ

| Số giờ trễ | Số ngày | Late Penalty | Overdue Interest | Total Late Fee | Total Payment |
|------------|---------|--------------|------------------|----------------|---------------|
| 0 | 0 | $0 | $0 | $0 | $888.49 |
| 24 | 1 | $44.42 | $0.61 | $45.03 | $933.52 |
| 48 | 2 | $44.42 | $1.23 | $45.65 | $934.14 |
| 72 | 3 | $44.42 | $1.84 | $46.26 | $934.75 |
| 168 | 7 | $44.42 | $4.30 | $48.72 | $937.21 |
| 360 | 15 | $44.42 | $9.21 | $53.63 | $942.12 |
| 720 | 30 | $44.42 | $18.42 | $62.84 | $951.33 |

**Công thức nhanh:**
```
Overdue Interest ≈ Base Debt × 24% × (Days / 365)
                 ≈ $932.91 × 0.24 × (Days / 365)
                 ≈ $0.61 × Days
```

---

## 🔍 View Function

### **getLateFeeInfo() - Kiểm tra phí phạt:**

```solidity
function getLateFeeInfo(uint256 loanId) public view returns (
    uint256 lateFeeAccumulated,    // Tổng phí đã tích lũy
    uint256 missedPayments,         // Số kỳ trễ
    uint256 periodsLate,            // Số giờ trễ hiện tại
    uint256 estimatedLateFee        // Phí ước tính nếu trả ngay
)
```

**Usage Example:**
```javascript
const { lateFeeAccumulated, missedPayments, periodsLate, estimatedLateFee } = 
    await contract.getLateFeeInfo(loanId);

const daysLate = periodsLate / 24;

console.log(`📊 Late Fee Info:`);
console.log(`Accumulated Fee: $${lateFeeAccumulated}`);
console.log(`Missed Payments: ${missedPayments}`);
console.log(`Days Late: ${daysLate}`);
console.log(`Estimated Fee if pay now: $${estimatedLateFee}`);
```

---

## 📡 Events

### **LateFeeApplied Event:**
```solidity
event LateFeeApplied(
    uint256 indexed loanId,
    uint256 lateFeeAmount,      // Phí phạt của kỳ này
    uint256 missedPayments,      // Số kỳ đã trễ
    uint256 totalDebt            // Tổng nợ (EMI + phí)
);
```

**Example:**
```javascript
contract.on("LateFeeApplied", (loanId, lateFeeAmount, missedPayments, totalDebt) => {
    const daysLate = missedPayments;
    
    console.log(`🚨 Late Fee Applied to Loan ${loanId}`);
    console.log(`Amount: $${lateFeeAmount}`);
    console.log(`Missed Payments: ${missedPayments}`);
    console.log(`Total Debt: $${totalDebt}`);
    
    // Send urgent notification
    notifyBorrower(loanId, {
        type: 'LATE_FEE',
        amount: lateFeeAmount,
        totalDebt: totalDebt,
        urgency: 'HIGH'
    });
});
```

---

## ⚠️ Điểm khác biệt so với Thẻ Tín Dụng

### **Giống:**
- ✅ Phí phạt 5% (một lần)
- ✅ Lãi quá hạn gấp đôi lãi suất gốc
- ✅ Tính theo ngày/giờ trễ
- ✅ Tích lũy nếu tiếp tục trễ

### **Khác:**
- ❌ Không có "lãi trên dư nợ gốc từ đầu kỳ" (đã tính trong EMI)
- ❌ Không có "dư nợ tối thiểu" (phải trả full EMI)
- ✅ Đơn giản hơn: chỉ có Late Penalty + Overdue Interest

---

## 🧮 Công thức Excel/Google Sheets

### **Tính Late Fee:**
```excel
=IF(HoursLate > 0,
    IF(MissedPayments = 0, EMI * 5%, 0) + 
    (EMI + AccumulatedFee) * 24% * (HoursLate / 8760),
    0)
```

### **Ví dụ cụ thể:**
```
Cell A1: EMI = 888.49
Cell A2: HoursLate = 24
Cell A3: MissedPayments = 0
Cell A4: AccumulatedFee = 0

Late Penalty (B1): =IF(A3=0, A1*5%, 0)
                  = $44.42

Base Debt (B2): =A1 + A4 + B1
               = $932.91

Overdue Interest (B3): =(B2 * 24% * A2) / 8760
                      = $0.61

Total Late Fee (B4): =B1 + B3
                    = $45.03
```

---

## 📱 Frontend Display

### **Payment Widget - On Time:**
```
┌─────────────────────────────────────┐
│  💳 Next Payment Due: Jan 15, 2025  │
│  ⏰ Time Remaining: 2 days 5 hours  │
│                                     │
│  EMI Payment: $888.49               │
│  Insurance (2%): $17.77             │
│  ─────────────────────────────────  │
│  Total: $906.26                     │
│                                     │
│  ⚠️ If Late (1 day):               │
│  • Late Penalty: $44.42 (5%)       │
│  • Overdue Interest: ~$0.61/day    │
│  • Extra Cost: ~$45/day            │
└─────────────────────────────────────┘
```

### **Payment Widget - Late:**
```
┌─────────────────────────────────────┐
│  🚨 PAYMENT OVERDUE!                │
│  Days Late: 3 days (72 hours)       │
│                                     │
│  EMI Payment: $888.49               │
│  Late Penalty (5%): $44.42          │
│  Overdue Interest: $1.84            │
│  ─────────────────────────────────  │
│  Subtotal: $934.75                  │
│  Insurance (2%): $18.69             │
│  ─────────────────────────────────  │
│  TOTAL DUE: $953.44                 │
│                                     │
│  📈 +$0.61 interest per day!        │
│  💰 Pay ASAP to minimize cost!      │
└─────────────────────────────────────┘
```

---

## 🎓 Best Practices

### **For Borrowers:**
1. ⏰ **Set reminders** 2-3 days before due date
2. 💰 **Budget extra 5-10%** for potential late fees
3. 📊 **Check late fee calculator** if might be late
4. 🚨 **Pay within 24h if late** to minimize overdue interest

### **For Lenders:**
1. 📈 **Benefit from late fees** (extra income)
2. 🔔 **Monitor late payments** via events
3. 📊 **Track patterns** for risk assessment

### **For Platform:**
1. 🔔 **Auto-notify** at T-3, T-1, T-0, T+1 days
2. 📊 **Display calculator** on payment page
3. 🎨 **Visual warnings** (yellow → red)
4. 📧 **Email/SMS reminders**

---

## 🔒 Security

1. **Overflow Protection**: Using SafeMath operations
2. **Precision**: All calculations in basis points
3. **Reentrancy Guard**: `nonReentrant` on `makePayment()`
4. **Reset Mechanism**: Clear fees when paid on time

---

## 📝 Summary

### **Cơ chế:**
```
1. Late Penalty = 5% EMI (lần đầu trễ)
2. Overdue Interest = (EMI + Fees) × 24%/year × (hours/8760)
3. Total = EMI + Late Penalty + Overdue Interest + Insurance
```

### **Ví dụ nhanh:**
```
EMI $888.49, trễ 1 ngày:
→ Penalty: $44.42
→ Overdue: $0.61
→ Total: $933.52 + $18.67 insurance = $952.19
→ Extra cost: $45.03 (~5%)
```

---

**Version:** 2.0  
**Last Updated:** 2025-01-15  
**Model:** Credit Card Style (Vietnam)  
**Contract:** P2PLending.sol


