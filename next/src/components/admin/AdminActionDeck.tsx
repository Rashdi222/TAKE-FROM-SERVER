"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

type ActionItem = {
  href: string;
  label: string;
  description: string;
};

export function AdminActionDeck({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions: ActionItem[];
}) {
  return (
    <Card variant="surface-2" className="p-5">
      <div className="flex flex-col gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--c-text-faint)]">
          {title}
        </p>
        <p className="max-w-3xl text-sm leading-6 text-[var(--c-text-muted)]">{description}</p>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        {actions.map((action) => (
          <div
            key={action.href}
            className="rounded-[var(--r-card)] border border-[var(--c-border)] bg-[color:color-mix(in_srgb,var(--c-surface-1)_88%,transparent)] p-4"
          >
            <div className="text-sm font-semibold text-[var(--c-text)]">{action.label}</div>
            <div className="mt-2 text-sm leading-6 text-[var(--c-text-muted)]">{action.description}</div>
            <div className="mt-4">
              <Link href={action.href}>
                <Button variant="secondary">Open</Button>
              </Link>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
