import type { Metadata } from "next";
import {
  absoluteUrl,
  getDefaultOgImageUrl,
  getDefaultTwitterImageUrl,
  SITE_NAME,
} from "@/lib/seo/site";

type PageMetadataInput = {
  title: string;
  description: string;
  path: string;
  keywords?: string[];
  ogType?: "website" | "article";
};

export function buildPublicMetadata({
  title,
  description,
  path,
  keywords = [],
  ogType = "website",
}: PageMetadataInput): Metadata {
  const url = absoluteUrl(path);

  return {
    title,
    description,
    keywords,
    alternates: {
      canonical: url,
    },
    openGraph: {
      type: ogType,
      url,
      siteName: SITE_NAME,
      title,
      description,
      images: [getDefaultOgImageUrl()],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [getDefaultTwitterImageUrl()],
    },
  };
}

export function buildNoIndexMetadata(): Metadata {
  return {
    robots: {
      index: false,
      follow: false,
      nocache: true,
    },
  };
}
