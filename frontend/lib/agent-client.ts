import { SUPPORTED_CHAINS_IDS, SUPPORTED_TOKENS } from '@avail-project/nexus-core';
import { create } from 'zustand';

export interface OptimizationRequest {
  userAddress: string;
  targetStakeAmount: number;
  targetChain: string;
  targetToken: string;
  riskTolerance: 'conservative' | 'moderate' | 'aggressive';
  timeHorizon: number;
  currentPortfolio: {[key: string]: any};
}

export interface OptimizationResponse {
  strategyId: string;
  recommendedActions: Array<{
    type: string;
    fromChain?: string;
    toChain?: string;
    token: string;
    amount: number;
    expectedYield?: number;
  }>;
  expectedYield: number;
  riskScore: number;
  estimatedGasCost: number;
  executionSteps: string[];
  requiresBridging: boolean;
  bridgeRoute?: {
    sourceChain: SUPPORTED_CHAINS_IDS;
    targetChain: SUPPORTED_CHAINS_IDS;
    token: SUPPORTED_TOKENS;
    amount: number;
  };
}

export interface AgentState {
  isConnected: boolean;
  activeStrategy: OptimizationResponse | null;
  executionStatus: 'idle' | 'optimizing' | 'bridging' | 'staking' | 'completed' | 'failed';
  currentStep: string;
  transactionHashes: string[];
  error: string | null;
}

interface AgentStore extends AgentState {
  connect: () => Promise<void>;
  disconnect: () => void;
  requestOptimization: (request: OptimizationRequest) => Promise<OptimizationResponse>;
  executeStrategy: (strategyId: string) => Promise<void>;
  updateStatus: (status: Partial<AgentState>) => void;
  reset: () => void;
}

// Agent Communication Client
export class AgentClient {
  private websocket: WebSocket | null = null;
  private messageQueue: Map<string, {resolve: Function, reject: Function}> = new Map();
  
  constructor(private agentEndpoint: string = 'ws://localhost:8000/ws') {}
  
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.websocket = new WebSocket(this.agentEndpoint);
        
        this.websocket.onopen = () => {
          console.log('Connected to AI agents');
          resolve();
        };
        
        this.websocket.onmessage = (event) => {
          this.handleMessage(JSON.parse(event.data));
        };
        
        this.websocket.onerror = (error) => {
          console.error('Agent WebSocket error:', error);
          reject(error);
        };
        
        this.websocket.onclose = () => {
          console.log('Disconnected from AI agents');
          this.websocket = null;
        };
      } catch (error) {
        reject(error);
      }
    });
  }
  
  disconnect(): void {
    if (this.websocket) {
      this.websocket.close();
      this.websocket = null;
    }
  }
  
  async sendMessage(type: string, payload: any): Promise<any> {
    if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected to agents');
    }
    
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const message = {
      id: messageId,
      type,
      payload,
      timestamp: Date.now()
    };
    
    return new Promise((resolve, reject) => {
      this.messageQueue.set(messageId, { resolve, reject });
      this.websocket!.send(JSON.stringify(message));
      
      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.messageQueue.has(messageId)) {
          this.messageQueue.delete(messageId);
          reject(new Error('Request timeout'));
        }
      }, 30000);
    });
  }
  
  private handleMessage(message: any): void {
    if (message.id && this.messageQueue.has(message.id)) {
      const { resolve, reject } = this.messageQueue.get(message.id)!;
      this.messageQueue.delete(message.id);
      
      if (message.error) {
        reject(new Error(message.error));
      } else {
        resolve(message.payload);
      }
    } else if (message.type === 'status_update') {
      // Handle status updates
      useAgentStore.getState().updateStatus(message.payload);
    }
  }
  
  async requestOptimization(request: OptimizationRequest): Promise<OptimizationResponse> {
    return this.sendMessage('optimization_request', request);
  }
  
  async executeStrategy(strategyId: string, userAddress: string): Promise<void> {
    return this.sendMessage('execute_strategy', { strategyId, userAddress });
  }
}

// Global agent client instance
let agentClient: AgentClient | null = null;

export const getAgentClient = (): AgentClient => {
  if (!agentClient) {
    agentClient = new AgentClient();
  }
  return agentClient;
};

// Zustand store for agent state
export const useAgentStore = create<AgentStore>((set, get) => ({
  isConnected: false,
  activeStrategy: null,
  executionStatus: 'idle',
  currentStep: '',
  transactionHashes: [],
  error: null,
  
  connect: async () => {
    try {
      await getAgentClient().connect();
      set({ isConnected: true, error: null });
    } catch (error) {
      set({ error: (error as Error).message, isConnected: false });
      throw error;
    }
  },
  
  disconnect: () => {
    getAgentClient().disconnect();
    set({ isConnected: false });
  },
  
  requestOptimization: async (request: OptimizationRequest) => {
    set({ executionStatus: 'optimizing', error: null });
    try {
      const strategy = await getAgentClient().requestOptimization(request);
      set({ activeStrategy: strategy, executionStatus: 'idle' });
      return strategy;
    } catch (error) {
      set({ error: (error as Error).message, executionStatus: 'failed' });
      throw error;
    }
  },
  
  executeStrategy: async (strategyId: string) => {
    const { activeStrategy } = get();
    if (!activeStrategy) {
      throw new Error('No active strategy');
    }
    
    set({ executionStatus: 'bridging', currentStep: 'Initiating cross-chain operations...' });
    
    try {
      await getAgentClient().executeStrategy(strategyId, activeStrategy.bridgeRoute?.token!);
      set({ executionStatus: 'completed', currentStep: 'Strategy executed successfully' });
    } catch (error) {
      set({ error: (error as Error).message, executionStatus: 'failed' });
      throw error;
    }
  },
  
  updateStatus: (status: Partial<AgentState>) => {
    set(status);
  },
  
  reset: () => {
    set({
      activeStrategy: null,
      executionStatus: 'idle',
      currentStep: '',
      transactionHashes: [],
      error: null
    });
  }
}));
