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

  // Enable swcMinify for better performance
  swcMinify: true,

  // Reduce runtime overhead
  reactStrictMode: true,

  trailingSlash: false,

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
