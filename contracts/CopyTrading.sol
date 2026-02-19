// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * @title CopyTrading
 * @dev Smart contract for automated copy trading
 * @notice Allows users to automatically copy trades from successful traders
 * 
 * Features:
 * - Follow multiple traders
 * - Configurable copy percentage per trader
 * - Automatic trade mirroring
 * - Performance tracking
 * - Stop-loss protection
 */
contract CopyTrading is Ownable, ReentrancyGuard {
    
    // ============ State Variables ============
    
    /// @notice User balances available for copy trading
    mapping(address => uint256) public userBalances;
    
    /// @notice Follower => Trader => CopySettings
    mapping(address => mapping(address => CopySettings)) public copySettings;
    
    /// @notice List of traders a user is following
    mapping(address => address[]) public following;
    
    /// @notice Registered trader profiles
    mapping(address => TraderProfile) public traderProfiles;
    
    /// @notice List of all registered traders
    address[] public registeredTraders;
    
    // ============ Structs ============
    
    struct CopySettings {
        bool enabled;
        uint256 copyPercentage; // Percentage of follower's balance to use (in basis points)
        uint256 maxPerTrade;    // Maximum amount per trade
        uint256 stopLossPercent; // Stop loss percentage
    }
    
    struct TraderProfile {
        bool isRegistered;
        uint256 totalFollowers;
        uint256 totalVolume;
        uint256 winRate;
        uint256 avgReturn;
    }
    
    struct CopiedTrade {
        address follower;
        address trader;
        uint256 amount;
        uint256 timestamp;
        string platform;
        bytes32 marketId;
    }
    
    /// @notice Trade history
    CopiedTrade[] public tradeHistory;
    
    // ============ Events ============
    
    event Deposit(address indexed user, uint256 amount);
    event Withdrawal(address indexed user, uint256 amount);
    event TraderFollowed(address indexed follower, address indexed trader);
    event TraderUnfollowed(address indexed follower, address indexed trader);
    event TradeCopied(
        address indexed follower,
        address indexed trader,
        uint256 amount,
        string platform,
        bytes32 marketId
    );
    event TraderRegistered(address indexed trader);
    
    // ============ User Functions ============
    
    /**
     * @notice Deposit funds for copy trading
     * @param amount Amount to deposit
     */
    function deposit(uint256 amount) external nonReentrant {
        require(amount > 0, "Amount must be greater than 0");
        
        // TODO: Transfer USDC from user
        // IERC20(usdcToken).transferFrom(msg.sender, address(this), amount);
        
        userBalances[msg.sender] += amount;
        
        emit Deposit(msg.sender, amount);
    }
    
    /**
     * @notice Withdraw funds
     * @param amount Amount to withdraw
     */
    function withdraw(uint256 amount) external nonReentrant {
        require(amount > 0, "Amount must be greater than 0");
        require(userBalances[msg.sender] >= amount, "Insufficient balance");
        
        userBalances[msg.sender] -= amount;
        
        // TODO: Transfer USDC to user
        // IERC20(usdcToken).transfer(msg.sender, amount);
        
        emit Withdrawal(msg.sender, amount);
    }
    
    /**
     * @notice Follow a trader
     * @param trader Trader address to follow
     * @param copyPercentage Percentage of balance to use for copying
     * @param maxPerTrade Maximum amount per trade
     * @param stopLossPercent Stop loss percentage
     */
    function followTrader(
        address trader,
        uint256 copyPercentage,
        uint256 maxPerTrade,
        uint256 stopLossPercent
    ) external {
        require(traderProfiles[trader].isRegistered, "Trader not registered");
        require(copyPercentage > 0 && copyPercentage <= 10000, "Invalid copy percentage");
        require(!copySettings[msg.sender][trader].enabled, "Already following");
        
        copySettings[msg.sender][trader] = CopySettings({
            enabled: true,
            copyPercentage: copyPercentage,
            maxPerTrade: maxPerTrade,
            stopLossPercent: stopLossPercent
        });
        
        following[msg.sender].push(trader);
        traderProfiles[trader].totalFollowers++;
        
        emit TraderFollowed(msg.sender, trader);
    }
    
    /**
     * @notice Unfollow a trader
     * @param trader Trader address to unfollow
     */
    function unfollowTrader(address trader) external {
        require(copySettings[msg.sender][trader].enabled, "Not following");
        
        copySettings[msg.sender][trader].enabled = false;
        traderProfiles[trader].totalFollowers--;
        
        // Remove from following array
        address[] storage followingList = following[msg.sender];
        for (uint256 i = 0; i < followingList.length; i++) {
            if (followingList[i] == trader) {
                followingList[i] = followingList[followingList.length - 1];
                followingList.pop();
                break;
            }
        }
        
        emit TraderUnfollowed(msg.sender, trader);
    }
    
    /**
     * @notice Update copy settings for a trader
     * @param trader Trader address
     * @param copyPercentage New copy percentage
     * @param maxPerTrade New max per trade
     * @param stopLossPercent New stop loss
     */
    function updateCopySettings(
        address trader,
        uint256 copyPercentage,
        uint256 maxPerTrade,
        uint256 stopLossPercent
    ) external {
        require(copySettings[msg.sender][trader].enabled, "Not following trader");
        require(copyPercentage > 0 && copyPercentage <= 10000, "Invalid copy percentage");
        
        copySettings[msg.sender][trader].copyPercentage = copyPercentage;
        copySettings[msg.sender][trader].maxPerTrade = maxPerTrade;
        copySettings[msg.sender][trader].stopLossPercent = stopLossPercent;
    }
    
    // ============ Trader Functions ============
    
    /**
     * @notice Register as a trader
     */
    function registerAsTrader() external {
        require(!traderProfiles[msg.sender].isRegistered, "Already registered");
        
        traderProfiles[msg.sender] = TraderProfile({
            isRegistered: true,
            totalFollowers: 0,
            totalVolume: 0,
            winRate: 0,
            avgReturn: 0
        });
        
        registeredTraders.push(msg.sender);
        
        emit TraderRegistered(msg.sender);
    }
    
    // ============ Keeper Functions ============
    
    /**
     * @notice Copy a trade from trader to all followers
     * @param trader The trader whose trade is being copied
     * @param tradeAmount Original trade amount
     * @param platform Platform where trade was executed
     * @param marketId Market identifier
     */
    function copyTrade(
        address trader,
        uint256 tradeAmount,
        string calldata platform,
        bytes32 marketId
    ) external onlyOwner nonReentrant {
        require(traderProfiles[trader].isRegistered, "Trader not registered");
        
        // TODO: Get list of all followers of this trader
        // For each follower, execute proportional trade
        
        // Update trader stats
        traderProfiles[trader].totalVolume += tradeAmount;
        
        emit TradeCopied(address(0), trader, tradeAmount, platform, marketId);
    }
    
    // ============ View Functions ============
    
    /**
     * @notice Get list of traders a user is following
     * @param user User address
     */
    function getFollowing(address user) external view returns (address[] memory) {
        return following[user];
    }
    
    /**
     * @notice Get all registered traders
     */
    function getAllTraders() external view returns (address[] memory) {
        return registeredTraders;
    }
    
    /**
     * @notice Get copy settings for a specific trader
     * @param follower Follower address
     * @param trader Trader address
     */
    function getCopySettings(address follower, address trader) external view returns (CopySettings memory) {
        return copySettings[follower][trader];
    }
    
    /**
     * @notice Get trader profile
     * @param trader Trader address
     */
    function getTraderProfile(address trader) external view returns (TraderProfile memory) {
        return traderProfiles[trader];
    }
}
