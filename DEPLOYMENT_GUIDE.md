# P2P Lending Smart Contract - Deployment Guide

## 🎯 Tổng quan

Smart contract P2P lending đã được phát triển hoàn chỉnh với tất cả các tính năng yêu cầu:

### ✅ Tính năng đã hoàn thành
- ✅ Khởi tạo Hardhat project với OpenZeppelin v5
- ✅ P2P lending contract với lãi suất động (6-22.5%)
- ✅ Phí khởi tạo khoản vay (0.5%)
- ✅ Phí bảo hiểm (2%) và phí matching (0.1%)
- ✅ Quản lý whitelist người vay và người cho vay
- ✅ Quản lý các ví công ty
- ✅ Tính năng pause/unpause
- ✅ Bảo mật với ReentrancyGuard, Ownable, Pausable
- ✅ 22 test cases đều pass
- ✅ Scripts deploy và quản lý

## 🚀 Cách deploy

### 1. Chuẩn bị môi trường

```bash
# Cài đặt dependencies
npm install

# Copy file cấu hình
cp env.example .env

# Điền thông tin vào .env
PRIVATE_KEY=your_private_key_here
BSC_TESTNET_URL=https://data-seed-prebsc-1-s1.binance.org:8545/
BSC_MAINNET_URL=https://bsc-dataseed.binance.org/
BSCSCAN_API_KEY=your_bscscan_api_key

# Địa chỉ USDT
USDT_TESTNET=0x337610d27c682E347C9cD60BD4b3b107C9d34dDd
USDT_MAINNET=0x55d398326f99059fF775485246999027B3197955

# Ví công ty
FEE_WALLET=0x742d35Cc6634C0532925a3b8D0e0d1b6b7e5f4e3
INSURANCE_WALLET=0x1234567890123456789012345678901234567890
MATCHING_WALLET=0x9876543210987654321098765432109876543210
```

### 2. Test trên local

```bash
# Chạy tests
npm test

# Deploy local
npm run deploy:local
```

### 3. Deploy lên BSC Testnet

```bash
# Deploy testnet
npm run deploy:testnet

# Verify contract
npx hardhat verify --network bscTestnet <contract_address> <usdt_address>
```

### 4. Deploy lên BSC Mainnet

```bash
# Deploy mainnet (CẨN THẬN!)
npm run deploy:mainnet

# Verify contract
npm run verify <contract_address> <usdt_address>
```

## 🔧 Quản lý sau khi deploy

### Thêm người dùng vào whitelist

```bash
# Thêm người vay
npx hardhat run scripts/manage-whitelist.js --network bscMainnet add 0x123... borrower

# Thêm người cho vay
npx hardhat run scripts/manage-whitelist.js --network bscMainnet add 0x456... lender

# Xóa khỏi whitelist
npx hardhat run scripts/manage-whitelist.js --network bscMainnet remove 0x123... borrower
```

### Cập nhật ví công ty

```javascript
// Sử dụng Hardhat console
npx hardhat console --network bscMainnet

// Trong console
const P2PLending = await ethers.getContractFactory("P2PLending");
const contract = P2PLending.attach("contract_address");
await contract.updateCompanyWallets(feeWallet, insuranceWallet, matchingWallet);
```

## 📊 Cấu trúc phí

### Cho người vay
- **Phí khởi tạo**: 0.5% (trả ngay khi tạo loan)
- **Phí bảo hiểm**: 2% (trừ từ số tiền giải ngân)
- **Phí matching**: 0.1% (trừ từ số tiền giải ngân)
- **Lãi suất**: 6-22.5% APR (trả hàng tháng)

### Lãi suất theo số tiền
- ≤ $1,000: 6% APR
- ≤ $5,000: 9% APR
- ≤ $10,000: 12% APR
- ≤ $25,000: 15% APR
- ≤ $50,000: 18% APR
- > $50,000: 22.5% APR

## 🛡️ Bảo mật

### Tính năng bảo mật đã implement
- ✅ **Ownable**: Chỉ owner mới quản lý được contract
- ✅ **ReentrancyGuard**: Chống reentrancy attacks
- ✅ **Pausable**: Có thể tạm dừng contract khi cần
- ✅ **SafeERC20**: Sử dụng SafeERC20 cho token transfers
- ✅ **Input validation**: Kiểm tra tất cả input
- ✅ **Whitelist system**: Chỉ người được whitelist mới sử dụng được

### Best practices
- Kiểm tra kỹ trước khi deploy mainnet
- Test thoroughly trên testnet
- Monitor contract events
- Backup private keys an toàn
- Sử dụng multi-sig wallet cho owner

## 📈 Monitoring

### Events quan trọng cần theo dõi
- `LoanCreated`: Khi có khoản vay mới
- `LoanFunded`: Khi khoản vay được tài trợ
- `PaymentMade`: Khi có thanh toán
- `InterestClaimed`: Khi người cho vay claim lãi
- `LoanCompleted`: Khi hoàn thành khoản vay

### Metrics cần track
- Tổng số khoản vay
- Tổng volume
- Tổng lãi suất đã trả
- Số khoản vay đang hoạt động
- Default rate

## 🆘 Troubleshooting

### Lỗi thường gặp

1. **"NotWhitelisted"**: Người dùng chưa được thêm vào whitelist
2. **"InsufficientBalance"**: Không đủ USDT để thực hiện giao dịch
3. **"PaymentNotDue"**: Chưa đến hạn thanh toán
4. **"Pausable: paused"**: Contract đang bị tạm dừng

### Liên hệ support
- Developer: [Your contact info]
- Documentation: [Link to docs]
- GitHub: [Link to repo]

---

**⚠️ Lưu ý quan trọng**: Đây là smart contract tài chính, cần test kỹ trước khi deploy mainnet và có kế hoạch backup/emergency response.
