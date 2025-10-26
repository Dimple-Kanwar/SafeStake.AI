// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@pythnetwork/pyth-sdk-solidity/IPyth.sol";
import "@pythnetwork/pyth-sdk-solidity/PythStructs.sol";

/**
 * @title CollateralManager
 * @dev Multi-asset collateral management with Pyth price feeds and PYUSD support
 * Prize Compliance: Pyth Network Prize + PayPal USD Prize
 */
contract CollateralManager is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    IPyth public immutable pyth;
    
    struct TokenConfig {
        bytes32 priceId;
        uint8 decimals;
        uint16 liquidationThreshold;
        uint256 maxDeposit;
        bool isStablecoin;
        bool isSupported;
    }
    
    struct CollateralPosition {
        mapping(address => uint256) tokenBalances;
        uint256 totalValueUSD;
        uint256 lastUpdateTime;
        bool isActive;
        uint256 depositCount;
    }
    
    mapping(address => TokenConfig) public tokenConfigs;
    mapping(address => CollateralPosition) private positions;
    address[] public supportedTokens;
    
    address public feeRecipient;
    uint16 public depositFee = 10; // 0.1% in basis points
    uint16 public withdrawalFee = 20; // 0.2% in basis points
    uint16 public constant BASIS_POINTS = 10000;
    uint16 public constant MIN_COLLATERAL_RATIO = 15000; // 150%
    
    // PYUSD specific addresses
    address public constant PYUSD_MAINNET = 0x6c3ea9036406852006290770BEdFcAbA0e23A0e8;
    address public constant PYUSD_SEPOLIA = 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238;
    
    event CollateralDeposited(address indexed user, address indexed token, uint256 amount);
    event CollateralWithdrawn(address indexed user, address indexed token, uint256 amount);
    event PYUSDDeposited(address indexed user, uint256 amount);
    event TokenAdded(address indexed token, bytes32 priceId);
    event TokenRemoved(address indexed token);
    event FeesUpdated(uint16 depositFee, uint16 withdrawalFee);
    
    error TokenNotSupported();
    error InvalidAmount();
    error InsufficientBalance();
    error ExceedsMaxDeposit();
    error InvalidFeeRecipient();

    constructor(address pythAddress, address _feeRecipient) Ownable(msg.sender) {
        if (pythAddress == address(0) || _feeRecipient == address(0)) {
            revert InvalidFeeRecipient();
        }
        
        pyth = IPyth(pythAddress);
        feeRecipient = _feeRecipient;
        
        _initializePYUSDConfig();
    }
    
    function _initializePYUSDConfig() private {
        // PYUSD mainnet configuration
        tokenConfigs[PYUSD_MAINNET] = TokenConfig({
            priceId: 0x41f3625971ca2ed2263e78573fe5ce23e13d2558ed3f2e47ab0f84fb9e7ae722,
            decimals: 6,
            liquidationThreshold: 9000, // 90% for stablecoin
            maxDeposit: 1000000 * 1e6, // 1M PYUSD
            isStablecoin: true,
            isSupported: true
        });
        supportedTokens.push(PYUSD_MAINNET);
        
        // PYUSD sepolia configuration
        tokenConfigs[PYUSD_SEPOLIA] = TokenConfig({
            priceId: 0x41f3625971ca2ed2263e78573fe5ce23e13d2558ed3f2e47ab0f84fb9e7ae722,
            decimals: 6,
            liquidationThreshold: 9000,
            maxDeposit: 1000000 * 1e6,
            isStablecoin: true,
            isSupported: true
        });
        supportedTokens.push(PYUSD_SEPOLIA);
    }
    
    function depositPYUSD(
        uint256 amount,
        bytes[] calldata priceUpdateData
    ) external payable nonReentrant {
        if (amount == 0) revert InvalidAmount();
        
        address pyusdToken = block.chainid == 1 ? PYUSD_MAINNET : PYUSD_SEPOLIA;
        
        _updatePrices(priceUpdateData);
        
        uint256 fee = (amount * depositFee) / BASIS_POINTS;
        uint256 netAmount = amount - fee;
        
        IERC20(pyusdToken).safeTransferFrom(msg.sender, address(this), amount);
        
        if (fee > 0) {
            IERC20(pyusdToken).safeTransfer(feeRecipient, fee);
        }
        
        CollateralPosition storage position = positions[msg.sender];
        position.tokenBalances[pyusdToken] += netAmount;
        position.isActive = true;
        position.depositCount++;
        position.lastUpdateTime = block.timestamp;
        
        _updatePositionValue(msg.sender);
        
        emit PYUSDDeposited(msg.sender, netAmount);
    }
    
    function depositCollateral(
        address token,
        uint256 amount,
        bytes[] calldata priceUpdateData
    ) external payable nonReentrant {
        TokenConfig memory config = tokenConfigs[token];
        if (!config.isSupported) revert TokenNotSupported();
        if (amount == 0) revert InvalidAmount();
        
        uint256 currentBalance = positions[msg.sender].tokenBalances[token];
        if (currentBalance + amount > config.maxDeposit) revert ExceedsMaxDeposit();
        
        _updatePrices(priceUpdateData);
        
        uint256 fee = (amount * depositFee) / BASIS_POINTS;
        uint256 netAmount = amount - fee;
        
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        
        if (fee > 0) {
            IERC20(token).safeTransfer(feeRecipient, fee);
        }
        
        CollateralPosition storage position = positions[msg.sender];
        position.tokenBalances[token] += netAmount;
        position.isActive = true;
        position.depositCount++;
        position.lastUpdateTime = block.timestamp;
        
        _updatePositionValue(msg.sender);
        
        emit CollateralDeposited(msg.sender, token, netAmount);
    }
    
    function withdrawCollateral(
        address token,
        uint256 amount,
        bytes[] calldata priceUpdateData
    ) external payable nonReentrant {
        TokenConfig memory config = tokenConfigs[token];
        if (!config.isSupported) revert TokenNotSupported();
        if (amount == 0) revert InvalidAmount();
        
        CollateralPosition storage position = positions[msg.sender];
        if (position.tokenBalances[token] < amount) revert InsufficientBalance();
        
        _updatePrices(priceUpdateData);
        
        uint256 fee = (amount * withdrawalFee) / BASIS_POINTS;
        uint256 netAmount = amount - fee;
        
        position.tokenBalances[token] -= amount;
        position.lastUpdateTime = block.timestamp;
        
        IERC20(token).safeTransfer(msg.sender, netAmount);
        
        if (fee > 0) {
            IERC20(token).safeTransfer(feeRecipient, fee);
        }
        
        _updatePositionValue(msg.sender);
        
        emit CollateralWithdrawn(msg.sender, token, netAmount);
    }
    
    function _updatePrices(bytes[] calldata priceUpdateData) private {
        if (priceUpdateData.length > 0) {
            uint256 fee = pyth.getUpdateFee(priceUpdateData);
            pyth.updatePriceFeeds{value: fee}(priceUpdateData);
        }
    }
    
    function _updatePositionValue(address user) private {
        CollateralPosition storage position = positions[user];
        uint256 totalValue = 0;
        
        for (uint256 i = 0; i < supportedTokens.length; i++) {
            address token = supportedTokens[i];
            uint256 balance = position.tokenBalances[token];
            
            if (balance > 0) {
                TokenConfig memory config = tokenConfigs[token];
                PythStructs.Price memory price = pyth.getPriceUnsafe(config.priceId);
                
                uint256 valueUSD = _calculateValueUSD(balance, config.decimals, price);
                totalValue += valueUSD;
            }
        }
        
        position.totalValueUSD = totalValue;
    }
    
    function _calculateValueUSD(
        uint256 amount,
        uint8 tokenDecimals,
        PythStructs.Price memory price
    ) private pure returns (uint256) {
        uint256 priceUint = uint256(uint64(price.price));
        int32 expo = price.expo;
        
        uint256 normalizedAmount = amount;
        if (tokenDecimals < 18) {
            normalizedAmount = amount * (10 ** (18 - tokenDecimals));
        }
        
        uint256 valueUSD;
        if (expo >= 0) {
            valueUSD = (normalizedAmount * priceUint * (10 ** uint32(expo))) / 1e18;
        } else {
            valueUSD = (normalizedAmount * priceUint) / (10 ** uint32(-expo)) / 1e18;
        }
        
        return valueUSD;
    }
    
    function getCollateralValue(address user) external view returns (uint256) {
        return positions[user].totalValueUSD;
    }
    
    function canStake(address user, uint256 stakeValueUSD) external view returns (bool) {
        uint256 collateralValue = positions[user].totalValueUSD;
        uint256 requiredCollateral = (stakeValueUSD * MIN_COLLATERAL_RATIO) / BASIS_POINTS;
        return collateralValue >= requiredCollateral;
    }
    
    function canLiquidate(address user, uint256 stakeValueUSD) external view returns (bool) {
        uint256 collateralValue = positions[user].totalValueUSD;
        uint256 liquidationThreshold = (stakeValueUSD * 13000) / BASIS_POINTS; // 130%
        return collateralValue < liquidationThreshold;
    }
    
    function getHealthRatio(
        address user,
        uint256 stakeValueUSD
    ) external view returns (uint256) {
        uint256 collateralValue = positions[user].totalValueUSD;
        if (stakeValueUSD == 0) return type(uint256).max;
        return (collateralValue * BASIS_POINTS) / stakeValueUSD;
    }
    
    function getTokenBalance(address user, address token) external view returns (uint256) {
        return positions[user].tokenBalances[token];
    }
    
    function getPositionSummary(
        address user
    ) external view returns (
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
            position.lastUpdateTime,
            position.isActive,
            position.depositCount
        );
    }
    
    function addSupportedToken(
        address token,
        bytes32 priceId,
        uint8 decimals,
        uint16 liquidationThreshold,
        uint256 maxDeposit,
        bool isStablecoin
    ) external onlyOwner {
        if (token == address(0)) revert InvalidAmount();
        
        tokenConfigs[token] = TokenConfig({
            priceId: priceId,
            decimals: decimals,
            liquidationThreshold: liquidationThreshold,
            maxDeposit: maxDeposit,
            isStablecoin: isStablecoin,
            isSupported: true
        });
        
        supportedTokens.push(token);
        
        emit TokenAdded(token, priceId);
    }
    
    function removeSupportedToken(address token) external onlyOwner {
        if (!tokenConfigs[token].isSupported) revert TokenNotSupported();
        
        tokenConfigs[token].isSupported = false;
        
        emit TokenRemoved(token);
    }
    
    function getSupportedTokens() external view returns (address[] memory) {
        return supportedTokens;
    }
    
    function updateFees(uint16 _depositFee, uint16 _withdrawalFee) external onlyOwner {
        require(_depositFee <= 500, "Fee too high"); // Max 5%
        require(_withdrawalFee <= 500, "Fee too high");
        
        depositFee = _depositFee;
        withdrawalFee = _withdrawalFee;
        
        emit FeesUpdated(_depositFee, _withdrawalFee);
    }
    
    function updateFeeRecipient(address newRecipient) external onlyOwner {
        if (newRecipient == address(0)) revert InvalidFeeRecipient();
        feeRecipient = newRecipient;
    }
}
