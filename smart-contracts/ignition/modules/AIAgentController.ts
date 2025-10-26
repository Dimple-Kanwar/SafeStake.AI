import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("AIAgentControllerModule", (m) => {
  const aIAgentController = m.contract("AIAgentController");
  return { aIAgentController };
});
