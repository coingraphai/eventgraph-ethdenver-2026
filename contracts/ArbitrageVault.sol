// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

/**
 * @title ArbitrageVault
 * @dev Smart contract for executing cross-platform arbitrage trades
 * @notice Holds user funds and executes arbitrage opportunities across prediction markets
 * 
 * Features:
 * - Multi-user vault with individual balances
 * - Automated arbitrage execution
 * - Profit distribution
 * - Emergency pause mechanism
 * - Fee collection for protocol
 */
contract ArbitrageVault is Ownable, ReentrancyGuard, Pausable {
    
    // ============ State Variables ============
    
    /// @notice Protocol fee percentage (in basis points, 100 = 1%)
    uint256 public protocolFeeBps = 200; // 2%
    
    /// @notice Minimum profit threshold for execution (in basis points)
    uint256 public minProfitBps = 500; // 5%
    
    /// @notice Maximum single trade size
    uint256 public maxTradeSize = 10000 * 10**6; // 10,000 USDC
    
    /// @notice User balances
    mapping(address => uint256) public userBalances;
    
    /// @notice Total deposited across all users
    uint256 public totalDeposited;
    
    /// @notice Accumulated protocol fees
    uint256 public accumulatedFees;
    
    /// @notice Keeper addresses authorized to execute trades
    mapping(address => bool) public authorizedKeepers;
    
    // ============ Structs ============
    
    struct TradeExecution {
        address user;
        uint256 amount;
        uint256 profit;
        uint256 timestamp;
        string buyPlatform;
        string sellPlatform;
        bytes32 marketId;
    }
    
    /// @notice Trade execution history
    TradeExecution[] public tradeHistory;
    
    // ============ Events ============
    
    event Deposit(address indexed user, uint256 amount);
    event Withdrawal(address indexed user, uint256 amount);
    event TradeExecuted(
        address indexed user,
        uint256 amount,
        uint256 profit,
        string buyPlatform,
        string sellPlatform,
        bytes32 marketId
    );
    event KeeperAuthorized(address indexed keeper);
    event KeeperRevoked(address indexed keeper);
    event FeesCollected(uint256 amount);
    
    // ============ Modifiers ============
    
    modifier onlyKeeper() {
        require(authorizedKeepers[msg.sender], "Not authorized keeper");
        _;
    }
    
    // ============ Constructor ============
    
    constructor() {
        authorizedKeepers[msg.sender] = true;
    }
    
    // ============ User Functions ============
    
    /**
     * @notice Deposit funds into the vault
     * @param amount Amount to deposit (in USDC)
     */
    function deposit(uint256 amount) external nonReentrant whenNotPaused {
        require(amount > 0, "Amount must be greater than 0");
        
        // TODO: Transfer USDC from user
        // IERC20(usdcToken).transferFrom(msg.sender, address(this), amount);
        
        userBalances[msg.sender] += amount;
        totalDeposited += amount;
        
        emit Deposit(msg.sender, amount);
    }
    
    /**
     * @notice Withdraw funds from the vault
     * @param amount Amount to withdraw
     */
    function withdraw(uint256 amount) external nonReentrant {
        require(amount > 0, "Amount must be greater than 0");
        require(userBalances[msg.sender] >= amount, "Insufficient balance");
        
        userBalances[msg.sender] -= amount;
        totalDeposited -= amount;
        
        // TODO: Transfer USDC to user
        // IERC20(usdcToken).transfer(msg.sender, amount);
        
        emit Withdrawal(msg.sender, amount);
    }
    
    /**
     * @notice Get user balance
     * @param user User address
     * @return User's current balance
     */
    function getBalance(address user) external view returns (uint256) {
        return userBalances[user];
    }
    
    // ============ Keeper Functions ============
    
    /**
     * @notice Execute an arbitrage trade
     * @param user User whose funds to use
     * @param amount Trade size
     * @param expectedProfit Expected profit from the trade
     * @param buyPlatform Platform to buy on
     * @param sellPlatform Platform to sell on
     * @param marketId Market identifier
     */
    function executeArbitrage(
        address user,
        uint256 amount,
        uint256 expectedProfit,
        string calldata buyPlatform,
        string calldata sellPlatform,
        bytes32 marketId
    ) external onlyKeeper nonReentrant whenNotPaused {
        require(userBalances[user] >= amount, "Insufficient user balance");
        require(amount <= maxTradeSize, "Exceeds max trade size");
        require(expectedProfit * 10000 / amount >= minProfitBps, "Profit too low");
        
        // TODO: Implement actual trade execution
        // 1. Buy on buyPlatform
        // 2. Sell on sellPlatform
        // 3. Calculate actual profit
        
        // For now, simulate successful trade
        uint256 actualProfit = expectedProfit;
        uint256 fee = (actualProfit * protocolFeeBps) / 10000;
        uint256 userProfit = actualProfit - fee;
        
        // Update balances
        userBalances[user] += userProfit;
        accumulatedFees += fee;
        
        // Record trade
        tradeHistory.push(TradeExecution({
            user: user,
            amount: amount,
            profit: actualProfit,
            timestamp: block.timestamp,
            buyPlatform: buyPlatform,
            sellPlatform: sellPlatform,
            marketId: marketId
        }));
        
        emit TradeExecuted(user, amount, actualProfit, buyPlatform, sellPlatform, marketId);
    }
    
    // ============ Admin Functions ============
    
    /**
     * @notice Authorize a keeper address
     * @param keeper Address to authorize
     */
    function authorizeKeeper(address keeper) external onlyOwner {
        authorizedKeepers[keeper] = true;
        emit KeeperAuthorized(keeper);
    }
    
    /**
     * @notice Revoke keeper authorization
     * @param keeper Address to revoke
     */
    function revokeKeeper(address keeper) external onlyOwner {
        authorizedKeepers[keeper] = false;
        emit KeeperRevoked(keeper);
    }
    
    /**
     * @notice Update protocol fee
     * @param newFeeBps New fee in basis points
     */
    function setProtocolFee(uint256 newFeeBps) external onlyOwner {
        require(newFeeBps <= 1000, "Fee too high"); // Max 10%
        protocolFeeBps = newFeeBps;
    }
    
    /**
     * @notice Update minimum profit threshold
     * @param newMinProfitBps New minimum profit in basis points
     */
    function setMinProfitThreshold(uint256 newMinProfitBps) external onlyOwner {
        minProfitBps = newMinProfitBps;
    }
    
    /**
     * @notice Collect accumulated fees
     */
    function collectFees() external onlyOwner {
        uint256 fees = accumulatedFees;
        accumulatedFees = 0;
        
        // TODO: Transfer fees to owner
        // IERC20(usdcToken).transfer(owner(), fees);
        
        emit FeesCollected(fees);
    }
    
    /**
     * @notice Emergency pause
     */
    function pause() external onlyOwner {
        _pause();
    }
    
    /**
     * @notice Unpause
     */
    function unpause() external onlyOwner {
        _unpause();
    }
    
    // ============ View Functions ============
    
    /**
     * @notice Get total number of trades executed
     */
    function getTotalTrades() external view returns (uint256) {
        return tradeHistory.length;
    }
    
    /**
     * @notice Get trade details by index
     * @param index Trade index
     */
    function getTrade(uint256 index) external view returns (TradeExecution memory) {
        require(index < tradeHistory.length, "Invalid index");
        return tradeHistory[index];
    }
}
