import { expect } from "chai";
import { describe, it } from "node:test";
import { network } from "hardhat";

describe("AIAgentController", async function () {
  async function deployAIAgentControllerFixture() {
    const connection = await network.connect();
    const {viem } = connection.viem;
    const  = viem.
    const [owner, agent1, agent2, user1, user2] = await viem.getWalletClients();
    const aiController = await viem.deployContract("AIAgentController");
    return { aiController, owner, agent1, agent2, user1, user2 };
  }

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      const { aiController, owner } = await deployAIAgentControllerFixture(
        deployAIAgentControllerFixture
      );

      const DEFAULT_ADMIN_ROLE = await aiController.DEFAULT_ADMIN_ROLE();
      expect(await aiController.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to
        .be.true;
    });

    it("Should grant executor role to owner", async function () {
      const { aiController, owner } = await loadFixture(
        deployAIAgentControllerFixture
      );

      const EXECUTOR_ROLE = await aiController.EXECUTOR_ROLE();
      expect(await aiController.hasRole(EXECUTOR_ROLE, owner.address)).to.be
        .true;
    });
  });

  describe("Agent Authorization", function () {
    it("Should authorize an agent", async function () {
      const { aiController, agent1 } = await loadFixture(
        deployAIAgentControllerFixture
      );

      await expect(
        aiController.authorizeAgent(agent1.address, "StrategyOptimizer")
      )
        .to.emit(aiController, "AgentAuthorized")
        .withArgs(agent1.address, "StrategyOptimizer");

      expect(await aiController.authorizedAgents(agent1.address)).to.be.true;
      expect(await aiController.agentTypes(agent1.address)).to.equal(
        "StrategyOptimizer"
      );
    });

    it("Should revert when non-admin tries to authorize agent", async function () {
      const { aiController, user1, agent1 } = await loadFixture(
        deployAIAgentControllerFixture
      );

      const DEFAULT_ADMIN_ROLE = await aiController.DEFAULT_ADMIN_ROLE();

      await expect(
        aiController
          .connect(user1)
          .authorizeAgent(agent1.address, "StrategyOptimizer")
      )
        .to.be.revertedWithCustomError(
          aiController,
          "AccessControlUnauthorizedAccount"
        )
        .withArgs(user1.address, DEFAULT_ADMIN_ROLE);
    });

    it("Should revert when authorizing zero address", async function () {
      const { aiController } = await loadFixture(
        deployAIAgentControllerFixture
      );

      await expect(
        aiController.authorizeAgent(ethers.ZeroAddress, "StrategyOptimizer")
      ).to.be.revertedWithCustomError(aiController, "InvalidRequest");
    });

    it("Should revoke an agent", async function () {
      const { aiController, agent1 } = await loadFixture(
        deployAIAgentControllerFixture
      );

      await aiController.authorizeAgent(agent1.address, "StrategyOptimizer");
      expect(await aiController.authorizedAgents(agent1.address)).to.be.true;

      await expect(aiController.revokeAgent(agent1.address))
        .to.emit(aiController, "AgentRevoked")
        .withArgs(agent1.address);

      expect(await aiController.authorizedAgents(agent1.address)).to.be.false;
      expect(await aiController.agentTypes(agent1.address)).to.equal("");
    });
  });

  describe("Agent Requests", function () {
    it("Should create an agent request", async function () {
      const { aiController, agent1, user1 } = await loadFixture(
        deployAIAgentControllerFixture
      );

      await aiController.authorizeAgent(agent1.address, "StrategyOptimizer");

      const actionData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "uint256"],
        [user1.address, ethers.parseEther("1")]
      );
      const currentTime = Math.floor(Date.now() / 1000);
      const expiry = currentTime + 3600;

      await expect(
        aiController.connect(agent1).createAgentRequest(
          user1.address,
          actionData,
          0, // RequestType.BRIDGE_AND_STAKE
          expiry
        )
      ).to.emit(aiController, "RequestCreated");

      expect(await aiController.agentRequestCounts(agent1.address)).to.equal(1);
    });

    it("Should revert when unauthorized agent creates request", async function () {
      const { aiController, agent2, user1 } = await loadFixture(
        deployAIAgentControllerFixture
      );

      const actionData = "0x1234";
      const expiry = Math.floor(Date.now() / 1000) + 3600;

      const AGENT_ROLE = await aiController.AGENT_ROLE();

      await expect(
        aiController
          .connect(agent2)
          .createAgentRequest(user1.address, actionData, 0, expiry)
      )
        .to.be.revertedWithCustomError(
          aiController,
          "AccessControlUnauthorizedAccount"
        )
        .withArgs(agent2.address, AGENT_ROLE);
    });

    it("Should revert with invalid expiry", async function () {
      const { aiController, agent1, user1 } = await loadFixture(
        deployAIAgentControllerFixture
      );

      await aiController.authorizeAgent(agent1.address, "StrategyOptimizer");

      const actionData = "0x1234";
      const pastExpiry = Math.floor(Date.now() / 1000) - 3600;

      await expect(
        aiController
          .connect(agent1)
          .createAgentRequest(user1.address, actionData, 0, pastExpiry)
      ).to.be.revertedWithCustomError(aiController, "InvalidExpiry");
    });

    it("Should enforce rate limiting", async function () {
      const { aiController, agent1, user1 } = await loadFixture(
        deployAIAgentControllerFixture
      );

      await aiController.authorizeAgent(agent1.address, "StrategyOptimizer");

      const actionData = "0x1234";
      const baseExpiry = Math.floor(Date.now() / 1000) + 3600;

      // Create 10 requests (max per hour)
      for (let i = 0; i < 10; i++) {
        await aiController
          .connect(agent1)
          .createAgentRequest(user1.address, actionData, 0, baseExpiry + i);
      }

      // 11th request should fail
      await expect(
        aiController
          .connect(agent1)
          .createAgentRequest(user1.address, actionData, 0, baseExpiry + 100)
      ).to.be.revertedWithCustomError(aiController, "RateLimitExceeded");
    });
  });

  describe("Request Execution", function () {
    async function deployWithRequestFixture() {
      const fixture = await loadFixture(deployAIAgentControllerFixture);
      const { aiController, agent1, user1 } = fixture;

      await aiController.authorizeAgent(agent1.address, "StrategyOptimizer");

      const actionData = "0x1234";
      const expiry = Math.floor(Date.now() / 1000) + 3600;

      const tx = await aiController
        .connect(agent1)
        .createAgentRequest(user1.address, actionData, 0, expiry);

      const receipt = await tx.wait();

      let requestId = ethers.ZeroHash;
      if (receipt) {
        for (const log of receipt.logs) {
          try {
            const parsed = aiController.interface.parseLog({
              topics: [...log.topics] as string[],
              data: log.data,
            });

            if (parsed && parsed.name === "RequestCreated") {
              requestId = parsed.args.requestId;
              break;
            }
          } catch (e) {
            // Skip logs that don't match
            continue;
          }
        }
      }

      return { ...fixture, requestId };
    }

    it("Should allow user to execute their request", async function () {
      const { aiController, user1, requestId } = await loadFixture(
        deployWithRequestFixture
      );

      await expect(aiController.connect(user1).executeAgentRequest(requestId))
        .to.emit(aiController, "RequestExecuted")
        .withArgs(requestId, user1.address);

      const request = await aiController.getRequest(requestId);
      expect(request.executed).to.be.true;
    });

    it("Should allow executor to execute request", async function () {
      const { aiController, owner, requestId } = await loadFixture(
        deployWithRequestFixture
      );

      await expect(aiController.connect(owner).executeAgentRequest(requestId))
        .to.emit(aiController, "RequestExecuted")
        .withArgs(requestId, owner.address);
    });

    it("Should revert when unauthorized user tries to execute", async function () {
      const { aiController, user2, requestId } = await loadFixture(
        deployWithRequestFixture
      );

      await expect(
        aiController.connect(user2).executeAgentRequest(requestId)
      ).to.be.revertedWithCustomError(aiController, "UnauthorizedAgent");
    });

    it("Should revert when executing already executed request", async function () {
      const { aiController, user1, requestId } = await loadFixture(
        deployWithRequestFixture
      );

      await aiController.connect(user1).executeAgentRequest(requestId);

      await expect(
        aiController.connect(user1).executeAgentRequest(requestId)
      ).to.be.revertedWithCustomError(aiController, "RequestAlreadyExecuted");
    });

    it("Should allow user to cancel their request", async function () {
      const { aiController, user1, requestId } = await loadFixture(
        deployWithRequestFixture
      );

      await expect(aiController.connect(user1).cancelRequest(requestId))
        .to.emit(aiController, "RequestCancelled")
        .withArgs(requestId, user1.address);

      const request = await aiController.getRequest(requestId);
      expect(request.executed).to.be.true;
    });
  });

  describe("Emergency Functions", function () {
    it("Should allow emergency pause", async function () {
      const { aiController, owner } = await loadFixture(
        deployAIAgentControllerFixture
      );

      await expect(aiController.emergencyPause())
        .to.emit(aiController, "EmergencyPaused")
        .withArgs(owner.address);

      expect(await aiController.paused()).to.be.true;
    });

    it("Should prevent operations when paused", async function () {
      const { aiController, agent1, user1 } = await loadFixture(
        deployAIAgentControllerFixture
      );

      await aiController.authorizeAgent(agent1.address, "StrategyOptimizer");
      await aiController.emergencyPause();

      const actionData = "0x1234";
      const expiry = Math.floor(Date.now() / 1000) + 3600;

      await expect(
        aiController
          .connect(agent1)
          .createAgentRequest(user1.address, actionData, 0, expiry)
      ).to.be.revertedWithCustomError(aiController, "EnforcedPause");
    });

    it("Should allow unpause", async function () {
      const { aiController } = await loadFixture(
        deployAIAgentControllerFixture
      );

      await aiController.emergencyPause();
      await aiController.unpause();

      expect(await aiController.paused()).to.be.false;
    });
  });

  describe("View Functions", function () {
    it("Should return agent info", async function () {
      const { aiController, agent1 } = await loadFixture(
        deployAIAgentControllerFixture
      );

      await aiController.authorizeAgent(agent1.address, "StrategyOptimizer");

      const agentInfo = await aiController.getAgentInfo(agent1.address);

      expect(agentInfo.authorized).to.be.true;
      expect(agentInfo.agentType_).to.equal("StrategyOptimizer");
      expect(agentInfo.requestCount).to.equal(0);
    });

    it("Should check rate limit", async function () {
      const { aiController, user1 } = await loadFixture(
        deployAIAgentControllerFixture
      );

      expect(await aiController.checkRateLimit(user1.address)).to.be.true;
    });
  });
});
