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
    <div className="container mx-auto px-4 py-8 sm:py-10">
      <section className="mb-8 rounded-[var(--r-lg)] border border-[var(--c-border)] bg-[rgba(28,25,51,0.56)] p-5 shadow-[var(--shadow-1)] backdrop-blur-[10px] sm:p-6">
        <p className="mb-3 text-xs uppercase tracking-[0.24em] text-[var(--c-text-faint)]">
          {eyebrow}
        </p>
        <h1 className="mb-3 text-3xl font-semibold tracking-[-0.04em] text-[var(--c-text)] sm:text-4xl">
          {title}
        </h1>
        <p className="max-w-3xl text-sm leading-6 text-[var(--c-text-muted)] sm:text-base sm:leading-7">
          {description}
        </p>
      </section>
      <section className="grid gap-4">{children}</section>
    </div>
  );
}
