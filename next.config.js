/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NEXT_DEV_DIST_DIR || ".next",
  output: "standalone",
};

module.exports = nextConfig;
