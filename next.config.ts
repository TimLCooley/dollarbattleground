import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // Home became Commander (2026-10-16); old Battleground deep links keep working.
      { source: "/", has: [{ type: "query", key: "as" }], destination: "/battleground", permanent: false },
      { source: "/", has: [{ type: "query", key: "tile" }], destination: "/battleground", permanent: false },
    ];
  },
};

export default nextConfig;
