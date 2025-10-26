// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./CollateralManager.sol";
import "./AIAgentController.sol";

/**
 * @title StakingProxy
 * @dev Cross-chain staking proxy with AI agent integration
 */
contract StakingProxy is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    CollateralManager public immutable collateralManager;
    AIAgentController public immutable aiController;
    address public protocolTreasury;
    
    struct StakingPosition {
        address token;
        uint256 stakedAmount;
        uint256 liquidTokenBalance;
        uint256 lastRewardTime;
        uint256 accumulatedRewards;
        uint256 unstakeRequestTime;
        uint256 unstakeAmount;
    }
    
    mapping(address => StakingPosition) public positions;
    mapping(address => bool) public supportedStakingTokens;
    mapping(bytes32 => bool) public processedBridgeIds;
    
    uint16 public baseAnnualRewardRate = 500; // 5% APY in basis points
    uint16 public protocolFeeRate = 100; // 1% in basis points
    uint16 public constant BASIS_POINTS = 10000;
    uint256 public constant UNSTAKE_DELAY = 7 days;
    uint256 public constant SECONDS_PER_YEAR = 365 days;
    
    uint256 public totalStaked;
    uint256 public totalRewardsDistributed;
    
    event StakeExecuted(
        address indexed user,
        address indexed token,
        uint256 amount,
        uint256 liquidTokens
    );
    event CrossChainStakeExecuted(
        address indexed user,
        address indexed token,
        uint256 amount,
        uint256 sourceChainId,
        bytes32 bridgeId
    );
    event UnstakeRequested(address indexed user, uint256 amount, uint256 availableAt);
    event UnstakeExecuted(address indexed user, uint256 amount, uint256 rewards);
    event RewardRateUpdated(uint16 oldRate, uint16 newRate);
    event StakingTokenAdded(address indexed token, bool supported);
    
    error TokenNotSupported();
    error InvalidAmount();
    error InsufficientStake();
    error InsufficientCollateral();
    error UnstakeNotRequested();
    error UnstakeDelayNotMet();
    error OnlyAIController();
    error InvalidRewardRate();
    error BridgeIdAlreadyProcessed();

    constructor(
        address _collateralManager,
        address _aiController,
        address _protocolTreasury
    ) Ownable(msg.sender) {
        if (_collateralManager == address(0) || 
            _aiController == address(0) || 
            _protocolTreasury == address(0)) {
            revert InvalidAmount();
        }
        
        collateralManager = CollateralManager(_collateralManager);
        aiController = AIAgentController(payable(_aiController));
        protocolTreasury = _protocolTreasury;
    }
    
    function stakeWithCollateral(
        address token,
        uint256 amount
    ) external nonReentrant {
        if (!supportedStakingTokens[token]) revert TokenNotSupported();
        if (amount == 0) revert InvalidAmount();
        
        // Check collateral requirement (150% ratio)
        uint256 stakeValueUSD = amount * 2500; // Mock $2500 per ETH
        if (!collateralManager.canStake(msg.sender, stakeValueUSD)) {
            revert InsufficientCollateral();
        }
        
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        
        _executeStake(msg.sender, token, amount);
        
        emit StakeExecuted(msg.sender, token, amount, amount);
    }
    
    function executeStakeAfterBridge(
        address user,
        address token,
        uint256 amount,
        uint256 sourceChainId,
        bytes32 bridgeId
    ) external nonReentrant {
        if (!supportedStakingTokens[token]) revert TokenNotSupported();
        if (amount == 0) revert InvalidAmount();
        if (processedBridgeIds[bridgeId]) revert BridgeIdAlreadyProcessed();
        
        // Check collateral
        uint256 stakeValueUSD = amount * 2500;
        if (!collateralManager.canStake(user, stakeValueUSD)) {
            revert InsufficientCollateral();
        }
        
        processedBridgeIds[bridgeId] = true;
        _executeStake(user, token, amount);
        
        emit CrossChainStakeExecuted(user, token, amount, sourceChainId, bridgeId);
    }
    
    function aiControlledStake(
        address user,
        address token,
        uint256 amount,
        bytes calldata
    ) external nonReentrant {
        if (msg.sender != address(aiController)) revert OnlyAIController();
        if (!supportedStakingTokens[token]) revert TokenNotSupported();
        if (amount == 0) revert InvalidAmount();
        
        uint256 stakeValueUSD = amount * 2500;
        if (!collateralManager.canStake(user, stakeValueUSD)) {
            revert InsufficientCollateral();
        }
        
        _executeStake(user, token, amount);
        
        emit StakeExecuted(user, token, amount, amount);
    }
    
    function _executeStake(address user, address token, uint256 amount) private {
        StakingPosition storage position = positions[user];
        
        // Calculate pending rewards before updating
        if (position.stakedAmount > 0) {
            uint256 pending = _calculatePendingRewards(user);
            position.accumulatedRewards += pending;
        }
        
        position.stakedAmount += amount;
        position.liquidTokenBalance += amount;
        position.lastRewardTime = block.timestamp;
        position.token = token;
        totalStaked += amount;
    }
    
    function requestUnstake(uint256 amount) external {
        StakingPosition storage position = positions[msg.sender];
        
        if (position.stakedAmount < amount) revert InsufficientStake();
        if (amount == 0) revert InvalidAmount();
        
        position.unstakeRequestTime = block.timestamp;
        position.unstakeAmount = amount;
        
        emit UnstakeRequested(msg.sender, amount, block.timestamp + UNSTAKE_DELAY);
    }
    
    function executeUnstake(uint256 amount) external nonReentrant {
        StakingPosition storage position = positions[msg.sender];
        
        if (position.unstakeRequestTime == 0) revert UnstakeNotRequested();
        if (block.timestamp < position.unstakeRequestTime + UNSTAKE_DELAY) {
            revert UnstakeDelayNotMet();
        }
        if (position.stakedAmount < amount) revert InsufficientStake();
        
        uint256 rewards = _calculatePendingRewards(msg.sender);
        uint256 totalRewards = position.accumulatedRewards + rewards;
        
        uint256 protocolFee = (totalRewards * protocolFeeRate) / BASIS_POINTS;
        uint256 userRewards = totalRewards - protocolFee;
        
        position.stakedAmount -= amount;
        position.liquidTokenBalance -= amount;
        position.accumulatedRewards = 0;
        position.lastRewardTime = block.timestamp;
        position.unstakeRequestTime = 0;
        position.unstakeAmount = 0;
        
        totalStaked -= amount;
        totalRewardsDistributed += userRewards;
        
        // Transfer staked amount + rewards back to user
        // In production, would transfer actual tokens
        
        emit UnstakeExecuted(msg.sender, amount, userRewards);
    }
    
    function _calculatePendingRewards(address user) private view returns (uint256) {
        StakingPosition storage position = positions[user];
        
        if (position.stakedAmount == 0) return 0;
        
        uint256 timeStaked = block.timestamp - position.lastRewardTime;
        uint256 annualReward = (position.stakedAmount * baseAnnualRewardRate) / BASIS_POINTS;
        uint256 reward = (annualReward * timeStaked) / SECONDS_PER_YEAR;
        
        return reward;
    }
    
    function getStakingInfo(
        address user
    ) external view returns (
        uint256 stakedAmount,
        uint256 pendingRewards,
        uint256 liquidBalance,
        uint256 collateralValue,
        bool isHealthy,
        bool canUnstake
    ) {
        StakingPosition storage position = positions[user];
        uint256 pending = _calculatePendingRewards(user);
        uint256 collateral = collateralManager.getCollateralValue(user);
        
        uint256 stakeValueUSD = position.stakedAmount * 2500;
        bool healthy = !collateralManager.canLiquidate(user, stakeValueUSD);
        bool unstakeReady = position.unstakeRequestTime > 0 && 
                           block.timestamp >= position.unstakeRequestTime + UNSTAKE_DELAY;
        
        return (
            position.stakedAmount,
            pending + position.accumulatedRewards,
            position.liquidTokenBalance,
            collateral,
            healthy,
            unstakeReady
        );
    }
    
    function getLiquidStakingBalance(
        address user,
        address
    ) external view returns (uint256) {
        return positions[user].liquidTokenBalance;
    }
    
    function getProtocolStats() external view returns (
        uint256 totalValueLocked,
        uint256 totalRewards,
        uint256 activeStakers,
        uint256 supportedTokensCount
    ) {
        return (totalStaked, totalRewardsDistributed, 0, 0);
    }
    
    function setSupportedStakingToken(address token, bool supported) external onlyOwner {
        supportedStakingTokens[token] = supported;
        emit StakingTokenAdded(token, supported);
    }
    
    function updateBaseRewardRate(uint16 newRate) external onlyOwner {
        if (newRate == 0 || newRate > 2000) revert InvalidRewardRate(); // Max 20% APY
        
        uint16 oldRate = baseAnnualRewardRate;
        baseAnnualRewardRate = newRate;
        
        emit RewardRateUpdated(oldRate, newRate);
    }
    
    function updateProtocolFeeRate(uint16 newRate) external onlyOwner {
        require(newRate <= 1000, "Fee rate too high"); // Max 10%
        protocolFeeRate = newRate;
    }
    
    function emergencyWithdraw(
        address token,
        uint256 amount,
        address recipient
    ) external onlyOwner {
        IERC20(token).safeTransfer(recipient, amount);
    }
}
