import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    agentUpgrade: 'security',
  },
  cacheComponents: true,
  partialPrefetching: true,
  headers() {
    const adminHeaders = [
      { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
      { key: 'Pragma', value: 'no-cache' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
      {
        key: 'Content-Security-Policy',
        // Avoid blocking Next.js hydration while protecting the private interface.
        value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
      },
    ];
    return [
      { source: '/admin/:path*', headers: adminHeaders },
      { source: '/api/admin/:path*', headers: adminHeaders },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
