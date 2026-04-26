"use client";

import { ReactNode, useState } from "react";
import { AuthGuard } from "@/lib/auth/AuthGuard";
import { UserMobileNav } from "@/components/user/UserMobileNav";
import { UserSportRail } from "@/components/user/UserSportRail";
import { UserSettingsPane } from "@/components/user/UserSettingsPane";

export default function UserLayout({ children }: { children: ReactNode }) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <AuthGuard allowedRoles={["player"]}>
      <div className="mx-auto min-h-screen w-full max-w-[96rem] px-3 py-4 md:h-screen md:max-h-screen md:overflow-hidden">
        <div className="flex gap-3 md:h-full">
          <UserSportRail
            settingsOpen={settingsOpen}
            onToggleSettings={() => setSettingsOpen((value) => !value)}
          />
          <UserSettingsPane open={settingsOpen} />
          <main className="min-w-0 flex-1 pb-28 md:h-full md:overflow-y-auto md:pb-0">{children}</main>
        </div>
        <UserMobileNav />
      </div>
    </AuthGuard>
  );
}
