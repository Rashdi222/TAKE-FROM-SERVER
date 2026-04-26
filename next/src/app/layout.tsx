import type { Metadata } from "next";
import { Inter, Space_Mono } from "next/font/google";
import "./globals.css";
import { QueryProvider } from "../lib/query/QueryProvider";
import { absoluteUrl, SITE_NAME } from "@/lib/seo/site";
import { ToastProvider } from "@/components/ui/Toast";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const spaceMono = Space_Mono({
  variable: "--font-space-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
  preload: false,
});

export const metadata: Metadata = {
  metadataBase: new URL(absoluteUrl("/")),
  title: {
    default: SITE_NAME,
    template: `%s | ${SITE_NAME}`,
  },
  description:
    "Sixerbat is an operator-grade sports betting platform with AI-assisted odds workflow, live match coverage, and multi-role operational control.",
  applicationName: SITE_NAME,
  keywords: [
    "sports betting platform",
    "live matches",
    "betting odds",
    "cricket betting",
    "football betting",
    "tennis betting",
    "horse racing betting",
    "dog racing betting",
  ],
  alternates: {
    canonical: absoluteUrl("/"),
  },
  openGraph: {
    type: "website",
    url: absoluteUrl("/"),
    siteName: SITE_NAME,
    title: SITE_NAME,
    description:
      "Operator-grade sports betting platform with AI-assisted odds workflow and live sports coverage.",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description:
      "Operator-grade sports betting platform with AI-assisted odds workflow and live sports coverage.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${spaceMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <QueryProvider>
          <ToastProvider>{children}</ToastProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
