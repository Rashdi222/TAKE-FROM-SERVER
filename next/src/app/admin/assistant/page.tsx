"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { AssistantDocumentsPanel } from "@/components/assistant/admin/AssistantDocumentsPanel";
import { AssistantFaqsPanel } from "@/components/assistant/admin/AssistantFaqsPanel";
import { AssistantDraftsPanel } from "@/components/assistant/admin/AssistantDraftsPanel";
import { AssistantAnalyticsPanel } from "@/components/assistant/admin/AssistantAnalyticsPanel";

type Tab = "documents" | "faqs" | "drafts" | "analytics";

const tabs: { id: Tab; label: string; note: string }[] = [
  { id: "documents", label: "Documents", note: "Upload and curate markdown knowledge." },
  { id: "faqs", label: "FAQs", note: "Write and govern canonical answers." },
  { id: "drafts", label: "Drafts", note: "Review mined FAQ suggestions." },
  { id: "analytics", label: "Analytics", note: "Watch chat volume and most asked topics." },
];

export default function AdminAssistantPage() {
  const [activeTab, setActiveTab] = useState<Tab>("documents");

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.24em] text-[var(--c-accent)]">Assistant</p>
        <h1 className="mt-2 text-3xl font-semibold text-[var(--c-text)]">AI Knowledge Desk</h1>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-[var(--c-text-muted)]">
          Manage the assistant knowledge vault: private markdown docs, manual FAQs, and emerging question patterns from live user chats.
        </p>
      </div>

      <Card variant="surface-1" className="p-3">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-[var(--r-md)] border px-4 py-4 text-left transition ${
                activeTab === tab.id
                  ? "border-[var(--c-accent)] bg-[rgba(99,32,232,0.14)]"
                  : "border-[var(--c-border)] bg-[rgba(255,255,255,0.02)]"
              }`}
            >
              <div className="font-semibold text-[var(--c-text)]">{tab.label}</div>
              <div className="mt-1 text-sm text-[var(--c-text-muted)]">{tab.note}</div>
            </button>
          ))}
        </div>
      </Card>

      {activeTab === "documents" ? <AssistantDocumentsPanel /> : null}
      {activeTab === "faqs" ? <AssistantFaqsPanel /> : null}
      {activeTab === "drafts" ? <AssistantDraftsPanel /> : null}
      {activeTab === "analytics" ? <AssistantAnalyticsPanel /> : null}
    </div>
  );
}
