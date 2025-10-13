// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./StakingProxy.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title BridgeCoordinator
 * @dev Coordinates with Avail Nexus SDK for cross-chain operations
 * Prize Compliance: Avail Nexus SDK Prize - Bridge & Execute coordination
 * ETHOnline 2025 - Cross-Chain AI Staking MVP
 */
contract BridgeCoordinator is ReentrancyGuard, Ownable {
    StakingProxy public immutable stakingProxy;
    
    struct BridgeOperation {
        address user;
        address sourceToken;
        address targetToken;
        uint256 amount;
        uint256 sourceChainId;
        uint256 targetChainId;
        uint256 timestamp;
        bool completed;
        bool cancelled;
        bytes32 nexusTxHash;
        bytes32 agentRequestId; // Link to AI agent request
        uint256 estimatedGas;
        uint256 bridgeFee;
    }
    
    struct ChainConfig {
        bool isSupported;
        uint256 minBridgeAmount;
        uint256 maxBridgeAmount;
        uint256 estimatedExecutionTime; // in seconds
        address[] supportedTokens;
    }
    
    mapping(bytes32 => BridgeOperation) public bridgeOperations;
    mapping(address => bytes32[]) public userOperations;
    mapping(uint256 => ChainConfig) public chainConfigs;
    mapping(bytes32 => bool) public processedNexusTxs; // Prevent replay
    
    // Cross-chain operation fees
    uint256 public bridgeServiceFee = 50; // 0.5% in basis points
    uint256 public constant BASIS_POINTS = 10000;
    address public feeRecipient;
    
    // Rate limiting
    mapping(address => uint256) public lastBridgeTime;
    uint256 public constant MIN_BRIDGE_INTERVAL = 300; // 5 minutes
    
    event BridgeOperationInitiated(
        bytes32 indexed operationId,
        address indexed user,
        uint256 sourceChainId,
        uint256 targetChainId,
        uint256 amount
    );
    event BridgeOperationCompleted(
        bytes32 indexed operationId, 
        bool success,
        bytes32 nexusTxHash
    );
    event BridgeOperationCancelled(bytes32 indexed operationId, address indexed user);
    event ChainConfigUpdated(uint256 indexed chainId, bool isSupported);
    event NexusCallbackReceived(
        bytes32 indexed operationId,
        address indexed user,
        uint256 amount,
        bool success
    );
    
    error ChainNotSupported();
    error InvalidAmount();
    error OperationNotFound();
    error AlreadyCompleted();
    error Unauthorized();
    error BridgeRateLimit();
    error InvalidChainConfig();
    error NexusTxAlreadyProcessed();
    
    modifier validChain(uint256 chainId) {
        if (!chainConfigs[chainId].isSupported) revert ChainNotSupported();
        _;
    }
    
    modifier rateLimited() {
        if (block.timestamp < lastBridgeTime[msg.sender] + MIN_BRIDGE_INTERVAL) {
            revert BridgeRateLimit();
        }
        _;
    }
    
    constructor(address _stakingProxy, address _feeRecipient) Ownable(msg.sender) {
        if (_stakingProxy == address(0) || _feeRecipient == address(0)) {
            revert InvalidAmount();
        }
        
        stakingProxy = StakingProxy(_stakingProxy);
        feeRecipient = _feeRecipient;
        
        // Initialize supported chains for ETHOnline demo
        _initializeChainConfigs();
    }
    
    /**
     * @dev Initialize chain configurations for common testnets
     */
    function _initializeChainConfigs() internal {
        // Ethereum Sepolia
        chainConfigs[11155111] = ChainConfig({
            isSupported: true,
            minBridgeAmount: 0.001 ether,
            maxBridgeAmount: 100 ether,
            estimatedExecutionTime: 300, // 5 minutes
            supportedTokens: new address[](0)
        });
        
        // Polygon Mumbai / Amoy
        chainConfigs[80002] = ChainConfig({
            isSupported: true,
            minBridgeAmount: 1 ether, // 1 MATIC
            maxBridgeAmount: 10000 ether,
            estimatedExecutionTime: 180, // 3 minutes
            supportedTokens: new address[](0)
        });
        
        // Arbitrum Sepolia
        chainConfigs[421614] = ChainConfig({
            isSupported: true,
            minBridgeAmount: 0.001 ether,
            maxBridgeAmount: 100 ether,
            estimatedExecutionTime: 120, // 2 minutes
            supportedTokens: new address[](0)
        });
        
        // Base Sepolia
        chainConfigs[84532] = ChainConfig({
            isSupported: true,
            minBridgeAmount: 0.001 ether,
            maxBridgeAmount: 100 ether,
            estimatedExecutionTime: 120,
            supportedTokens: new address[](0)
        });
    }
    
    /**
     * @dev Create bridge operation record (called by frontend/AI agents)
     * This prepares the operation before Nexus SDK execution
     */
    function createBridgeOperation(
        address user,
        address sourceToken,
        address targetToken,
        uint256 amount,
        uint256 sourceChainId,
        uint256 targetChainId,
        bytes32 agentRequestId,
        uint256 estimatedGas,
        uint256 bridgeFee
    ) external rateLimited validChain(sourceChainId) validChain(targetChainId) returns (bytes32) {
        
        ChainConfig storage sourceConfig = chainConfigs[sourceChainId];
        if (amount < sourceConfig.minBridgeAmount || amount > sourceConfig.maxBridgeAmount) {
            revert InvalidAmount();
        }
        
        bytes32 operationId = keccak256(abi.encodePacked(
            user,
            sourceToken,
            targetToken,
            amount,
            sourceChainId,
            targetChainId,
            block.timestamp,
            agentRequestId
        ));
        
        bridgeOperations[operationId] = BridgeOperation({
            user: user,
            sourceToken: sourceToken,
            targetToken: targetToken,
            amount: amount,
            sourceChainId: sourceChainId,
            targetChainId: targetChainId,
            timestamp: block.timestamp,
            completed: false,
            cancelled: false,
            nexusTxHash: bytes32(0),
            agentRequestId: agentRequestId,
            estimatedGas: estimatedGas,
            bridgeFee: bridgeFee
        });
        
        userOperations[user].push(operationId);
        lastBridgeTime[msg.sender] = block.timestamp;
        
        emit BridgeOperationInitiated(
            operationId, 
            user, 
            sourceChainId, 
            targetChainId, 
            amount
        );
        
        return operationId;
    }
    
    /**
     * @dev Callback function called by Avail Nexus SDK after successful bridge & execute
     * This function confirms the cross-chain operation completion
     * Prize Compliance: Required for Avail Nexus SDK integration
     */
    function confirmBridgeAndStake(
        bytes32 operationId,
        address user,
        address token,
        uint256 amount,
        uint256 sourceChainId,
        bytes32 nexusTxHash
    ) external nonReentrant {
        // In production, this would have proper access control for Nexus callbacks
        // For MVP, we allow any caller but verify operation exists
        
        if (processedNexusTxs[nexusTxHash]) revert NexusTxAlreadyProcessed();
        
        BridgeOperation storage operation = bridgeOperations[operationId];
        if (operation.user != user) revert OperationNotFound();
        if (operation.completed || operation.cancelled) revert AlreadyCompleted();
        
        operation.completed = true;
        operation.nexusTxHash = nexusTxHash;
        processedNexusTxs[nexusTxHash] = true;
        
        bool success = true;
        
        // Execute the stake on behalf of the user through StakingProxy
        try stakingProxy.executeStakeAfterBridge(
            user, 
            token, 
            amount, 
            sourceChainId, 
            operationId
        ) {
            success = true;
        } catch {
            success = false;
        }
        
        emit BridgeOperationCompleted(operationId, success, nexusTxHash);
        emit NexusCallbackReceived(operationId, user, amount, success);
    }
    
    /**
     * @dev Simulate bridge operation (for frontend estimation)
     * Returns estimated costs and execution time
     */
    function simulateBridgeOperation(
        uint256 sourceChainId,
        uint256 targetChainId,
        address token,
        uint256 amount
    ) external view validChain(sourceChainId) validChain(targetChainId) returns (
        uint256 estimatedGas,
        uint256 bridgeFee,
        uint256 serviceFee,
        uint256 executionTime,
        bool canExecute
    ) {
        ChainConfig storage sourceConfig = chainConfigs[sourceChainId];
        ChainConfig storage targetConfig = chainConfigs[targetChainId];
        
        canExecute = amount >= sourceConfig.minBridgeAmount && 
                    amount <= sourceConfig.maxBridgeAmount;
        
        // Simplified fee calculation for MVP
        serviceFee = (amount * bridgeServiceFee) / BASIS_POINTS;
        bridgeFee = 0.001 ether; // Mock bridge fee
        estimatedGas = 500000; // Mock gas estimate
        executionTime = targetConfig.estimatedExecutionTime;
    }
    
    /**
     * @dev Cancel bridge operation (before execution)
     */
    function cancelBridgeOperation(bytes32 operationId) external {
        BridgeOperation storage operation = bridgeOperations[operationId];
        
        if (operation.user != msg.sender) revert Unauthorized();
        if (operation.completed || operation.cancelled) revert AlreadyCompleted();
        
        operation.cancelled = true;
        
        emit BridgeOperationCancelled(operationId, msg.sender);
    }
    
    /**
     * @dev Get bridge operation details
     */
    function getBridgeOperation(bytes32 operationId) external view returns (
        address user,
        address sourceToken,
        address targetToken,
        uint256 amount,
        uint256 sourceChainId,
        uint256 targetChainId,
        bool completed,
        bool cancelled,
        bytes32 nexusTxHash,
        uint256 timestamp
    ) {
        BridgeOperation memory operation = bridgeOperations[operationId];
        return (
            operation.user,
            operation.sourceToken,
            operation.targetToken,
            operation.amount,
            operation.sourceChainId,
            operation.targetChainId,
            operation.completed,
            operation.cancelled,
            operation.nexusTxHash,
            operation.timestamp
        );
    }
    
    /**
     * @dev Get user's bridge operations with pagination
     */
    function getUserOperations(
        address user, 
        uint256 offset, 
        uint256 limit
    ) external view returns (bytes32[] memory operations) {
        bytes32[] storage userOps = userOperations[user];
        
        if (offset >= userOps.length) {
            return new bytes32[](0);
        }
        
        uint256 end = offset + limit;
        if (end > userOps.length) {
            end = userOps.length;
        }
        
        operations = new bytes32[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            operations[i - offset] = userOps[i];
        }
    }
    
    /**
     * @dev Get user operations count
     */
    function getUserOperationCount(address user) external view returns (uint256) {
        return userOperations[user].length;
    }
    
    /**
     * @dev Update chain configuration
     */
    function updateChainConfig(
        uint256 chainId,
        bool isSupported,
        uint256 minBridgeAmount,
        uint256 maxBridgeAmount,
        uint256 estimatedExecutionTime
    ) external onlyOwner {
        if (minBridgeAmount >= maxBridgeAmount) revert InvalidChainConfig();
        
        chainConfigs[chainId] = ChainConfig({
            isSupported: isSupported,
            minBridgeAmount: minBridgeAmount,
            maxBridgeAmount: maxBridgeAmount,
            estimatedExecutionTime: estimatedExecutionTime,
            supportedTokens: chainConfigs[chainId].supportedTokens
        });
        
        emit ChainConfigUpdated(chainId, isSupported);
    }
    
    /**
     * @dev Add supported token to chain
     */
    function addSupportedTokenToChain(
        uint256 chainId, 
        address token
    ) external onlyOwner validChain(chainId) {
        chainConfigs[chainId].supportedTokens.push(token);
    }
    
    /**
     * @dev Update bridge service fee
     */
    function updateBridgeServiceFee(uint256 newFee) external onlyOwner {
        require(newFee <= 500, "Fee too high"); // Max 5%
        bridgeServiceFee = newFee;
    }
    
    /**
     * @dev Update fee recipient
     */
    function updateFeeRecipient(address newRecipient) external onlyOwner {
        if (newRecipient == address(0)) revert InvalidAmount();
        feeRecipient = newRecipient;
    }
    
    /**
     * @dev Get chain configuration
     */
    function getChainConfig(uint256 chainId) external view returns (
        bool isSupported,
        uint256 minBridgeAmount,
        uint256 maxBridgeAmount,
        uint256 estimatedExecutionTime,
        uint256 supportedTokenCount
    ) {
        ChainConfig storage config = chainConfigs[chainId];
        return (
            config.isSupported,
            config.minBridgeAmount,
            config.maxBridgeAmount,
            config.estimatedExecutionTime,
            config.supportedTokens.length
        );
    }
    
    /**
     * @dev Get protocol statistics
     */
    function getProtocolStats() external view returns (
        uint256 totalOperations,
        uint256 completedOperations,
        uint256 totalVolumeUSD,
        uint256 activeChains
    ) {
        // Simplified implementation for MVP
        // In production, would track these metrics properly
        activeChains = 4; // Sepolia, Polygon, Arbitrum, Base
    }
    
    /**
     * @dev Emergency function to mark operation as completed (owner only)
     */
    function emergencyCompleteOperation(
        bytes32 operationId,
        bytes32 nexusTxHash
    ) external onlyOwner {
        BridgeOperation storage operation = bridgeOperations[operationId];
        if (operation.completed) revert AlreadyCompleted();
        
        operation.completed = true;
        operation.nexusTxHash = nexusTxHash;
        
        emit BridgeOperationCompleted(operationId, true, nexusTxHash);
    }
}