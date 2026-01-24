#!/bin/bash

# RealMultiLLM Build Script
# Comprehensive build process with error handling and optimization

set -e  # Exit on any error

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

# Build configuration
BUILD_START_TIME=$(date +%s)
NODE_OPTIONS="--max_old_space_size=4096"
export NODE_OPTIONS

# Header
log "========================================="
log "RealMultiLLM Production Build"
log "========================================="

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    error "package.json not found. Please run this script from the project root."
    exit 1
fi

# Parse command line arguments
SKIP_TESTS=false
SKIP_LINT=false
SKIP_TYPE_CHECK=false
CLEAN_BUILD=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-tests)
            SKIP_TESTS=true
            shift
            ;;
        --skip-lint)
            SKIP_LINT=true
            shift
            ;;
        --skip-type-check)
            SKIP_TYPE_CHECK=true
            shift
            ;;
        --clean)
            CLEAN_BUILD=true
            shift
            ;;
        --help)
            echo "Usage: $0 [options]"
            echo "Options:"
            echo "  --skip-tests      Skip running tests"
            echo "  --skip-lint       Skip linting"
            echo "  --skip-type-check Skip TypeScript type checking"
            echo "  --clean           Clean build (remove .next and node_modules/.cache)"
            echo "  --help            Show this help message"
            exit 0
            ;;
        *)
            error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Step 1: Environment Validation
log "Step 1: Environment Validation"

# Check Node.js version
NODE_VERSION=$(node --version)
log "Node.js version: $NODE_VERSION"
if [[ "$NODE_VERSION" =~ ^v20\. ]]; then
    success "Node.js version is compatible"
else
    warning "Recommended: Node.js v20.x for optimal compatibility"
fi

# Check environment variables
REQUIRED_VARS=("NEXTAUTH_SECRET" "ENCRYPTION_MASTER_KEY")
MISSING_VARS=()

for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var}" ]; then
        MISSING_VARS+=("$var")
    fi
done

