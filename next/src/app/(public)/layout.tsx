import type { ReactNode } from "react";
import { PublicChromeShell } from "@/components/layout/PublicChromeShell";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return <PublicChromeShell>{children}</PublicChromeShell>;
}
