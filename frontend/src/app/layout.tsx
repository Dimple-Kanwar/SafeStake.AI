import React from 'react';
import { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Cross-Chain AI Staking MVP',
  description: 'Optimize your staking strategy across multiple blockchains with AI agents',
  keywords: ['DeFi', 'Cross-Chain', 'AI', 'Staking', 'ETHOnline2025'],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>
          <main className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
