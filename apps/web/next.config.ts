import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig: NextConfig = {
  // Document import renders PDF pages to images server-side (see
  // `lib/document-import/pdf-render.ts`). `pdfjs-dist` is ESM-only and
  // `@napi-rs/canvas` — which pdfjs ships as its own optional dependency for
  // Node rendering — resolves a platform-specific `.node` binary at runtime.
  // Left to itself the bundler tries to trace and inline both and fails on the
  // native binary, which is the "pdfjs-dist has Next.js compatibility issues"
  // that earlier code worked around with a try/catch. Externalising them is the
  // supported fix: they are required from node_modules at runtime instead.
  serverExternalPackages: ['pdfjs-dist', '@napi-rs/canvas'],
  experimental: {
    serverActions: {
      bodySizeLimit: '1mb',
    },
  },
  async redirects() {
    return [
      {
        source: '/carrier/dispatches',
        destination: '/carrier/trips',
        permanent: true,
      },
      {
        source: '/carrier/dispatches/:path*',
        destination: '/carrier/trips/:path*',
        permanent: true,
      },
    ];
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
