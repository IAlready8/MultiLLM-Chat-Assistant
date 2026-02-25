import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
};

export default nextConfig;
