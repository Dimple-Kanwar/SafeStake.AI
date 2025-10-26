import asyncio
import os
from typing import Dict, Any, Optional, List
from uagents import Agent, Context, Model # pyright: ignore[reportMissingImports]
from uagents.network import get_faucet, wait_for_tx_to_complete # pyright: ignore[reportMissingImports]
from pydantic import BaseModel, Field # type: ignore
from dotenv import load_dotenv # type: ignore
import json
import time

load_dotenv()
# Message Models for Agent Communication

class OptimizationRequest(Model):
    user_address: str
    target_stake_amount: float
    target_chain: str
    target_token: str
    risk_tolerance: str = "moderate"
    time_horizon: int = 30
    current_portfolio: Dict[str, Any] = {}

class OptimizationResponse(Model):
    strategy_id: str
    recommended_actions: List[Dict[str, Any]] = []
    expected_yield: float
    risk_score: float
    estimated_gas_cost: float
    execution_steps: List[str] = []
    requires_bridging: bool = False
    bridge_route: Optional[Dict[str, Any]] = None

class BridgeRequest(Model):
    strategy_id: str
    user_address: str
    source_chain: str
    target_chain: str
    token: str
    amount: float
    destination_contract: str
    execution_data: bytes

class BridgeResponse(Model):
    bridge_id: str
    estimated_time: int
    bridge_fee: float
    success_probability: float
    nexus_operation_id: Optional[str] = None

class ConversionRequest(Model):
    strategy_id: str
    user_address: str
    source_token: str
    target_token: str
    amount: float
    chain: str
    slippage_tolerance: float = 0.005
    deadline: int

class ConversionResponse(Model):
    conversion_id: str
    expected_output: float
    actual_slippage: float
    dex_route: List[str] = []
    gas_estimate: int

class ExecutionRequest(Model):
    strategy_id: str
    user_address: str
    bridge_result: Optional[BridgeResponse] = None
    conversion_result: Optional[ConversionResponse] = None
    final_amount: float
    target_contract: str

class ExecutionResponse(Model):
    execution_id: str
    transaction_hash: str
    status: str
    liquid_tokens_issued: float = 0


