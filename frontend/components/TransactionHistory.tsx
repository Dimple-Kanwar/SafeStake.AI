import React from 'react';
import { useAccount } from 'wagmi';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { ExternalLink, Clock, Hash, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { useBlockscoutPopup, useTransactionHistory } from '../lib/blockscout-provider';

export const TransactionHistory: React.FC = () => {
  const { address, chain } = useAccount();
  const { showTransactionDetails, showTransactionHistory } = useBlockscoutPopup();
  
  const { 
    data: transactions, 
    isLoading, 
    error 
  } = useTransactionHistory(chain?.id || 1, address || '');
  
  if (!address) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-gray-500">
          Connect wallet to view transaction history
        </CardContent>
      </Card>
    );
  }
  
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Transaction History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="flex items-center justify-between p-4 border rounded">
                  <div className="space-y-2 flex-1">
                    <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                    <div className="h-3 bg-gray-200 rounded w-1/3"></div>
                  </div>
                  <div className="h-8 bg-gray-200 rounded w-20"></div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }
  
  if (error || !transactions) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Transaction History</CardTitle>
        </CardHeader>
        <CardContent className="p-6 text-center text-red-500">
          Failed to load transaction history
        </CardContent>
      </Card>
    );
  }
  
  const formatHash = (hash: string) => {
    return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
  };
  
  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };
  
  const formatValue = (value: string) => {
    const eth = parseFloat(value) / 1e18;
    return eth.toFixed(6);
  };
  
  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'success':
      case 'ok':
        return 'success';
      case 'failed':
      case 'error':
        return 'destructive';
      default:
        return 'secondary';
    }
  };
  
  const isIncoming = (tx: any) => {
    return tx.to_address_hash?.toLowerCase() === address?.toLowerCase();
  };
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          Transaction History
          <Button
            variant="outline"
            size="sm"
            onClick={() => showTransactionHistory(chain?.id || 1, address)}
          >
            <ExternalLink className="w-4 h-4 mr-1" />
            View in Explorer
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {transactions.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            No transactions found
          </div>
        ) : (
          <div className="space-y-3">
            {transactions.slice(0, 10).map((tx: any) => (
              <div
                key={tx.hash}
                className="flex items-center justify-between p-4 border rounded hover:bg-gray-50 transition-colors cursor-pointer"
                onClick={() => showTransactionDetails(chain?.id || 1, tx.hash)}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-full ${isIncoming(tx) ? 'bg-green-100' : 'bg-blue-100'}`}>
                    {isIncoming(tx) ? (
                      <ArrowDownLeft className="w-4 h-4 text-green-600" />
                    ) : (
                      <ArrowUpRight className="w-4 h-4 text-blue-600" />
                    )}
                  </div>
                  
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-sm">
                        {formatHash(tx.hash)}
                      </span>
                      <Badge variant={getStatusColor(tx.status)}>
                        {tx.status || 'Unknown'}
                      </Badge>
                    </div>
                    
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatTime(tx.block_timestamp)}
                      </div>
                      
                      <div className="flex items-center gap-1">
                        <Hash className="w-3 h-3" />
                        Block {tx.block_height}
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="text-right">
                  <div className="font-mono font-semibold">
                    {formatValue(tx.value)} ETH
                  </div>
                  
                  {tx.gas_used && tx.gas_price && (
                    <div className="text-sm text-gray-500">
                      Gas: {(parseInt(tx.gas_used) * parseInt(tx.gas_price) / 1e18).toFixed(6)} ETH
                    </div>
                  )}
                </div>
              </div>
            ))}
            
            {transactions.length > 10 && (
              <div className="text-center pt-4">
                <Button
                  variant="outline"
                  onClick={() => showTransactionHistory(chain?.id || 1, address)}
                >
                  View All Transactions
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
