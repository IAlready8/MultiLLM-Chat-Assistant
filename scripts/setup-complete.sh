#!/bin/bash

# RealMultiLLM Complete Setup Script
# This script provides a comprehensive setup for the RealMultiLLM project

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Header
log "========================================="
log "RealMultiLLM Complete Setup"
log "========================================="

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    error "package.json not found. Please run this script from the project root."
    exit 1
fi

# Step 1: Environment Setup
log "Step 1: Environment Setup"

# Check Node.js version
NODE_VERSION=$(node --version)
log "Node.js version: $NODE_VERSION"
if [[ "$NODE_VERSION" =~ ^v20\. ]]; then
    success "Node.js version is compatible"
else
    warning "Recommended: Node.js v20.x for optimal compatibility"
fi

# Check npm version
NPM_VERSION=$(npm --version)
log "npm version: $NPM_VERSION"

# Step 2: Environment File Setup
log "Step 2: Environment File Configuration"

if [ ! -f ".env.local" ]; then
    if [ -f ".env.example" ]; then
        log "Creating .env.local from .env.example..."
        cp .env.example .env.local
        
        # Generate secure keys
        if command -v openssl &> /dev/null; then
            NEXTAUTH_SECRET=$(openssl rand -base64 32)
            ENCRYPTION_KEY=$(openssl rand -base64 64)
            
            # Update .env.local with generated keys
            sed -i.bak "s/NEXTAUTH_SECRET=.*/NEXTAUTH_SECRET=$NEXTAUTH_SECRET/" .env.local
            sed -i.bak "s/ENCRYPTION_MASTER_KEY=.*/ENCRYPTION_MASTER_KEY=$ENCRYPTION_KEY/" .env.local
            rm .env.local.bak
            
            success "Generated secure keys in .env.local"
        else
            warning "OpenSSL not found. Please manually configure secure keys in .env.local"
        fi
        
        warning "Please edit .env.local with your actual API keys and database URL"
    else
        error ".env.example not found"
    fi
else
    success ".env.local already exists"
fi

# Step 3: Dependencies
log "Step 3: Dependency Installation"

# Clear cache and node_modules if requested
if [ "$1" == "--clean" ]; then
    log "Cleaning node_modules and cache..."
    rm -rf node_modules
    rm -rf package-lock.json
    npm cache clean --force
fi

log "Installing dependencies..."
npm ci --prefer-offline --no-audit
success "Dependencies installed"

# Step 4: Git Hooks Setup
log "Step 4: Git Hooks Configuration"
if [ -d ".git" ]; then
    if [ -f "scripts/setup-hooks.sh" ]; then
        chmod +x scripts/setup-hooks.sh
        ./scripts/setup-hooks.sh
        success "Git hooks configured"
    else
        warning "Git hooks setup script not found"
    fi
else
    warning "Not a git repository, skipping git hooks setup"
fi

# Step 5: Database Setup
log "Step 5: Database Configuration"

# Check if DATABASE_URL is set
if [ -n "$DATABASE_URL" ]; then
    log "DATABASE_URL found, setting up database..."
    
    # Generate Prisma client
    if npx prisma generate >/dev/null 2>&1; then
        success "Prisma client generated"
    else
        warning "Prisma client generation failed"
    fi
    
    # Push schema to database
    if npx prisma db push >/dev/null 2>&1; then
        success "Database schema pushed"
    else
        warning "Database schema push failed (database may not be running)"
    fi
else
    warning "DATABASE_URL not set, skipping database setup"
fi

# Step 6: TypeScript Configuration
log "Step 6: TypeScript Configuration"
if npm run type-check >/dev/null 2>&1; then
    success "TypeScript configuration is valid"
else
    warning "TypeScript configuration issues detected"
    log "Common fixes:"
    log "- Check tsconfig.json paths configuration"
    log "- Ensure all required types are installed"
    log "- Verify import statements"
fi

# Step 7: Test Setup
log "Step 7: Test Environment Setup"

# Create test setup if missing
if [ ! -f "test/setup.tsx" ]; then
    log "Creating test setup file..."
    mkdir -p test
    cat > test/setup.tsx << 'EOF'
import '@testing-library/jest-dom'
import { expect, afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

// Mock Next.js router
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => ({
    get: vi.fn(),
    getAll: vi.fn(),
    has: vi.fn(),
  }),
  usePathname: () => '/',
}))

// Clean up after each test
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})
EOF
    success "Test setup file created"
else
    success "Test setup file already exists"
fi

# Step 8: File Permissions
log "Step 8: File Permissions"
if [ -f "scripts/fix-file-perms.sh" ]; then
    chmod +x scripts/fix-file-perms.sh
    ./scripts/fix-file-perms.sh
    success "File permissions fixed"
fi

# Step 9: Initial Validation
log "Step 9: Initial Validation"

# Run linting
if npm run lint >/dev/null 2>&1; then
    success "Code linting passed"
else
    warning "Code linting issues detected"
fi

# Run type check
if npm run type-check >/dev/null 2>&1; then
    success "TypeScript compilation passed"
else
    warning "TypeScript compilation issues detected"
fi

# Step 10: Final Setup
log "Step 10: Final Setup"

# Create development script
if [ ! -f "dev.sh" ]; then
    cat > dev.sh << 'EOF'
#!/bin/bash
# Development script for RealMultiLLM

echo "Starting RealMultiLLM development server..."
npm run dev
EOF
    chmod +x dev.sh
    success "Development script created"
fi

# Create build script
if [ ! -f "build.sh" ]; then
    cat > build.sh << 'EOF'
#!/bin/bash
# Build script for RealMultiLLM

echo "Building RealMultiLLM..."
npm run build
EOF
    chmod +x build.sh
    success "Build script created"
fi

# Step 11: Summary
log "Step 11: Setup Summary"
echo "========================================="
echo "RealMultiLLM Setup Complete!"
echo "========================================="
echo ""
echo "Next Steps:"
echo "1. Edit .env.local with your API keys"
echo "2. Set up your database (if not done)"
echo "3. Run development server: ./dev.sh"
echo "4. Run build verification: ./scripts/build-verification.sh"
echo ""
echo "Available Commands:"
echo "- npm run dev          # Start development server"
echo "- npm run build        # Build for production"
echo "- npm run test         # Run tests"
echo "- npm run lint         # Run linting"
echo "- npm run validate     # Run all checks"
echo ""
echo "Environment Variables to Configure:"
echo "- OPENAI_API_KEY (for OpenAI models)"
echo "- ANTHROPIC_API_KEY (for Claude models)"
echo "- GOOGLE_AI_API_KEY (for Gemini models)"
echo "- DATABASE_URL (for database connection)"
echo ""
echo "For troubleshooting, see: docs/BUILD_TROUBLESHOOTING.md"
echo "========================================="

success "Setup completed successfully!"

# Exit with success
exit 0