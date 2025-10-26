import { ExecuteParams, NexusSDK, SUPPORTED_CHAINS, SUPPORTED_CHAINS_IDS, SUPPORTED_TOKENS } from '@avail-project/nexus-core';
import { createPublicClient, createWalletClient, custom, http, PublicClient, WalletClient } from 'viem';
import { mainnet, polygon, arbitrum, base, sepolia } from 'viem/chains';

export interface NexusConfig {
  network: 'mainnet' | 'testnet';
  rpcUrls?: {
    [chainId: number]: string;
  };
}

export class NexusClient {
  private sdk: NexusSDK;
  private publicClient: PublicClient;
  private walletClient: WalletClient | null = null;
  
  constructor(config: NexusConfig) {
    // Initialize Nexus SDK
    this.sdk = new NexusSDK({
      network: config.network,
      // rpcUrls: config.rpcUrls || {}
    });
    
    // Setup public client
    this.publicClient = createPublicClient({
      chain: config.network === 'mainnet' ? mainnet : sepolia,
      transport: http()
    });
  }
  
  async initialize(provider: any): Promise<void> {
    try {
      // Initialize Nexus SDK with provider
      await this.sdk.initialize(provider);
      
      // Setup wallet client if provider available
      if (provider) {
        this.walletClient = createWalletClient({
          chain: this.publicClient.chain,
          transport: custom(provider)
        });
      }
      
      console.log('Nexus SDK initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Nexus SDK:', error);
      throw error;
    }
  }
  
  async simulateBridgeAndExecute(params: {
    token: SUPPORTED_TOKENS;
    amount: string;
    toChainId: SUPPORTED_CHAINS_IDS;
    userAddress: string;
    execute?: Omit<ExecuteParams, 'toChainId'>}) {
    try {
      const startTime = Date.now();
      const simulation = await this.sdk.simulateBridgeAndExecute({
        token: params.token,
        amount: params.amount,
        toChainId: params.toChainId,
        execute: params.execute
      });
      const endTime = Date.now();
      return {
        ...simulation,
        estimatedTime: (endTime - startTime) || 300, // 5 minutes default
        totalEstimatedCost: simulation.totalEstimatedCost!.breakdown.bridge || '0',
        gasCost: simulation.executeSimulation?.gasCostEth || '0',
        success: simulation.success || false
      };
    } catch (error) {
      console.error('Bridge simulation failed:', error);
      throw error;
    }
  }
  
  async executeBridgeAndStake(params: {
    token: SUPPORTED_TOKENS;
    amount: string;
    toChainId: SUPPORTED_CHAINS_IDS;
    userAddress: string;
    stakingContract: string;
    onProgress?: (step: string, txHash?: string) => void;
  }) {
    if (!this.walletClient) {
      throw new Error('Wallet not connected');
    }
    
    try {
      const executeParams: Omit<ExecuteParams, 'toChainId'> = {
        contractAddress: params.stakingContract,
        functionName: 'executeStakeAfterBridge',
        buildFunctionParams: (token: string, amount: string, chainId: number, userAddress: string) => ({
          functionParams: [
            userAddress,
            token,
            amount,
            chainId,
            `bridge_${Date.now()}`
          ]
        }),
        contractAbi: []
      };
      
      const result = await this.sdk.bridgeAndExecute({
        token: params.token,
        amount: params.amount,
        toChainId: params.toChainId,
        execute: executeParams,
        // onProgress: (step, data) => {
        //   console.log(`Bridge step: ${step}`, data);
        //   params.onProgress?.(step, data?.transactionHash);
        // }
      });
      
      return result;
    } catch (error) {
      console.error('Bridge and execute failed:', error);
      throw error;
    }
  }
  
  // async getTransactionStatus(txHash: string, chainId: number) {
  //   try {
  //     return await this.sdk.utils.(txHash, chainId);
  //   } catch (error) {
  //     console.error('Failed to get transaction status:', error);
  //     throw error;
  //   }
  // }
  
  getSupportedChains() {
    return this.sdk.getSwapSupportedChainsAndTokens();
  }
  
  getSupportedTokens(chainId: number) {
    return this.sdk.getSwapSupportedChainsAndTokens();
  }
}

// Singleton instance
let nexusClient: NexusClient | null = null;

export const getNexusClient = (config?: NexusConfig): NexusClient => {
  if (!nexusClient && config) {
    nexusClient = new NexusClient(config);
  }
  if (!nexusClient) {
    throw new Error('NexusClient not initialized. Please provide config.');
  }
  return nexusClient;
};
