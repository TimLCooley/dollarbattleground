import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: "https://commanderbg.com/", lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: "https://commanderbg.com/commander/tutorial", lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: "https://commanderbg.com/legal", lastModified: now, changeFrequency: "yearly", priority: 0.2 },
  ];
}