# Master Coordinator Agent
class MasterCoordinatorAgent:
    def __init__(self):
        self.agent = Agent(
            name="master_coordinator",
            seed=os.getenv("COORDINATOR_SEED", "coordinator_agent_seed_phrase"),
            port=8000,
            endpoint=["http://127.0.0.1:8000/submit"]
        )
        
        # Agent addresses (will be populated during registration)
        self.strategy_agent_address = ""
        self.bridge_agent_address = ""
        self.conversion_agent_address = ""
        
        # Active strategies tracking
        self.active_strategies: Dict[str, Dict[str, Any]] = {}
        
        self._setup_handlers()
    
    def _setup_handlers(self):
        @self.agent.on_event("startup")
        async def startup_handler(ctx: Context):
            ctx.logger.info(f"Master Coordinator Agent started")
            ctx.logger.info(f"Agent address: {self.agent.address}")
            
            # Fund agent for network operations
            try:
                await get_faucet()
                ctx.logger.info("Agent funded successfully")
            except Exception as e:
                ctx.logger.error(f"Failed to fund agent: {e}")
            
            # Register agent addresses (in production, these would be discovered)
            await self._discover_agent_addresses(ctx)
        
        @self.agent.on_message(model=OptimizationRequest)
        async def handle_optimization_request(ctx: Context, sender: str, msg: OptimizationRequest):
            ctx.logger.info(f"Received optimization request for user: {msg.user_address}")
            
            try:
                # Forward to strategy optimization agent
                if self.strategy_agent_address:
                    ctx.logger.info("Forwarding to Strategy Optimization Agent...")
                    await ctx.send(self.strategy_agent_address, msg)
                else:
                    ctx.logger.error("Strategy agent address not available")
                    
            except Exception as e:
                ctx.logger.error(f"Failed to process optimization request: {e}")
        
        @self.agent.on_message(model=OptimizationResponse)
        async def handle_optimization_response(ctx: Context, sender: str, msg: OptimizationResponse):
            ctx.logger.info(f"Received optimization response: {msg.strategy_id}")
            
            # Store strategy
            self.active_strategies[msg.strategy_id] = {
                "strategy": msg,
                "status": "optimized",
                "created_at": time.time()
            }
            
            try:
                # If bridging required, send to bridge agent
                if msg.requires_bridging and msg.bridge_route:
                    bridge_request = BridgeRequest(
                        strategy_id=msg.strategy_id,
                        user_address=msg.bridge_route["user_address"],
                        source_chain=msg.bridge_route["source_chain"],
                        target_chain=msg.bridge_route["target_chain"],
                        token=msg.bridge_route["token"],
                        amount=msg.bridge_route["amount"],
                        destination_contract=msg.bridge_route.get("destination_contract", ""),
                        execution_data=msg.bridge_route.get("execution_data", b"")
                    )
                    
                    if self.bridge_agent_address:
                        await ctx.send(self.bridge_agent_address, bridge_request)
                        ctx.logger.info("Sent bridge request")
                    else:
                        ctx.logger.error("Bridge agent address not available")
                
                else:
                    # Direct execution without bridging
                    ctx.logger.info("No bridging required, proceeding to execution")
                    await self._execute_strategy(ctx, msg.strategy_id)
                    
            except Exception as e:
                ctx.logger.error(f"Failed to process optimization response: {e}")
        
        @self.agent.on_message(model=BridgeResponse)
        async def handle_bridge_response(ctx: Context, sender: str, msg: BridgeResponse):
            ctx.logger.info(f"Received bridge response: {msg.bridge_id}")
            
            # Update strategy status
            for strategy_id, strategy_data in self.active_strategies.items():
                if strategy_data.get("bridge_id") == msg.bridge_id:
                    strategy_data["bridge_result"] = msg
                    strategy_data["status"] = "bridged"
                    
                    # Proceed to conversion or execution
                    await self._process_next_step(ctx, strategy_id)
                    break
        
        @self.agent.on_message(model=ConversionResponse)
        async def handle_conversion_response(ctx: Context, sender: str, msg: ConversionResponse):
            ctx.logger.info(f"Received conversion response: {msg.conversion_id}")
            
            # Update strategy and proceed to execution
            for strategy_id, strategy_data in self.active_strategies.items():
                if strategy_data.get("conversion_id") == msg.conversion_id:
                    strategy_data["conversion_result"] = msg
                    strategy_data["status"] = "converted"
                    
                    await self._execute_strategy(ctx, strategy_id)
                    break
        
        @self.agent.on_message(model=ExecutionResponse)
        async def handle_execution_response(ctx: Context, sender: str, msg: ExecutionResponse):
            ctx.logger.info(f"Strategy execution completed: {msg.execution_id}")
            
            # Update strategy status
            for strategy_id, strategy_data in self.active_strategies.items():
                if strategy_data.get("execution_id") == msg.execution_id:
                    strategy_data["execution_result"] = msg
                    strategy_data["status"] = "completed"
                    strategy_data["completed_at"] = time.time()
                    break
    
    async def _discover_agent_addresses(self, ctx: Context):
        """Discover other agent addresses (simplified for demo)"""
        # In production, this would query the Almanac contract
        self.strategy_agent_address = os.getenv("STRATEGY_AGENT_ADDRESS", "agent1qg...")
        self.bridge_agent_address = os.getenv("BRIDGE_AGENT_ADDRESS", "agent1qh...")
        self.conversion_agent_address = os.getenv("CONVERSION_AGENT_ADDRESS", "agent1qi...")
        
        ctx.logger.info(f"Discovered agents:")
        ctx.logger.info(f"  Strategy: {self.strategy_agent_address}")
        ctx.logger.info(f"  Bridge: {self.bridge_agent_address}")
        ctx.logger.info(f"  Conversion: {self.conversion_agent_address}")
    
    async def _process_next_step(self, ctx: Context, strategy_id: str):
        """Process next step in strategy execution"""
        strategy_data = self.active_strategies.get(strategy_id)
        if not strategy_data:
            return
        
        strategy = strategy_data["strategy"]
        
        # Check if conversion is needed
        if any("convert" in step.lower() for step in strategy.execution_steps):
            # Send conversion request
            conversion_request = ConversionRequest(
                strategy_id=strategy_id,
                user_address=strategy.bridge_route["user_address"],
                source_token="USDC",  # Example
                target_token="ETH",   # Example
                amount=100.0,         # Example
                chain="ethereum",     # Example
                deadline=int(time.time()) + 1800  # 30 minutes
            )
            
            if self.conversion_agent_address:
                await ctx.send(self.conversion_agent_address, conversion_request)
                ctx.logger.info("Sent conversion request")
        else:
            # Direct to execution
            await self._execute_strategy(ctx, strategy_id)
    
    async def _execute_strategy(self, ctx: Context, strategy_id: str):
        """Execute the final staking strategy"""
        strategy_data = self.active_strategies.get(strategy_id)
        if not strategy_data:
            return
        
        # Create execution request
        execution_request = ExecutionRequest(
            strategy_id=strategy_id,
            user_address=strategy_data["strategy"].bridge_route.get("user_address", ""),
            bridge_result=strategy_data.get("bridge_result"),
            conversion_result=strategy_data.get("conversion_result"),
            final_amount=100.0,  # Calculate based on results
            target_contract=os.getenv("STAKING_PROXY_ADDRESS", "")
        )
        
        # For now, simulate execution
        execution_response = ExecutionResponse(
            execution_id=f"exec_{int(time.time())}",
            transaction_hash=f"0x{'0' * 60}{int(time.time()) % 10000:04d}",
            status="success",
            liquid_tokens_issued=100.0
        )
        
        strategy_data["execution_result"] = execution_response
        strategy_data["status"] = "completed"
        
        ctx.logger.info(f"Strategy {strategy_id} execution completed")
    
    def run(self):
        """Start the coordinator agent"""
        self.agent.run()

# Singleton instance
coordinator = MasterCoordinatorAgent()

if __name__ == "__main__":
    print("Starting Master Coordinator Agent...")
    print(f"Agent address will be: {coordinator.agent.address}")
    coordinator.run()
