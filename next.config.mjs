import withBundleAnalyzer from '@next/bundle-analyzer';

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    unoptimized: true,
  },
  serverExternalPackages: [],
  experimental: {
    webpackBuildWorker: true,
    parallelServerBuildTraces: true,
    parallelServerCompiles: true,
  },
  // Add environment variables that can be used in Edge Runtime
  env: {
    PERPLEXITY_API_KEY: process.env.PERPLEXITY_API_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_KEY: process.env.SUPABASE_KEY,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  },
  // Add security headers config
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self' https://*.supabase.co https://api.openai.com; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://*.supabase.co https://avatar.vercel.sh;"
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY'
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block'
          }
        ]
      }
    ];
  },
  webpack: (config, { isServer, dev }) => {
    // Fix for ESM modules
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        os: false,
        crypto: false,
      };
    }

    // Enable tree shaking optimizations
    config.optimization = {
      ...config.optimization,
      sideEffects: true,
    };

    // Improve module resolution
    config.resolve.alias = {
      ...config.resolve.alias,
      // Add any specific aliases to optimize imports here
    };

    // Optimize dev experience by reducing HMR frequency
    if (dev) {
      // Reduce the frequency of HMR checks to improve development performance
      config.watchOptions = {
        ...config.watchOptions,
        aggregateTimeout: 300, // Delay rebuild after the first change
        poll: false, // Use native file system events instead of polling
        ignored: [
          '**/node_modules/**',
          '**/.git/**',
          '**/dist/**',
          '**/.next/**',
        ],
      };
    }

    return config;
  }
}

// Wrap with bundle analyzer
const analyzeBundles = withBundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

export default analyzeBundles(nextConfig);
