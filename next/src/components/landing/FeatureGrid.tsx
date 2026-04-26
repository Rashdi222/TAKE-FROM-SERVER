const features = [
  {
    title: "Match Ops",
    desc: "Create, update, go live, close, settle, cancel with clear status transitions.",
  },
  {
    title: "AI Odds Workspace",
    desc: "Generate, rewrite, regenerate, orchestrate, then publish with version tracking.",
  },
  {
    title: "Wallets",
    desc: "Deposits, withdrawals, and transaction history per player.",
  },
  {
    title: "Risk Controls",
    desc: "Per-user limits and session revocation from the admin panel.",
  },
  {
    title: "Providers + Sports Data",
    desc: "Sync logs, rejections, backfills, and health checks for ingestion.",
  },
  {
    title: "API Management",
    desc: "Rate limits, pause/resume, usage windows, and event feed for debugging.",
  },
];

export function FeatureGrid() {
  return (
    <section className="sb-shell py-14 md:py-20">
      <div className="flex items-end justify-between gap-6">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-[-0.03em] text-[color:var(--c-text)] md:text-3xl">
            Built for operators
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--c-text-muted)] md:text-base">
            Minimal, sharp UI surfaces that make critical actions obvious and auditable.
          </p>
        </div>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {features.map((f) => (
          <div
            key={f.title}
            className="group rounded-[var(--r-lg)] border border-[var(--c-border)] bg-[linear-gradient(315deg,rgba(28,25,51,0.88),rgba(20,18,38,0.92))] p-5 shadow-[var(--shadow-1)] transition-transform duration-[var(--dur-3)] ease-[var(--ease-operator)] hover:-translate-y-1.5"
          >
            <div className="text-sm font-medium text-[color:var(--c-text)]">{f.title}</div>
            <div className="mt-2 text-sm leading-6 text-[color:var(--c-text-muted)]">{f.desc}</div>
            <div className="mt-4 h-px w-full bg-gradient-to-r from-transparent via-[var(--c-border-strong)] to-transparent" />
            <div className="mt-4 text-xs text-[color:var(--c-text-faint)]">Sixerbat platform module</div>
          </div>
        ))}
      </div>
    </section>
  );
}
