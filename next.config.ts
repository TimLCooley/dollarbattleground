import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // The game is Commander at commanderbg.com (2026-10-17). Old-domain pages
      // forward permanently to the same path; /api stays put on both domains so
      // Stripe webhooks and the pg_cron autopilot (which can't follow a redirect) keep working.
      ...["dollarbattleground.com", "www.dollarbattleground.com"].map((host) => ({
        source: "/:path((?!api/).*)",
        has: [{ type: "host" as const, value: host }],
        destination: "https://commanderbg.com/:path",
        permanent: true,
      })),
      { source: "/:path((?!api/).*)", has: [{ type: "host" as const, value: "www.commanderbg.com" }], destination: "https://commanderbg.com/:path", permanent: true },
      // Home became Commander (2026-10-16); old Battleground deep links keep working.
      { source: "/", has: [{ type: "query", key: "as" }], destination: "/battleground", permanent: false },
      { source: "/", has: [{ type: "query", key: "tile" }], destination: "/battleground", permanent: false },
    ];
  },
};

export default nextConfig;
