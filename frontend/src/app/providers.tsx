'use client';

import React, { useRef } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createConfig, WagmiProvider } from 'wagmi';
import { ConnectKitProvider } from 'connectkit';
import { Toaster } from 'react-hot-toast';
import { config } from './config';
import { BlockscoutProvider } from '../../lib/blockscout-provider';

// Create React Query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000, // 30 seconds
      // cacheTime: 5 * 60 * 1000, // 5 minutes
      retry: 3,
      refetchOnWindowFocus: false,
    },
  },
});

export const Providers: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <ConnectKitProvider
          theme="auto"
          mode="auto"
          customTheme={{
            '--ck-connectbutton-font-size': '16px',
            '--ck-connectbutton-border-radius': '12px',
            '--ck-connectbutton-color': '#373737',
            '--ck-connectbutton-background': '#ffffff',
            '--ck-connectbutton-box-shadow': '0 2px 4px rgba(0, 0, 0, 0.1)',
          }}
          options={{
            initialChainId: 0, // Auto-detect
            walletConnectName: 'Cross-Chain AI Staking',
            disclaimer: (
              <div className="text-sm text-gray-600 p-4">
                By connecting your wallet, you agree to use our experimental cross-chain AI staking platform.
              </div>
            ),
          }}
        >
          <BlockscoutProvider>
            {children}
            <Toaster
              position="top-right"
              toastOptions={{
                duration: 5000,
                style: {
                  background: '#363636',
                  color: '#fff',
                },
                success: {
                  duration: 3000,
                  iconTheme: {
                    primary: '#10B981',
                    secondary: '#fff',
                  },
                },
                error: {
                  duration: 7000,
                  iconTheme: {
                    primary: '#EF4444',
                    secondary: '#fff',
                  },
                },
              }}
            />
          </BlockscoutProvider>
        </ConnectKitProvider>
      </QueryClientProvider >
    </WagmiProvider>
  );
};
