// import { NEXUS_EVENTS, ProgressStep } from '@avail-project/nexus-core';
 
// // Bridge & Execute Progress
// const unsubscribeBridgeExecuteExpected = sdk.nexusEvents.on(
//   NEXUS_EVENTS.BRIDGE_EXECUTE_EXPECTED_STEPS,
//   (steps: ProgressStep[]) => {
//     console.log(
//       'Bridge & Execute steps →',
//       steps.map((s) => s.typeID),
//     );
//   },
// );
 
// const unsubscribeBridgeExecuteCompleted = sdk.nexusEvents.on(
//   NEXUS_EVENTS.BRIDGE_EXECUTE_COMPLETED_STEPS,
//   (step: ProgressStep) => {
//     console.log('Bridge & Execute completed →', step.typeID, step.data);
 
//     if (step.typeID === 'IS' && step.data.explorerURL) {
//       console.log('View transaction:', step.data.explorerURL);
//     }
//   },
// );
 
// // Transfer & Bridge Progress (optimized operations)
// const unsubscribeTransferExpected = sdk.nexusEvents.on(
//   NEXUS_EVENTS.EXPECTED_STEPS,
//   (steps: ProgressStep[]) => {
//     console.log(
//       'Transfer/Bridge steps →',
//       steps.map((s) => s.typeID),
//     );
//     // For direct transfers: ['CS', 'TS', 'IS'] (3 steps, ~5-15s)
//   },
// );
 
// const unsubscribeTransferCompleted = sdk.nexusEvents.on(
//   NEXUS_EVENTS.STEP_COMPLETE,
//   (step: ProgressStep) => {
//     console.log('Transfer/Bridge completed →', step.typeID, step.data);
 
//     if (step.typeID === 'IS' && step.data.explorerURL) {
//       // Transaction submitted with hash - works for both direct and CA
//       console.log('Transaction hash:', step.data.transactionHash);
//       console.log('Explorer URL:', step.data.explorerURL);
//     }
//   },
// );
 
// // Cleanup
// return () => {
//   unsubscribeBridgeExecuteExpected();
//   unsubscribeBridgeExecuteCompleted();
//   unsubscribeTransferExpected();
//   unsubscribeTransferCompleted();
// };