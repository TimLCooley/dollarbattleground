import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/api/", "/auth/", "/handoff", "/settings", "/receipts", "/report", "/e/", "/r/"] }],
    sitemap: "https://commanderbg.com/sitemap.xml",
    host: "https://commanderbg.com",
  };
}
