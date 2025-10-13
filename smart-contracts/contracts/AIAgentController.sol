// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title AIAgentController
 * @dev Controls AI agent authorization and request execution for cross-chain staking
 * Prize Compliance: ASI Alliance Prize - Agent authorization framework
 * ETHOnline 2025 - Cross-Chain AI Staking MVP
 */
contract AIAgentController is AccessControl, ReentrancyGuard, Pausable {
    bytes32 public constant AGENT_ROLE = keccak256("AGENT_ROLE");
    bytes32 public constant EXECUTOR_ROLE = keccak256("EXECUTOR_ROLE");
    bytes32 public constant EMERGENCY_ROLE = keccak256("EMERGENCY_ROLE");
    
    enum RequestType {
        BRIDGE_AND_STAKE,
        REBALANCE_PORTFOLIO,
        OPTIMIZE_YIELD,
        EMERGENCY_EXIT,
        DEPOSIT_COLLATERAL,
        WITHDRAW_COLLATERAL
    }
    
    struct AgentRequest {
        address user;
        address agent;
        bytes actionData;
        uint256 timestamp;
        uint256 expiry;
        bool executed;
        RequestType requestType;
        uint256 value; // ETH value if needed
    }
    
    mapping(bytes32 => AgentRequest) public agentRequests;
    mapping(address => bool) public authorizedAgents;
    mapping(address => uint256) public agentRequestCounts;
    mapping(address => string) public agentTypes; // Track agent specialization
    
    // Rate limiting
    mapping(address => mapping(uint256 => uint256)) public userRequestsPerHour;
    uint256 public constant MAX_REQUESTS_PER_HOUR = 10;
    
    event AgentAuthorized(address indexed agent, string agentType);
    event AgentRevoked(address indexed agent);
    event RequestCreated(
        bytes32 indexed requestId, 
        address indexed user, 
        address indexed agent,
        RequestType requestType,
        uint256 expiry
    );
    event RequestExecuted(bytes32 indexed requestId, bool success, bytes returnData);
    event RequestCancelled(bytes32 indexed requestId, address indexed user);
    event EmergencyPaused(address indexed admin);
    
    error UnauthorizedAgent();
    error InvalidRequest();
    error RequestExpired();
    error RequestAlreadyExecuted();
    error RateLimitExceeded();
    error InvalidExpiry();
    error InsufficientValue();
    
    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(EXECUTOR_ROLE, msg.sender);
        _grantRole(EMERGENCY_ROLE, msg.sender);
    }
    
    /**
     * @dev Authorize an AI agent for specific operations
     * Required for ASI Alliance Prize compliance
     */
    function authorizeAgent(
        address agent, 
        string calldata agentType
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (agent == address(0)) revert InvalidRequest();
        
        authorizedAgents[agent] = true;
        agentTypes[agent] = agentType;
        _grantRole(AGENT_ROLE, agent);
        
        emit AgentAuthorized(agent, agentType);
    }
    
    /**
     * @dev Revoke agent authorization
     */
    function revokeAgent(address agent) external onlyRole(DEFAULT_ADMIN_ROLE) {
        authorizedAgents[agent] = false;
        delete agentTypes[agent];
        _revokeRole(AGENT_ROLE, agent);
        
        emit AgentRevoked(agent);
    }
    
    /**
     * @dev Create a request from authorized AI agent with rate limiting
     */
    function createAgentRequest(
        address user,
        bytes calldata actionData,
        RequestType requestType,
        uint256 expiry
    ) external payable onlyRole(AGENT_ROLE) whenNotPaused returns (bytes32) {
        if (user == address(0)) revert InvalidRequest();
        if (expiry <= block.timestamp || expiry > block.timestamp + 1 days) {
            revert InvalidExpiry();
        }
        
        // Rate limiting check
        uint256 currentHour = block.timestamp / 3600;
        if (userRequestsPerHour[user][currentHour] >= MAX_REQUESTS_PER_HOUR) {
            revert RateLimitExceeded();
        }
        
        bytes32 requestId = keccak256(abi.encodePacked(
            user,
            msg.sender,
            actionData,
            block.timestamp,
            agentRequestCounts[msg.sender]++
        ));
        
        agentRequests[requestId] = AgentRequest({
            user: user,
            agent: msg.sender,
            actionData: actionData,
            timestamp: block.timestamp,
            expiry: expiry,
            executed: false,
            requestType: requestType,
            value: msg.value
        });
        
        userRequestsPerHour[user][currentHour]++;
        
        emit RequestCreated(requestId, user, msg.sender, requestType, expiry);
        return requestId;
    }
    
    /**
     * @dev Execute agent request (callable by user or authorized executor)
     */
    function executeAgentRequest(
        bytes32 requestId
    ) external nonReentrant whenNotPaused returns (bool success, bytes memory returnData) {
        AgentRequest storage request = agentRequests[requestId];
        
        if (msg.sender != request.user && !hasRole(EXECUTOR_ROLE, msg.sender)) {
            revert UnauthorizedAgent();
        }
        if (request.executed) revert RequestAlreadyExecuted();
        if (block.timestamp > request.expiry) revert RequestExpired();
        
        request.executed = true;
        
        // Execute the action with value if specified
        (success, returnData) = address(this).call{value: request.value}(request.actionData);
        
        emit RequestExecuted(requestId, success, returnData);
    }
    
    /**
     * @dev Cancel a pending request (user only)
     */
    function cancelRequest(bytes32 requestId) external {
        AgentRequest storage request = agentRequests[requestId];
        
        if (msg.sender != request.user) revert UnauthorizedAgent();
        if (request.executed) revert RequestAlreadyExecuted();
        
        request.executed = true; // Mark as executed to prevent execution
        
        // Refund any ETH value
        if (request.value > 0) {
            payable(request.user).transfer(request.value);
        }
        
        emit RequestCancelled(requestId, msg.sender);
    }
    
    /**
     * @dev Get request details
     */
    function getRequest(bytes32 requestId) external view returns (
        address user,
        address agent,
        RequestType requestType,
        uint256 timestamp,
        uint256 expiry,
        bool executed,
        uint256 value
    ) {
        AgentRequest memory request = agentRequests[requestId];
        return (
            request.user,
            request.agent,
            request.requestType,
            request.timestamp,
            request.expiry,
            request.executed,
            request.value
        );
    }
    
    /**
     * @dev Get agent information
     */
    function getAgentInfo(address agent) external view returns (
        bool authorized,
        string memory agentType,
        uint256 requestCount
    ) {
        return (
            authorizedAgents[agent],
            agentTypes[agent],
            agentRequestCounts[agent]
        );
    }
    
    /**
     * @dev Check if user has exceeded rate limit
     */
    function checkRateLimit(address user) external view returns (bool canMakeRequest) {
        uint256 currentHour = block.timestamp / 3600;
        return userRequestsPerHour[user][currentHour] < MAX_REQUESTS_PER_HOUR;
    }
    
    /**
     * @dev Emergency pause function
     */
    function emergencyPause() external onlyRole(EMERGENCY_ROLE) {
        _pause();
        emit EmergencyPaused(msg.sender);
    }
    
    /**
     * @dev Unpause after emergency
     */
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }
    
    /**
     * @dev Receive function for ETH deposits
     */
    receive() external payable {}
    
    /**
     * @dev Fallback function for unknown calls
     */
    fallback() external payable {}
}