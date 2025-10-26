'use client';

import '../lib/polyfills';
import React, { useState, useEffect, useMemo } from 'react';
import { useAccount, } from 'wagmi';
import { BridgeAndExecuteButton, EthereumProvider, useNexus, UserAsset } from '@avail-project/nexus-widgets';
import { useAgentStore } from '../lib/agent-client';
import { usePythPrices } from '../lib/pyth-client';
import { toast } from 'react-hot-toast';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select } from './ui/select';
import { Badge } from './ui/badge';
import { Loader2, TrendingUp, Shield, Zap, ExternalLink } from 'lucide-react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { cn } from '../lib/utils';
import { useBlockscoutNotifications, useBlockscoutPopup } from '../lib/blockscout-provider';

export const AIDashboard: React.FC = () => {
  const { address, isConnected, connector, status, chain } = useAccount();
  const { setProvider, provider, isSdkInitialized, sdk, initializeSdk, deinitializeSdk } = useNexus();
  const [loading, setLoading] = useState(false)
  const [initLoading, setInitLoading] = useState(false)
  const [unifiedBalance, setUnifiedBalance] = useState<UserAsset[] | undefined>(
    undefined,
  )

  // State
  const [stakeAmount, setStakeAmount] = useState('');
  const [targetChain, setTargetChain] = useState('ethereum');
  const [targetToken, setTargetToken] = useState('ETH');
  const [riskTolerance, setRiskTolerance] = useState<'conservative' | 'moderate' | 'aggressive'>('moderate');
  const [unifiedBalances, setUnifiedBalances] = useState<{ [chainId: number]: { [token: string]: string } }>({});

  // Hooks
  const agentStore = useAgentStore();
  const { showTransactionToast } = useBlockscoutNotifications();
  const { showTransactionHistory } = useBlockscoutPopup();
  const pythPrices = usePythPrices(['ETH', 'USDC', 'PYUSD', 'MATIC', 'ARB']);

  // Initialize connections on mount
  useEffect(() => {
    const initialize = async () => {
      if (!provider && status === 'connected') {
        const provider = await window.ethereum;
      }
      if (isSdkInitialized && provider && status === 'disconnected') {
        console.log('deinit')
        deinitializeSdk()
      }
      // if (isSdkInitialized) return
      setInitLoading(true)
      try {
        await initializeSdk(provider)

        // Connect to AI agents
        await agentStore.connect();

        // Fetch unified balances
        await fetchBalance();


        toast.success('Connected to AI agents and Nexus SDK');
      } catch (error) {
        console.error('Error initializing SDK', error)
        toast.error('Failed to initialize services');
      } finally {
        setInitLoading(false)
      }
    }

    initialize();

    return () => {
      agentStore.disconnect();
    };
  }, [isConnected, provider, address, chain]);

  const handleOptimizeStrategy = async () => {
    if (!address || !stakeAmount) return;

    try {
      const optimizationRequest = {
        userAddress: address,
        targetStakeAmount: parseFloat(stakeAmount),
        targetChain,
        targetToken,
        riskTolerance,
        timeHorizon: 30,
        currentPortfolio: unifiedBalances
      };

      await agentStore.requestOptimization(optimizationRequest);
      toast.success('AI strategy optimization complete!');
    } catch (error) {
      console.error('Optimization failed:', error);
      toast.error('Strategy optimization failed');
    }
  };

  // const setupProvider = async () => {
  //   try {
  //     const ethProvider = await connector?.getProvider()
  //     if (!ethProvider) return
  //     setProvider(ethProvider as EthereumProvider)
  //   } catch (error) {
  //     console.error('Failed to setup provider:', error)
  //   }
  // }
  const fetchBalance = async () => {
    setLoading(true)
    try {
      const balance = await sdk?.getUnifiedBalances()
      console.log(
        'Swap supported chains and tokens',
        sdk?.utils?.getSwapSupportedChainsAndTokens(),
      )
      const supportedChains = sdk?.utils?.getSupportedChains()
      const swapSupportedChainsAndTokens =
        sdk?.utils?.getSwapSupportedChainsAndTokens()
      console.log('balance', balance)
      console.log('supportedChains', supportedChains)
      console.log('swapSupportedChainsAndTokens', swapSupportedChainsAndTokens)
      setUnifiedBalance(balance)
    } catch (e) {
      console.error('Error fetching balance', e)
    } finally {
      setLoading(false)
    }
  }

  const handleExecuteStrategy = async () => {
    if (!agentStore.activeStrategy) return;

    try {
      await agentStore.executeStrategy(agentStore.activeStrategy.strategyId);
      toast.success('Strategy execution completed!');
    } catch (error) {
      console.error('Execution failed:', error);
      toast.error('Strategy execution failed');
    }
  };

  const formatBalance = (balance: string, decimals = 6) => {
    const num = parseFloat(balance);
    return num.toFixed(Math.min(decimals, 6));
  };

  const totalBalance = useMemo(() => {
    const total = unifiedBalance
      ?.reduce((acc, fiat) => acc + fiat.balanceInFiat, 0)
      .toFixed(2)

    return total ?? 0
  }, [unifiedBalance])

  const formatUSD = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(amount);
  };

  if (!isConnected) {
    return (
      <div
        className={cn(
          'max-w-md mx-auto p-4 flex items-center justify-center',
          // status === 'connected' && 'hidden',
        )}
      >
        <ConnectButton />
        <p className="text-gray-600">Please connect your wallet to access AI staking</p>
      </div>
      // <div className="flex items-center justify-center h-96">
      //   <div className="text-center">
      //     <h2 className="text-2xl font-bold mb-4">Connect Wallet</h2>
      //     <p className="text-gray-600">Please connect your wallet to access AI staking</p>
      //   </div>
      // </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-2">Cross-Chain AI Staking</h1>
        <p className="text-gray-600">Optimize your staking strategy across multiple blockchains</p>
        <div className="flex justify-center gap-2 mt-4">
          <Badge variant={agentStore.isConnected ? "success" : "secondary"}>
            {agentStore.isConnected ? "🤖 AI Connected" : "🤖 AI Disconnected"}
          </Badge>
          {/* <Badge variant="outline">
            {chain?.name || 'Unknown Network'}
          </Badge> */}
        </div>
      </div>

      {/* Unified Portfolio Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Portfolio Overview
            <Button
              variant="ghost"
              size="sm"
              onClick={() => showTransactionHistory(chain?.id || 1, address || '')}
            >
              <ExternalLink className="w-4 h-4" />
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(unifiedBalances).map(([chainId, tokens]) => (
              <div key={chainId} className="space-y-2">
                <h4 className="font-semibold text-sm">Chain {chainId}</h4>
                {Object.entries(tokens).map(([token, balance]) => {
                  const priceData = pythPrices.data?.[token];
                  const usdValue = priceData ? parseFloat(balance) * priceData.price : 0;

                  return (
                    <div key={token} className="bg-gray-50 rounded p-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium">{token}</span>
                        <span className="text-xs text-gray-600">
                          {formatBalance(balance)}
                        </span>
                      </div>
                      {priceData && (
                        <div className="text-xs text-gray-500">
                          {formatUSD(usdValue)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Strategy Input Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5" />
            AI Strategy Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Stake Amount</label>
              <Input
                type="number"
                value={stakeAmount}
                onChange={(e) => setStakeAmount(e.target.value)}
                placeholder="0.1"
                step="0.01"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Target Chain</label>
              <select
                value={targetChain}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setTargetChain(e.target.value)}
              >
                <option value="ethereum">Ethereum</option>
                <option value="polygon">Polygon</option>
                <option value="arbitrum">Arbitrum</option>
                <option value="base">Base</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Target Token</label>
              <select
                value={targetToken}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setTargetToken(e.target.value)}
              >
                <option value="ETH">ETH</option>
                <option value="USDC">USDC</option>
                <option value="PYUSD">PYUSD</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Risk Tolerance</label>
              <Select
                value={riskTolerance}
                onValueChange={(value) => setRiskTolerance(value as 'conservative' | 'moderate' | 'aggressive')}
              >
                <option value="conservative">Conservative</option>
                <option value="moderate">Moderate</option>
                <option value="aggressive">Aggressive</option>
              </Select>
            </div>
          </div>

          <Button
            onClick={handleOptimizeStrategy}
            disabled={agentStore.executionStatus === 'optimizing' || !stakeAmount}
            className="w-full"
          >
            {agentStore.executionStatus === 'optimizing' ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                AI Optimizing Strategy...
              </>
            ) : (
              <>
                <TrendingUp className="w-4 h-4 mr-2" />
                Optimize Strategy with AI
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* AI Strategy Results */}
      {agentStore.activeStrategy && (
        <Card>
          <CardHeader>
            <CardTitle>AI Optimized Strategy</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="text-green-800 font-semibold">Expected Yield</div>
                <div className="text-2xl font-bold text-green-600">
                  {agentStore.activeStrategy.expectedYield.toFixed(2)}% APY
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="text-blue-800 font-semibold">Risk Score</div>
                <div className="text-2xl font-bold text-blue-600">
                  {agentStore.activeStrategy.riskScore}/100
                </div>
              </div>

              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                <div className="text-orange-800 font-semibold">Gas Cost</div>
                <div className="text-2xl font-bold text-orange-600">
                  ${agentStore.activeStrategy.estimatedGasCost.toFixed(2)}
                </div>
              </div>
            </div>

            <div>
              <h4 className="font-semibold mb-2">Execution Steps:</h4>
              <ol className="list-decimal list-inside space-y-1">
                {agentStore.activeStrategy.executionSteps.map((step, index) => (
                  <li key={index} className="text-sm text-gray-700">
                    {step}
                  </li>
                ))}
              </ol>
            </div>

            <div>
              <h4 className="font-semibold mb-2">Recommended Actions:</h4>
              <div className="space-y-2">
                {agentStore.activeStrategy.recommendedActions.map((action, index) => (
                  <div key={index} className="bg-gray-50 rounded p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-medium capitalize">{action.type}</span>
                      <Badge variant="outline">
                        {action.amount} {action.token}
                      </Badge>
                    </div>
                    {action.fromChain && action.toChain && (
                      <div className="text-sm text-gray-600 mt-1">
                        {action.fromChain} → {action.toChain}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Nexus Bridge & Execute Widget */}
            {agentStore.activeStrategy.requiresBridging && agentStore.activeStrategy.bridgeRoute && (
              <div className="border-2 border-dashed border-gray-200 rounded-lg p-6">
                <h4 className="font-semibold mb-4">Execute Cross-Chain Strategy</h4>
                <BridgeAndExecuteButton contractAddress={`0x${process.env.NEXT_PUBLIC_STAKING_PROXY_ADDRESS}` || `0x`}
                  prefill={{
                    token: agentStore.activeStrategy.bridgeRoute.token,
                    amount: agentStore.activeStrategy.bridgeRoute.amount.toString(),
                    toChainId: agentStore.activeStrategy.bridgeRoute.targetChain
                  }}
                  contractAbi={
                    [
                      {
                        "inputs": [
                          {
                            "internalType": "address",
                            "name": "user",
                            "type": "address"
                          },
                          {
                            "internalType": "address",
                            "name": "token",
                            "type": "address"
                          },
                          {
                            "internalType": "uint256",
                            "name": "amount",
                            "type": "uint256"
                          },
                          {
                            "internalType": "uint256",
                            "name": "sourceChainId",
                            "type": "uint256"
                          },
                          {
                            "internalType": "bytes32",
                            "name": "bridgeId",
                            "type": "bytes32"
                          }
                        ],
                        "name": "executeStakeAfterBridge",
                        "outputs": [],
                        "stateMutability": "nonpayable",
                        "type": "function"
                      }
                    ]
                  }
                  functionName='executeStakeAfterBridge'
                  buildFunctionParams={(token: string, amount: string, chainId: number, user) => {
                    return {
                      functionParams: [
                        address,
                        token,
                        amount,
                        agentStore.activeStrategy?.bridgeRoute?.sourceChain,
                        `bridge_${Date.now()}`
                      ]
                    }
                  }}
                // onProgress={(step: any, data: { transactionHash: string; }) => {
                //   console.log(`Bridge step: ${step}`, data);
                //   if (data?.transactionHash) {
                //     showTransactionToast(chain?.id || 1, data.transactionHash);
                //   }
                //   agentStore.updateStatus({
                //     currentStep: `Bridge: ${step}`,
                //     executionStatus: 'bridging'
                //   });
                // }}
                // onSuccess={(result: { bridgeExplorerUrl: any; executeExplorerUrl: any; }) => {
                //   console.log('Bridge success:', result);
                //   agentStore.updateStatus({
                //     executionStatus: 'completed',
                //     currentStep: 'Strategy executed successfully',
                //     transactionHashes: [
                //       ...agentStore.transactionHashes,
                //       result.bridgeExplorerUrl || '',
                //       result.executeExplorerUrl || ''
                //     ].filter(Boolean)
                //   });
                //   toast.success('Cross-chain strategy executed successfully!');
                // }}
                // onError={(error: Error) => {
                //   console.error('Bridge error:', error);
                //   agentStore.updateStatus({
                //     executionStatus: 'failed',
                //     error: error.message
                //   });
                //   toast.error('Bridge execution failed');
                // }}
                >
                  {({ onClick, isLoading }) => (
                    <Button
                      onClick={onClick}
                      disabled={isLoading || agentStore.executionStatus === 'bridging'}
                      size="lg"
                      className="w-full"
                    >
                      {isLoading || agentStore.executionStatus === 'bridging' ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                          Executing Bridge & Stake...
                        </>
                      ) : (
                        'Execute Cross-Chain Strategy'
                      )}
                    </Button>
                  )}
                </BridgeAndExecuteButton>
              </div>
            )}

            {/* Local staking button for non-bridge strategies */}
            {!agentStore.activeStrategy.requiresBridging && (
              <Button
                onClick={handleExecuteStrategy}
                disabled={agentStore.executionStatus !== 'idle'}
                size="lg"
                className="w-full"
              >
                {agentStore.executionStatus === 'staking' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Executing Stake...
                  </>
                ) : (
                  'Execute Staking Strategy'
                )}
              </Button>
            )}
          </CardContent>
        </Card>
      )
      }

      {/* Execution Status */}
      {
        agentStore.executionStatus !== 'idle' && (
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold">
                    Status: {agentStore.executionStatus.charAt(0).toUpperCase() + agentStore.executionStatus.slice(1)}
                  </div>
                  {agentStore.currentStep && (
                    <div className="text-sm text-gray-600">{agentStore.currentStep}</div>
                  )}
                </div>

                {agentStore.executionStatus !== 'completed' && agentStore.executionStatus !== 'failed' && (
                  <Loader2 className="w-5 h-5 animate-spin" />
                )}
              </div>

              {agentStore.transactionHashes.length > 0 && (
                <div className="mt-4 pt-4 border-t">
                  <h4 className="font-semibold mb-2">Transaction Hashes:</h4>
                  <div className="space-y-1">
                    {agentStore.transactionHashes.map((hash, index) => (
                      <a
                        key={index}
                        href={hash}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block text-sm text-blue-600 hover:text-blue-800 font-mono"
                      >
                        {hash}
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {agentStore.error && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
                  Error: {agentStore.error}
                </div>
              )}
            </CardContent>
          </Card>
        )
      }
    </div >
  );
};

// Helper function to get chain ID from name
// const getChainId = (chainName: string): number => {
//   const chainIds: { [key: string]: number } = {
//     'ethereum': 1,
//     'polygon': 137,
//     'arbitrum': 42161,
//     'base': 8453,
//     'sepolia': 11155111
//   };
//   return chainIds[chainName.toLowerCase()] || 1;
// };
