import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isProduction = process.env.NODE_ENV === 'production';

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  isProduction
    ? "connect-src 'self'"
    : "connect-src 'self' ws: wss: http: https:",
  "manifest-src 'self'",
  ...(isProduction ? ['upgrade-insecure-requests'] : []),
].join('; ');

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

  // Optimize bundle
  webpack: (config, { dev }) => {
    if (!dev) {
      // Tree shake unused code more aggressively
      config.optimization.usedExports = true;
      config.optimization.sideEffects = false;
    }
    return config;
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: contentSecurityPolicy,
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
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
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin',
          },
          {
            key: 'Cross-Origin-Resource-Policy',
            value: 'same-origin',
          },
          ...(isProduction
            ? [
                {
                  key: 'Strict-Transport-Security',
                  value: 'max-age=63072000; includeSubDomains; preload',
                },
              ]
            : []),
        ],
      },
    ];
  },
};

export default nextConfig;
