// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@pythnetwork/pyth-sdk-solidity/IPyth.sol";
import "@pythnetwork/pyth-sdk-solidity/PythStructs.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title CollateralManager
 * @dev Manages multi-chain collateral with PYUSD integration and Pyth price feeds
 * Prize Compliance: PayPal USD Prize, Pyth Network Prize
 * ETHOnline 2025 - Cross-Chain AI Staking MVP
 */
contract CollateralManager is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;
    
    IPyth public immutable pyth;
    
    // PayPal USD token addresses (mainnet and testnet)
    address public constant PYUSD_MAINNET = 0x6c3ea9036406852006290770BEdFcAbA0e23A0e8;
    address public constant PYUSD_SEPOLIA = 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238; // Testnet
    
    struct CollateralPosition {
        mapping(address => uint256) tokenBalances;
        uint256 totalValueUSD; // 8 decimal precision to match Pyth
        uint256 lastPriceUpdate;
        bool isActive;
        uint256 depositCount; // Track number of deposits
    }
    
    struct TokenConfig {
        bytes32 pythPriceId;
        uint8 decimals;
        bool isSupported;
        uint256 liquidationThreshold; // In basis points (e.g., 8000 = 80%)
        uint256 maxDepositAmount; // Maximum deposit amount per transaction
        bool isStablecoin; // Flag for stablecoin handling
    }
    
    mapping(address => CollateralPosition) public positions;
    mapping(address => TokenConfig) public tokenConfigs;
    address[] public supportedTokens;
    
    // Risk parameters
    uint256 public constant COLLATERAL_RATIO = 15000; // 150% (basis points)
    uint256 public constant LIQUIDATION_THRESHOLD = 13000; // 130% (basis points)
    uint256 public constant BASIS_POINTS = 10000;
    uint256 public constant PRICE_PRECISION = 1e8; // Pyth uses 8 decimals
    uint256 public constant STALE_PRICE_THRESHOLD = 3600; // 1 hour
    
    // Protocol fees
    uint256 public depositFee = 10; // 0.1% in basis points
    uint256 public withdrawalFee = 20; // 0.2% in basis points
    address public feeRecipient;
    
    event CollateralDeposited(
        address indexed user, 
        address indexed token, 
        uint256 amount,
        uint256 usdValue
    );
    event CollateralWithdrawn(
        address indexed user, 
        address indexed token, 
        uint256 amount,
        uint256 usdValue
    );
    event PYUSDDeposited(address indexed user, uint256 amount);
    event PricesUpdated(uint256 timestamp, uint256 feedCount);
    event TokenAdded(address indexed token, bytes32 priceId);
    event TokenRemoved(address indexed token);
    event PositionLiquidated(address indexed user, uint256 deficit);
    event FeesUpdated(uint256 depositFee, uint256 withdrawalFee);
    
    error TokenNotSupported();
    error InvalidAmount();
    error InsufficientCollateral();
    error StalePrice();
    error ExceedsMaxDeposit();
    error InvalidPriceUpdate();
    error InsufficientBalance();
    error InvalidFeeRecipient();
    
    constructor(address _pyth, address _feeRecipient) Ownable(msg.sender) {
        if (_pyth == address(0) || _feeRecipient == address(0)) {
            revert InvalidFeeRecipient();
        }
        
        pyth = IPyth(_pyth);
        feeRecipient = _feeRecipient;
        
        // Initialize PYUSD configuration for both mainnet and testnet
        _addSupportedToken(
            PYUSD_MAINNET,
            0x41f3625971ca2ed2263e78573fe5ce23e13d2558ed3f2e47ab0f84fb9e7ae722, // PYUSD/USD price ID
            6, // PYUSD has 6 decimals
            9500, // 95% liquidation threshold for stablecoin
            1000000e6, // 1M PYUSD max deposit
            true // is stablecoin
        );
        
        _addSupportedToken(
            PYUSD_SEPOLIA,
            0x41f3625971ca2ed2263e78573fe5ce23e13d2558ed3f2e47ab0f84fb9e7ae722, // Same price ID
            6,
            9500,
            1000000e6,
            true
        );
    }
    
    /**
     * @dev Deposit PYUSD as stable collateral (PayPal USD Prize requirement)
     */
    function depositPYUSD(
        uint256 amount, 
        bytes[] calldata priceUpdateData
    ) external payable nonReentrant {
        if (amount == 0) revert InvalidAmount();
        
        address pyusdToken = _getPYUSDAddress();
        if (!tokenConfigs[pyusdToken].isSupported) revert TokenNotSupported();
        
        // Update prices first
        _updatePrices(priceUpdateData);
        
        // Check max deposit limit
        if (amount > tokenConfigs[pyusdToken].maxDepositAmount) {
            revert ExceedsMaxDeposit();
        }
        
        // Calculate and collect deposit fee
        uint256 fee = (amount * depositFee) / BASIS_POINTS;
        uint256 netAmount = amount - fee;
        
        // Transfer PYUSD tokens
        IERC20(pyusdToken).safeTransferFrom(msg.sender, address(this), amount);
        
        // Transfer fee to recipient
        if (fee > 0) {
            IERC20(pyusdToken).safeTransfer(feeRecipient, fee);
        }
        
        // Update position
        positions[msg.sender].tokenBalances[pyusdToken] += netAmount;
        positions[msg.sender].isActive = true;
        positions[msg.sender].depositCount++;
        
        uint256 usdValue = _updatePositionValue(msg.sender);
        
        emit PYUSDDeposited(msg.sender, netAmount);
        emit CollateralDeposited(msg.sender, pyusdToken, netAmount, usdValue);
    }
    
    /**
     * @dev Deposit any supported collateral token
     */
    function depositCollateral(
        address token,
        uint256 amount,
        bytes[] calldata priceUpdateData
    ) external payable nonReentrant {
        if (!tokenConfigs[token].isSupported) revert TokenNotSupported();
        if (amount == 0) revert InvalidAmount();
        if (amount > tokenConfigs[token].maxDepositAmount) {
            revert ExceedsMaxDeposit();
        }
        
        // Update prices using Pyth (Pyth Network Prize requirement)
        _updatePrices(priceUpdateData);
        
        // Calculate and collect deposit fee
        uint256 fee = (amount * depositFee) / BASIS_POINTS;
        uint256 netAmount = amount - fee;
        
        // Transfer tokens
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        
        // Transfer fee to recipient
        if (fee > 0) {
            IERC20(token).safeTransfer(feeRecipient, fee);
        }
        
        // Update position
        positions[msg.sender].tokenBalances[token] += netAmount;
        positions[msg.sender].isActive = true;
        positions[msg.sender].depositCount++;
        
        uint256 usdValue = _updatePositionValue(msg.sender);
        
        emit CollateralDeposited(msg.sender, token, netAmount, usdValue);
    }
    
    /**
     * @dev Withdraw collateral tokens
     */
    function withdrawCollateral(
        address token,
        uint256 amount,
        bytes[] calldata priceUpdateData
    ) external payable nonReentrant {
        if (!tokenConfigs[token].isSupported) revert TokenNotSupported();
        if (amount == 0) revert InvalidAmount();
        
        CollateralPosition storage position = positions[msg.sender];
        if (position.tokenBalances[token] < amount) revert InsufficientBalance();
        
        // Update prices first
        _updatePrices(priceUpdateData);
        
        // Calculate withdrawal fee
        uint256 fee = (amount * withdrawalFee) / BASIS_POINTS;
        uint256 netAmount = amount - fee;
        
        // Update position
        position.tokenBalances[token] -= amount;
        
        uint256 usdValue = _updatePositionValue(msg.sender);
        
        // Transfer tokens to user (net of fee)
        IERC20(token).safeTransfer(msg.sender, netAmount);
        
        // Transfer fee to recipient
        if (fee > 0) {
            IERC20(token).safeTransfer(feeRecipient, fee);
        }
        
        emit CollateralWithdrawn(msg.sender, token, netAmount, usdValue);
    }
    
    /**
     * @dev Update prices using Pyth Network (Pull method as per prize requirement)
     */
    function _updatePrices(bytes[] calldata priceUpdateData) internal {
        if (priceUpdateData.length == 0) return;
        
        uint256 fee = pyth.getUpdateFee(priceUpdateData);
        if (msg.value < fee) revert InvalidPriceUpdate();
        
        try pyth.updatePriceFeeds{value: fee}(priceUpdateData) {
            emit PricesUpdated(block.timestamp, priceUpdateData.length);
        } catch {
            revert InvalidPriceUpdate();
        }
        
        // Refund excess ETH
        if (msg.value > fee) {
            payable(msg.sender).transfer(msg.value - fee);
        }
    }
    
    /**
     * @dev Update total USD value of user's collateral position
     */
    function _updatePositionValue(address user) internal returns (uint256) {
        CollateralPosition storage position = positions[user];
        uint256 totalValue = 0;
        
        for (uint256 i = 0; i < supportedTokens.length; i++) {
            address token = supportedTokens[i];
            uint256 balance = position.tokenBalances[token];
            
            if (balance > 0) {
                TokenConfig memory config = tokenConfigs[token];
                uint256 tokenValue;
                
                if (config.isStablecoin) {
                    // For stablecoins, assume 1:1 USD parity with small discount for safety
                    tokenValue = (balance * 99 * PRICE_PRECISION) / (100 * (10 ** config.decimals));
                } else {
                    // Get price from Pyth for non-stablecoins
                    PythStructs.Price memory price = pyth.getPrice(config.pythPriceId);
                    
                    if (price.price <= 0) revert InvalidPriceUpdate();
                    if (block.timestamp > price.publishTime + STALE_PRICE_THRESHOLD) {
                        revert StalePrice();
                    }
                    
                    // Calculate USD value with proper decimal handling
                    uint256 priceUint = uint256(int256(price.price));
                    
                    if (price.expo >= 0) {
                        tokenValue = (balance * priceUint * (10 ** uint32(price.expo))) / 
                                   (10 ** config.decimals);
                    } else {
                        tokenValue = (balance * priceUint) / 
                                   ((10 ** config.decimals) * (10 ** uint32(-price.expo)));
                    }
                }
                
                totalValue += tokenValue;
            }
        }
        
        position.totalValueUSD = totalValue;
        position.lastPriceUpdate = block.timestamp;
        
        return totalValue;
    }
    
    /**
     * @dev Check if position can support additional staking
     */
    function canStake(address user, uint256 stakeValueUSD) external view returns (bool) {
        uint256 collateralValue = getCollateralValue(user);
        return (collateralValue * BASIS_POINTS) >= (stakeValueUSD * COLLATERAL_RATIO);
    }
    
    /**
     * @dev Get total collateral value in USD
     */
    function getCollateralValue(address user) public view returns (uint256) {
        return positions[user].totalValueUSD;
    }
    
    /**
     * @dev Get token balance for user
     */
    function getTokenBalance(address user, address token) external view returns (uint256) {
        return positions[user].tokenBalances[token];
    }
    
    /**
     * @dev Check if position is eligible for liquidation
     */
    function canLiquidate(address user, uint256 stakeValueUSD) external view returns (bool) {
        uint256 collateralValue = getCollateralValue(user);
        return (collateralValue * BASIS_POINTS) < (stakeValueUSD * LIQUIDATION_THRESHOLD);
    }
    
    /**
     * @dev Get health ratio (collateral value / stake value * 100)
     */
    function getHealthRatio(address user, uint256 stakeValueUSD) external view returns (uint256) {
        if (stakeValueUSD == 0) return type(uint256).max;
        uint256 collateralValue = getCollateralValue(user);
        return (collateralValue * BASIS_POINTS) / stakeValueUSD;
    }
    
    /**
     * @dev Add new supported token (owner only)
     */
    function _addSupportedToken(
        address token,
        bytes32 pythPriceId,
        uint8 decimals,
        uint256 liquidationThreshold,
        uint256 maxDepositAmount,
        bool isStablecoin
    ) internal {
        if (tokenConfigs[token].isSupported) return; // Skip if already added
        
        tokenConfigs[token] = TokenConfig({
            pythPriceId: pythPriceId,
            decimals: decimals,
            isSupported: true,
            liquidationThreshold: liquidationThreshold,
            maxDepositAmount: maxDepositAmount,
            isStablecoin: isStablecoin
        });
        
        supportedTokens.push(token);
        emit TokenAdded(token, pythPriceId);
    }
    
    /**
     * @dev Add supported token (external function)
     */
    function addSupportedToken(
        address token,
        bytes32 pythPriceId,
        uint8 decimals,
        uint256 liquidationThreshold,
        uint256 maxDepositAmount,
        bool isStablecoin
    ) external onlyOwner {
        _addSupportedToken(
            token, 
            pythPriceId, 
            decimals, 
            liquidationThreshold, 
            maxDepositAmount,
            isStablecoin
        );
    }
    
    /**
     * @dev Remove supported token
     */
    function removeSupportedToken(address token) external onlyOwner {
        if (!tokenConfigs[token].isSupported) revert TokenNotSupported();
        
        tokenConfigs[token].isSupported = false;
        
        // Remove from array
        for (uint256 i = 0; i < supportedTokens.length; i++) {
            if (supportedTokens[i] == token) {
                supportedTokens[i] = supportedTokens[supportedTokens.length - 1];
                supportedTokens.pop();
                break;
            }
        }
        
        emit TokenRemoved(token);
    }
    
    /**
     * @dev Update fees
     */
    function updateFees(
        uint256 _depositFee, 
        uint256 _withdrawalFee
    ) external onlyOwner {
        require(_depositFee <= 500 && _withdrawalFee <= 500, "Fee too high"); // Max 5%
        depositFee = _depositFee;
        withdrawalFee = _withdrawalFee;
        emit FeesUpdated(_depositFee, _withdrawalFee);
    }
    
    /**
     * @dev Update fee recipient
     */
    function updateFeeRecipient(address _feeRecipient) external onlyOwner {
        if (_feeRecipient == address(0)) revert InvalidFeeRecipient();
        feeRecipient = _feeRecipient;
    }
    
    /**
     * @dev Get PYUSD address based on chain
     */
    function _getPYUSDAddress() internal view returns (address) {
        if (block.chainid == 1) return PYUSD_MAINNET;
        if (block.chainid == 11155111) return PYUSD_SEPOLIA;
        return PYUSD_SEPOLIA; // Default to testnet
    }
    
    /**
     * @dev Get supported tokens list
     */
    function getSupportedTokens() external view returns (address[] memory) {
        return supportedTokens;
    }
    
    /**
     * @dev Get position summary
     */
    function getPositionSummary(address user) external view returns (
        uint256 totalValueUSD,
        uint256 tokenCount,
        uint256 lastUpdate,
        bool isActive,
        uint256 deposits
    ) {
        CollateralPosition storage position = positions[user];
        
        uint256 count = 0;
        for (uint256 i = 0; i < supportedTokens.length; i++) {
            if (position.tokenBalances[supportedTokens[i]] > 0) {
                count++;
            }
        }
        
        return (
            position.totalValueUSD,
            count,
            position.lastPriceUpdate,
            position.isActive,
            position.depositCount
        );
    }
}