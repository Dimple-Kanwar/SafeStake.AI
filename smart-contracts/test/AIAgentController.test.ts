import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { 
  AIAgentController, 
  CollateralManager, 
  StakingProxy, 
  BridgeCoordinator,
  MockERC20,
  MockPyth 
} from "../typechain-types";

describe("AIAgentController", function () {
  let aiController: AIAgentController;
  let owner: SignerWithAddress;
  let agent1: SignerWithAddress;
  let agent2: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;

  beforeEach(async function () {
    [owner, agent1, agent2, user1, user2] = await ethers.getSigners();

    const AIAgentController = await ethers.getContractFactory("AIAgentController");
    aiController = await AIAgentController.deploy();
    await aiController.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await aiController.hasRole(await aiController.DEFAULT_ADMIN_ROLE(), owner.address))
        .to.be.true;
    });

    it("Should grant executor role to owner", async function () {
      expect(await aiController.hasRole(await aiController.EXECUTOR_ROLE(), owner.address))
        .to.be.true;
    });
  });

  describe("Agent Authorization", function () {
    it("Should authorize an agent", async function () {
      await expect(
        aiController.authorizeAgent(agent1.address, "StrategyOptimizer")
      ).to.emit(aiController, "AgentAuthorized")
       .withArgs(agent1.address, "StrategyOptimizer");

      expect(await aiController.authorizedAgents(agent1.address)).to.be.true;
      expect(await aiController.agentTypes(agent1.address)).to.equal("StrategyOptimizer");
    });

    it("Should revert when non-admin tries to authorize agent", async function () {
      await expect(
        aiController.connect(user1).authorizeAgent(agent1.address, "StrategyOptimizer")
      ).to.be.revertedWithCustomError(aiController, "AccessControlUnauthorizedAccount");
    });

    it("Should revert when authorizing zero address", async function () {
      await expect(
        aiController.authorizeAgent(ethers.ZeroAddress, "StrategyOptimizer")
      ).to.be.revertedWithCustomError(aiController, "InvalidRequest");
    });

    it("Should revoke an agent", async function () {
      // First authorize
      await aiController.authorizeAgent(agent1.address, "StrategyOptimizer");
      expect(await aiController.authorizedAgents(agent1.address)).to.be.true;

      // Then revoke
      await expect(
        aiController.revokeAgent(agent1.address)
      ).to.emit(aiController, "AgentRevoked")
       .withArgs(agent1.address);

      expect(await aiController.authorizedAgents(agent1.address)).to.be.false;
      expect(await aiController.agentTypes(agent1.address)).to.equal("");
    });
  });

  describe("Agent Requests", function () {
    beforeEach(async function () {
      await aiController.authorizeAgent(agent1.address, "StrategyOptimizer");
    });

    it("Should create an agent request", async function () {
      const actionData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "uint256"], 
        [user1.address, ethers.parseEther("1")]
      );
      const expiry = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

      await expect(
        aiController.connect(agent1).createAgentRequest(
          user1.address,
          actionData,
          0, // BRIDGE_AND_STAKE
          expiry
        )
      ).to.emit(aiController, "RequestCreated");

      // Check request count increased
      expect(await aiController.agentRequestCounts(agent1.address)).to.equal(1);
    });

    it("Should revert when unauthorized agent creates request", async function () {
      const actionData = "0x1234";
      const expiry = Math.floor(Date.now() / 1000) + 3600;

      await expect(
        aiController.connect(agent2).createAgentRequest(
          user1.address,
          actionData,
          0,
          expiry
        )
      ).to.be.revertedWithCustomError(aiController, "AccessControlUnauthorizedAccount");
    });

    it("Should revert with invalid expiry", async function () {
      const actionData = "0x1234";
      const pastExpiry = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago

      await expect(
        aiController.connect(agent1).createAgentRequest(
          user1.address,
          actionData,
          0,
          pastExpiry
        )
      ).to.be.revertedWithCustomError(aiController, "InvalidExpiry");
    });

    it("Should enforce rate limiting", async function () {
      const actionData = "0x1234";
      const expiry = Math.floor(Date.now() / 1000) + 3600;

      // Create multiple requests in the same hour
      for (let i = 0; i < 10; i++) {
        await aiController.connect(agent1).createAgentRequest(
          user1.address,
          actionData,
          0,
          expiry + i // Different expiry for each request
        );
      }

      // 11th request should fail
      await expect(
        aiController.connect(agent1).createAgentRequest(
          user1.address,
          actionData,
          0,
          expiry + 100
        )
      ).to.be.revertedWithCustomError(aiController, "RateLimitExceeded");
    });
  });

  describe("Request Execution", function () {
    let requestId: string;

    beforeEach(async function () {
      await aiController.authorizeAgent(agent1.address, "StrategyOptimizer");
      
      const actionData = "0x1234";
      const expiry = Math.floor(Date.now() / 1000) + 3600;

      const tx = await aiController.connect(agent1).createAgentRequest(
        user1.address,
        actionData,
        0,
        expiry
      );
      
      const receipt = await tx.wait();
      const event = receipt?.logs.find(log => {
        try {
          return aiController.interface.parseLog({
            topics: log.topics as string[],
            data: log.data
          })?.name === "RequestCreated";
        } catch {
          return false;
        }
      });

      if (event) {
        const parsed = aiController.interface.parseLog({
          topics: event.topics as string[],
          data: event.data
        });
        requestId = parsed?.args.requestId;
      }
    });

    it("Should allow user to execute their request", async function () {
      await expect(
        aiController.connect(user1).executeAgentRequest(requestId)
      ).to.emit(aiController, "RequestExecuted");

      const [, , , , , executed] = await aiController.getRequest(requestId);
      expect(executed).to.be.true;
    });

    it("Should allow executor to execute request", async function () {
      await expect(
        aiController.connect(owner).executeAgentRequest(requestId)
      ).to.emit(aiController, "RequestExecuted");
    });

    it("Should revert when unauthorized user tries to execute", async function () {
      await expect(
        aiController.connect(user2).executeAgentRequest(requestId)
      ).to.be.revertedWithCustomError(aiController, "UnauthorizedAgent");
    });

    it("Should revert when executing already executed request", async function () {
      await aiController.connect(user1).executeAgentRequest(requestId);
      
      await expect(
        aiController.connect(user1).executeAgentRequest(requestId)
      ).to.be.revertedWithCustomError(aiController, "RequestAlreadyExecuted");
    });

    it("Should allow user to cancel their request", async function () {
      await expect(
        aiController.connect(user1).cancelRequest(requestId)
      ).to.emit(aiController, "RequestCancelled")
       .withArgs(requestId, user1.address);

      const [, , , , , executed] = await aiController.getRequest(requestId);
      expect(executed).to.be.true; // Cancelled requests are marked as executed
    });
  });

  describe("Emergency Functions", function () {
    it("Should allow emergency pause", async function () {
      await expect(
        aiController.emergencyPause()
      ).to.emit(aiController, "EmergencyPaused")
       .withArgs(owner.address);

      expect(await aiController.paused()).to.be.true;
    });

    it("Should prevent operations when paused", async function () {
      await aiController.authorizeAgent(agent1.address, "StrategyOptimizer");
      await aiController.emergencyPause();

      const actionData = "0x1234";
      const expiry = Math.floor(Date.now() / 1000) + 3600;

      await expect(
        aiController.connect(agent1).createAgentRequest(
          user1.address,
          actionData,
          0,
          expiry
        )
      ).to.be.revertedWithCustomError(aiController, "EnforcedPause");
    });

    it("Should allow unpause", async function () {
      await aiController.emergencyPause();
      await aiController.unpause();
      
      expect(await aiController.paused()).to.be.false;
    });
  });

  describe("View Functions", function () {
    beforeEach(async function () {
      await aiController.authorizeAgent(agent1.address, "StrategyOptimizer");
    });

    it("Should return agent info", async function () {
      const [authorized, agentType, requestCount] = await aiController.getAgentInfo(agent1.address);
      
      expect(authorized).to.be.true;
      expect(agentType).to.equal("StrategyOptimizer");
      expect(requestCount).to.equal(0);
    });

    it("Should check rate limit", async function () {
      expect(await aiController.checkRateLimit(user1.address)).to.be.true;
      
      // Create max requests
      const actionData = "0x1234";
      const expiry = Math.floor(Date.now() / 1000) + 3600;

      for (let i = 0; i < 10; i++) {
        await aiController.connect(agent1).createAgentRequest(
          user1.address,
          actionData,
          0,
          expiry + i
        );
      }

      expect(await aiController.checkRateLimit(user1.address)).to.be.false;
    });
  });
});