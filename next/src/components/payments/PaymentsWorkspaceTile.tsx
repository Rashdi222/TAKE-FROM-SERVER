"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/Card";

export function PaymentsWorkspaceTile({
  href,
  eyebrow,
  title,
  description,
  metric,
  tone = "default",
}: {
  href: string;
  eyebrow: string;
  title: string;
  description: string;
  metric: string;
  tone?: "default" | "warning" | "success";
}) {
  const metricTone =
    tone === "warning"
      ? "text-[var(--c-warning)]"
      : tone === "success"
        ? "text-[var(--c-success)]"
        : "text-[var(--c-text)]";

  return (
    <Link href={href} className="block">
      <Card variant="surface-2" className="group h-full p-6 transition hover:-translate-y-1 hover:border-[var(--c-accent)]/40">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--c-accent)]">{eyebrow}</p>
        <div className="mt-4 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-semibold text-[var(--c-text)]">{title}</h3>
            <p className="mt-2 text-sm leading-6 text-[var(--c-text-muted)]">{description}</p>
          </div>
          <ArrowRight className="mt-1 h-5 w-5 text-[var(--c-text-faint)] transition group-hover:text-[var(--c-accent)]" />
        </div>
        <div className="mt-6 border-t border-[var(--c-border)] pt-4">
          <p className="text-xs uppercase tracking-[0.16em] text-[var(--c-text-faint)]">At a glance</p>
          <p className={`mt-2 font-mono text-2xl ${metricTone}`}>{metric}</p>
        </div>
      </Card>
    </Link>
  );
}
