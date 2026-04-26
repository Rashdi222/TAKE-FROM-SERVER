"use client";

import { useMemo, useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { publicApi } from "@/lib/api";
import type { LandingWhatsappSettings } from "@/lib/api/types/settings";

function whatsappHref(phoneNumber?: string | null, message?: string | null) {
  const digits = String(phoneNumber ?? "").replace(/\D/g, "");
  if (!digits) return "#";

  const query = message ? `?text=${encodeURIComponent(message)}` : "";
  return `https://wa.me/${digits}${query}`;
}

export function LandingWhatsappLauncher() {
  const [open, setOpen] = useState(false);
  const { data } = useQuery({
    queryKey: ["public", "settings", "landing-whatsapp"],
    queryFn: () => publicApi.settings.landingWhatsapp(),
    staleTime: 300_000,
  });

  const settings = ((data as { data?: LandingWhatsappSettings } | undefined)?.data ?? null) as LandingWhatsappSettings | null;
  const enabled = Boolean(settings?.enabled && settings?.phone_number);

  const contactLink = useMemo(
    () => whatsappHref(settings?.phone_number, settings?.message),
    [settings?.phone_number, settings?.message],
  );

  if (!enabled) {
    return null;
  }

  return (
    <div className="fixed bottom-5 right-5 z-[70] flex flex-col items-end gap-3">
      {open ? (
        <div className="w-[min(92vw,22rem)] rounded-[1.25rem] border border-[rgba(255,255,255,0.12)] bg-[rgba(7,10,18,0.92)] p-4 shadow-[0_30px_80px_rgba(0,0,0,0.48)] backdrop-blur-xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-[var(--c-text)]">{settings?.label || "WhatsApp Support"}</p>
              <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-[var(--c-text-faint)]">{settings?.channel || "whatsapp"}</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full border border-[var(--c-border)] p-2 text-[var(--c-text-muted)] transition-colors hover:text-[var(--c-text)]"
              aria-label="Close WhatsApp contact popup"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 rounded-[1rem] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] p-4">
            <p className="text-sm leading-6 text-[var(--c-text-muted)]">
              {settings?.message || "Chat with our support desk on WhatsApp."}
            </p>
            <p className="mt-3 font-mono text-sm text-[var(--c-text)]">{settings?.phone_number}</p>
          </div>

          <a
            href={contactLink}
            target="_blank"
            rel="noreferrer"
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-[999px] bg-[#25D366] px-4 py-3 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5"
          >
            <MessageCircle className="h-4 w-4" />
            Open WhatsApp
          </a>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-[0_18px_40px_rgba(37,211,102,0.38)] transition-transform hover:-translate-y-1"
        aria-label="Open WhatsApp contact popup"
      >
        <MessageCircle className="h-7 w-7" />
      </button>
    </div>
  );
}
