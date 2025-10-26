import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("CollateralManagerModule", (m) => {
  const pythAddress = "";
  const feeRecipientAddress = "";
  const collateralManager = m.contract("CollateralManager", [
    pythAddress,
    feeRecipientAddress, // Fee recipient
  ]);

  return { collateralManager };
});
