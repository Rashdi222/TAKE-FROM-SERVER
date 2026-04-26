import type { ReactNode } from "react";

type ContentPageProps = {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
};

export function ContentPage({
  eyebrow,
  title,
  description,
  children,
}: ContentPageProps) {
  return (
    <div className="container mx-auto px-4 py-10">
      <section className="mb-10 rounded-[var(--r-lg)] border border-[var(--c-border)] bg-[rgba(28,25,51,0.56)] p-8 shadow-[var(--shadow-1)] backdrop-blur-[10px]">
        <p className="mb-3 text-xs uppercase tracking-[0.24em] text-[var(--c-text-faint)]">
          {eyebrow}
        </p>
        <h1 className="mb-4 text-4xl font-semibold tracking-[-0.04em] text-[var(--c-text)]">
          {title}
        </h1>
        <p className="max-w-3xl text-base leading-7 text-[var(--c-text-muted)]">
          {description}
        </p>
      </section>
      <section className="grid gap-6">{children}</section>
    </div>
  );
}

