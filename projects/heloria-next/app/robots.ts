import type { MetadataRoute } from "next";
import { meta } from "@/lib/content";

/** Closed while the site is a preview; open, with the sitemap, once it is live. */
export default function robots(): MetadataRoute.Robots {
  return meta.live
    ? { rules: { userAgent: "*", allow: "/" }, sitemap: `${meta.url}/sitemap.xml` }
    : { rules: { userAgent: "*", disallow: "/" } };
}
