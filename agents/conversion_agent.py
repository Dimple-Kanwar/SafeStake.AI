import asyncio
import os
from typing import Dict, List, Any, Optional
from uagents import Agent, Context
from uagents.network import get_faucet
from coordinator import ConversionRequest, ConversionResponse
import json
import time
import random
from dotenv import load_dotenv

load_dotenv()

class AssetConversionAgent:
    def __init__(self):
        self.agent = Agent(
            name="asset_converter",
            seed=os.getenv("CONVERSION_SEED", "asset_converter_seed_phrase"),
            port=8003,
            endpoint=["http://127.0.0.1:8003/submit"]
        )
        
        # DEX configurations
        self.dex_configs = self._setup_dex_configs()
        self._setup_handlers()
    
    def _setup_dex_configs(self):
        """Setup DEX configurations for different chains"""
        return {
            "ethereum": {
                "dexes": {
                    "uniswap_v3": {
                        "router": "0xE592427A0AEce92De3Edee1F18E0157C05861564",
                        "fee_tiers": [500, 3000, 10000],
                        "supported_tokens": ["ETH", "USDC", "PYUSD", "WETH"]
                    },
                    "1inch": {
                        "aggregator": "0x1111111254EEB25477B68fb85Ed929f73A960582",
                        "supported_tokens": ["ETH", "USDC", "PYUSD", "WETH", "DAI"]
                    }
                }
            },
            "polygon": {
                "dexes": {
                    "quickswap": {
                        "router": "0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff",
                        "supported_tokens": ["MATIC", "USDC", "WETH"]
                    },
                    "1inch": {
                        "aggregator": "0x1111111254EEB25477B68fb85Ed929f73A960582",
                        "supported_tokens": ["MATIC", "USDC", "WETH", "DAI"]
                    }
                }
            },
            "arbitrum": {
                "dexes": {
                    "uniswap_v3": {
                        "router": "0xE592427A0AEce92De3Edee1F18E0157C05861564",
                        "supported_tokens": ["ETH", "USDC", "ARB"]
                    },
                    "camelot": {
                        "router": "0xc873fEcbd354f5A56E00E710B90EF4201db2448d",
                        "supported_tokens": ["ETH", "USDC", "ARB"]
                    }
                }
            },
            "base": {
                "dexes": {
                    "uniswap_v3": {
                        "router": "0x2626664c2603336E57B271c5C0b26F421741e481",
                        "supported_tokens": ["ETH", "USDC"]
                    }
                }
            }
        }
    
    def _setup_handlers(self):
        @self.agent.on_event("startup")
        async def startup_handler(ctx: Context):
            ctx.logger.info("Asset Conversion Agent started")
            ctx.logger.info(f"Agent address: {self.agent.address}")
            
            try:
                await get_faucet()
                ctx.logger.info("Agent funded successfully")
            except Exception as e:
                ctx.logger.error(f"Failed to fund agent: {e}")
        
        @self.agent.on_message(model=ConversionRequest)
        async def handle_conversion_request(ctx: Context, sender: str, msg: ConversionRequest):
            ctx.logger.info(f"Processing conversion: {msg.source_token} -> {msg.target_token}")
            
            try:
                # Analyze DEX routes
                dex_routes = await self._analyze_dex_routes(ctx, msg)
                
                # Select optimal route
                optimal_route = await self._select_optimal_route(ctx, dex_routes, msg)
                
                # Execute conversion
                conversion_result = await self._execute_conversion(ctx, msg, optimal_route)
                
                # Create response
                response = ConversionResponse(
                    conversion_id=f"conv_{int(time.time())}_{random.randint(1000, 9999)}",
                    expected_output=conversion_result["output_amount"],
                    actual_slippage=conversion_result["slippage"],
                    dex_route=conversion_result["route"],
                    gas_estimate=conversion_result["gas_used"]
                )
                
                # Send response back
                await ctx.send(sender, response)
                ctx.logger.info(f"Sent conversion response: {response.conversion_id}")
                
            except Exception as e:
                ctx.logger.error(f"Failed to process conversion: {e}")
    
    async def _analyze_dex_routes(self, ctx: Context, request: ConversionRequest) -> List[Dict[str, Any]]:
        """Analyze available DEX routes for the conversion"""
        ctx.logger.info(f"Analyzing routes on {request.chain}")
        
        chain_config = self.dex_configs.get(request.chain, {})
        routes = []
        
        for dex_name, dex_config in chain_config.get("dexes", {}).items():
            if (request.source_token in dex_config["supported_tokens"] and 
                request.target_token in dex_config["supported_tokens"]):
                
                route = await self._get_dex_quote(ctx, dex_name, dex_config, request)
                if route:
                    routes.append(route)
        
        ctx.logger.info(f"Found {len(routes)} available routes")
        return routes
    
    async def _get_dex_quote(
        self, 
        ctx: Context, 
        dex_name: str,
        dex_config: Dict[str, Any],
        request: ConversionRequest
    ) -> Optional[Dict[str, Any]]:
        """Get quote from specific DEX"""
        
        try:
            if dex_name == "uniswap_v3":
                return await self._get_uniswap_quote(ctx, dex_config, request)
            elif dex_name == "1inch":
                return await self._get_1inch_quote(ctx, dex_config, request)
            else:
                return await self._get_generic_quote(ctx, dex_name, dex_config, request)
                
        except Exception as e:
            ctx.logger.error(f"Failed to get quote from {dex_name}: {e}")
            return None
    
    async def _get_uniswap_quote(
        self, 
        ctx: Context,
        config: Dict[str, Any],
        request: ConversionRequest
    ) -> Dict[str, Any]:
        """Get Uniswap V3 quote"""
        
        # Simulate Uniswap V3 quote
        # In real implementation, would call quoter contract
        
        base_rate = self._get_mock_exchange_rate(request.source_token, request.target_token)
        slippage_estimate = 0.002  # 0.2% for V3
        
        output_amount = request.amount * base_rate * (1 - slippage_estimate)
        
        return {
            "dex": "Uniswap V3",
            "output": output_amount,
            "slippage": slippage_estimate,
            "gas_estimate": 150000,
            "route": [request.source_token, request.target_token],
            "fee_tier": 3000,  # 0.3%
            "pool_address": "0x...",
            "price_impact": slippage_estimate
        }
    
    async def _get_1inch_quote(
        self, 
        ctx: Context,
        config: Dict[str, Any],
        request: ConversionRequest
    ) -> Dict[str, Any]:
        """Get 1inch aggregator quote"""
        
        # Simulate 1inch quote
        # In real implementation, would call 1inch API
        
        base_rate = self._get_mock_exchange_rate(request.source_token, request.target_token)
        slippage_estimate = 0.0015  # 0.15% for aggregator
        
        output_amount = request.amount * base_rate * (1 - slippage_estimate)
        
        return {
            "dex": "1inch",
            "output": output_amount,
            "slippage": slippage_estimate,
            "gas_estimate": 180000,
            "route": [request.source_token, "USDC", request.target_token],
            "protocols": ["Uniswap V3", "SushiSwap"],
            "price_impact": slippage_estimate
        }
    
    async def _get_generic_quote(
        self, 
        ctx: Context,
        dex_name: str,
        config: Dict[str, Any],
        request: ConversionRequest
    ) -> Dict[str, Any]:
        """Get generic DEX quote"""
        
        base_rate = self._get_mock_exchange_rate(request.source_token, request.target_token)
        slippage_estimate = 0.003  # 0.3% for other DEXes
        
        output_amount = request.amount * base_rate * (1 - slippage_estimate)
        
        return {
            "dex": dex_name,
            "output": output_amount,
            "slippage": slippage_estimate,
            "gas_estimate": 120000,
            "route": [request.source_token, request.target_token],
            "price_impact": slippage_estimate
        }
    
    def _get_mock_exchange_rate(self, source_token: str, target_token: str) -> float:
        """Get mock exchange rate between tokens"""
        
        # Mock price data
        usd_prices = {
            "ETH": 2500,
            "WETH": 2500,
            "USDC": 1.0,
            "PYUSD": 1.0,
            "MATIC": 0.8,
            "ARB": 1.2,
            "DAI": 1.0
        }
        
        source_price = usd_prices.get(source_token, 1.0)
        target_price = usd_prices.get(target_token, 1.0)
        
        return source_price / target_price
    
    async def _select_optimal_route(
        self, 
        ctx: Context,
        routes: List[Dict[str, Any]],
        request: ConversionRequest
    ) -> Dict[str, Any]:
        """Select optimal route based on output and gas costs"""
        
        if not routes:
            raise Exception("No available routes for conversion")
        
        best_route = None
        best_net_output = 0
        
        # Estimate gas price for calculations
        gas_price_eth = 0.00002  # 20 gwei * 150k gas = ~$8 at $2500 ETH
        
        for route in routes:
            if route["slippage"] <= request.slippage_tolerance:
                # Calculate net output after gas costs
                gas_cost_eth = route["gas_estimate"] * gas_price_eth / 1000000
                gas_cost_usd = gas_cost_eth * 2500  # ETH price
                
                # Convert gas cost to target token
                target_price = self._get_token_usd_price(request.target_token)
                gas_cost_target = gas_cost_usd / target_price
                
                net_output = route["output"] - gas_cost_target
                
                ctx.logger.info(f"{route['dex']}: Net output {net_output:.6f} {request.target_token}")
                
                if net_output > best_net_output:
                    best_net_output = net_output
                    best_route = route
        
        if not best_route:
            raise Exception("No routes meet slippage tolerance requirements")
        
        ctx.logger.info(f"Selected {best_route['dex']} for conversion")
        return best_route
    
    def _get_token_usd_price(self, token: str) -> float:
        """Get token USD price"""
        prices = {
            "ETH": 2500,
            "WETH": 2500,
            "USDC": 1.0,
            "PYUSD": 1.0,
            "MATIC": 0.8,
            "ARB": 1.2,
            "DAI": 1.0
        }
        return prices.get(token, 1.0)
    
    async def _execute_conversion(
        self, 
        ctx: Context,
        request: ConversionRequest,
        route: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Execute the conversion"""
        
        ctx.logger.info(f"Executing conversion via {route['dex']}")
        
        # Simulate conversion execution
        # In real implementation, would execute on-chain transaction
        
        actual_slippage = route["slippage"] + random.uniform(-0.0005, 0.0005)  # Some variance
        actual_output = request.amount * self._get_mock_exchange_rate(
            request.source_token, 
            request.target_token
        ) * (1 - actual_slippage)
        
        result = {
            "output_amount": actual_output,
            "slippage": actual_slippage,
            "route": route["route"],
            "gas_used": route["gas_estimate"],
            "transaction_hash": f"0x{'0' * 60}{random.randint(1000, 9999):04d}",
            "block_number": random.randint(18000000, 19000000)
        }
        
        ctx.logger.info(f"Conversion executed: {result['output_amount']:.6f} {request.target_token}")
        return result
    
    def run(self):
        """Start the conversion agent"""
        self.agent.run()
