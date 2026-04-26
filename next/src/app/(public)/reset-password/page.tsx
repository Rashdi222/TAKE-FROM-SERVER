"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { publicApi, isApiError } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";

export default function ResetPasswordPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const validation = useQuery({
    queryKey: ["public", "reset-password", "validate", token],
    queryFn: () => publicApi.auth.validateResetPassword(token),
    enabled: !!token,
    retry: false,
  });

  const expiresAt = useMemo(() => {
    const value = (validation.data as { data?: { expires_at?: string } } | undefined)?.data?.expires_at;
    return value ? new Date(value).toLocaleString() : null;
  }, [validation.data]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== passwordConfirmation) {
      setError("Password confirmation does not match.");
      return;
    }

    setSubmitting(true);

    try {
      await publicApi.auth.resetPassword({
        token,
        password,
        password_confirmation: passwordConfirmation,
      });
      setDone(true);
    } catch (value) {
      if (isApiError(value)) {
        setError(value.message);
      } else {
        setError("Unable to reset password.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="sb-auth-bg min-h-screen px-4 py-16">
      <div className="mx-auto max-w-xl">
        <Card variant="surface-2" className="sb-panel-auth sb-animate-rise p-8">
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--c-accent)]">Player Access</p>
          <h1 className="mt-3 text-3xl font-semibold text-[var(--c-text)]">Reset Password</h1>
          <p className="mt-3 text-sm leading-6 text-[var(--c-text-muted)]">
            Set a new password using the one-time reset link shared with you.
          </p>

          {!token ? <Alert variant="error" className="mt-6">Missing reset token.</Alert> : null}
          {validation.isError ? <Alert variant="error" className="mt-6">This reset link is invalid or expired.</Alert> : null}
          {expiresAt ? <Alert variant="info" className="mt-6">Link expires at {expiresAt}</Alert> : null}
          {done ? <Alert variant="success" className="mt-6">Password updated successfully. You can log in now.</Alert> : null}
          {error ? <Alert variant="error" className="mt-6">{error}</Alert> : null}

          {!done && token && !validation.isError ? (
            <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
              <Input
                label="New password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Minimum 8 characters"
              />
              <Input
                label="Confirm password"
                type="password"
                value={passwordConfirmation}
                onChange={(event) => setPasswordConfirmation(event.target.value)}
                placeholder="Repeat password"
              />
              <Button type="submit" variant="primary" disabled={submitting || validation.isLoading}>
                {submitting ? "Updating..." : "Update password"}
              </Button>
            </form>
          ) : null}

          <div className="mt-6">
            <Link href="/login" className="text-sm text-[var(--c-accent)] hover:text-[var(--c-text)]">
              Back to login
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
