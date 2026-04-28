"use client";

import { Suspense } from "react";
import { MatchesPageClient } from "@/components/public/MatchesPageClient";
import { UserHomeSportStrip } from "@/components/user/UserHomeSportStrip";

export default function SportsbookHomePage() {
  return (
    <Suspense fallback={null}>
      <UserHomeSportStrip />
      <MatchesPageClient filterUi="time_only" />
    </Suspense>
  );
}
