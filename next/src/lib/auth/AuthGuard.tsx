"use client";

import { useEffect, useState, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { userApi } from "@/lib/api";
import { getAccessToken } from "./session";

type Role = "player" | "master_admin" | "super_admin";

interface AuthGuardProps {
  children: ReactNode;
  allowedRoles?: Role[];
}

export function AuthGuard({ children, allowedRoles }: AuthGuardProps) {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const token = getAccessToken();
      
      if (!token) {
        router.push("/login");
        return;
      }

      try {
        const response = await userApi.auth.me() as { user: { role: string } };
        const userRole = response.user.role;

        if (allowedRoles && !allowedRoles.includes(userRole as Role)) {
          const redirectPath = userRole === "super_admin"
            ? "/admin/dashboard"
            : userRole === "master_admin"
            ? "/master/dashboard"
            : "/profile";
          router.push(redirectPath);
          return;
        }
      } catch {
        router.push("/login");
        return;
      } finally {
        setChecking(false);
      }
    };

    checkAuth();
  }, [router, allowedRoles]);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--c-bg)]">
        <div className="text-[var(--c-text-muted)]">Checking auth...</div>
      </div>
    );
  }

  return <>{children}</>;
}
