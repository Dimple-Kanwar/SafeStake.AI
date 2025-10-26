'use client';

import React from 'react';
import { 
  NotificationProvider, 
  TransactionPopupProvider,
  useNotification,
  useTransactionPopup 
} from '@blockscout/app-sdk';
import { useQuery } from '@tanstack/react-query';
import { getBlockscoutClient } from './blockscout-client';

// React Provider Component
export const BlockscoutProvider: React.FC<{children: React.ReactNode}> = ({ children }) => {
  return (
    <NotificationProvider>
      <TransactionPopupProvider>
        {children}
      </TransactionPopupProvider>
    </NotificationProvider>
  );
};

// Custom hooks
export const useBlockscoutNotifications = () => {
  const { openTxToast } = useNotification();
  
  const showTransactionToast = (chainId: number, txHash: string) => {
    openTxToast(chainId.toString(), txHash);
  };
  
  return { showTransactionToast };
};

export const useBlockscoutPopup = () => {
  const { openPopup } = useTransactionPopup();
  
  const showTransactionHistory = (chainId: number, address: string) => {
    openPopup({
      chainId: chainId.toString(),
      address,
    });
  };
  
  const showTransactionDetails = (chainId: number, txHash: string) => {
    openPopup({
      chainId: chainId.toString(),
      address: txHash,
    });
  };
  
  return { showTransactionHistory, showTransactionDetails };
};

// React Query hooks
export const useTransactionHistory = (chainId: number, address: string) => {
  return useQuery({
    queryKey: ['transaction-history', chainId, address],
    queryFn: () => getBlockscoutClient().getTransactionHistory(chainId, address),
    enabled: !!address && !!chainId,
    refetchInterval: 30000
  });
};

export const useTokenTransfers = (chainId: number, address: string, tokenAddress?: string) => {
  return useQuery({
    queryKey: ['token-transfers', chainId, address, tokenAddress],
    queryFn: () => getBlockscoutClient().getTokenTransfers(chainId, address, tokenAddress),
    enabled: !!address && !!chainId,
    refetchInterval: 30000
  });
};
