import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // The game is Commander at commanderbg.com (2026-10-17). The OLD domain's
      // forwarding lives in src/proxy.ts — it hands signed-in browsers over
      // (login + saved data) instead of a plain redirect.
      { source: "/:path((?!api/).*)", has: [{ type: "host" as const, value: "www.commanderbg.com" }], destination: "https://commanderbg.com/:path", permanent: true },
      // Home became Commander (2026-10-16); old Battleground deep links keep working.
      { source: "/", has: [{ type: "query", key: "as" }], destination: "/battleground", permanent: false },
      { source: "/", has: [{ type: "query", key: "tile" }], destination: "/battleground", permanent: false },
    ];
  },
};

export default nextConfig;
