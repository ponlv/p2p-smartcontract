# P2P Lending Smart Contract

Đây là smart contract cho nền tảng P2P lending giữa người vay và người cho vay, được phát triển trên Hardhat và sử dụng OpenZeppelin.

## Tính năng chính

### 🏦 Cho người vay
- Tạo yêu cầu vay với số tiền và thời hạn
- Trả phí khởi tạo khoản vay (0.5%)
- Nhận tiền giải ngân (trừ phí bảo hiểm 2% và phí matching 0.1%)
- Trả lãi hàng tháng theo lãi suất được tính toán

### 💰 Cho người cho vay
- Xem và chọn khoản vay để tài trợ
- Chuyển tiền cho người vay
- Nhận lãi từ khoản vay
- Claim lãi khi có thể

### 🏢 Cho công ty (Owner)
- Quản lý whitelist người vay và người cho vay
- Cấu hình các ví nhận phí của công ty
- Tạm dừng/tiếp tục hệ thống khi cần

## Lãi suất động

Lãi suất được tính dựa trên số tiền vay:
- ≤ $1,000: 6% APR
- ≤ $5,000: 9% APR  
- ≤ $10,000: 12% APR
- ≤ $25,000: 15% APR
- ≤ $50,000: 18% APR
- > $50,000: 22.5% APR

## Cấu trúc phí

1. **Phí khởi tạo khoản vay**: 0.5% (người vay trả)
2. **Phí bảo hiểm**: 2% (trừ từ số tiền giải ngân)
3. **Phí matching**: 0.1% (trừ từ số tiền giải ngân)

## Cài đặt

```bash
# Cài đặt dependencies
npm install

# Biên dịch contracts
npx hardhat compile

# Chạy tests
npx hardhat test

# Deploy lên testnet
npx hardhat run scripts/deploy.js --network bscTestnet
```

## Cấu hình

1. Copy file `env.example` thành `.env`
2. Điền thông tin cần thiết:
   - `PRIVATE_KEY`: Private key của ví deploy
   - `BSC_TESTNET_URL`: RPC URL của BSC Testnet
   - Các địa chỉ ví của công ty

## Bảo mật

Contract được thiết kế với các tính năng bảo mật:
- ✅ Access Control (Ownable)
- ✅ ReentrancyGuard
- ✅ Pausable
- ✅ SafeERC20
- ✅ Input validation
- ✅ Whitelist system

## Test

```bash
# Chạy tất cả tests
npx hardhat test

# Chạy test với coverage
npx hardhat coverage

# Chạy test cụ thể
npx hardhat test test/P2PLending.test.js
```

## Deploy

```bash
# Deploy lên BSC Testnet
npx hardhat run scripts/deploy.js --network bscTestnet

# Deploy lên BSC Mainnet
npx hardhat run scripts/deploy.js --network bscMainnet
```

## Networks

- **BSC Testnet**: Chain ID 97
- **BSC Mainnet**: Chain ID 56
- **Local**: Chain ID 1337 (Hardhat)

## Events

Contract emit các events quan trọng:
- `LoanCreated`: Khi tạo khoản vay mới
- `LoanFunded`: Khi khoản vay được tài trợ
- `PaymentMade`: Khi có thanh toán lãi
- `InterestClaimed`: Khi người cho vay claim lãi
- `LoanCompleted`: Khi hoàn thành khoản vay

## License

MIT License
