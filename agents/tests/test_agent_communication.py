import pytest
import asyncio
from unittest.mock import AsyncMock, MagicMock
import sys
import os

sys.path.append('..')
from coordinator import MasterCoordinatorAgent, OptimizationRequest, OptimizationResponse
from strategy_optimizer import StrategyOptimizationAgent
from bridge_agent import CrossChainBridgeAgent
from conversion_agent import AssetConversionAgent

@pytest.mark.asyncio
class TestAgentCommunication:
    
    def setup_method(self):
        """Setup test environment"""
        self.coordinator = MasterCoordinatorAgent()
        self.strategy_agent = StrategyOptimizationAgent()
        self.bridge_agent = CrossChainBridgeAgent()
        self.conversion_agent = AssetConversionAgent()
    
    async def test_optimization_flow(self):
        """Test complete optimization flow"""
        
        # Mock optimization request
        request = OptimizationRequest(
            user_address="0x742d35Cc6634C0532925a3b8D6B9DDE3d3ce0B77",
            target_stake_amount=0.1,
            target_chain="ethereum",
            target_token="ETH",
            risk_tolerance="moderate",
            time_horizon=30,
            current_portfolio={}
        )
        
        # Test strategy optimization
        portfolio = {
            "total_value_usd": 5000,
            "assets": {
                "polygon:USDC": {"balance": 1000, "usd_value": 1000, "chain": "polygon", "token": "USDC"},
                "arbitrum:ETH": {"balance": 1.5, "usd_value": 3750, "chain": "arbitrum", "token": "ETH"}
            },
            "chains": {"polygon", "arbitrum"}
        }
        
        strategy = await self.strategy_agent._calculate_optimal_strategy(
            None, request, portfolio
        )
        
        assert strategy["requires_bridging"] == True
        assert strategy["expected_yield"] > 0
        assert len(strategy["execution_steps"]) > 0
        
    async def test_bridge_selection(self):
        """Test bridge option selection"""
        from coordinator import BridgeRequest
        
        bridge_request = BridgeRequest(
            strategy_id="test_strategy",
            user_address="0x742d35Cc6634C0532925a3b8D6B9DDE3d3ce0B77",
            source_chain="polygon",
            target_chain="ethereum",
            token="USDC",
            amount=1000,
            destination_contract="0x...",
            execution_data=b""
        )
        
        # Test bridge option analysis
        options = await self.bridge_agent._analyze_bridge_options(None, bridge_request)
        
        assert len(options) > 0
        assert any(opt["bridge"] == "Avail Nexus" for opt in options)
        
        # Test optimal selection
        optimal = await self.bridge_agent._select_optimal_bridge(None, options)
        
        assert optimal is not None
        assert optimal["success_rate"] > 0.9
        
    async def test_conversion_routing(self):
        """Test DEX routing and selection"""
        from coordinator import ConversionRequest
        
        conversion_request = ConversionRequest(
            strategy_id="test_strategy",
            user_address="0x742d35Cc6634C0532925a3b8D6B9DDE3d3ce0B77",
            source_token="USDC",
            target_token="ETH",
            amount=1000,
            chain="ethereum",
            slippage_tolerance=0.005,
            deadline=1234567890
        )
        
        # Test DEX route analysis
        routes = await self.conversion_agent._analyze_dex_routes(None, conversion_request)
        
        assert len(routes) > 0
        
        # Test route selection
        if routes:
            optimal_route = await self.conversion_agent._select_optimal_route(
                None, routes, conversion_request
            )
            
            assert optimal_route is not None
            assert optimal_route["slippage"] <= conversion_request.slippage_tolerance
    
    async def test_agent_message_flow(self):
        """Test message flow between agents"""
        
        # This would require running actual agents, so we'll test the message models
        request = OptimizationRequest(
            user_address="0x742d35Cc6634C0532925a3b8D6B9DDE3d3ce0B77",
            target_stake_amount=0.1,
            target_chain="ethereum",
            target_token="ETH"
        )
        
        # Test message serialization
        request_dict = request.dict()
        assert request_dict["user_address"] == "0x742d35Cc6634C0532925a3b8D6B9DDE3d3ce0B77"
        assert request_dict["target_stake_amount"] == 0.1
        
        # Test response creation
        response = OptimizationResponse(
            strategy_id="test_123",
            recommended_actions=[{"type": "bridge", "amount": 1000}],
            expected_yield=5.2,
            risk_score=35,
            estimated_gas_cost=15.0,
            execution_steps=["Bridge USDC", "Stake ETH"],
            requires_bridging=True,
            bridge_route={"source_chain": "polygon", "target_chain": "ethereum"}
        )
        
        response_dict = response.dict()
        assert response_dict["strategy_id"] == "test_123"
        assert response_dict["requires_bridging"] == True

if __name__ == "__main__":
    pytest.main([__file__])
