#!/bin/bash
# RealMultiLLM Deployment Script
# Optimized for macOS systems with limited resources

# 3-STEP PLAN:
# 1. Validate environment and dependencies
# 2. Run tests and build process with resource management
# 3. Deploy to Netlify with proper configuration

set -e # Exit on any error

echo "🚀 Starting RealMultiLLM deployment process..."

# Check Node version
NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "❌ Node.js version 20 or newer is required"
  exit 1
fi

# Check for required environment variables
required_envs=("DATABASE_URL" "NEXTAUTH_SECRET")
missing_envs=()

for env in "${required_envs[@]}"; do
  if [ -z "${!env}" ]; then
    missing_envs+=("$env")
  fi
done

if [ ${#missing_envs[@]} -ne 0 ]; then
  echo "❌ Missing required environment variables: ${missing_envs[*]}"
  echo "Please set them in .env.local or your environment"
  exit 1
fi

# Clean previous build files
echo "🧹 Cleaning previous build artifacts..."
if npm run -s clean >/dev/null 2>&1; then
  npm run clean
else
  rm -rf .next
fi

# Install dependencies with memory optimization
echo "📦 Installing dependencies..."
export NODE_OPTIONS="--max-old-space-size=4096"
npm ci --no-fund --no-audit

# Generate Prisma client
echo "🔄 Generating Prisma client..."
npx prisma generate

# Run type checking
echo "🔍 Running type checking..."
npm run type-check

# Run lightweight tests (skip heavy tests on resource-constrained machines)
echo "🧪 Running critical tests only..."
LIGHTWEIGHT_TESTS=true npm run test:run

# Build the application
echo "🏗️ Building the application..."
npm run build

# Deploy using Netlify CLI if installed
if command -v netlify &> /dev/null; then
  echo "🚀 Deploying to Netlify..."
  netlify deploy --prod
else
  echo "ℹ️ Netlify CLI not found. Manual deployment required."
  echo "Run 'npm install -g netlify-cli' to install Netlify CLI"
  echo "Then run 'netlify deploy --prod' to deploy"
fi

echo "✅ Deployment process completed!"
