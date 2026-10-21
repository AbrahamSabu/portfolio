import type { MetadataRoute } from "next";
import { meta } from "@/lib/content";

/** One page. `/geneva` is the workbench the machine was built on, not the site. */
export default function sitemap(): MetadataRoute.Sitemap {
  return meta.live ? [{ url: meta.url, changeFrequency: "monthly", priority: 1 }] : [];
}
