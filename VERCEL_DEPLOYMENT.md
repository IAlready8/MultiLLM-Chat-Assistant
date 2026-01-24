# Vercel Deployment Guide for MultiLLM Chat Assistant

This document provides comprehensive instructions for deploying the MultiLLM Chat Assistant to Vercel, including setup, configuration, and troubleshooting.

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Environment Variables](#environment-variables)
3. [Vercel CLI Deployment](#vercel-cli-deployment)
4. [GitHub Integration](#github-integration)
5. [Build Configuration](#build-configuration)
6. [Monitoring and Analytics](#monitoring-and-analytics)
7. [Troubleshooting](#troubleshooting)

## Prerequisites

- A Vercel account (sign up at [vercel.com](https://vercel.com))
- Vercel CLI installed: `npm install -g vercel`
- Node.js 18+ (recommended: 18.x or 20.x)
- Git repository for the project

## Environment Variables

The application requires the following environment variables to be configured in your Vercel project:

### Required Variables
```
# Database URL (for production)
DATABASE_URL="your_production_database_url"

# Authentication secret
NEXTAUTH_SECRET="your_nextauth_secret"
NEXTAUTH_URL="https://your-deployment-url.vercel.app"

# Client-side storage secret (keep consistent across deploys)
SECURE_STORAGE_SECRET="your_secure_storage_secret"

# LLM Provider API Keys (optional, can be configured by users in-app)
OPENAI_API_KEY="sk-your-openai-api-key"
ANTHROPIC_API_KEY="your-anthropic-api-key"
GOOGLE_AI_API_KEY="your-google-ai-api-key"
OPENROUTER_API_KEY="your-openrouter-api-key"

# Redis (optional, for caching)
REDIS_URL="your_redis_url"
```

### Setting Environment Variables
1. Go to your Vercel project dashboard
2. Navigate to Settings → Environment Variables
3. Add each variable with its appropriate value

## Vercel CLI Deployment

### 1. Install Vercel CLI
```bash
npm install -g vercel
```

### 2. Login to Vercel
```bash
vercel login
```

### 3. Deploy the Project
From the project root directory, run:
```bash
vercel
```

### 4. Configure Deployment Settings
When prompted:
- Set up the project directory (default: current directory)
- Choose your scope (team or personal account)
- Set the project name (or use the default)
- Do NOT automatically set up the domain
- Do NOT link to Git repository (if you want to push manually first)

### 5. Production Deploy
```bash
vercel --prod
```

## GitHub Integration

### Option 1: Automatic Deployment
1. Push your code to a GitHub repository
2. Go to [vercel.com](https://vercel.com) → Add New Project
3. Select your GitHub repository
4. Vercel will automatically detect this is a Next.js project
5. Update the build settings if needed:

**Build & Development Settings:**
```
Build Command: next build
Development Command: next dev
Install Command: npm install
Output Directory: Leave blank
```

### Option 2: Vercel CLI Link
```bash
# Link your local project to Vercel
vercel link

# Deploy and automatically connect to GitHub
vercel git link
```

## Build Configuration

### vercel.json (Current)
Your project already includes a `vercel.json` file configured for Next.js. This is the current configuration:

```json
{
  "version": 2,
  "builds": [
    {
      "src": "package.json",
      "use": "@vercel/next",
      "config": {
        "serverless": true
      }
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "/"
    }
  ]
}
```

### Custom Configuration (Optional)
If you need to customize your configuration, create or update `vercel.json`:

```json
{
  "version": 2,
  "builds": [
    {
      "src": "package.json",
      "use": "@vercel/next",
      "config": {
        "serverless": true
      }
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "/"
    }
  ]
}
```

## Database Configuration

### Prisma Setup
The application uses Prisma for database management. For production deployments:

1. **Using PostgreSQL:**
   ```bash
   # In your Vercel environment variables:
   DATABASE_URL="postgresql://username:password@host:port/database_name"
   ```

2. **Running Migrations:**
   Vercel does not run Prisma migrations by default. Run `npx prisma migrate deploy` in CI or before promoting a deployment.

### Alternative: PlanetScale, Supabase, or other managed databases
These are recommended for production deployments over local Postgres instances.

## Monitoring and Analytics

### Vercel Analytics
Enable Vercel Analytics for performance monitoring:
1. Go to your project settings
2. Navigate to Analytics
3. Enable Analytics

### Environment-Specific Behavior
- Development: Uses the `DATABASE_URL` you set locally
- Preview: Uses the preview environment `DATABASE_URL`
- Production: Uses the production `DATABASE_URL`

## Performance Optimization

### Image Optimization
Vercel automatically optimizes images via the Next.js Image component. No additional configuration needed.

### Caching
- Static assets are cached by default
- API routes can implement custom caching headers
- Consider using Redis for session or data caching

### Edge Functions
Future optimization opportunity: Deploy API routes to the edge for better performance.

## Troubleshooting

### Common Issues and Solutions

#### 1. Build Failures
Check the build logs in your Vercel dashboard for specific error messages. Common issues:
- Missing environment variables
- Version conflicts
- Dependencies not properly installed

#### 2. Database Connection Issues
- Ensure DATABASE_URL is correctly set
- For production, avoid local file databases; use PostgreSQL or another managed database
- Check that your database allows connections from Vercel's deployment regions

#### 3. Authentication Problems
- Verify NEXTAUTH_URL matches your deployment URL
- Ensure NEXTAUTH_SECRET is set and consistent

#### 4. LLM API Connection Issues
- API keys are stored in user's browser localStorage (encrypted)
- Users need to configure their own API keys via the Settings page
- The application handles rate limiting and connection pooling

#### 5. API Routes Not Working
The application has API routes in `app/api/`. Ensure:
- Routes are properly defined using the Next.js App Router
- CORS is properly configured for client-side requests
- Rate limiting is appropriately implemented

### Debugging Steps
1. Check Vercel deployment logs
2. Verify all environment variables are set
3. Use Vercel's preview deployments for testing
4. Test locally with `vercel dev`
5. Monitor network requests in browser dev tools

## Security Considerations

### API Key Security
- API keys are encrypted before storage in localStorage
- Never expose backend API keys to the client
- Use Vercel environment variables for backend keys only

### Authentication
- Uses NextAuth.js for authentication
- Secure cookies for session management
- HTTPS enforced by Vercel by default

### Data Protection
- End-to-end encryption for sensitive data
- Regular security audits recommended
- Follow OWASP security guidelines

## Rollback and Versioning

### Rolling Back Deployments
1. Go to your Vercel dashboard
2. Navigate to your project
3. Select "Deployments"
4. Click "Rollback" on a previous deployment

### Preview Deployments
Each git branch push creates a preview deployment with a unique URL, allowing safe testing of changes.

## Performance Monitoring

### Vercel Speed Insights
Enable Speed Insights to monitor Core Web Vitals:
```bash
# Add to package.json
npm install @vercel/analytics
```

Then use in your app:
```javascript
import { Analytics } from '@vercel/analytics/react';

// In your layout or component
<Analytics />
```

### Error Tracking
Vercel provides built-in error monitoring in the deployment logs. For more advanced tracking, consider integrating with Sentry or similar services.

## Scaling Considerations

### Traffic Scaling
- Vercel automatically scales serverless functions
- Use Vercel's deployment regions closest to your users
- Consider edge caching for static content

### Database Scaling
- Plan for database scaling with your chosen provider
- Implement connection pooling
- Use read replicas if needed

## Maintenance and Updates

### Regular Maintenance
- Update dependencies regularly
- Monitor for security vulnerabilities
- Review and update environment variables as needed
- Check billing and usage regularly

### Updating the Application
1. Make changes in your local environment
2. Test thoroughly
3. Push to your git repository
4. Vercel automatically deploys (if integrated) or use `vercel --prod`
5. Verify deployment in the Vercel dashboard

## Conclusion

Your MultiLLM Chat Assistant should now be successfully deployed to Vercel. Remember to:

- Keep environment variables secure and up to date
- Monitor deployment logs for errors
- Test the application functionality after each deployment
- Update dependencies regularly
- Plan for database scaling as usage grows

For ongoing support, check the Vercel documentation and your project's logs regularly.
