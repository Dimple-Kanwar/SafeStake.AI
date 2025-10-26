import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AIDashboard } from '../components/AIDashboard';
import { PythPriceDisplay } from '../components/PythPriceDisplay';
import { TransactionHistory } from '../components/TransactionHistory';

// Mock wagmi hooks
jest.mock('wagmi', () => ({
  useAccount: () => ({
    address: '0x742d35Cc6634C0532925a3b8D6B9DDE3d3ce0B77',
    isConnected: true
  }),
  useNetwork: () => ({
    chain: { id: 1, name: 'Ethereum', network: 'homestead' }
  }),
  useProvider: () => ({})
}));

// Mock SDK clients
jest.mock('../lib/nexus-client');
jest.mock('../lib/agent-client');
jest.mock('../lib/pyth-client');
jest.mock('../lib/blockscout-client');

describe('Integration Tests', () => {
  let queryClient: QueryClient;
  
  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false }
      }
    });
  });
  
  const renderWithProviders = (component: React.ReactElement) => {
    return render(
      <QueryClientProvider client={queryClient}>
        {component}
      </QueryClientProvider>
    );
  };
  
  test('AIDashboard renders with wallet connected', () => {
    renderWithProviders(<AIDashboard />);
    
    expect(screen.getByText('Cross-Chain AI Staking')).toBeInTheDocument();
    expect(screen.getByText('Portfolio Overview')).toBeInTheDocument();
    expect(screen.getByText('AI Strategy Configuration')).toBeInTheDocument();
  });
  
  test('PythPriceDisplay shows price data', async () => {
    renderWithProviders(<PythPriceDisplay token="ETH" showDetails={true} />);
    
    await waitFor(() => {
      expect(screen.getByText('ETH/USD')).toBeInTheDocument();
    });
  });
  
  test('TransactionHistory loads for connected wallet', () => {
    renderWithProviders(<TransactionHistory />);
    
    expect(screen.getByText('Transaction History')).toBeInTheDocument();
    expect(screen.getByText('View in Explorer')).toBeInTheDocument();
  });
});
