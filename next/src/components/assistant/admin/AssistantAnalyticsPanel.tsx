"use client";

import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { useAssistantAnalytics } from "@/hooks/useAssistantAdmin";
import type { AssistantAnalytics } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

export function AssistantAnalyticsPanel() {
  const { data, isLoading, isError } = useAssistantAnalytics();
  const analytics = ((data as { data?: AssistantAnalytics } | undefined)?.data ?? null) as AssistantAnalytics | null;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Chat Volume" value={analytics?.total_chat_volume ?? 0} />
        <MetricCard label="Active Users" value={analytics?.active_users ?? 0} />
        <MetricCard label="Approved FAQs" value={analytics?.approved_faqs ?? 0} />
        <MetricCard label="Pending Drafts" value={analytics?.pending_faq_drafts ?? 0} />
      </div>

      <Card variant="surface-2" className="p-5">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--c-text-faint)]">Top Topics</p>
          <h3 className="mt-2 text-xl font-semibold text-[var(--c-text)]">Most Asked Questions</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--c-text-muted)]">
            Frequency-ranked digest view across live assistant chats. Use this table to decide which patterns deserve canonical FAQ promotion.
          </p>
        </div>

        {isError ? <Alert variant="error" className="mt-4">Assistant analytics failed to load.</Alert> : null}

        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-[var(--c-text-faint)]">
              <tr className="border-b border-[var(--c-border)]">
                <th className="px-3 py-3 font-medium">Question Pattern</th>
                <th className="px-3 py-3 font-medium">Count</th>
                <th className="px-3 py-3 font-medium">First Seen</th>
                <th className="px-3 py-3 font-medium">Last Seen</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-[var(--c-text-muted)]">Loading analytics...</td>
                </tr>
              ) : analytics?.top_question_digests?.length ? (
                analytics.top_question_digests.map((digest) => (
                  <tr key={digest.id} className="border-b border-[var(--c-border)]/70">
                    <td className="px-3 py-4 text-[var(--c-text)]">{digest.normalized_question}</td>
                    <td className="px-3 py-4 text-[var(--c-text-muted)]">{digest.count}</td>
                    <td className="px-3 py-4 text-[var(--c-text-muted)]">{formatDateTime(digest.first_seen_at)}</td>
                    <td className="px-3 py-4 text-[var(--c-text-muted)]">{formatDateTime(digest.last_seen_at)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-[var(--c-text-muted)]">No question digest activity yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <Card variant="surface-1" className="p-5">
      <p className="text-xs uppercase tracking-[0.18em] text-[var(--c-text-faint)]">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-[var(--c-text)]">{value}</p>
    </Card>
  );
}
