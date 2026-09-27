import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Photos are capped at 5 MB; leave room for multipart overhead and the other fields.
      bodySizeLimit: "6mb",
    },
  },
};

export default nextConfig;
