/** @type {import('next').NextConfig} */
const nextConfig = {
  // The waitlist form POSTs to /api/leads; proxy it to the NestJS API so it's same-origin
  // (no CORS) in dev. Point API_ORIGIN at the deployed API in production.
  async rewrites() {
    const api = process.env.API_ORIGIN ?? "http://localhost:4000";
    return [{ source: "/api/:path*", destination: `${api}/:path*` }];
  },
  // ESLint isn't set up in this workspace; type safety is covered by `tsc --noEmit`.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
