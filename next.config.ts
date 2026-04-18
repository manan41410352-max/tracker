import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DEV_DIST_DIR || ".next",
  output: "standalone",
};

export default nextConfig;
