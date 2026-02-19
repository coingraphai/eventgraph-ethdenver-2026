# Keeper Bot

Automated bot for monitoring arbitrage opportunities and executing trades via smart contracts.

## Features

- 🔄 **Continuous Monitoring** - Checks for arbitrage opportunities every 30 seconds
- 🎯 **Smart Filtering** - Only executes high-quality opportunities
- ⚡ **Automated Execution** - Executes trades via ArbitrageVault smart contract
- 📊 **Real-time Logging** - Detailed execution logs
- 🛡️ **Safety Checks** - Minimum profit, slippage, and volume filters

## How It Works

1. **Monitor** - Fetches arbitrage opportunities from backend API
2. **Filter** - Applies criteria (min profit %, feasibility score, slippage)
3. **Execute** - Calls smart contract to execute profitable trades
4. **Report** - Logs execution results and updates statistics

## Setup

### 1. Install Dependencies

```bash
cd keeper-bot
pip install -r requirements.txt
```

### 2. Configure Environment

```bash
cp .env.example .env
nano .env
```

Required configuration:
- `API_BASE_URL` - Backend API URL
- `VAULT_CONTRACT_ADDRESS` - Deployed ArbitrageVault address
- `KEEPER_PRIVATE_KEY` - Private key for keeper wallet
- `RPC_URL` - Base network RPC endpoint
- `MIN_PROFIT_PERCENT` - Minimum profit threshold (default: 5%)
- `MAX_TRADE_SIZE` - Maximum size per trade (default: $1000)

### 3. Run the Keeper

```bash
python keeper.py
```

## Configuration

Edit `.env` to customize behavior:

```env
# Minimum profit required to execute (%)
MIN_PROFIT_PERCENT=5.0

# Maximum amount per trade (USD)
MAX_TRADE_SIZE=1000

# How often to check for opportunities (seconds)
CHECK_INTERVAL=30

# Maximum gas price willing to pay (gwei)
MAX_GAS_PRICE_GWEI=50
```

## Execution Criteria

The keeper will only execute opportunities that meet ALL criteria:

- ✅ Spread > MIN_PROFIT_PERCENT
- ✅ Feasibility score > 50/100
- ✅ Estimated slippage < 2%
- ✅ Minimum volume > $100
- ✅ Gas cost < expected profit

## Example Output

```
🤖 Keeper Bot Started
   API: http://localhost:8001
   Min Profit: 5.0%
   Max Trade Size: $1000
   Check Interval: 30s

==================================================

[14:30:15] Checking for opportunities...
   Found 12 opportunities
   3 opportunities meet criteria

🎯 Executing arbitrage opportunity:
   Market: Trump wins 2024
   Route: polymarket → kalshi
   Spread: 6.5%
   Trade Size: $1000
   ✅ Execution successful
   Total executions: 1
```

## Safety Features

- **Slippage Protection** - Rejects high-slippage trades
- **Volume Checks** - Ensures sufficient liquidity
- **Gas Price Limits** - Won't execute if gas too high
- **Emergency Stop** - Can pause via Ctrl+C
- **Contract Pause** - Vault can be paused by owner

## Production Deployment

For production use:

1. Deploy contracts to Base mainnet
2. Fund keeper wallet with ETH for gas
3. Authorize keeper address in vault contract
4. Run keeper on reliable server (AWS/DigitalOcean)
5. Set up monitoring and alerts
6. Use process manager (PM2/systemd)

### Using PM2

```bash
pm2 start keeper.py --name eventgraph-keeper
pm2 save
pm2 startup
```

## Monitoring

Check keeper status:
```bash
pm2 status
pm2 logs eventgraph-keeper
```

## Security

- ⚠️ **Never commit private keys**
- ⚠️ **Use separate keeper wallet with limited funds**
- ⚠️ **Implement rate limiting**
- ⚠️ **Monitor for anomalies**
- ⚠️ **Regular security audits**

## TODO

- [ ] Implement Web3 contract calls
- [ ] Add transaction confirmation handling
- [ ] Implement gas price optimization
- [ ] Add Telegram/Discord notifications
- [ ] Create admin dashboard
- [ ] Add multi-keeper coordination
- [ ] Implement fallback RPCs
- [ ] Add performance metrics
- [ ] Create automated tests

## License

MIT
