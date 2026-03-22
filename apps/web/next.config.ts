import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  async headers() {
    return [
      {
        // Disable proxy buffering for all routes so React Suspense streaming
        // HTML chunks reach the browser immediately instead of being buffered
        // by Railway's Nginx reverse proxy until the response is complete.
        source: '/(.*)',
        headers: [
          { key: 'X-Accel-Buffering', value: 'no' },
        ],
      },
    ];
  },
};

export default nextConfig;
