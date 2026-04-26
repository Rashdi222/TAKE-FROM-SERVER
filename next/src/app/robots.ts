import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/seo/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/matches",
          "/matches/",
          "/sports",
          "/sports/",
          "/tournaments",
          "/tournaments/",
          "/how-it-works",
          "/responsible-gaming",
          "/faq",
          "/terms",
          "/privacy",
          "/contact",
        ],
        disallow: [
          "/admin",
          "/master",
          "/profile",
          "/wallet",
          "/bets",
          "/account",
          "/login",
          "/register",
          "/reset-password",
        ],
      },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
