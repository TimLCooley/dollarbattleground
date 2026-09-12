import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Don't fail production builds on lint warnings (e.g. unused vars) while we iterate.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
