# Smart Contracts

This directory contains Solidity smart contracts for the EventGraph execution system.

## Contracts

### 1. ArbitrageVault.sol
Main vault contract for holding user funds and executing cross-platform arbitrage trades.

**Features:**
- Multi-user vault with individual balance tracking
- Automated arbitrage execution via keeper bots
- Protocol fee collection (configurable)
- Emergency pause mechanism
- Access control for authorized keepers
- Trade history tracking

**Key Functions:**
- `deposit(amount)` - Deposit USDC into vault
- `withdraw(amount)` - Withdraw funds
- `executeArbitrage(...)` - Execute arbitrage trade (keeper only)
- `getBalance(user)` - Check user balance

### 2. CopyTrading.sol
Contract for automated copy trading functionality.

**Features:**
- Follow multiple successful traders
- Configurable copy percentage per trader
- Maximum trade size limits
- Stop-loss protection
- Performance tracking
- Trader profiles and statistics

**Key Functions:**
- `followTrader(trader, settings)` - Start copying a trader
- `unfollowTrader(trader)` - Stop copying
- `copyTrade(...)` - Mirror a trade (keeper only)
- `registerAsTrader()` - Register as a copyable trader

## Development Setup

### Prerequisites
- Node.js 18+
- Hardhat or Foundry
- Base network RPC access

### Installation

```bash
npm install --save-dev hardhat @openzeppelin/contracts
```

### Compile Contracts

```bash
npx hardhat compile
```

### Test Contracts

```bash
npx hardhat test
```

### Deploy to Base Testnet

```bash
npx hardhat run scripts/deploy.js --network base-testnet
```

## Contract Addresses (Base Mainnet)

*To be deployed*

- **ArbitrageVault:** TBD
- **CopyTrading:** TBD

## Security

- Contracts use OpenZeppelin's audited libraries
- ReentrancyGuard protection on all state-changing functions
- Pausable mechanism for emergency stops
- Access control via Ownable pattern

## TODO

- [ ] Implement actual USDC token transfers
- [ ] Add comprehensive test suite
- [ ] Integrate with prediction market platforms
- [ ] Add price oracle integration
- [ ] Implement slippage protection
- [ ] Add time-lock for withdrawals
- [ ] Gas optimization
- [ ] Professional audit before mainnet deployment

## License

MIT
