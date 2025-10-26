import asyncio
import os
from typing import Dict, List, Any, Optional
from uagents import Agent, Context
from uagents.network import get_faucet
from coordinator import BridgeRequest, BridgeResponse
import json
import time
import random
from dotenv import load_dotenv

load_dotenv()

class CrossChainBridgeAgent:
    def __init__(self):
        self.agent = Agent(
            name="bridge_coordinator",
            seed=os.getenv("BRIDGE_SEED", "bridge_coordinator_seed_phrase"),
            port=8002,
            endpoint=["http://127.0.0.1:8002/submit"]
        )
        
        # Bridge configurations for different chains
        self.bridge_configs = self._setup_bridge_configs()
        self._setup_handlers()
    
    def _setup_bridge_configs(self):
        """Setup bridge configurations for supported chains"""
        return {
            "ethereum": {
                "chain_id": 1,
                "gas_price_gwei": 20,
                "supported_tokens": ["ETH", "USDC", "PYUSD", "WETH"],
                "bridge_contracts": {
                    "nexus": "0x...",  # Avail Nexus contract address
                }
            },
            "polygon": {
                "chain_id": 137,
                "gas_price_gwei": 30,
                "supported_tokens": ["MATIC", "USDC", "WETH"],
                "bridge_contracts": {
                    "nexus": "0x...",
                }
            },
            "arbitrum": {
                "chain_id": 42161,
                "gas_price_gwei": 0.1,
                "supported_tokens": ["ETH", "USDC", "ARB"],
                "bridge_contracts": {
                    "nexus": "0x...",
                }
            },
            "base": {
                "chain_id": 8453,
                "gas_price_gwei": 0.05,
                "supported_tokens": ["ETH", "USDC"],
                "bridge_contracts": {
                    "nexus": "0x...",
                }
            }
        }
    
    def _setup_handlers(self):
        @self.agent.on_event("startup")
        async def startup_handler(ctx: Context):
            ctx.logger.info("Cross-Chain Bridge Agent started")
            ctx.logger.info(f"Agent address: {self.agent.address}")
            
            try:
                await get_faucet()
                ctx.logger.info("Agent funded successfully")
            except Exception as e:
                ctx.logger.error(f"Failed to fund agent: {e}")
        
        @self.agent.on_message(model=BridgeRequest)
        async def handle_bridge_request(ctx: Context, sender: str, msg: BridgeRequest):
            ctx.logger.info(f"Processing bridge request: {msg.strategy_id}")
            
            try:
                # Analyze available bridge options
                bridge_options = await self._analyze_bridge_options(ctx, msg)
                
                # Select optimal bridge
                optimal_bridge = await self._select_optimal_bridge(ctx, bridge_options)
                
                # Execute bridge operation (simulation for demo)
                bridge_result = await self._execute_bridge_operation(ctx, msg, optimal_bridge)
                
                # Create response
                response = BridgeResponse(
                    bridge_id=f"bridge_{int(time.time())}_{random.randint(1000, 9999)}",
                    estimated_time=optimal_bridge["estimated_time"],
                    bridge_fee=optimal_bridge["fee"],
                    success_probability=optimal_bridge["success_rate"],
                    nexus_operation_id=bridge_result.get("nexus_id")
                )
                
                # Send response back
                await ctx.send(sender, response)
                ctx.logger.info(f"Sent bridge response: {response.bridge_id}")
                
            except Exception as e:
                ctx.logger.error(f"Failed to process bridge request: {e}")
    
    async def _analyze_bridge_options(self, ctx: Context, request: BridgeRequest) -> List[Dict[str, Any]]:
        """Analyze available bridge options"""
        ctx.logger.info(f"Analyzing bridge from {request.source_chain} to {request.target_chain}")
        
        options = []
        
        # Avail Nexus SDK option (primary)
        nexus_option = await self._evaluate_nexus_bridge(ctx, request)
        options.append(nexus_option)
        
        # Other bridge options for comparison (simplified)
        layerzero_option = {
            "bridge": "LayerZero",
            "estimated_time": 600,  # 10 minutes
            "fee": 12.5,
            "success_rate": 0.98,
            "security_score": 0.95,
            "supported": self._is_route_supported("layerzero", request.source_chain, request.target_chain)
        }
        options.append(layerzero_option)
        
        wormhole_option = {
            "bridge": "Wormhole",
            "estimated_time": 900,  # 15 minutes
            "fee": 15.0,
            "success_rate": 0.97,
            "security_score": 0.93,
            "supported": self._is_route_supported("wormhole", request.source_chain, request.target_chain)
        }
        options.append(wormhole_option)
        
        # Filter only supported options
        supported_options = [opt for opt in options if opt["supported"]]
        
        ctx.logger.info(f"Found {len(supported_options)} supported bridge options")
        return supported_options
    
    async def _evaluate_nexus_bridge(self, ctx: Context, request: BridgeRequest) -> Dict[str, Any]:
        """Evaluate Avail Nexus SDK bridge option"""
        
        # Calculate fees based on amount and chains
        base_fee = 8.0  # Base fee in USD
        percentage_fee = request.amount * 0.001  # 0.1% of amount
        total_fee = base_fee + percentage_fee
        
        # Estimate time based on chain congestion
        base_time = 300  # 5 minutes base
        congestion_multiplier = self._get_congestion_multiplier(request.target_chain)
        estimated_time = int(base_time * congestion_multiplier)
        
        return {
            "bridge": "Avail Nexus",
            "estimated_time": estimated_time,
            "fee": total_fee,
            "success_rate": 0.995,  # Very high for Nexus
            "security_score": 0.98,
            "supported": True,
            "native_integration": True  # Special flag for Nexus
        }
    
    def _is_route_supported(self, bridge: str, source_chain: str, target_chain: str) -> bool:
        """Check if bridge supports the route"""
        # Simplified support matrix
        support_matrix = {
            "layerzero": {
                ("ethereum", "polygon"), ("ethereum", "arbitrum"), 
                ("polygon", "ethereum"), ("arbitrum", "ethereum")
            },
            "wormhole": {
                ("ethereum", "polygon"), ("ethereum", "base"),
                ("polygon", "ethereum"), ("base", "ethereum")
            }
        }
        
        return (source_chain, target_chain) in support_matrix.get(bridge, set())
    
    def _get_congestion_multiplier(self, chain: str) -> float:
        """Get congestion multiplier for time estimation"""
        # Mock congestion data
        congestion = {
            "ethereum": 1.5,
            "polygon": 1.1,
            "arbitrum": 1.2,
            "base": 1.0
        }
        return congestion.get(chain, 1.2)
    
    async def _select_optimal_bridge(self, ctx: Context, options: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Select optimal bridge based on multiple criteria"""
        ctx.logger.info("Selecting optimal bridge...")
        
        if not options:
            raise Exception("No supported bridge options available")
        
        best_score = 0
        best_option = None
        
        for option in options:
            # Scoring algorithm (weighted)
            time_score = max(0, 1 - (option["estimated_time"] - 300) / 1200)  # Prefer faster
            fee_score = max(0, 1 - (option["fee"] - 8) / 20)  # Prefer cheaper
            success_score = option["success_rate"]
            security_score = option["security_score"]
            
            # Special bonus for native Nexus integration
            nexus_bonus = 0.1 if option.get("native_integration") else 0
            
            total_score = (
                time_score * 0.25 +      # 25% weight on speed
                fee_score * 0.30 +       # 30% weight on cost
                success_score * 0.25 +   # 25% weight on reliability
                security_score * 0.20 +  # 20% weight on security
                nexus_bonus              # Bonus for native integration
            )
            
            ctx.logger.info(f"{option['bridge']}: Score {total_score:.3f}")
            
            if total_score > best_score:
                best_score = total_score
                best_option = option
        
        ctx.logger.info(f"Selected {best_option['bridge']} with score {best_score:.3f}")
        return best_option
    
    async def _execute_bridge_operation(
        self, 
        ctx: Context, 
        request: BridgeRequest,
        bridge_option: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Execute the bridge operation"""
        ctx.logger.info(f"Executing bridge via {bridge_option['bridge']}")
        
        if bridge_option.get("native_integration"):
            # Use Avail Nexus SDK
            return await self._execute_nexus_bridge(ctx, request, bridge_option)
        else:
            # Use other bridge (simplified simulation)
            return await self._execute_generic_bridge(ctx, request, bridge_option)
    
    async def _execute_nexus_bridge(
        self, 
        ctx: Context, 
        request: BridgeRequest,
        bridge_option: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Execute bridge using Avail Nexus SDK"""
        ctx.logger.info("Executing Nexus SDK bridge operation...")
        
        # Simulate Nexus SDK bridgeAndExecute call
        nexus_operation = {
            "nexus_id": f"nexus_{int(time.time())}_{random.randint(1000, 9999)}",
            "source_tx": f"0x{'0' * 60}{random.randint(1000, 9999):04d}",
            "target_tx": None,  # Will be available after execution
            "status": "initiated",
            "estimated_completion": time.time() + bridge_option["estimated_time"]
        }
        
        # In real implementation, this would call:
        # nexus_result = await nexusSDK.bridgeAndExecute({
        #     "token": request.token,
        #     "amount": str(request.amount),
        #     "toChainId": self.bridge_configs[request.target_chain]["chain_id"],
        #     "execute": {
        #         "contractAddress": request.destination_contract,
        #         "functionName": "executeStakeAfterBridge",
        #         "buildFunctionParams": lambda token, amount, chainId, userAddress: {
        #             "functionParams": [userAddress, token, amount, chainId, nexus_operation["nexus_id"]]
        #         }
        #     }
        # })
        
        ctx.logger.info(f"Nexus operation initiated: {nexus_operation['nexus_id']}")
        return nexus_operation
    
    async def _execute_generic_bridge(
        self, 
        ctx: Context, 
        request: BridgeRequest,
        bridge_option: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Execute bridge using other bridge protocols"""
        ctx.logger.info(f"Executing {bridge_option['bridge']} bridge operation...")
        
        # Simulate generic bridge operation
        operation = {
            "bridge_id": f"{bridge_option['bridge'].lower()}_{int(time.time())}",
            "source_tx": f"0x{'0' * 60}{random.randint(1000, 9999):04d}",
            "status": "initiated",
            "estimated_completion": time.time() + bridge_option["estimated_time"]
        }
        
        ctx.logger.info(f"Bridge operation initiated: {operation['bridge_id']}")
        return operation
    
    def run(self):
        """Start the bridge agent"""
        self.agent.run()