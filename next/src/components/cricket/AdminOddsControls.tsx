"use client";

import { useState } from "react";
import { PauseCircle, PencilLine, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { useToggleOddsActive, useUpdateOdds } from "@/hooks/useOdds";
import type { Odds } from "@/lib/api";

export function AdminOddsControls({
  matchId,
  odd,
}: {
  matchId: string;
  odd: Odds;
}) {
  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState(String(odd.odds_value ?? ""));
  const [adminNote, setAdminNote] = useState("");
  const toggle = useToggleOddsActive(String(odd.id), matchId, Boolean(odd.is_active));
  const updateOdds = useUpdateOdds(String(odd.id), matchId);
  const { showToast } = useToast();

  const handleOpen = () => {
    setPrice(String(odd.odds_value ?? ""));
    setAdminNote(String(odd.admin_note ?? ""));
    setOpen(true);
  };

  const handleToggle = async () => {
    try {
      await toggle.mutateAsync();
      showToast({
        title: odd.is_active ? "Odds row suspended" : "Odds row resumed",
        description: String(odd.outcome || odd.selection_key || "Selection"),
      });
    } catch (error) {
      showToast({
        title: "Odds action failed",
        description: error instanceof Error ? error.message : "Unable to update row state.",
        variant: "error",
      });
    }
  };

  const handleModify = async () => {
    const parsedPrice = parseFloat(price);
    if (isNaN(parsedPrice) || parsedPrice < 1.01 || parsedPrice > 50) {
      showToast({
        title: "Invalid odds value",
        description: "Odds must be between 1.01 and 50.00.",
        variant: "error",
      });
      return;
    }

    try {
      await updateOdds.mutateAsync({
        odds_value: price,
        admin_note: adminNote || "Adjusted from live command center",
        provider_snapshot: {
          ...(odd.provider_snapshot || {}),
          selection_key: odd.selection_key,
          market_family: odd.market_family,
          manual_override: true,
          override_source: "live_command_center",
        },
      });
      showToast({
        title: "Odds row updated",
        description: `Saved ${String(odd.outcome || odd.selection_key || "selection")} at ${price}`,
      });
      setOpen(false);
    } catch (error) {
      showToast({
        title: "Modify failed",
        description: error instanceof Error ? error.message : "Unable to modify this odds row.",
        variant: "error",
      });
    }
  };

  return (
    <>
      <div className="flex items-center gap-1.5 justify-end">
        <Button
          variant={odd.is_active ? "destructive" : "secondary"}
          disabled={toggle.isPending}
          onClick={() => void handleToggle()}
          title={odd.is_active ? "Suspend odds row" : "Resume odds row"}
          aria-label={odd.is_active ? "Suspend odds row" : "Resume odds row"}
          className="h-7 min-h-0 w-7 rounded-[0.7rem] px-0"
        >
          {toggle.isPending ? (
            <span className="text-[10px] leading-none">...</span>
          ) : odd.is_active ? (
            <PauseCircle className="h-3.5 w-3.5" />
          ) : (
            <PlayCircle className="h-3.5 w-3.5" />
          )}
        </Button>
        <Button
          variant="secondary"
          disabled={updateOdds.isPending}
          onClick={handleOpen}
          title="Modify odds row"
          aria-label="Modify odds row"
          className="h-7 min-h-0 w-7 rounded-[0.7rem] px-0"
        >
          <PencilLine className="h-3.5 w-3.5" />
        </Button>
      </div>

      <Modal isOpen={open} onClose={() => setOpen(false)} title="Modify Odds Row" className="max-w-lg">
        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium text-[var(--c-text)]">
              {String(odd.outcome || odd.selection_key || "Selection")}
            </p>
            <p className="mt-1 text-xs text-[var(--c-text-faint)]">
              {String(odd.source_market_key || odd.bet_type || "market")}
            </p>
          </div>

          <label className="block space-y-2">
            <span className="text-sm text-[var(--c-text-muted)]">New odds value</span>
            <Input value={price} onChange={(event) => setPrice(event.target.value)} />
          </label>

          <label className="block space-y-2">
            <span className="text-sm text-[var(--c-text-muted)]">Admin note</span>
            <Input value={adminNote} onChange={(event) => setAdminNote(event.target.value)} />
          </label>

          <div className="rounded-[var(--r-md)] border border-[var(--c-border)] bg-[rgba(255,255,255,0.03)] px-3 py-2 text-xs text-[var(--c-text-muted)]">
            Saving this form marks the row as an admin override so operators can distinguish manual pricing from AI-controlled pricing.
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={updateOdds.isPending || !price.trim()} onClick={() => void handleModify()}>
              {updateOdds.isPending ? "Saving..." : "Save Override"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
