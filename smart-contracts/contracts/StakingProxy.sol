// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./CollateralManager.sol";
import "./AIAgentController.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title StakingProxy
 * @dev Handles cross-chain staking operations with AI agent integration
 * Prize Compliance: Avail Nexus SDK Prize - Bridge & Execute integration
 * ETHOnline 2025 - Cross-Chain AI Staking MVP
 */
contract StakingProxy is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    CollateralManager public immutable collateralManager;
    AIAgentController public immutable aiController;

    struct StakingPosition {
        uint256 stakedAmount;
        address stakingToken;
        uint256 startTime;
        uint256 lastRewardUpdate;
        uint256 accumulatedRewards;
        uint256 rewardRate; // Custom rate per user based on risk
        bool isActive;
        uint256 unstakeRequestTime;
        bool unstakeRequested;
    }

    mapping(address => StakingPosition) public stakingPositions;
    mapping(address => bool) public supportedStakingTokens;
    mapping(address => uint256) public totalStakedPerToken;

    // Liquid staking token (simplified - in production would be separate contract)
    mapping(address => mapping(address => uint256))
        public liquidStakingBalances; // user => token => balance

    // Staking parameters
    uint256 public baseAnnualRewardRate = 500; // 5% APY in basis points
    uint256 public constant SECONDS_PER_YEAR = 365 days;
    uint256 public constant BASIS_POINTS = 10000;
    uint256 public constant UNSTAKE_DELAY = 7 days; // Unstaking delay

    // Protocol parameters
    uint256 public totalProtocolRewards;
    uint256 public protocolFeeRate = 100; // 1% of rewards
    address public protocolTreasury;

    // Events
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
    event RewardsClaimed(address indexed user, uint256 rewards);
    event UnstakeRequested(
        address indexed user,
        uint256 amount,
        uint256 availableTime
    );
    event UnstakeExecuted(
        address indexed user,
        uint256 amount,
        uint256 rewards
    );
    event StakingTokenAdded(address indexed token, bool supported);
    event RewardRateUpdated(uint256 oldRate, uint256 newRate);

    error TokenNotSupported();
    error InvalidAmount();
    error InsufficientCollateral();
    error InsufficientStake();
    error UnstakeNotRequested();
    error UnstakeDelayNotMet();
    error InvalidRewardRate();
    error OnlyAIController();
    error StakeNotActive();

    modifier onlyAIController() {
        if (msg.sender != address(aiController)) revert OnlyAIController();
        _;
    }

    constructor(
        address _collateralManager,
        address _aiController,
        address _protocolTreasury
    ) Ownable(msg.sender) {
        if (
            _collateralManager == address(0) ||
            _aiController == address(0) ||
            _protocolTreasury == address(0)
        ) {
            revert InvalidAmount();
        }

        collateralManager = CollateralManager(_collateralManager);
        aiController = AIAgentController(payable(_aiController));
        protocolTreasury = _protocolTreasury;
    }

    /**
     * @dev Execute cross-chain stake (called by Avail Nexus Bridge & Execute)
     * This function is called when assets are bridged from another chain
     * Prize Compliance: Avail Nexus SDK Prize requirement
     */
    function executeStakeAfterBridge(
        address user,
        address token,
        uint256 amount,
        uint256 sourceChainId,
        bytes32 bridgeId
    ) external nonReentrant {
        if (!supportedStakingTokens[token]) revert TokenNotSupported();
        if (amount == 0) revert InvalidAmount();

        // Verify sufficient collateral
        uint256 stakeValueUSD = _calculateStakeValueUSD(token, amount);
        if (!collateralManager.canStake(user, stakeValueUSD)) {
            revert InsufficientCollateral();
        }

        // Update or create staking position
        _updateStakingPosition(user, token, amount);

        // Issue liquid staking tokens (1:1 ratio simplified)
        liquidStakingBalances[user][token] += amount;

        // Update total staked
        totalStakedPerToken[token] += amount;

        emit CrossChainStakeExecuted(
            user,
            token,
            amount,
            sourceChainId,
            bridgeId
        );
    }

    /**
     * @dev Stake with existing collateral (local chain operation)
     */
    function stakeWithCollateral(
        address token,
        uint256 amount
    ) external nonReentrant returns (uint256 liquidTokens) {
        if (!supportedStakingTokens[token]) revert TokenNotSupported();
        if (amount == 0) revert InvalidAmount();

        // Check collateral requirements
        uint256 stakeValueUSD = _calculateStakeValueUSD(token, amount);
        if (!collateralManager.canStake(msg.sender, stakeValueUSD)) {
            revert InsufficientCollateral();
        }

        // Transfer tokens from user
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        // Update staking position
        _updateStakingPosition(msg.sender, token, amount);

        // Issue liquid staking tokens
        liquidTokens = amount; // 1:1 simplified
        liquidStakingBalances[msg.sender][token] += liquidTokens;

        // Update total staked
        totalStakedPerToken[token] += amount;

        emit StakeExecuted(msg.sender, token, amount, liquidTokens);
        return liquidTokens;
    }

    /**
     * @dev AI Agent controlled staking (requires authorization)
     */
    function aiControlledStake(
        address user,
        address token,
        uint256 amount,
        bytes calldata agentData
    ) external onlyAIController nonReentrant returns (uint256) {
        if (!supportedStakingTokens[token]) revert TokenNotSupported();
        if (amount == 0) revert InvalidAmount();

        // Verify collateral through CollateralManager
        uint256 stakeValueUSD = _calculateStakeValueUSD(token, amount);
        if (!collateralManager.canStake(user, stakeValueUSD)) {
            revert InsufficientCollateral();
        }

        // Transfer tokens (assuming they're already in this contract from bridge)
        // In production, this would have more sophisticated token handling

        // Update position with potentially custom reward rate based on AI analysis
        _updateStakingPositionWithCustomRate(user, token, amount, agentData);

        // Issue liquid tokens
        uint256 liquidTokens = amount;
        liquidStakingBalances[user][token] += liquidTokens;
        totalStakedPerToken[token] += amount;

        emit StakeExecuted(user, token, amount, liquidTokens);
        return liquidTokens;
    }

    /**
     * @dev Request unstaking (begins cooldown period)
     */
    function requestUnstake(uint256 amount) external nonReentrant {
        StakingPosition storage position = stakingPositions[msg.sender];
        if (!position.isActive) revert StakeNotActive();
        if (position.stakedAmount < amount) revert InsufficientStake();

        // Update rewards before unstaking
        _updateRewards(msg.sender);

        position.unstakeRequested = true;
        position.unstakeRequestTime = block.timestamp;

        emit UnstakeRequested(
            msg.sender,
            amount,
            block.timestamp + UNSTAKE_DELAY
        );
    }

    /**
     * @dev Execute unstaking (after cooldown period)
     */
    function executeUnstake(uint256 amount) external nonReentrant {
        StakingPosition storage position = stakingPositions[msg.sender];

        if (!position.unstakeRequested) revert UnstakeNotRequested();
        if (block.timestamp < position.unstakeRequestTime + UNSTAKE_DELAY) {
            revert UnstakeDelayNotMet();
        }
        if (position.stakedAmount < amount) revert InsufficientStake();

        // Update rewards
        _updateRewards(msg.sender);

        uint256 rewards = position.accumulatedRewards;
        uint256 protocolFee = (rewards * protocolFeeRate) / BASIS_POINTS;
        uint256 userRewards = rewards - protocolFee;

        // Update position
        position.stakedAmount -= amount;
        position.accumulatedRewards = 0;
        position.unstakeRequested = false;

        if (position.stakedAmount == 0) {
            position.isActive = false;
        }

        // Burn liquid tokens
        liquidStakingBalances[msg.sender][position.stakingToken] -= amount;
        totalStakedPerToken[position.stakingToken] -= amount;

        // Transfer tokens back to user
        IERC20(position.stakingToken).safeTransfer(msg.sender, amount);

        // Distribute rewards
        if (userRewards > 0) {
            IERC20(position.stakingToken).safeTransfer(msg.sender, userRewards);
        }
        if (protocolFee > 0) {
            IERC20(position.stakingToken).safeTransfer(
                protocolTreasury,
                protocolFee
            );
            totalProtocolRewards += protocolFee;
        }

        emit UnstakeExecuted(msg.sender, amount, userRewards);
    }

    /**
     * @dev Update staking position with rewards calculation
     */
    function _updateStakingPosition(
        address user,
        address token,
        uint256 amount
    ) internal {
        StakingPosition storage position = stakingPositions[user];

        if (position.isActive) {
            _updateRewards(user);
            position.stakedAmount += amount;
        } else {
            position.stakedAmount = amount;
            position.stakingToken = token;
            position.startTime = block.timestamp;
            position.isActive = true;
            position.rewardRate = baseAnnualRewardRate; // Default rate
        }

        position.lastRewardUpdate = block.timestamp;
    }

    /**
     * @dev Update staking position with custom reward rate (AI-optimized)
     */
    function _updateStakingPositionWithCustomRate(
        address user,
        address token,
        uint256 amount,
        bytes calldata agentData
    ) internal {
        StakingPosition storage position = stakingPositions[user];

        // Decode AI agent data to get custom reward rate
        uint256 customRate = baseAnnualRewardRate;
        if (agentData.length >= 32) {
            customRate = abi.decode(agentData, (uint256));
            // Validate rate (max 20% APY)
            if (customRate > 2000) customRate = 2000;
            if (customRate < 100) customRate = 100;
        }

        if (position.isActive) {
            _updateRewards(user);
            position.stakedAmount += amount;
        } else {
            position.stakedAmount = amount;
            position.stakingToken = token;
            position.startTime = block.timestamp;
            position.isActive = true;
        }

        position.rewardRate = customRate;
        position.lastRewardUpdate = block.timestamp;
    }

    /**
     * @dev Calculate and update pending rewards for a user
     */
    function _updateRewards(address user) internal {
        StakingPosition storage position = stakingPositions[user];
        if (!position.isActive) return;

        uint256 timeStaked = block.timestamp - position.lastRewardUpdate;
        uint256 rewards = (position.stakedAmount *
            position.rewardRate *
            timeStaked) / (BASIS_POINTS * SECONDS_PER_YEAR);

        position.accumulatedRewards += rewards;
        position.lastRewardUpdate = block.timestamp;
    }

    /**
     * @dev Calculate USD value of stake (simplified)
     */
    function _calculateStakeValueUSD(
        address token,
        uint256 amount
    ) internal pure returns (uint256) {
        // Simplified calculation for MVP
        // In production, would integrate with Pyth price feeds

        // Mock prices for demo
        if (
            token == 0x6c3ea9036406852006290770BEdFcAbA0e23A0e8 || // PYUSD mainnet
            token == 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238
        ) {
            // PYUSD sepolia
            return amount; // 1:1 USD for PYUSD
        }

        // Mock ETH price at $2000
        return amount * 2000;
    }

    /**
     * @dev Get staking information for user
     */
    function getStakingInfo(
        address user
    )
        external
        view
        returns (
            uint256 stakedAmount,
            uint256 pendingRewards,
            uint256 liquidTokenBalance,
            uint256 collateralValue,
            bool isHealthy,
            bool canUnstake
        )
    {
        StakingPosition memory position = stakingPositions[user];
        stakedAmount = position.stakedAmount;

        // Calculate pending rewards
        if (position.isActive) {
            uint256 timeStaked = block.timestamp - position.lastRewardUpdate;
            uint256 newRewards = (position.stakedAmount *
                position.rewardRate *
                timeStaked) / (BASIS_POINTS * SECONDS_PER_YEAR);
            pendingRewards = position.accumulatedRewards + newRewards;
        }

        liquidTokenBalance = liquidStakingBalances[user][position.stakingToken];
        collateralValue = collateralManager.getCollateralValue(user);

        uint256 stakeValueUSD = _calculateStakeValueUSD(
            position.stakingToken,
            stakedAmount
        );
        isHealthy = collateralManager.canStake(user, stakeValueUSD);

        canUnstake =
            position.unstakeRequested &&
            block.timestamp >= position.unstakeRequestTime + UNSTAKE_DELAY;
    }

    /**
     * @dev Get liquid staking token balance
     */
    function getLiquidStakingBalance(
        address user,
        address token
    ) external view returns (uint256) {
        return liquidStakingBalances[user][token];
    }

    /**
     * @dev Add/remove supported staking token
     */
    function setSupportedStakingToken(
        address token,
        bool supported
    ) external onlyOwner {
        supportedStakingTokens[token] = supported;
        emit StakingTokenAdded(token, supported);
    }

    /**
     * @dev Update base reward rate
     */
    function updateBaseRewardRate(uint256 newRate) external onlyOwner {
        if (newRate == 0 || newRate > 2000) revert InvalidRewardRate(); // Max 20%

        uint256 oldRate = baseAnnualRewardRate;
        baseAnnualRewardRate = newRate;

        emit RewardRateUpdated(oldRate, newRate);
    }

    /**
     * @dev Update protocol fee rate
     */
    function updateProtocolFeeRate(uint256 newRate) external onlyOwner {
        require(newRate <= 1000, "Fee rate too high"); // Max 10%
        protocolFeeRate = newRate;
    }

    /**
     * @dev Emergency withdrawal (owner only)
     */
    function emergencyWithdraw(
        address token,
        uint256 amount,
        address to
    ) external onlyOwner {
        IERC20(token).safeTransfer(to, amount);
    }

    /**
     * @dev Get total protocol stats
     */
    function getProtocolStats()
        external
        view
        returns (
            // uint256 totalValueLocked, 
            uint256 totalRewardsDistributed,
            // uint256 activeStakers,
            uint256 supportedTokenCount
        )
    {
        // Simplified implementation for MVP
        totalRewardsDistributed = totalProtocolRewards;

        // Count supported tokens
        // address[] memory tokens = new address[](10); // Max 10 for demo
        uint256 count = 0;

        // This would be more sophisticated in production
        supportedTokenCount = count;
    }
}
