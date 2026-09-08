import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Application-level defense-in-depth headers. HSTS is intentionally omitted:
// transport policy is owned by the deployment platform and must be verified
// there before an application config claims includeSubDomains or preload.
// The CSP keeps inline script/style compatibility required by the current
// App Router/Tailwind output; nonce-based CSP can be evaluated separately.
const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join('; '),
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Compiler optimizations
  compiler: {
    // Keep server-side logs in production for operational debugging/alerts.
    removeConsole: false,
  },

  // Image optimization
  images: {
    formats: ['image/webp', 'image/avif'],
  },

  // Reduce runtime overhead
  reactStrictMode: true,

  trailingSlash: false,

  outputFileTracingRoot: __dirname,

  // Explicit Turbopack config keeps Next 16 migration path available
  // while webpack remains the default runtime path for this repo.
  turbopack: {},

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },

  // Optimize bundle
  webpack: (config, { dev }) => {
    if (!dev) {
      // Tree shake unused code more aggressively
      config.optimization.usedExports = true;
      config.optimization.sideEffects = false;
    }
    return config;
  },
};

export default nextConfig;
