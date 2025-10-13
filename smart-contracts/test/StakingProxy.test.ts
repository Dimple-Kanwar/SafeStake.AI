import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { 
  StakingProxy,
  CollateralManager,
  AIAgentController, 
  MockERC20,
  MockPyth 
} from "../typechain-types";

describe("StakingProxy", function () {
  let stakingProxy: StakingProxy;
  let collateralManager: CollateralManager;
  let aiController: AIAgentController;
  let mockPyth: MockPyth;
  let stakingToken: MockERC20;
  let owner: SignerWithAddress;
  let treasury: SignerWithAddress;
  let feeRecipient: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;

  beforeEach(async function () {
    [owner, treasury, feeRecipient, user1, user2] = await ethers.getSigners();

    // Deploy MockPyth
    const MockPyth = await ethers.getContractFactory("MockPyth");
    mockPyth = await MockPyth.deploy();
    await mockPyth.waitForDeployment();

    // Deploy CollateralManager
    const CollateralManager = await ethers.getContractFactory("CollateralManager");
    collateralManager = await CollateralManager.deploy(
      await mockPyth.getAddress(),
      feeRecipient.address
    );
    await collateralManager.waitForDeployment();

    // Deploy AIAgentController
    const AIAgentController = await ethers.getContractFactory("AIAgentController");
    aiController = await AIAgentController.deploy();
    await aiController.waitForDeployment();

    // Deploy StakingProxy
    const StakingProxy = await ethers.getContractFactory("StakingProxy");
    stakingProxy = await StakingProxy.deploy(
      await collateralManager.getAddress(),
      await aiController.getAddress(),
      treasury.address
    );
    await stakingProxy.waitForDeployment();

    // Deploy staking token
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    stakingToken = await MockERC20.deploy("Staking Token", "STK", 18, ethers.parseEther("1000000"));

    // Setup tokens
    await stakingToken.mint(user1.address, ethers.parseEther("10000"));
    await stakingToken.mint(user2.address, ethers.parseEther("10000"));
    await stakingToken.mint(await stakingProxy.getAddress(), ethers.parseEther("100000")); // For rewards

    // Add as supported staking token
    await stakingProxy.setSupportedStakingToken(await stakingToken.getAddress(), true);

    // Add collateral to users for testing
    await stakingToken.connect(user1).approve(
      await collateralManager.getAddress(), 
      ethers.parseEther("10000")
    );
    await collateralManager.connect(user1).depositCollateral(
      await stakingToken.getAddress(),
      ethers.parseEther("2000"), // $4M collateral at $2000/ETH
      [],
      { value: ethers.parseEther("0.01") }
    );
  });

  describe("Deployment", function () {
    it("Should set correct addresses", async function () {
      expect(await stakingProxy.collateralManager()).to.equal(await collateralManager.getAddress());
      expect(await stakingProxy.aiController()).to.equal(await aiController.getAddress());
      expect(await stakingProxy.protocolTreasury()).to.equal(treasury.address);
    });

    it("Should revert with zero addresses", async function () {
      const StakingProxy = await ethers.getContractFactory("StakingProxy");
      
      await expect(
        StakingProxy.deploy(ethers.ZeroAddress, await aiController.getAddress(), treasury.address)
      ).to.be.revertedWithCustomError(stakingProxy, "InvalidAmount");
    });
  });

  describe("Local Staking", function () {
    beforeEach(async function () {
      await stakingToken.connect(user1).approve(
        await stakingProxy.getAddress(), 
        ethers.parseEther("10000")
      );
    });

    it("Should stake with collateral successfully", async function () {
      const stakeAmount = ethers.parseEther("100");
      
      await expect(
        stakingProxy.connect(user1).stakeWithCollateral(
          await stakingToken.getAddress(),
          stakeAmount
        )
      ).to.emit(stakingProxy, "StakeExecuted")
       .withArgs(user1.address, await stakingToken.getAddress(), stakeAmount, stakeAmount);

      // Check staking position
      const [stakedAmount, , , , , canUnstake] = await stakingProxy.getStakingInfo(user1.address);
      expect(stakedAmount).to.equal(stakeAmount);
      expect(canUnstake).to.be.false; // No unstake requested yet

      // Check liquid token balance
      const liquidBalance = await stakingProxy.getLiquidStakingBalance(
        user1.address, 
        await stakingToken.getAddress()
      );
      expect(liquidBalance).to.equal(stakeAmount);
    });

    it("Should revert with unsupported token", async function () {
      const unsupportedToken = await (await ethers.getContractFactory("MockERC20"))
        .deploy("Unsupported", "UNS", 18, ethers.parseEther("1000"));

      await expect(
        stakingProxy.connect(user1).stakeWithCollateral(
          await unsupportedToken.getAddress(),
          ethers.parseEther("100")
        )
      ).to.be.revertedWithCustomError(stakingProxy, "TokenNotSupported");
    });

    it("Should revert with insufficient collateral", async function () {
      const excessiveAmount = ethers.parseEther("3000"); // Would require $6M collateral
      
      await expect(
        stakingProxy.connect(user1).stakeWithCollateral(
          await stakingToken.getAddress(),
          excessiveAmount
        )
      ).to.be.revertedWithCustomError(stakingProxy, "InsufficientCollateral");
    });

    it("Should accumulate stakes for existing position", async function () {
      const firstStake = ethers.parseEther("100");
      const secondStake = ethers.parseEther("50");
      
      // First stake
      await stakingProxy.connect(user1).stakeWithCollateral(
        await stakingToken.getAddress(),
        firstStake
      );
      
      // Second stake
      await stakingProxy.connect(user1).stakeWithCollateral(
        await stakingToken.getAddress(),
        secondStake
      );
      
      const [stakedAmount] = await stakingProxy.getStakingInfo(user1.address);
      expect(stakedAmount).to.equal(firstStake + secondStake);
    });
  });

  describe("Cross-Chain Staking", function () {
    it("Should execute cross-chain stake", async function () {
      const stakeAmount = ethers.parseEther("100");
      const sourceChainId = 137; // Polygon
      const bridgeId = ethers.keccak256(ethers.toUtf8Bytes("bridge_123"));
      
      await expect(
        stakingProxy.executeStakeAfterBridge(
          user1.address,
          await stakingToken.getAddress(),
          stakeAmount,
          sourceChainId,
          bridgeId
        )
      ).to.emit(stakingProxy, "CrossChainStakeExecuted")
       .withArgs(user1.address, await stakingToken.getAddress(), stakeAmount, sourceChainId, bridgeId);

      const [stakedAmount] = await stakingProxy.getStakingInfo(user1.address);
      expect(stakedAmount).to.equal(stakeAmount);
    });

    it("Should revert cross-chain stake with insufficient collateral", async function () {
      const excessiveAmount = ethers.parseEther("3000");
      const sourceChainId = 137;
      const bridgeId = ethers.keccak256(ethers.toUtf8Bytes("bridge_123"));
      
      await expect(
        stakingProxy.executeStakeAfterBridge(
          user1.address,
          await stakingToken.getAddress(),
          excessiveAmount,
          sourceChainId,
          bridgeId
        )
      ).to.be.revertedWithCustomError(stakingProxy, "InsufficientCollateral");
    });
  });

  describe("AI Controlled Staking", function () {
    let agent: SignerWithAddress;

    beforeEach(async function () {
      [, , , , , agent] = await ethers.getSigners();
      
      // Authorize agent
      await aiController.authorizeAgent(agent.address, "StakingAgent");
    });

    it("Should allow AI controlled staking", async function () {
      const stakeAmount = ethers.parseEther("100");
      const agentData = ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [800]); // 8% custom rate
      
      await expect(
        stakingProxy.connect(await aiController.getAddress()).aiControlledStake(
          user1.address,
          await stakingToken.getAddress(),
          stakeAmount,
          agentData
        )
      ).to.emit(stakingProxy, "StakeExecuted");
    });

    it("Should revert when called by non-AI controller", async function () {
      const stakeAmount = ethers.parseEther("100");
      const agentData = "0x";
      
      await expect(
        stakingProxy.connect(user1).aiControlledStake(
          user1.address,
          await stakingToken.getAddress(),
          stakeAmount,
          agentData
        )
      ).to.be.revertedWithCustomError(stakingProxy, "OnlyAIController");
    });
  });

  describe("Unstaking Process", function () {
    beforeEach(async function () {
      // Setup initial stake
      await stakingToken.connect(user1).approve(
        await stakingProxy.getAddress(), 
        ethers.parseEther("10000")
      );
      
      await stakingProxy.connect(user1).stakeWithCollateral(
        await stakingToken.getAddress(),
        ethers.parseEther("1000")
      );
    });

    it("Should request unstaking", async function () {
      const unstakeAmount = ethers.parseEther("500");
      
      await expect(
        stakingProxy.connect(user1).requestUnstake(unstakeAmount)
      ).to.emit(stakingProxy, "UnstakeRequested");

      const [, , , , , canUnstake] = await stakingProxy.getStakingInfo(user1.address);
      expect(canUnstake).to.be.false; // Still in cooldown
    });

    it("Should execute unstaking after cooldown", async function () {
      const unstakeAmount = ethers.parseEther("500");
      
      // Request unstake
      await stakingProxy.connect(user1).requestUnstake(unstakeAmount);
      
      // Fast forward time (simulate 7 days)
      await ethers.provider.send("evm_increaseTime", [7 * 24 * 3600 + 1]);
      await ethers.provider.send("evm_mine", []);
      
      const initialBalance = await stakingToken.balanceOf(user1.address);
      
      await expect(
        stakingProxy.connect(user1).executeUnstake(unstakeAmount)
      ).to.emit(stakingProxy, "UnstakeExecuted");
      
      const finalBalance = await stakingToken.balanceOf(user1.address);
      expect(finalBalance).to.be.greaterThan(initialBalance);
    });

    it("Should revert unstaking before cooldown", async function () {
      const unstakeAmount = ethers.parseEther("500");
      
      await stakingProxy.connect(user1).requestUnstake(unstakeAmount);
      
      await expect(
        stakingProxy.connect(user1).executeUnstake(unstakeAmount)
      ).to.be.revertedWithCustomError(stakingProxy, "UnstakeDelayNotMet");
    });

    it("Should revert unstaking without request", async function () {
      const unstakeAmount = ethers.parseEther("500");
      
      await expect(
        stakingProxy.connect(user1).executeUnstake(unstakeAmount)
      ).to.be.revertedWithCustomError(stakingProxy, "UnstakeNotRequested");
    });

    it("Should revert unstaking more than staked", async function () {
      const excessiveAmount = ethers.parseEther("2000");
      
      await expect(
        stakingProxy.connect(user1).requestUnstake(excessiveAmount)
      ).to.be.revertedWithCustomError(stakingProxy, "InsufficientStake");
    });
  });

  describe("Rewards System", function () {
    beforeEach(async function () {
      await stakingToken.connect(user1).approve(
        await stakingProxy.getAddress(), 
        ethers.parseEther("10000")
      );
      
      await stakingProxy.connect(user1).stakeWithCollateral(
        await stakingToken.getAddress(),
        ethers.parseEther("1000")
      );
    });

    it("Should calculate pending rewards", async function () {
      // Fast forward 1 year
      await ethers.provider.send("evm_increaseTime", [365 * 24 * 3600]);
      await ethers.provider.send("evm_mine", []);
      
      const [, pendingRewards] = await stakingProxy.getStakingInfo(user1.address);
      expect(pendingRewards).to.be.greaterThan(0);
      
      // Should be approximately 5% of staked amount (50 ETH for 1000 ETH staked)
      const expectedRewards = ethers.parseEther("50"); // 5% of 1000 ETH
      expect(pendingRewards).to.be.closeTo(expectedRewards, ethers.parseEther("1"));
    });

    it("Should distribute rewards on unstaking", async function () {
      // Fast forward some time
      await ethers.provider.send("evm_increaseTime", [30 * 24 * 3600]); // 30 days
      await ethers.provider.send("evm_mine", []);
      
      const unstakeAmount = ethers.parseEther("1000");
      
      // Request and execute unstake
      await stakingProxy.connect(user1).requestUnstake(unstakeAmount);
      
      await ethers.provider.send("evm_increaseTime", [7 * 24 * 3600 + 1]);
      await ethers.provider.send("evm_mine", []);
      
      const initialBalance = await stakingToken.balanceOf(user1.address);
      
      await stakingProxy.connect(user1).executeUnstake(unstakeAmount);
      
      const finalBalance = await stakingToken.balanceOf(user1.address);
      const received = finalBalance - initialBalance;
      
      // Should receive more than the unstaked amount due to rewards
      expect(received).to.be.greaterThan(unstakeAmount);
    });
  });

  describe("Token Management", function () {
    it("Should add supported staking token", async function () {
      const newToken = await (await ethers.getContractFactory("MockERC20"))
        .deploy("New Staking Token", "NST", 18, ethers.parseEther("1000"));

      await expect(
        stakingProxy.setSupportedStakingToken(await newToken.getAddress(), true)
      ).to.emit(stakingProxy, "StakingTokenAdded")
       .withArgs(await newToken.getAddress(), true);

      expect(await stakingProxy.supportedStakingTokens(await newToken.getAddress())).to.be.true;
    });

    it("Should remove supported staking token", async function () {
      await expect(
        stakingProxy.setSupportedStakingToken(await stakingToken.getAddress(), false)
      ).to.emit(stakingProxy, "StakingTokenAdded")
       .withArgs(await stakingToken.getAddress(), false);

      expect(await stakingProxy.supportedStakingTokens(await stakingToken.getAddress())).to.be.false;
    });
  });

  describe("Parameter Updates", function () {
    it("Should update base reward rate", async function () {
      const newRate = 800; // 8%
      
      await expect(
        stakingProxy.updateBaseRewardRate(newRate)
      ).to.emit(stakingProxy, "RewardRateUpdated")
       .withArgs(500, newRate); // old rate, new rate

      expect(await stakingProxy.baseAnnualRewardRate()).to.equal(newRate);
    });

    it("Should revert with invalid reward rate", async function () {
      await expect(
        stakingProxy.updateBaseRewardRate(0)
      ).to.be.revertedWithCustomError(stakingProxy, "InvalidRewardRate");

      await expect(
        stakingProxy.updateBaseRewardRate(2500) // 25% - too high
      ).to.be.revertedWithCustomError(stakingProxy, "InvalidRewardRate");
    });

    it("Should update protocol fee rate", async function () {
      const newFeeRate = 200; // 2%
      
      await stakingProxy.updateProtocolFeeRate(newFeeRate);
      expect(await stakingProxy.protocolFeeRate()).to.equal(newFeeRate);
    });

    it("Should revert with excessive protocol fee", async function () {
      await expect(
        stakingProxy.updateProtocolFeeRate(1500) // 15% - too high
      ).to.be.revertedWith("Fee rate too high");
    });
  });

  describe("Emergency Functions", function () {
    it("Should allow emergency withdrawal", async function () {
      const withdrawAmount = ethers.parseEther("100");
      const initialBalance = await stakingToken.balanceOf(owner.address);
      
      await stakingProxy.emergencyWithdraw(
        await stakingToken.getAddress(),
        withdrawAmount,
        owner.address
      );
      
      const finalBalance = await stakingToken.balanceOf(owner.address);
      expect(finalBalance - initialBalance).to.equal(withdrawAmount);
    });

    it("Should revert emergency withdrawal from non-owner", async function () {
      await expect(
        stakingProxy.connect(user1).emergencyWithdraw(
          await stakingToken.getAddress(),
          ethers.parseEther("100"),
          user1.address
        )
      ).to.be.revertedWithCustomError(stakingProxy, "OwnableUnauthorizedAccount");
    });
  });

  describe("View Functions", function () {
    beforeEach(async function () {
      await stakingToken.connect(user1).approve(
        await stakingProxy.getAddress(), 
        ethers.parseEther("10000")
      );
      
      await stakingProxy.connect(user1).stakeWithCollateral(
        await stakingToken.getAddress(),
        ethers.parseEther("1000")
      );
    });

    it("Should return complete staking info", async function () {
      const [stakedAmount, pendingRewards, liquidBalance, collateralValue, isHealthy, canUnstake] = 
        await stakingProxy.getStakingInfo(user1.address);
      
      expect(stakedAmount).to.equal(ethers.parseEther("1000"));
      expect(liquidBalance).to.equal(ethers.parseEther("1000"));
      expect(collateralValue).to.be.greaterThan(0);
      expect(isHealthy).to.be.true;
      expect(canUnstake).to.be.false;
    });

    it("Should return liquid staking balance", async function () {
      const balance = await stakingProxy.getLiquidStakingBalance(
        user1.address,
        await stakingToken.getAddress()
      );
      expect(balance).to.equal(ethers.parseEther("1000"));
    });

    it("Should return protocol stats", async function () {
      const [totalValueLocked, totalRewards, activeStakers, supportedTokens] = 
        await stakingProxy.getProtocolStats();
      
      // Basic checks - in production these would be more comprehensive
      expect(totalRewards).to.equal(0); // No rewards distributed yet
    });
  });
});