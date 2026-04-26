"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { userApi } from "@/lib/api";
import { clearSession } from "@/lib/auth/session";
import { Button } from "../ui/Button";

export function LogoutButton({ className = "" }: { className?: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);

  const handleLogout = async () => {
    setLoading(true);
    try {
      await userApi.auth.logout();
    } catch {
      // Clear session even if API call fails
    } finally {
      clearSession();
      queryClient.clear();
      router.replace("/login");
      router.refresh();
    }
  };

  return (
    <Button variant="secondary" onClick={handleLogout} disabled={loading} className={className}>
      {loading ? "Logging out..." : "Logout"}
    </Button>
  );
}
