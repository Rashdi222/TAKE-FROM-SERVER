"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { LandingWhatsappLauncher } from "@/components/layout/LandingWhatsappLauncher";

export function PublicChromeShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isMatchDetailRoute = /^\/matches\/[^/]+\/[^/]+$/.test(pathname || "");
  const isLandingPage = pathname === "/";

  if (isMatchDetailRoute) {
    return <main className="flex-1">{children}</main>;
  }

  return (
    <>
      <Header />
      <main className="flex-1 pt-20">{children}</main>
      <Footer />
      {isLandingPage ? <LandingWhatsappLauncher /> : null}
    </>
  );
}
