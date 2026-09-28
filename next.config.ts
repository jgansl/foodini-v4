import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Playwright uses its own build folder so its dev server can run beside `pnpm dev` (Next locks per folder).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
  experimental: {
    serverActions: {
      // Photos are capped at 5 MB; leave room for multipart overhead and the other fields.
      bodySizeLimit: "6mb",
    },
  },
};

export default nextConfig;
