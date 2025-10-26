#!/bin/bash

echo "🚀 Deploying Cross-Chain AI Staking Frontend..."

# Check if environment variables are set
if [ -z "$NEXT_PUBLIC_ALCHEMY_API_KEY" ]; then
  echo "❌ NEXT_PUBLIC_ALCHEMY_API_KEY not set"
  exit 1
fi

if [ -z "$NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID" ]; then
  echo "❌ NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID not set"
  exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Build the application
echo "🏗️ Building application..."
npm run build

# Run tests
echo "🧪 Running tests..."
npm run test -- --passWithNoTests

# Deploy to Vercel (if configured)
if command -v vercel &> /dev/null; then
  echo "🌐 Deploying to Vercel..."
  vercel --prod
else
  echo "⚠️ Vercel CLI not found. Skipping deployment."
fi

echo "✅ Frontend deployment complete!"
