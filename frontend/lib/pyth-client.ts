import { HermesClient } from '@pythnetwork/hermes-client';

export interface PythConfig {
  hermesEndpoint?: string;
  priceIds: {[token: string]: string};
}

export interface PriceData {
  price: number;
  confidence: number;
  exponent: number;
  publishTime: number;
}

export class PythClient {
  private hermes: HermesClient;
  private priceIds: {[token: string]: string};
  
  constructor(config: PythConfig) {
    this.hermes = new HermesClient(
      config.hermesEndpoint || 'https://hermes.pyth.network'
    );
    this.priceIds = config.priceIds;
  }
  
  async getPrice(token: string): Promise<PriceData | null> {
    const priceId = this.priceIds[token];
    if (!priceId) {
      console.warn(`No price ID configured for token: ${token}`);
      return null;
    }
    
    try {
      const priceFeeds = await this.hermes.getLatestPriceFeeds([priceId]);
      const priceFeed = priceFeeds;
      
      if (!priceFeed || !priceFeed.price) {
        return null;
      }
      
      return {
        price: Number(priceFeed.price.price) * Math.pow(10, priceFeed.price.expo),
        confidence: Number(priceFeed.price.conf) * Math.pow(10, priceFeed.price.expo),
        exponent: priceFeed.price.expo,
        publishTime: Number(priceFeed.price.publishTime)
      };
    } catch (error) {
      console.error(`Failed to fetch price for ${token}:`, error);
      return null;
    }
  }
  
  async getPrices(tokens: string[]): Promise<{[token: string]: PriceData | null}> {
    const priceIds = tokens
      .map(token => this.priceIds[token])
      .filter(Boolean);
    
    if (priceIds.length === 0) {
      return {};
    }
    
    try {
      const priceFeeds = await this.hermes.getLatestPriceFeeds(priceIds);
      const results: {[token: string]: PriceData | null} = {};
      
      tokens.forEach((token, index) => {
        const priceFeed = priceFeeds.find(feed => 
          feed.id === this.priceIds[token]
        );
        
        if (priceFeed && priceFeed.price) {
          results[token] = {
            price: Number(priceFeed.price.price) * Math.pow(10, priceFeed.price.expo),
            confidence: Number(priceFeed.price.conf) * Math.pow(10, priceFeed.price.expo),
            exponent: priceFeed.price.expo,
            publishTime: Number(priceFeed.price.publishTime)
          };
        } else {
          results[token] = null;
        }
      });
      
      return results;
    } catch (error) {
      console.error('Failed to fetch multiple prices:', error);
      return {};
    }
  }
  
  async getPriceUpdateData(tokens: string[]): Promise<string[]> {
    const priceIds = tokens
      .map(token => this.priceIds[token])
      .filter(Boolean);
    
    if (priceIds.length === 0) {
      return [];
    }
    
    try {
      const updateData = await this.hermes.getLatestVaas(priceIds);
      return updateData.map(vaa => `0x${Buffer.from(vaa, 'base64').toString('hex')}`);
    } catch (error) {
      console.error('Failed to get price update data:', error);
      return [];
    }
  }
}

// Default Pyth configuration with common price IDs
const DEFAULT_PRICE_IDS = {
  'ETH': '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
  'USDC': '0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a',
  'PYUSD': '0x41f3625971ca2ed2263e78573fe5ce23e13d2558ed3f2e47ab0f84fb9e7ae722',
  'MATIC': '0x5de33a9112c2b700b8d30b8a3402c103578ccfa2765696471cc672bd5cf6ac52',
  'ARB': '0x3fa4252848f9f0a1480be62745a4629d9eb1322aebab8a791e344b3b9c1adcf5',
};

// Global Pyth client
let pythClient: PythClient | null = null;

export const getPythClient = (config?: PythConfig): PythClient => {
  if (!pythClient) {
    pythClient = new PythClient({
      priceIds: DEFAULT_PRICE_IDS,
      ...config
    });
  }
  return pythClient;
};

// React hook for price data
import { useQuery } from '@tanstack/react-query';

export const usePythPrice = (token: string, refreshInterval = 10000) => {
  return useQuery({
    queryKey: ['pyth-price', token],
    queryFn: () => getPythClient().getPrice(token),
    refetchInterval: refreshInterval,
    staleTime: 5000 // Consider data stale after 5 seconds
  });
};

export const usePythPrices = (tokens: string[], refreshInterval = 10000) => {
  return useQuery({
    queryKey: ['pyth-prices', tokens.sort().join(',')],
    queryFn: () => getPythClient().getPrices(tokens),
    refetchInterval: refreshInterval,
    staleTime: 5000
  });
};
