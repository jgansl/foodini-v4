import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Playwright uses its own build folder so its dev server can run beside `pnpm dev` (Next locks per folder).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  experimental: {
    serverActions: {
      // Photos are capped at 5 MB; leave room for multipart overhead and the other fields.
      bodySizeLimit: "6mb",
    },
  },
};

export default nextConfig;
