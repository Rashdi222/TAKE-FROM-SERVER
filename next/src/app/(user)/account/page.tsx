"use client";

import { Card } from "@/components/ui/Card";

export default function AccountPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-[var(--c-text)] mb-6">Account Settings</h1>
      
      <Card variant="surface-2" className="p-6 max-w-lg">
        <p className="text-[var(--c-text-muted)]">
          Account settings are managed by administrators. Contact support for any account-related changes.
        </p>
      </Card>
    </div>
  );
}
