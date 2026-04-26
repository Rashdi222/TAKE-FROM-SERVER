"use client";

import { Card } from "../ui/Card";
import { Button } from "../ui/Button";

interface ReportExportCardProps {
  exportData: Record<string, unknown> | undefined;
  playerId: string;
}

export function ReportExportCard({ exportData, playerId }: ReportExportCardProps) {
  const handleExport = () => {
    // In a real implementation, this would trigger a download
    // For now, we just show the data structure
    const dataStr = JSON.stringify(exportData, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `player-report-${playerId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card variant="surface-2" className="p-6">
      <h3 className="text-lg font-semibold text-[var(--c-text)] mb-4">Export Report</h3>
      <p className="text-sm text-[var(--c-text-muted)] mb-4">
        Download a complete report for this player including all transactions, bets, and statistics.
      </p>
      <Button variant="primary" onClick={handleExport}>
        Download JSON
      </Button>
    </Card>
  );
}
