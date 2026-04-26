"use client";

export function PaymentStatusBadge({ status }: { status: string | null | undefined }) {
  const value = String(status ?? "unknown").toLowerCase();
  const normalized = value === "completed" ? "approved" : value === "failed" ? "rejected" : value;

  const className =
    normalized === "approved"
      ? "border-[rgba(100,181,19,0.28)] bg-[rgba(100,181,19,0.14)] text-[var(--c-success)]"
      : normalized === "pending"
        ? "animate-pulse border-[rgba(255,176,32,0.32)] bg-[rgba(255,176,32,0.14)] text-[var(--c-warning)]"
        : normalized === "rejected"
          ? "border-[rgba(255,60,60,0.25)] bg-[rgba(255,60,60,0.12)] text-[var(--c-danger)]"
          : "border-[var(--c-border)] bg-[var(--c-surface-1)] text-[var(--c-text-muted)]";

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${className}`}>
      {normalized}
    </span>
  );
}
