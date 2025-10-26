'use client';

import React from 'react';
import { ConnectKitButton } from 'connectkit';
import { useAccount } from 'wagmi';
import { AIDashboard } from '../../components/AIDashboard';
import { TransactionHistory } from '../../components/TransactionHistory';
import { PythPriceOverview } from '../../components/PythPriceDisplay';

export default function HomePage() {
  const { isConnected } = useAccount();

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <header className="flex items-center justify-between mb-12">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            Cross-Chain AI Staking
          </h1>
          <p className="text-gray-600 mt-2">
            ETHOnline 2025 - Powered by Avail Nexus, ASI Agents, Pyth & Blockscout
          </p>
        </div>
        
        <ConnectKitButton 
          theme="auto"
          showBalance={true}
          showAvatar={true}
        />
      </header>

      {isConnected ? (
        <div className="space-y-8">
          {/* Price Overview */}
          <section>
            <h2 className="text-2xl font-semibold mb-4">Live Prices (Pyth Network)</h2>
            <PythPriceOverview tokens={['ETH', 'USDC', 'PYUSD', 'HBR', 'ARB']} />
          </section>

          {/* Main Dashboard */}
          <section>
            <AIDashboard />
          </section>

          {/* Transaction History */}
          <section>
            <h2 className="text-2xl font-semibold mb-4">Transaction History (Blockscout)</h2>
            <TransactionHistory />
          </section>
        </div>
      ) : (
        <div className="text-center py-20">
          <div className="max-w-2xl mx-auto">
            <h2 className="text-4xl font-bold mb-6">
              Welcome to Cross-Chain AI Staking
            </h2>
            <p className="text-xl text-gray-600 mb-8">
              Optimize your DeFi staking strategy across multiple blockchains using AI agents. 
              Get started by connecting your wallet.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
              <div className="bg-white rounded-lg shadow-lg p-6 border border-gray-100">
                <div className="text-blue-600 text-3xl mb-4">🤖</div>
                <h3 className="font-semibold text-lg mb-2">AI-Powered Strategy</h3>
                <p className="text-gray-600 text-sm">
                  Our AI agents analyze your portfolio and optimize cross-chain staking strategies
                </p>
              </div>
              
              <div className="bg-white rounded-lg shadow-lg p-6 border border-gray-100">
                <div className="text-green-600 text-3xl mb-4">🌉</div>
                <h3 className="font-semibold text-lg mb-2">Cross-Chain Bridging</h3>
                <p className="text-gray-600 text-sm">
                  Seamlessly bridge assets across Ethereum, Polygon, Arbitrum, and Base
                </p>
              </div>
              
              <div className="bg-white rounded-lg shadow-lg p-6 border border-gray-100">
                <div className="text-purple-600 text-3xl mb-4">📊</div>
                <h3 className="font-semibold text-lg mb-2">Real-Time Data</h3>
                <p className="text-gray-600 text-sm">
                  Live price feeds from Pyth Network and transaction tracking via Blockscout
                </p>
              </div>
            </div>
            
            <ConnectKitButton 
              theme="auto"
              mode="light"
              customTheme={{
                '--ck-connectbutton-font-size': '18px',
                '--ck-connectbutton-border-radius': '16px',
                '--ck-primary-button-color': '#ffffff',
                '--ck-primary-button-background': '#3B82F6',
                '--ck-primary-button-hover-background': '#2563EB',
              }}
            />
          </div>
        </div>
      )}
      
      {/* Footer */}
      <footer className="mt-20 pt-12 border-t border-gray-200">
        <div className="text-center text-gray-500">
          <p className="mb-2">
            Built for ETHOnline 2025 | Integrating 6+ Prize Track Technologies
          </p>
          <div className="flex justify-center gap-6 text-sm">
            <a href="https://github.com/your-repo" target="_blank" className="hover:text-gray-700">
              GitHub Repository
            </a>
            <a href="https://docs.availproject.org" target="_blank" className="hover:text-gray-700">
              Avail Nexus Docs
            </a>
            <a href="https://pyth.network" target="_blank" className="hover:text-gray-700">
              Pyth Network
            </a>
            <a href="https://blockscout.com" target="_blank" className="hover:text-gray-700">
              Blockscout Explorer
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
