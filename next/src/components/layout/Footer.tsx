import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-auto border-t border-[var(--c-border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.015),rgba(255,255,255,0.005))] bg-[var(--c-surface-1)]">
      <div className="sb-shell flex flex-col gap-6 py-6 text-center md:flex-row md:items-start md:justify-between md:text-left">
        <div>
          <p className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--c-text)]">
            Sixerbat
          </p>
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">
            Betting operations, risk control, provider observability
          </p>
        </div>
        <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm text-[var(--c-text-muted)] md:justify-start">
          <Link href="/sports" className="hover:text-[var(--c-text)]">
            Sports
          </Link>
          <Link href="/tournaments" className="hover:text-[var(--c-text)]">
            Tournaments
          </Link>
          <Link href="/how-it-works" className="hover:text-[var(--c-text)]">
            How It Works
          </Link>
          <Link href="/responsible-gaming" className="hover:text-[var(--c-text)]">
            Responsible Gaming
          </Link>
          <Link href="/faq" className="hover:text-[var(--c-text)]">
            FAQ
          </Link>
          <Link href="/terms" className="hover:text-[var(--c-text)]">
            Terms
          </Link>
          <Link href="/privacy" className="hover:text-[var(--c-text)]">
            Privacy
          </Link>
          <Link href="/contact" className="hover:text-[var(--c-text)]">
            Contact
          </Link>
        </nav>
        <div className="text-sm text-[var(--c-text-muted)]">
          © {new Date().getFullYear()} Sixerbat. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
