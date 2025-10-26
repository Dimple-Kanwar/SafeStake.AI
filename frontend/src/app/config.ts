import { createConfig, http } from '@wagmi/core'
import { hederaTestnet, baseSepolia, arbitrumSepolia } from '@wagmi/core/chains'
import { getDefaultConfig } from 'connectkit';

// Configure Wagmi
export const config = createConfig(
  getDefaultConfig({
    appName: 'Cross-Chain AI Staking MVP',
    appDescription: 'Optimize your staking strategy across multiple blockchains with AI agents',
    appUrl: 'https://cross-chain-ai-staking.vercel.app',
    appIcon: '/favicon.ico',
    walletConnectProjectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID!,
    chains: [hederaTestnet, arbitrumSepolia, baseSepolia],
    ssr: true
  })
);