if [ ${#MISSING_VARS[@]} -eq 0 ]; then
    success "All required environment variables are set"
else
    warning "Missing environment variables: ${MISSING_VARS[*]}"
    warning "Build may fail without these variables"
fi

# Step 2: Clean Build (if requested)
log "Step 2: Build Preparation"
if [ "$CLEAN_BUILD" = true ]; then
    log "Performing clean build..."
    rm -rf .next
    rm -rf node_modules/.cache
    rm -rf coverage
    success "Clean build preparation complete"
fi

# Step 3: Dependency Check
log "Step 3: Dependency Check"
if [ ! -d "node_modules" ]; then
    log "Installing dependencies..."
    npm ci --prefer-offline --no-audit
    success "Dependencies installed"
else
    log "Dependencies already installed"
fi

# Step 4: TypeScript Compilation
log "Step 4: TypeScript Compilation"
if [ "$SKIP_TYPE_CHECK" = false ]; then
    if npm run type-check; then
        success "TypeScript compilation successful"
    else
        error "TypeScript compilation failed"
        exit 1
    fi
else
    warning "Skipping TypeScript type check"
fi

# Step 5: Code Linting
log "Step 5: Code Linting"
if [ "$SKIP_LINT" = false ]; then
    if npm run lint; then
        success "Code linting passed"
    else
        error "Code linting failed"
        exit 1
    fi
else
    warning "Skipping code linting"
fi

# Step 6: Security Audit
log "Step 6: Security Audit"
if npm audit --audit-level moderate; then
    success "No moderate or high severity vulnerabilities found"
else
    warning "Security vulnerabilities detected (check npm audit)"
fi

# Step 7: Test Execution
log "Step 7: Test Execution"
if [ "$SKIP_TESTS" = false ]; then
    if npm run test:run; then
        success "All tests passed"
    else
        error "Tests failed"
        exit 1
    fi
else
    warning "Skipping tests"
fi

# Step 8: Database Schema Validation
log "Step 8: Database Schema Validation"
if command -v npx &> /dev/null; then
    if npx prisma validate >/dev/null 2>&1; then
        success "Prisma schema is valid"
    else
        warning "Prisma schema validation failed"
    fi
else
    warning "Prisma not available, skipping schema validation"
fi

# Step 9: Production Build
log "Step 9: Production Build"
BUILD_START=$(date +%s)

if npm run build; then
    BUILD_END=$(date +%s)
    BUILD_DURATION=$((BUILD_END - BUILD_START))
    success "Build completed in ${BUILD_DURATION} seconds"
else
    error "Build failed"
    exit 1
fi

# Step 10: Build Output Validation
log "Step 10: Build Output Validation"
if [ -d ".next" ]; then
    BUILD_SIZE=$(du -sh .next | cut -f1)
    success "Build output exists (.next directory: $BUILD_SIZE)"
    
    # Check for critical files
    if [ -f ".next/BUILD_ID" ]; then
        success "BUILD_ID file exists"
    else
        warning "BUILD_ID file missing"
    fi
    
    if [ -d ".next/static" ]; then
        STATIC_SIZE=$(du -sh .next/static | cut -f1)
        success "Static assets directory exists ($STATIC_SIZE)"
    else
        warning "Static assets directory missing"
    fi
    
    if [ -d ".next/server" ]; then
        success "Server build directory exists"
    else
        warning "Server build directory missing"
    fi
else
    error "Build output not found"
    exit 1
fi

# Step 11: Bundle Analysis
log "Step 11: Bundle Size Analysis"
if [ -d ".next/static" ]; then
    JS_BUNDLE_SIZE=$(find .next/static -name "*.js" -exec wc -c {} + 2>/dev/null | tail -1 | awk '{print $1}' || echo "0")
    CSS_BUNDLE_SIZE=$(find .next/static -name "*.css" -exec wc -c {} + 2>/dev/null | tail -1 | awk '{print $1}' || echo "0")
    
    JS_SIZE_MB=$((JS_BUNDLE_SIZE / 1024 / 1024))
    CSS_SIZE_MB=$((CSS_BUNDLE_SIZE / 1024 / 1024))
    
    log "JavaScript bundle size: ${JS_SIZE_MB}MB"
    log "CSS bundle size: ${CSS_SIZE_MB}MB"
    
    if [ $JS_SIZE_MB -gt 5 ]; then
        warning "JavaScript bundle size is large (>5MB)"
    else
        success "Bundle size is reasonable"
    fi
    
    TOTAL_SIZE_MB=$((JS_SIZE_MB + CSS_SIZE_MB))
    log "Total bundle size: ${TOTAL_SIZE_MB}MB"
else
    warning "Cannot analyze bundle size - static directory not found"
fi

# Step 12: Performance Metrics
log "Step 12: Performance Metrics"
BUILD_END_TIME=$(date +%s)
TOTAL_BUILD_TIME=$((BUILD_END_TIME - BUILD_START_TIME))

log "Total build time: ${TOTAL_BUILD_TIME} seconds"

if [ $TOTAL_BUILD_TIME -gt 300 ]; then
    warning "Build time is longer than expected (>5 minutes)"
elif [ $TOTAL_BUILD_TIME -gt 180 ]; then
    warning "Build time is moderately long (>3 minutes)"
else
    success "Build time is acceptable"
fi

# Step 13: Health Check Preparation
log "Step 13: Health Check Preparation"
if [ -f "scripts/verify-startup.sh" ]; then
    chmod +x scripts/verify-startup.sh
    success "Health check script prepared"
else
    warning "Health check script not found"
fi

# Step 14: Final Summary
log "Step 14: Build Summary"
echo "========================================="
echo "RealMultiLLM Build Results"
echo "========================================="
echo "✅ Environment: Validated"
echo "✅ Dependencies: Installed"
echo "✅ TypeScript: $([ "$SKIP_TYPE_CHECK" = false ] && echo "Compiled" || echo "Skipped")"
echo "✅ Linting: $([ "$SKIP_LINT" = false ] && echo "Passed" || echo "Skipped")"
echo "✅ Tests: $([ "$SKIP_TESTS" = false ] && echo "Executed" || echo "Skipped")"
echo "✅ Build: Successful (${TOTAL_BUILD_TIME}s)"
echo "✅ Output: Validated (${BUILD_SIZE})"
echo "========================================="

if [ ${#MISSING_VARS[@]} -gt 0 ]; then
    echo "⚠️  Missing Environment Variables: ${MISSING_VARS[*]}"
fi

echo ""
echo "Next Steps:"
echo "1. Deploy to your hosting platform"
echo "2. Configure production environment variables"
echo "3. Set up database if not already done"
echo "4. Monitor application performance"
echo "5. Run health checks after deployment"

echo ""
echo "Deployment Commands:"
echo "- Vercel: vercel --prod"
echo "- Docker: docker build -t realmultillm ."
echo "- PM2: pm2 start ecosystem.config.js"

success "Build completed successfully!"

# Exit with success
exit 0