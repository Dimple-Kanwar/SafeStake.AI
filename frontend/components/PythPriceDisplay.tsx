import React from 'react';
import { usePythPrice, usePythPrices } from '../lib/pyth-client';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { TrendingUp, TrendingDown, Clock, AlertCircle } from 'lucide-react';

interface PriceDisplayProps {
  token: string;
  showDetails?: boolean;
}

export const PythPriceDisplay: React.FC<PriceDisplayProps> = ({ token, showDetails = false }) => {
  const { data: priceData, isLoading, error } = usePythPrice(token);
  
  if (isLoading) {
    return (
      <div className="animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-20"></div>
      </div>
    );
  }
  
  if (error || !priceData) {
    return (
      <div className="flex items-center gap-1 text-red-500">
        <AlertCircle className="w-3 h-3" />
        <span className="text-sm">Price unavailable</span>
      </div>
    );
  }
  
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 6
    }).format(price);
  };
  
  const formatTime = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleTimeString();
  };
  
  const getConfidenceColor = (confidence: number, price: number) => {
    const confidencePercent = (confidence / price) * 100;
    if (confidencePercent < 0.1) return 'text-green-600';
    if (confidencePercent < 0.5) return 'text-yellow-600';
    return 'text-red-600';
  };
  
  if (!showDetails) {
    return (
      <div className="flex items-center gap-2">
        <span className="font-mono font-semibold">
          {formatPrice(priceData.price)}
        </span>
        <Badge variant="secondary" className="text-xs">
          <Clock className="w-3 h-3 mr-1" />
          {formatTime(priceData.publishTime)}
        </Badge>
      </div>
    );
  }
  
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center justify-between">
          {token}/USD
          <Badge variant="outline">Pyth Network</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-2xl font-bold font-mono">
          {formatPrice(priceData.price)}
        </div>
        
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-gray-600">Confidence</div>
            <div className={`font-mono ${getConfidenceColor(priceData.confidence, priceData.price)}`}>
              ±{formatPrice(priceData.confidence)}
            </div>
          </div>
          
          <div>
            <div className="text-gray-600">Last Update</div>
            <div className="font-mono">
              {formatTime(priceData.publishTime)}
            </div>
          </div>
        </div>
        
        <div className="pt-2 border-t">
          <div className="text-xs text-gray-500">
            Exponent: {priceData.exponent} | 
            Confidence: {((priceData.confidence / priceData.price) * 100).toFixed(3)}%
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

// Multi-token price overview
export const PythPriceOverview: React.FC<{tokens: string[]}> = ({ tokens }) => {
  const { data: pricesData, isLoading } = usePythPrices(tokens);
  
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {tokens.map(token => (
          <div key={token} className="animate-pulse">
            <div className="h-20 bg-gray-200 rounded"></div>
          </div>
        ))}
      </div>
    );
  }
  
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {tokens.map(token => {
        const priceData = pricesData?.[token];
        
        if (!priceData) {
          return (
            <Card key={token} className="p-4">
              <div className="text-center text-red-500">
                <AlertCircle className="w-6 h-6 mx-auto mb-2" />
                <div className="font-semibold">{token}</div>
                <div className="text-sm">Price unavailable</div>
              </div>
            </Card>
          );
        }
        
        return (
          <Card key={token} className="p-4">
            <div className="text-center">
              <div className="font-semibold text-lg">{token}</div>
              <div className="font-mono font-bold text-xl mb-2">
                ${priceData.price.toFixed(priceData.price < 1 ? 6 : 2)}
              </div>
              <div className="text-xs text-gray-500">
                ±${priceData.confidence.toFixed(priceData.confidence < 1 ? 6 : 2)}
              </div>
              <div className="text-xs text-gray-400 mt-1">
                {new Date(priceData.publishTime * 1000).toLocaleTimeString()}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
};
