"use client";

import type { ReactNode } from "react";

type ShellTab = {
  id: string;
  label: string;
  count?: number;
};

type ShellMetric = {
  label: string;
  value: ReactNode;
  detail: string;
};

export function SportControlShell({
  eyebrow,
  title,
  description,
  actions,
  metrics,
  tabs,
  activeTab,
  onTabChange,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
  metrics?: ShellMetric[];
  tabs?: ShellTab[];
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
  children: ReactNode;
}) {
  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[2rem] border border-[var(--c-border)] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--c-accent)_12%,transparent),transparent_42%),linear-gradient(180deg,var(--c-surface-2),color-mix(in_srgb,var(--c-surface-1)_90%,black_10%))] p-6 shadow-[0_28px_80px_rgba(0,0,0,0.16)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-4xl">
            <p className="text-[11px] uppercase tracking-[0.28em] text-[var(--c-accent)]">{eyebrow}</p>
            <h1 className="mt-2 text-3xl font-semibold text-[var(--c-text)]">{title}</h1>
            <p className="mt-2 text-sm leading-6 text-[var(--c-text-muted)]">{description}</p>
          </div>
          {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
        </div>

        {metrics && metrics.length > 0 ? (
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {metrics.map((metric) => (
              <div
                key={metric.label}
                className="rounded-[1.4rem] border border-[var(--c-border)] bg-[color:color-mix(in_srgb,var(--c-surface-1)_85%,transparent)] p-5"
              >
                <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--c-text-faint)]">
                  {metric.label}
                </p>
                <div className="mt-3 text-2xl font-semibold text-[var(--c-text)]">{metric.value}</div>
                <p className="mt-2 text-sm leading-6 text-[var(--c-text-muted)]">{metric.detail}</p>
              </div>
            ))}
          </div>
        ) : null}

        {tabs && tabs.length > 0 && activeTab && onTabChange ? (
          <div className="mt-6 flex flex-wrap gap-2">
            {tabs.map((tab) => {
              const active = activeTab === tab.id;

              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onTabChange(tab.id)}
                  className={`rounded-[var(--r-pill)] border px-4 py-2 text-sm transition ${
                    active
                      ? "border-[var(--c-accent)] bg-[var(--c-accent-soft)] text-[var(--c-text)]"
                      : "border-[var(--c-border)] bg-[var(--c-surface-1)] text-[var(--c-text-muted)] hover:text-[var(--c-text)]"
                  }`}
                >
                  {tab.label}
                  {typeof tab.count === "number" ? (
                    <span className="ml-2 text-[var(--c-text-faint)]">{tab.count}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : null}
      </section>

      {children}
    </div>
  );
}
