import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("BridgeCoordinatorModule", (m) => {
  const stakingProxyAddress = "";
  const feeRecipientAddress = "";
  const bridgeCoordinator = m.contract("BridgeCoordinator", [
    stakingProxyAddress,
    feeRecipientAddress, // Fee recipient
  ]);

  return { bridgeCoordinator };
});
