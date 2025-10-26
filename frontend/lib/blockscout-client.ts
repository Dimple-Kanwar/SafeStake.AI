import { 
  NotificationProvider, 
  TransactionPopupProvider,
  useNotification,
  useTransactionPopup 
} from '@blockscout/app-sdk';
import { createBlockscoutClient } from '@settlemint/sdk-blockscout';

export interface BlockscoutConfig {
  instances: {
    [chainId: number]: {
      url: string;
      apiKey?: string;
    };
  };
}

export class BlockscoutClient {
  private clients: {[chainId: number]: any} = {};
  
  constructor(private config: BlockscoutConfig) {
    this.initializeClients();
  }
  
  private initializeClients() {
    Object.entries(this.config.instances).forEach(([chainId, config]) => {
      try {
        this.clients[Number(chainId)] = createBlockscoutClient({
          instance: config.url,
          accessToken: config.apiKey
        });
      } catch (error) {
        console.error(`Failed to initialize Blockscout client for chain ${chainId}:`, error);
      }
    });
  }
  
  getClient(chainId: number) {
    return this.clients[chainId];
  }
  
  async getTransactionHistory(chainId: number, address: string, limit = 20) {
    const client = this.getClient(chainId);
    if (!client) {
      throw new Error(`No Blockscout client configured for chain ${chainId}`);
    }
    
    try {
      // This would be the actual GraphQL query in production
      const query = `
        query GetTransactionHistory($address: String!, $limit: Int!) {
          address(hash: $address) {
            transactions(first: $limit, order_by: {block_height: desc}) {
              edges {
                node {
                  hash
                  block_height
                  block_timestamp
                  value
                  gas_used
                  gas_price
                  status
                  to_address_hash
                  from_address_hash
                }
              }
            }
          }
        }
      `;
      
      const result = await client.client.request(query, { address, limit });
      return result.address?.transactions?.edges?.map((edge: any) => edge.node) || [];
    } catch (error) {
      console.error('Failed to fetch transaction history:', error);
      return [];
    }
  }
  
  async getTokenTransfers(chainId: number, address: string, tokenAddress?: string) {
    const client = this.getClient(chainId);
    if (!client) {
      throw new Error(`No Blockscout client configured for chain ${chainId}`);
    }
    
    try {
      const query = `
        query GetTokenTransfers($address: String!, $token: String) {
          address(hash: $address) {
            token_transfers(first: 50, token_contract_address_hash: $token) {
              edges {
                node {
                  amount
                  block_number
                  block_timestamp
                  transaction_hash
                  from_address_hash
                  to_address_hash
                  token_contract_address_hash
                  token {
                    name
                    symbol
                    decimals
                  }
                }
              }
            }
          }
        }
      `;
      
      const result = await client.client.request(query, { 
        address, 
        token: tokenAddress 
      });
      
      return result.address?.token_transfers?.edges?.map((edge: any) => edge.node) || [];
    } catch (error) {
      console.error('Failed to fetch token transfers:', error);
      return [];
    }
  }
  
  getExplorerUrl(chainId: number, txHash: string): string {
    const instance = this.config.instances[chainId];
    if (!instance) {
      return `https://etherscan.io/tx/${txHash}`; // Fallback
    }
    
    return `${instance.url}/tx/${txHash}`;
  }
}

// Default Blockscout configuration
const DEFAULT_BLOCKSCOUT_CONFIG: BlockscoutConfig = {
  instances: {
    1: { url: 'https://eth.blockscout.com' }, // Ethereum
    137: { url: 'https://polygon.blockscout.com' }, // Polygon
    42161: { url: 'https://arbitrum.blockscout.com' }, // Arbitrum
    8453: { url: 'https://base.blockscout.com' }, // Base
    11155111: { url: 'https://eth-sepolia.blockscout.com' }, // Sepolia
    80002: { url: 'https://polygon-amoy.blockscout.com' } // Polygon Amoy
  }
};

// Global Blockscout client
let blockscoutClient: BlockscoutClient | null = null;

export const getBlockscoutClient = (config?: BlockscoutConfig): BlockscoutClient => {
  if (!blockscoutClient) {
    blockscoutClient = new BlockscoutClient(config || DEFAULT_BLOCKSCOUT_CONFIG);
  }
  return blockscoutClient;
};
