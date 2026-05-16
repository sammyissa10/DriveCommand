import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '1mb',
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
      {
        // HTTP security headers applied to all responses.
        // No Content-Security-Policy here — managed separately to avoid
        // conflicts with Next.js inline scripts and Sentry injection.
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  org: "onesquad",
  project: "drivecommand-web",
  silent: !process.env.CI,
  widenClientFileUpload: true,
  disableLogger: true,
});
