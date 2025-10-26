import asyncio
import os
from typing import Dict, List, Any, Optional
from uagents import Agent, Context
from uagents.network import get_faucet
from coordinator import OptimizationRequest, OptimizationResponse
from web3 import Web3
import json
import time
import random
from dotenv import load_dotenv

load_dotenv()

class StrategyOptimizationAgent:
    def __init__(self):
        self.agent = Agent(
            name="strategy_optimizer",
            seed=os.getenv("STRATEGY_SEED", "strategy_optimizer_seed_phrase"),
            port=8001,
            endpoint=["http://127.0.0.1:8001/submit"]
        )
        
        # Web3 connections for different chains
        self.web3_connections = {}
        self._setup_web3_connections()
        self._setup_handlers()
    
    def _setup_web3_connections(self):
        """Setup Web3 connections for supported chains"""
        chain_configs = {
            "ethereum": {
                "rpc": os.getenv("ETHEREUM_RPC_URL"),
                "chain_id": 1
            },
            "polygon": {
                "rpc": os.getenv("POLYGON_RPC_URL"),
                "chain_id": 137
            },
            "arbitrum": {
                "rpc": os.getenv("ARBITRUM_RPC_URL"),
                "chain_id": 42161
            },
            "base": {
                "rpc": os.getenv("BASE_RPC_URL"),
                "chain_id": 8453
            }
        }
        
        for chain, config in chain_configs.items():
            if config["rpc"]:
                try:
                    self.web3_connections[chain] = Web3(Web3.HTTPProvider(config["rpc"]))
                    print(f"Connected to {chain}: {self.web3_connections[chain].is_connected()}")
                except Exception as e:
                    print(f"Failed to connect to {chain}: {e}")
    
    def _setup_handlers(self):
        @self.agent.on_event("startup")
        async def startup_handler(ctx: Context):
            ctx.logger.info("Strategy Optimization Agent started")
            ctx.logger.info(f"Agent address: {self.agent.address}")
            
            try:
                await get_faucet()
                ctx.logger.info("Agent funded successfully")
            except Exception as e:
                ctx.logger.error(f"Failed to fund agent: {e}")
        
        @self.agent.on_message(model=OptimizationRequest)
        async def handle_optimization_request(ctx: Context, sender: str, msg: OptimizationRequest):
            ctx.logger.info(f"Processing optimization for user: {msg.user_address}")
            
            try:
                # Analyze user's current portfolio
                portfolio_analysis = await self._analyze_portfolio(ctx, msg)
                
                # Calculate optimal strategy
                strategy = await self._calculate_optimal_strategy(ctx, msg, portfolio_analysis)
                
                # Create response
                response = OptimizationResponse(
                    strategy_id=f"strategy_{int(time.time())}_{random.randint(1000, 9999)}",
                    recommended_actions=strategy["actions"],
                    expected_yield=strategy["expected_yield"],
                    risk_score=strategy["risk_score"],
                    estimated_gas_cost=strategy["gas_cost"],
                    execution_steps=strategy["execution_steps"],
                    requires_bridging=strategy["requires_bridging"],
                    bridge_route=strategy.get("bridge_route")
                )
                
                # Send response back to coordinator
                await ctx.send(sender, response)
                ctx.logger.info(f"Sent optimization response: {response.strategy_id}")
                
            except Exception as e:
                ctx.logger.error(f"Failed to process optimization: {e}")
    
    async def _analyze_portfolio(self, ctx: Context, request: OptimizationRequest) -> Dict[str, Any]:
        """Analyze user's current portfolio across chains"""
        ctx.logger.info("Analyzing user portfolio...")
        
        portfolio_data = {
            "total_value_usd": 0,
            "assets": {},
            "chains": set(),
            "risk_level": "moderate"
        }
        
        # Get unified balances across chains (using mock data for demo)
        unified_balances = await self._get_unified_balances(request.user_address)
        
        for chain, assets in unified_balances.items():
            portfolio_data["chains"].add(chain)
            for token, balance in assets.items():
                if balance > 0:
                    usd_value = await self._get_token_value_usd(chain, token, balance)
                    portfolio_data["total_value_usd"] += usd_value
                    
                    asset_key = f"{chain}:{token}"
                    portfolio_data["assets"][asset_key] = {
                        "balance": balance,
                        "usd_value": usd_value,
                        "chain": chain,
                        "token": token
                    }
        
        ctx.logger.info(f"Portfolio analysis complete. Total value: ${portfolio_data['total_value_usd']:.2f}")
        return portfolio_data
    
    async def _get_unified_balances(self, user_address: str) -> Dict[str, Dict[str, float]]:
        """Get unified balances across all chains"""
        # Mock unified balance data for demo
        return {
            "ethereum": {
                "ETH": 0.0001,
                "USDC": 500,
                "PYUSD": 0
            },
            "polygon": {
                "MATIC": 100,
                "USDC": 1000,
                "WETH": 0
            },
            "arbitrum": {
                "ETH": 0.05,
                "USDC": 2000,
                "ARB": 50
            },
            "base": {
                "ETH": 0.02,
                "USDC": 800
            }
        }
    
    async def _get_token_value_usd(self, chain: str, token: str, balance: float) -> float:
        """Get token value in USD"""
        # Mock price data for demo
        prices = {
            "ETH": 2500,
            "USDC": 1.0,
            "PYUSD": 1.0,
            "MATIC": 0.8,
            "WETH": 2500,
            "ARB": 1.2
        }
        
        price = prices.get(token, 1.0)
        return balance * price
    
    async def _calculate_optimal_strategy(
        self, 
        ctx: Context, 
        request: OptimizationRequest,
        portfolio: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Calculate optimal staking strategy using AI logic"""
        ctx.logger.info("Calculating optimal strategy...")
        
        target_amount_usd = request.target_stake_amount * 2500  # Assume ETH price for demo
        
        # Check if user has sufficient assets
        if portfolio["total_value_usd"] < target_amount_usd * 1.5:  # 150% collateral ratio
            ctx.logger.warning("Insufficient portfolio value for target stake")
        
        # Analyze best source of funds
        best_sources = self._find_best_funding_sources(
            portfolio["assets"], 
            target_amount_usd,
            request.target_chain
        )
        
        strategy = {
            "actions": [],
            "expected_yield": self._calculate_expected_yield(request),
            "risk_score": self._calculate_risk_score(request, portfolio),
            "gas_cost": 0,
            "execution_steps": [],
            "requires_bridging": False,
            "bridge_route": None
        }
        
        # Build execution plan
        for source in best_sources:
            if source["chain"] != request.target_chain:
                strategy["requires_bridging"] = True
                strategy["bridge_route"] = {
                    "user_address": request.user_address,
                    "source_chain": source["chain"],
                    "target_chain": request.target_chain,
                    "token": source["token"],
                    "amount": source["amount"],
                    "destination_contract": os.getenv("STAKING_PROXY_ADDRESS", "")
                }
                
                strategy["actions"].append({
                    "type": "bridge",
                    "from_chain": source["chain"],
                    "to_chain": request.target_chain,
                    "token": source["token"],
                    "amount": source["amount"]
                })
                
                strategy["execution_steps"].append(
                    f"Bridge {source['amount']} {source['token']} from {source['chain']} to {request.target_chain}"
                )
        
        # Add staking action
        strategy["actions"].append({
            "type": "stake",
            "chain": request.target_chain,
            "token": request.target_token,
            "amount": request.target_stake_amount,
            "expected_yield": strategy["expected_yield"]
        })
        
        strategy["execution_steps"].append(
            f"Stake {request.target_stake_amount} {request.target_token} on {request.target_chain}"
        )
        
        # Estimate gas costs
        strategy["gas_cost"] = self._estimate_gas_costs(strategy["actions"])
        
        ctx.logger.info(f"Strategy calculated. Expected yield: {strategy['expected_yield']:.2f}%")
        return strategy
    
    def _find_best_funding_sources(
        self, 
        assets: Dict[str, Any], 
        target_usd: float,
        target_chain: str
    ) -> List[Dict[str, Any]]:
        """Find best sources of funding for the stake"""
        
        sources = []
        remaining_usd = target_usd
        
        # Sort assets by efficiency (prefer same chain, then highest value)
        sorted_assets = sorted(
            assets.items(),
            key=lambda x: (
                0 if x["chain"] == target_chain else 1,  # Same chain preference
                -x["usd_value"]  # Higher value first
            )
        )
        
        for asset_key, asset_data in sorted_assets:
            if remaining_usd <= 0:
                break
                
            if asset_data["usd_value"] > 0:
                use_amount = min(asset_data["balance"], remaining_usd / self._get_asset_price(asset_data["token"]))
                
                sources.append({
                    "chain": asset_data["chain"],
                    "token": asset_data["token"],
                    "amount": use_amount,
                    "usd_value": use_amount * self._get_asset_price(asset_data["token"])
                })
                
                remaining_usd -= use_amount * self._get_asset_price(asset_data["token"])
        
        return sources
    
    def _get_asset_price(self, token: str) -> float:
        """Get asset price in USD"""
        prices = {
            "ETH": 2500,
            "USDC": 1.0,
            "PYUSD": 1.0,
            "MATIC": 0.8,
            "WETH": 2500,
            "ARB": 1.2
        }
        return prices.get(token, 1.0)
    
    def _calculate_expected_yield(self, request: OptimizationRequest) -> float:
        """Calculate expected yield based on market conditions"""
        base_yield = {
            "ethereum": 5.2,
            "polygon": 7.8,
            "arbitrum": 6.1,
            "base": 5.9
        }
        
        chain_yield = base_yield.get(request.target_chain, 5.0)
        
        # Adjust based on risk tolerance
        risk_multiplier = {
            "conservative": 0.8,
            "moderate": 1.0,
            "aggressive": 1.3
        }
        
        return chain_yield * risk_multiplier.get(request.risk_tolerance, 1.0)
    
    def _calculate_risk_score(self, request: OptimizationRequest, portfolio: Dict[str, Any]) -> float:
        """Calculate risk score for the strategy"""
        base_risk = {
            "ethereum": 25,
            "polygon": 45,
            "arbitrum": 35,
            "base": 30
        }
        
        chain_risk = base_risk.get(request.target_chain, 40)
        
        # Adjust based on portfolio diversification
        diversification_bonus = min(len(portfolio["chains"]) * 5, 20)
        
        return max(10, chain_risk - diversification_bonus)
    
    def _estimate_gas_costs(self, actions: List[Dict[str, Any]]) -> float:
        """Estimate gas costs for all actions"""
        total_cost = 0
        
        for action in actions:
            if action["type"] == "bridge":
                total_cost += 15.0  # $15 for bridge
            elif action["type"] == "stake":
                total_cost += 8.0   # $8 for staking
            elif action["type"] == "convert":
                total_cost += 5.0   # $5 for conversion
        
        return total_cost
    
    def run(self):
        """Start the strategy optimization agent"""
        self.agent.run()

# Singleton instance
strategy_optimizer = StrategyOptimizationAgent()

if __name__ == "__main__":
    print("Starting Strategy Optimization Agent...")
    print(f"Agent address will be: {strategy_optimizer.agent.address}")
    strategy_optimizer.run()
