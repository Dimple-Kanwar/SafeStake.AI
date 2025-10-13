import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { 
  CollateralManager, 
  MockERC20,
  MockPyth 
} from "../typechain-types";

describe("CollateralManager", function () {
  let collateralManager: CollateralManager;
  let mockPyth: MockPyth;
  let pyusdToken: MockERC20;
  let usdcToken: MockERC20;
  let owner: SignerWithAddress;
  let feeRecipient: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;

  beforeEach(async function () {
    [owner, feeRecipient, user1, user2] = await ethers.getSigners();

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

    // Deploy mock tokens
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    pyusdToken = await MockERC20.deploy("PayPal USD", "PYUSD", 6, ethers.parseUnits("1000000", 6));
    usdcToken = await MockERC20.deploy("USD Coin", "USDC", 6, ethers.parseUnits("1000000", 6));

    // Mint tokens to users
    await pyusdToken.mint(user1.address, ethers.parseUnits("10000", 6));
    await pyusdToken.mint(user2.address, ethers.parseUnits("10000", 6));
    await usdcToken.mint(user1.address, ethers.parseUnits("10000", 6));
    await usdcToken.mint(user2.address, ethers.parseUnits("10000", 6));

    // Add USDC as supported token
    await collateralManager.addSupportedToken(
      await usdcToken.getAddress(),
      "0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a", // USDC/USD price ID
      6, // decimals
      8500, // 85% liquidation threshold
      ethers.parseUnits("100000", 6), // 100k max deposit
      true // is stablecoin
    );
  });

  describe("Deployment", function () {
    it("Should set the right owner and fee recipient", async function () {
      expect(await collateralManager.owner()).to.equal(owner.address);
      expect(await collateralManager.feeRecipient()).to.equal(feeRecipient.address);
    });

    it("Should initialize PYUSD configurations", async function () {
      const supportedTokens = await collateralManager.getSupportedTokens();
      expect(supportedTokens.length).to.be.greaterThan(0);
    });

    it("Should revert with zero addresses", async function () {
      const CollateralManager = await ethers.getContractFactory("CollateralManager");
      
      await expect(
        CollateralManager.deploy(ethers.ZeroAddress, feeRecipient.address)
      ).to.be.revertedWithCustomError(collateralManager, "InvalidFeeRecipient");

      await expect(
        CollateralManager.deploy(await mockPyth.getAddress(), ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(collateralManager, "InvalidFeeRecipient");
    });
  });

  describe("PYUSD Deposits", function () {
    beforeEach(async function () {
      // Approve tokens
      await pyusdToken.connect(user1).approve(
        await collateralManager.getAddress(), 
        ethers.parseUnits("10000", 6)
      );
    });

    it("Should deposit PYUSD successfully", async function () {
      const depositAmount = ethers.parseUnits("1000", 6);
      const priceUpdateData: string[] = [];
      
      await expect(
        collateralManager.connect(user1).depositPYUSD(depositAmount, priceUpdateData, {
          value: ethers.parseEther("0.01") // Price update fee
        })
      ).to.emit(collateralManager, "PYUSDDeposited")
       .withArgs(user1.address, depositAmount - (depositAmount * 10n) / 10000n); // Minus 0.1% fee

      // Check position was created
      const collateralValue = await collateralManager.getCollateralValue(user1.address);
      expect(collateralValue).to.be.greaterThan(0);
    });

    it("Should revert with zero amount", async function () {
      await expect(
        collateralManager.connect(user1).depositPYUSD(0, [])
      ).to.be.revertedWithCustomError(collateralManager, "InvalidAmount");
    });

    it("Should handle price updates correctly", async function () {
      const depositAmount = ethers.parseUnits("1000", 6);
      const priceUpdateData = ["0x1234"]; // Mock update data
      
      await expect(
        collateralManager.connect(user1).depositPYUSD(depositAmount, priceUpdateData, {
          value: ethers.parseEther("0.01")
        })
      ).to.emit(mockPyth, "PriceFeedUpdate");
    });

    it("Should collect deposit fees", async function () {
      const depositAmount = ethers.parseUnits("1000", 6);
      const expectedFee = (depositAmount * 10n) / 10000n; // 0.1% fee
      
      const initialBalance = await pyusdToken.balanceOf(feeRecipient.address);
      
      await collateralManager.connect(user1).depositPYUSD(depositAmount, [], {
        value: ethers.parseEther("0.01")
      });
      
      const finalBalance = await pyusdToken.balanceOf(feeRecipient.address);
      expect(finalBalance - initialBalance).to.equal(expectedFee);
    });
  });

  describe("General Collateral Deposits", function () {
    beforeEach(async function () {
      await usdcToken.connect(user1).approve(
        await collateralManager.getAddress(), 
        ethers.parseUnits("10000", 6)
      );
    });

    it("Should deposit supported tokens", async function () {
      const depositAmount = ethers.parseUnits("1000", 6);
      
      await expect(
        collateralManager.connect(user1).depositCollateral(
          await usdcToken.getAddress(),
          depositAmount,
          [],
          { value: ethers.parseEther("0.01") }
        )
      ).to.emit(collateralManager, "CollateralDeposited");

      const balance = await collateralManager.getTokenBalance(
        user1.address, 
        await usdcToken.getAddress()
      );
      expect(balance).to.be.greaterThan(0);
    });

    it("Should revert for unsupported tokens", async function () {
      const unsupportedToken = await (await ethers.getContractFactory("MockERC20"))
        .deploy("Unsupported", "UNS", 18, ethers.parseEther("1000"));

      await expect(
        collateralManager.connect(user1).depositCollateral(
          await unsupportedToken.getAddress(),
          ethers.parseEther("100"),
          []
        )
      ).to.be.revertedWithCustomError(collateralManager, "TokenNotSupported");
    });

    it("Should enforce maximum deposit limits", async function () {
      const maxDeposit = ethers.parseUnits("100000", 6);
      const excessiveAmount = maxDeposit + 1n;
      
      await expect(
        collateralManager.connect(user1).depositCollateral(
          await usdcToken.getAddress(),
          excessiveAmount,
          []
        )
      ).to.be.revertedWithCustomError(collateralManager, "ExceedsMaxDeposit");
    });
  });

  describe("Collateral Withdrawals", function () {
    beforeEach(async function () {
      // Setup deposits first
      await usdcToken.connect(user1).approve(
        await collateralManager.getAddress(), 
        ethers.parseUnits("10000", 6)
      );
      
      await collateralManager.connect(user1).depositCollateral(
        await usdcToken.getAddress(),
        ethers.parseUnits("1000", 6),
        [],
        { value: ethers.parseEther("0.01") }
      );
    });

    it("Should withdraw collateral successfully", async function () {
      const withdrawAmount = ethers.parseUnits("500", 6);
      
      await expect(
        collateralManager.connect(user1).withdrawCollateral(
          await usdcToken.getAddress(),
          withdrawAmount,
          [],
          { value: ethers.parseEther("0.01") }
        )
      ).to.emit(collateralManager, "CollateralWithdrawn");
    });

    it("Should revert when withdrawing more than balance", async function () {
      const excessiveAmount = ethers.parseUnits("2000", 6);
      
      await expect(
        collateralManager.connect(user1).withdrawCollateral(
          await usdcToken.getAddress(),
          excessiveAmount,
          []
        )
      ).to.be.revertedWithCustomError(collateralManager, "InsufficientBalance");
    });

    it("Should collect withdrawal fees", async function () {
      const withdrawAmount = ethers.parseUnits("500", 6);
      const expectedFee = (withdrawAmount * 20n) / 10000n; // 0.2% withdrawal fee
      
      const initialBalance = await usdcToken.balanceOf(feeRecipient.address);
      
      await collateralManager.connect(user1).withdrawCollateral(
        await usdcToken.getAddress(),
        withdrawAmount,
        [],
        { value: ethers.parseEther("0.01") }
      );
      
      const finalBalance = await usdcToken.balanceOf(feeRecipient.address);
      expect(finalBalance).to.be.greaterThan(initialBalance);
    });
  });

  describe("Collateral Valuation", function () {
    beforeEach(async function () {
      await usdcToken.connect(user1).approve(
        await collateralManager.getAddress(), 
        ethers.parseUnits("10000", 6)
      );
    });

    it("Should calculate collateral value correctly", async function () {
      const depositAmount = ethers.parseUnits("1000", 6);
      
      await collateralManager.connect(user1).depositCollateral(
        await usdcToken.getAddress(),
        depositAmount,
        [],
        { value: ethers.parseEther("0.01") }
      );
      
      const collateralValue = await collateralManager.getCollateralValue(user1.address);
      expect(collateralValue).to.be.greaterThan(0);
    });

    it("Should check staking eligibility", async function () {
      const depositAmount = ethers.parseUnits("1500", 6); // $1500
      const stakeAmount = ethers.parseUnits("1000", 8); // $1000 stake (8 decimals for USD)
      
      await collateralManager.connect(user1).depositCollateral(
        await usdcToken.getAddress(),
        depositAmount,
        [],
        { value: ethers.parseEther("0.01") }
      );
      
      const canStake = await collateralManager.canStake(user1.address, stakeAmount);
      expect(canStake).to.be.true; // 150% collateral ratio satisfied
    });

    it("Should check liquidation conditions", async function () {
      const depositAmount = ethers.parseUnits("1300", 6); // $1300
      const stakeAmount = ethers.parseUnits("1000", 8); // $1000 stake
      
      await collateralManager.connect(user1).depositCollateral(
        await usdcToken.getAddress(),
        depositAmount,
        [],
        { value: ethers.parseEther("0.01") }
      );
      
      const canLiquidate = await collateralManager.canLiquidate(user1.address, stakeAmount);
      expect(canLiquidate).to.be.true; // Below 130% liquidation threshold
    });

    it("Should calculate health ratio", async function () {
      const depositAmount = ethers.parseUnits("2000", 6); // $2000
      const stakeAmount = ethers.parseUnits("1000", 8); // $1000 stake
      
      await collateralManager.connect(user1).depositCollateral(
        await usdcToken.getAddress(),
        depositAmount,
        [],
        { value: ethers.parseEther("0.01") }
      );
      
      const healthRatio = await collateralManager.getHealthRatio(user1.address, stakeAmount);
      expect(healthRatio).to.be.greaterThan(15000); // Should be around 200% (20000 basis points)
    });
  });

  describe("Token Management", function () {
    it("Should add new supported token", async function () {
      const newToken = await (await ethers.getContractFactory("MockERC20"))
        .deploy("New Token", "NEW", 18, ethers.parseEther("1000"));

      await expect(
        collateralManager.addSupportedToken(
          await newToken.getAddress(),
          "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef", // Mock price ID
          18,
          8000, // 80% threshold
          ethers.parseEther("10000"), // 10k max deposit
          false // not stablecoin
        )
      ).to.emit(collateralManager, "TokenAdded");

      const supportedTokens = await collateralManager.getSupportedTokens();
      expect(supportedTokens).to.include(await newToken.getAddress());
    });

    it("Should remove supported token", async function () {
      const tokenAddress = await usdcToken.getAddress();
      
      await expect(
        collateralManager.removeSupportedToken(tokenAddress)
      ).to.emit(collateralManager, "TokenRemoved")
       .withArgs(tokenAddress);
    });

    it("Should revert when removing unsupported token", async function () {
      const unsupportedToken = await (await ethers.getContractFactory("MockERC20"))
        .deploy("Unsupported", "UNS", 18, ethers.parseEther("1000"));

      await expect(
        collateralManager.removeSupportedToken(await unsupportedToken.getAddress())
      ).to.be.revertedWithCustomError(collateralManager, "TokenNotSupported");
    });
  });

  describe("Fee Management", function () {
    it("Should update fees", async function () {
      const newDepositFee = 20; // 0.2%
      const newWithdrawalFee = 30; // 0.3%
      
      await expect(
        collateralManager.updateFees(newDepositFee, newWithdrawalFee)
      ).to.emit(collateralManager, "FeesUpdated")
       .withArgs(newDepositFee, newWithdrawalFee);

      expect(await collateralManager.depositFee()).to.equal(newDepositFee);
      expect(await collateralManager.withdrawalFee()).to.equal(newWithdrawalFee);
    });

    it("Should revert with excessive fees", async function () {
      await expect(
        collateralManager.updateFees(600, 100) // 6% deposit fee (too high)
      ).to.be.revertedWith("Fee too high");
    });

    it("Should update fee recipient", async function () {
      const newRecipient = user2.address;
      
      await collateralManager.updateFeeRecipient(newRecipient);
      expect(await collateralManager.feeRecipient()).to.equal(newRecipient);
    });

    it("Should revert with zero address fee recipient", async function () {
      await expect(
        collateralManager.updateFeeRecipient(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(collateralManager, "InvalidFeeRecipient");
    });
  });

  describe("Position Summary", function () {
    beforeEach(async function () {
      await usdcToken.connect(user1).approve(
        await collateralManager.getAddress(), 
        ethers.parseUnits("10000", 6)
      );
      await pyusdToken.connect(user1).approve(
        await collateralManager.getAddress(), 
        ethers.parseUnits("10000", 6)
      );
    });

    it("Should return position summary", async function () {
      // Make deposits
      await collateralManager.connect(user1).depositCollateral(
        await usdcToken.getAddress(),
        ethers.parseUnits("1000", 6),
        [],
        { value: ethers.parseEther("0.01") }
      );
      
      await collateralManager.connect(user1).depositPYUSD(
        ethers.parseUnits("500", 6),
        [],
        { value: ethers.parseEther("0.01") }
      );
      
      const [totalValueUSD, tokenCount, lastUpdate, isActive, deposits] = 
        await collateralManager.getPositionSummary(user1.address);
      
      expect(totalValueUSD).to.be.greaterThan(0);
      expect(tokenCount).to.equal(2); // USDC and PYUSD
      expect(isActive).to.be.true;
      expect(deposits).to.equal(2);
    });

    it("Should return empty summary for new user", async function () {
      const [totalValueUSD, tokenCount, lastUpdate, isActive, deposits] = 
        await collateralManager.getPositionSummary(user2.address);
      
      expect(totalValueUSD).to.equal(0);
      expect(tokenCount).to.equal(0);
      expect(isActive).to.be.false;
      expect(deposits).to.equal(0);
    });
  });
});