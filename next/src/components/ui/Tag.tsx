import { HTMLAttributes } from "react";

type TagStatus = "scheduled" | "live" | "finished" | "settled" | "cancelled";

interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  status: string;
}

export function Tag({ status, className = "", ...props }: TagProps) {
  const baseStyles = "inline-flex items-center gap-1.5 px-3 py-1 rounded-[var(--r-pill)] text-xs font-medium";
  const normalizedStatus: TagStatus =
    status === "live" || status === "scheduled" || status === "finished" || status === "settled" || status === "cancelled"
      ? status
      : status === "won" || status === "lost"
        ? "finished"
        : "scheduled";

  const statusStyles = {
    scheduled: "bg-[var(--c-surface-2)] text-[var(--c-text-muted)] border border-[var(--c-border)]",
    live: "bg-[var(--c-info)] bg-opacity-20 text-[var(--c-info)] border border-[var(--c-info)]",
    finished: "bg-[var(--c-surface-2)] text-[var(--c-text-faint)]",
    settled: "bg-[var(--c-success)] bg-opacity-20 text-[var(--c-success)] border border-[var(--c-success)]",
    cancelled: "bg-[var(--c-danger)] bg-opacity-20 text-[var(--c-danger)] border border-[var(--c-danger)]",
  };

  return (
    <span className={`${baseStyles} ${statusStyles[normalizedStatus]} ${className}`} {...props}>
      {normalizedStatus === "live" && <span className="w-1.5 h-1.5 rounded-full bg-[var(--c-info)] animate-pulse" />}
      {status}
    </span>
  );
}
