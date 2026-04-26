export const SITE_NAME = "Sixerbat";

export function getSiteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
}

export function getApiBaseUrl() {
  const explicit = process.env.NEXT_PUBLIC_API_BASE_URL;

  if (explicit) {
    return explicit.replace(/\/$/, "");
  }

  return "http://127.0.0.1:4000";
}

export function absoluteUrl(path = "/") {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${getSiteUrl()}${normalized}`;
}

export function getDefaultOgImageUrl() {
  return absoluteUrl("/opengraph-image");
}

export function getDefaultTwitterImageUrl() {
  return absoluteUrl("/twitter-image");
}
