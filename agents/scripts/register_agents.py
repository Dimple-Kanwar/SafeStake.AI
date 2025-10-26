import asyncio
import os
from uagents.network import get_faucet, wait_for_tx_to_complete
from dotenv import load_dotenv
import sys
sys.path.append('../agents')

from coordinator import MasterCoordinatorAgent
from strategy_optimizer import StrategyOptimizationAgent  
from bridge_agent import CrossChainBridgeAgent
from conversion_agent import AssetConversionAgent

load_dotenv()

async def register_all_agents():
    """Register all agents on the Almanac"""
    print("🤖 Registering AI Agents on Fetch.ai Almanac...")
    
    # Initialize agents
    coordinator = MasterCoordinatorAgent()
    strategy_optimizer = StrategyOptimizationAgent()
    bridge_agent = CrossChainBridgeAgent()
    conversion_agent = AssetConversionAgent()
    
    agents = [
        ("Master Coordinator", coordinator.agent),
        ("Strategy Optimizer", strategy_optimizer.agent),
        ("Bridge Agent", bridge_agent.agent),
        ("Conversion Agent", conversion_agent.agent)
    ]
    
    for name, agent in agents:
        try:
            print(f"\n📋 Registering {name}...")
            print(f"   Address: {agent.address}")
            
            # Fund agent
            await get_faucet(agent.wallet.address())
            print(f"   ✅ Funded")
            
            # Register on Almanac
            await agent.register()
            print(f"   ✅ Registered on Almanac")
            
        except Exception as e:
            print(f"   ❌ Failed to register {name}: {e}")
    
    print("\n🎉 Agent registration complete!")
    print("\n📋 Agent Directory:")
    for name, agent in agents:
        print(f"   {name}: {agent.address}")
    
    # Save addresses to environment file
    with open('.env.agents', 'w') as f:
        f.write("# AI Agent Addresses\n")
        f.write(f"COORDINATOR_ADDRESS={coordinator.agent.address}\n")
        f.write(f"STRATEGY_AGENT_ADDRESS={strategy_optimizer.agent.address}\n")
        f.write(f"BRIDGE_AGENT_ADDRESS={bridge_agent.agent.address}\n")
        f.write(f"CONVERSION_AGENT_ADDRESS={conversion_agent.agent.address}\n")
    
    print("\n📄 Agent addresses saved to .env.agents")

if __name__ == "__main__":
    asyncio.run(register_all_agents())
