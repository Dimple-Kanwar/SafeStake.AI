// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title AIAgentController
 * @dev Manages AI agent authorization and request lifecycle
 * ASI Alliance Prize Compliance - AI Agent Framework
 */
contract AIAgentController is AccessControl, ReentrancyGuard, Pausable {
    bytes32 public constant AGENT_ROLE = keccak256("AGENT_ROLE");
    bytes32 public constant EXECUTOR_ROLE = keccak256("EXECUTOR_ROLE");

    enum RequestType {
        BRIDGE_AND_STAKE,
        OPTIMIZE_STRATEGY,
        REBALANCE_PORTFOLIO,
        LIQUIDATE_POSITION
    }

    struct AgentRequest {
        address user;
        address agent;
        bytes actionData;
        RequestType requestType;
        uint256 createdAt;
        uint256 expiresAt;
        bool executed;
    }

    mapping(bytes32 => AgentRequest) public requests;
    mapping(address => bool) public authorizedAgents;
    mapping(address => string) public agentTypes;
    mapping(address => uint256) public agentRequestCounts;
    mapping(address => uint256) private lastRequestTime;

    uint256 public constant MAX_REQUESTS_PER_HOUR = 10;
    uint256 public constant REQUEST_EXPIRY_TIME = 1 hours;

    event AgentAuthorized(address indexed agent, string agentType);
    event AgentRevoked(address indexed agent);
    event RequestCreated(
        bytes32 indexed requestId,
        address indexed user,
        address indexed agent,
        RequestType requestType
    );
    event RequestExecuted(bytes32 indexed requestId, address indexed executor);
    event RequestCancelled(bytes32 indexed requestId, address indexed user);
    event EmergencyPaused(address indexed pauser);

    error UnauthorizedAgent();
    error RequestAlreadyExecuted();
    error RequestExpired();
    error InvalidExpiry();
    error InvalidRequest();
    error RateLimitExceeded();

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(EXECUTOR_ROLE, msg.sender);
    }

    function authorizeAgent(
        address agent,
        string calldata agentType_
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (agent == address(0)) revert InvalidRequest();
        
        authorizedAgents[agent] = true;
        agentTypes[agent] = agentType_;
        _grantRole(AGENT_ROLE, agent);
        
        emit AgentAuthorized(agent, agentType_);
    }

    function revokeAgent(address agent) external onlyRole(DEFAULT_ADMIN_ROLE) {
        authorizedAgents[agent] = false;
        agentTypes[agent] = "";
        _revokeRole(AGENT_ROLE, agent);
        
        emit AgentRevoked(agent);
    }

    function createAgentRequest(
        address user,
        bytes calldata actionData,
        RequestType requestType,
        uint256 expiresAt
    ) external onlyRole(AGENT_ROLE) whenNotPaused nonReentrant returns (bytes32) {
        if (expiresAt <= block.timestamp) revert InvalidExpiry();
        if (user == address(0)) revert InvalidRequest();
        
        // Rate limiting
        uint256 hourAgo = block.timestamp - 1 hours;
        if (lastRequestTime[user] > hourAgo) {
            // uint256 recentRequests = 0;
            // Simple rate limit check
            if (agentRequestCounts[msg.sender] >= MAX_REQUESTS_PER_HOUR) {
                revert RateLimitExceeded();
            }
        }
        
        bytes32 requestId = keccak256(
            abi.encodePacked(user, msg.sender, actionData, block.timestamp)
        );
        
        requests[requestId] = AgentRequest({
            user: user,
            agent: msg.sender,
            actionData: actionData,
            requestType: requestType,
            createdAt: block.timestamp,
            expiresAt: expiresAt,
            executed: false
        });
        
        agentRequestCounts[msg.sender]++;
        lastRequestTime[user] = block.timestamp;
        
        emit RequestCreated(requestId, user, msg.sender, requestType);
        return requestId;
    }

    function executeAgentRequest(
        bytes32 requestId
    ) external nonReentrant whenNotPaused {
        AgentRequest storage request = requests[requestId];
        
        if (request.executed) revert RequestAlreadyExecuted();
        if (block.timestamp > request.expiresAt) revert RequestExpired();
        
        // Only user or executor can execute
        if (msg.sender != request.user && !hasRole(EXECUTOR_ROLE, msg.sender)) {
            revert UnauthorizedAgent();
        }
        
        request.executed = true;
        
        emit RequestExecuted(requestId, msg.sender);
    }

    function cancelRequest(bytes32 requestId) external {
        AgentRequest storage request = requests[requestId];
        
        if (msg.sender != request.user) revert UnauthorizedAgent();
        if (request.executed) revert RequestAlreadyExecuted();
        
        request.executed = true;
        
        emit RequestCancelled(requestId, msg.sender);
    }

    function getRequest(
        bytes32 requestId
    ) external view returns (
        address user,
        address agent,
        bytes memory actionData,
        RequestType requestType,
        uint256 createdAt,
        bool executed
    ) {
        AgentRequest memory request = requests[requestId];
        return (
            request.user,
            request.agent,
            request.actionData,
            request.requestType,
            request.createdAt,
            request.executed
        );
    }

    function checkRateLimit(address user) external view returns (bool) {
        uint256 hourAgo = block.timestamp - 1 hours;
        return lastRequestTime[user] <= hourAgo;
    }

    function getAgentInfo(
        address agent
    ) external view returns (bool authorized, string memory agentType_, uint256 requestCount) {
        return (authorizedAgents[agent], agentTypes[agent], agentRequestCounts[agent]);
    }

    function emergencyPause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
        emit EmergencyPaused(msg.sender);
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }
}
