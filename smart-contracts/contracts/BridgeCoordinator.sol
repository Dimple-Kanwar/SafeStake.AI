// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./StakingProxy.sol";

/**
 * @title BridgeCoordinator
 * @dev Coordinates cross-chain bridge operations with Avail Nexus SDK
 */
contract BridgeCoordinator is ReentrancyGuard, Ownable {
    StakingProxy public immutable stakingProxy;
    address public feeRecipient;
    
    enum OperationStatus {
        INITIATED,
        BRIDGED,
        EXECUTED,
        FAILED,
        CANCELLED
    }
    
    struct BridgeOperation {
        address user;
        address token;
        uint256 amount;
        uint256 sourceChainId;
        uint256 targetChainId;
        uint256 initiatedAt;
        uint256 completedAt;
        OperationStatus status;
        bytes32 nexusTxHash;
        bool requiresStaking;
    }
    
    mapping(bytes32 => BridgeOperation) public operations;
    mapping(address => bytes32[]) public userOperations;
    
    uint256 public bridgeFee = 0.001 ether;
    uint256 public operationCount;
    
    event BridgeInitiated(
        bytes32 indexed operationId,
        address indexed user,
        address token,
        uint256 amount,
        uint256 sourceChainId,
        uint256 targetChainId
    );
    
    event BridgeCompleted(
        bytes32 indexed operationId,
        bytes32 nexusTxHash
    );
    
    event StakeExecutedAfterBridge(
        bytes32 indexed operationId,
        address indexed user,
        uint256 amount
    );
    
    event OperationCancelled(bytes32 indexed operationId);
    
    error InvalidOperation();
    error OperationAlreadyProcessed();
    error InsufficientBridgeFee();
    error InvalidChainId();

    constructor(address _stakingProxy, address _feeRecipient) Ownable(msg.sender) {
        if (_stakingProxy == address(0) || _feeRecipient == address(0)) {
            revert InvalidOperation();
        }
        
        stakingProxy = StakingProxy(_stakingProxy);
        feeRecipient = _feeRecipient;
    }
    
    function initiateBridgeOperation(
        address token,
        uint256 amount,
        uint256 sourceChainId,
        uint256 targetChainId,
        bool requiresStaking
    ) external payable nonReentrant returns (bytes32) {
        if (msg.value < bridgeFee) revert InsufficientBridgeFee();
        if (amount == 0) revert InvalidOperation();
        if (targetChainId == 0) revert InvalidChainId();
        
        bytes32 operationId = keccak256(
            abi.encodePacked(
                msg.sender,
                token,
                amount,
                sourceChainId,
                targetChainId,
                block.timestamp,
                operationCount++
            )
        );
        
        operations[operationId] = BridgeOperation({
            user: msg.sender,
            token: token,
            amount: amount,
            sourceChainId: sourceChainId,
            targetChainId: targetChainId,
            initiatedAt: block.timestamp,
            completedAt: 0,
            status: OperationStatus.INITIATED,
            nexusTxHash: bytes32(0),
            requiresStaking: requiresStaking
        });
        
        userOperations[msg.sender].push(operationId);
        
        // Transfer bridge fee to recipient
        (bool success, ) = feeRecipient.call{value: msg.value}("");
        require(success, "Fee transfer failed");
        
        emit BridgeInitiated(
            operationId,
            msg.sender,
            token,
            amount,
            sourceChainId,
            targetChainId
        );
        
        return operationId;
    }
    
    function confirmBridgeAndStake(
        bytes32 operationId,
        address user,
        address token,
        uint256 amount,
        uint256 sourceChainId,
        bytes32 nexusTxHash
    ) external nonReentrant {
        BridgeOperation storage operation = operations[operationId];
        
        if (operation.status != OperationStatus.INITIATED) {
            revert OperationAlreadyProcessed();
        }
        if (operation.user != user) revert InvalidOperation();
        
        operation.status = OperationStatus.BRIDGED;
        operation.nexusTxHash = nexusTxHash;
        operation.completedAt = block.timestamp;
        
        emit BridgeCompleted(operationId, nexusTxHash);
        
        if (operation.requiresStaking) {
            stakingProxy.executeStakeAfterBridge(
                user,
                token,
                amount,
                sourceChainId,
                operationId
            );
            
            operation.status = OperationStatus.EXECUTED;
            
            emit StakeExecutedAfterBridge(operationId, user, amount);
        }
    }
    
    function simulateBridgeAndStake(
        // address token,
        uint256 amount,
        uint256 targetChainId
    ) external view returns (
        uint256 estimatedTime,
        uint256 estimatedGas,
        uint256 bridgeFeeAmount,
        bool canExecute
    ) {
        // Mock simulation values
        estimatedTime = 300; // 5 minutes
        estimatedGas = 500000;
        bridgeFeeAmount = bridgeFee;
        canExecute = amount > 0 && targetChainId > 0;
    }
    
    function getOperation(
        bytes32 operationId
    ) external view returns (
        address user,
        address token,
        uint256 amount,
        uint256 sourceChainId,
        uint256 targetChainId,
        OperationStatus status,
        bytes32 nexusTxHash
    ) {
        BridgeOperation storage operation = operations[operationId];
        return (
            operation.user,
            operation.token,
            operation.amount,
            operation.sourceChainId,
            operation.targetChainId,
            operation.status,
            operation.nexusTxHash
        );
    }
    
    function getUserOperations(
        address user
    ) external view returns (bytes32[] memory) {
        return userOperations[user];
    }
    
    function getOperationStatus(
        bytes32 operationId
    ) external view returns (OperationStatus) {
        return operations[operationId].status;
    }
    
    function cancelOperation(bytes32 operationId) external {
        BridgeOperation storage operation = operations[operationId];
        
        if (operation.user != msg.sender) revert InvalidOperation();
        if (operation.status != OperationStatus.INITIATED) {
            revert OperationAlreadyProcessed();
        }
        
        operation.status = OperationStatus.CANCELLED;
        operation.completedAt = block.timestamp;
        
        emit OperationCancelled(operationId);
    }
    
    function updateBridgeFee(uint256 newFee) external onlyOwner {
        bridgeFee = newFee;
    }
    
    function updateFeeRecipient(address newRecipient) external onlyOwner {
        if (newRecipient == address(0)) revert InvalidOperation();
        feeRecipient = newRecipient;
    }
    
    function emergencyWithdraw() external onlyOwner {
        (bool success, ) = owner().call{value: address(this).balance}("");
        require(success, "Withdrawal failed");
    }
}