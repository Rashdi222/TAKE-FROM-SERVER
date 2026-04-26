"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { publicApi } from "@/lib/api";
import { setSession } from "@/lib/auth/session";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { ApiError } from "@/lib/api/errors";

const DEV_QUICK_USERS = [
  {
    label: "Super Admin",
    email: "admin@sixerbat.com",
    password: "Admin@123456",
  },
  {
    label: "Master Admin",
    email: "master@sixerbat.com",
    password: "Master@123456",
  },
  {
    label: "Player",
    email: "player@sixerbat.com",
    password: "Player@123456",
  },
] as const;

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const isDev = process.env.NODE_ENV !== "production";

  const loginWithCredentials = async (nextEmail: string, nextPassword: string) => {
    setError("");
    setLoading(true);

    try {
      const response = await publicApi.auth.login({
        email: nextEmail,
        password: nextPassword,
      });

      setSession({
        accessToken: response.access_token,
        refreshToken: response.refresh_token,
      });

      const redirectPath = response.user.role === "super_admin"
        ? "/admin/dashboard"
        : response.user.role === "master_admin"
        ? "/master/dashboard"
        : "/profile";

      router.push(redirectPath);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Login failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await loginWithCredentials(email, password);
  };

  const handleQuickLogin = async (nextEmail: string, nextPassword: string) => {
    setEmail(nextEmail);
    setPassword(nextPassword);
    await loginWithCredentials(nextEmail, nextPassword);
  };

  return (
    <div className="relative min-h-[92vh] overflow-hidden sb-auth-bg">
      <div className="pointer-events-none absolute inset-0">
        <div className="sb-glow absolute -left-24 top-[-160px] h-[420px] w-[420px] rounded-full" style={{ background: "radial-gradient(circle, rgba(58,139,255,0.32), rgba(13,11,21,0) 65%)" }} />
        <div className="sb-glow absolute -right-24 bottom-[-200px] h-[520px] w-[520px] rounded-full" style={{ background: "radial-gradient(circle, rgba(99,32,232,0.28), rgba(13,11,21,0) 70%)" }} />
      </div>

      <div className="relative mx-auto flex min-h-[92vh] max-w-6xl items-center justify-center px-6 py-16">
        <Card
          variant="surface-2"
          className="sb-panel-auth sb-animate-rise w-full max-w-lg border-[var(--c-border-strong)] p-10 shadow-[0_18px_64px_rgba(0,0,0,0.55)] backdrop-blur-[18px]"
        >
          <div className="mb-6 text-center">
            <p className="text-xs uppercase tracking-[0.22em] text-[var(--c-text-faint)]">Access</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[var(--c-text)]">Login</h1>
            <p className="mt-2 text-sm text-[var(--c-text-muted)]">Role-aware entry for super admin, master admin, and players.</p>
          </div>

          {isDev && (
            <div className="mb-6 rounded-[var(--r-md)] border border-[rgba(58,139,255,0.2)] bg-[linear-gradient(145deg,rgba(58,139,255,0.12),rgba(99,32,232,0.08))] p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-[var(--c-info)]">Dev Quick Login</p>
                  <p className="mt-1 text-xs text-[var(--c-text-muted)]">One-click access for seeded role accounts.</p>
                </div>
                <span className="rounded-full border border-[rgba(58,139,255,0.25)] px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-[var(--c-text-faint)]">
                  Dev Only
                </span>
              </div>

              <div className="grid gap-2 sm:grid-cols-3">
                {DEV_QUICK_USERS.map((user) => (
                  <Button
                    key={user.email}
                    type="button"
                    variant="secondary"
                    className="w-full"
                    disabled={loading}
                    onClick={() => handleQuickLogin(user.email, user.password)}
                  >
                    {user.label}
                  </Button>
                ))}
              </div>
            </div>
          )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 rounded-[var(--r-sm)] bg-[var(--c-danger)] bg-opacity-20 border border-[var(--c-danger)] text-[var(--c-danger)] text-sm">
              {error}
            </div>
          )}
          
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="you@example.com"
          />
          
          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder="••••••••"
          />
          
          <Button type="submit" variant="primary" className="w-full" disabled={loading}>
            {loading ? "Logging in..." : "Login"}
          </Button>
        </form>
        
        <p className="mt-4 text-center text-sm text-[var(--c-text-muted)]">
          Don&apos;t have an account?{" "}
          <a href="/register" className="sb-link-hover text-[var(--c-accent)] transition-colors duration-200 hover:text-white">Register</a>
        </p>
        <p className="mt-3 text-center text-sm text-[var(--c-text-muted)]">
          Forgot your password?{" "}
          <a href="/forgot-password" className="sb-link-hover text-[var(--c-accent)] transition-colors duration-200 hover:text-white">Find reset support</a>
        </p>
        </Card>
      </div>
    </div>
  );
}
