/** @type {import('next').NextConfig} */
const nextConfig = {
  // The waitlist form POSTs to /api/leads; proxy it to the NestJS API so it's same-origin
  // (no CORS) in dev. NOT for production: through this proxy the API sees the marketing server as
  // the client, so every visitor would share one rate limit. Route /api/* to the API at the load
  // balancer there instead, so the visitor's own address arrives.
  async rewrites() {
    const api = process.env.API_ORIGIN ?? "http://localhost:4000";
    return [{ source: "/api/:path*", destination: `${api}/:path*` }];
  },
  // ESLint isn't set up in this workspace; type safety is covered by `tsc --noEmit`.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
