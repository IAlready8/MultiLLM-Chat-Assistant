/** @type {import('next').NextConfig} */
const nextConfig = {
  // Compiler optimizations
  compiler: {
    removeConsole: process.env.NODE_ENV === "production",
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

  // Optimize package imports for better tree shaking
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts', 'date-fns'],
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
