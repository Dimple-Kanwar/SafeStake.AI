import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("StakingProxyModule", (m) => {
    const collateralManagerAddress ="";
    const aiControllerAddress ="";
    const protocolTreasuryAddress = "";
  const stakingProxy = m.contract("StakingProxy", [
    collateralManagerAddress,
    aiControllerAddress,
    protocolTreasuryAddress, // Protocol treasury
  ]);

  return { stakingProxy };
});
