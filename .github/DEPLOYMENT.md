# Vercel Deployment Guide

## Prerequisites

### Environment Variables (Required)
Set these in Vercel Dashboard → Settings → Environment Variables:

```bash
# Database
DATABASE_URL=postgresql://user:password@host:5432/database

# Authentication
NEXTAUTH_SECRET=<generate with: openssl rand -base64 32>
NEXTAUTH_URL=https://your-domain.vercel.app

# Security
API_KEY_ENCRYPTION_SEED=<generate with: openssl rand -base64 32>

# OAuth (Optional)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

# Redis (Optional - for scaling)
REDIS_URL=redis://...
```

## Deployment Steps

### 1. Initial Setup
```bash
# Install Vercel CLI
npm i -g vercel

# Login to Vercel
vercel login

# Link project
vercel link
```

### 2. Set Environment Variables
```bash
# Production environment variables
vercel env add DATABASE_URL production
vercel env add NEXTAUTH_SECRET production
vercel env add NEXTAUTH_URL production
vercel env add API_KEY_ENCRYPTION_SEED production
```

### 3. Deploy
```bash
# Preview deployment
vercel

# Production deployment
vercel --prod
```

## Database Migration

### Before First Deployment
```bash
# Run migrations on production database
npx prisma migrate deploy
```

## Post-Deployment Checklist

- [ ] Environment variables set correctly
- [ ] Database migrations applied
- [ ] OAuth providers configured (if using)
- [ ] API endpoints responding
- [ ] Authentication working
- [ ] API key encryption functional

## Troubleshooting

### Build Fails
- Check Vercel build logs
- Verify all environment variables are set
- Ensure DATABASE_URL is accessible from Vercel

### Runtime Errors
- Check Vercel Function logs
- Verify API_KEY_ENCRYPTION_SEED is set
- Test database connectivity

## Performance Optimization

This project includes:
- ✅ Static page generation (30 routes)
- ✅ Image optimization (WebP, AVIF)
- ✅ Tree shaking enabled
- ✅ Loading states for all pages
- ✅ API caching headers configured
