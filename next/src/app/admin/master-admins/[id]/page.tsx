"use client";

import { use } from "react";
import { useSuperAdminMasterAdmin } from "@/hooks/useSuperAdmin";
import { Card } from "@/components/ui/Card";

interface MasterAdmin {
  id: string;
  username?: string | null;
  email?: string;
  is_active?: boolean;
  inserted_at?: string;
}

export default function MasterAdminDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, isLoading } = useSuperAdminMasterAdmin(id);

  const admin: MasterAdmin = ((data as { data?: MasterAdmin })?.data || {}) as MasterAdmin;

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <p className="text-[var(--c-text-muted)]">Loading...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-[var(--c-text)] mb-6">Master Admin Details</h1>

      <Card variant="surface-2" className="p-6 max-w-lg">
        <div className="space-y-4">
          <div>
            <label className="text-sm text-[var(--c-text-muted)]">Username</label>
            <p className="text-[var(--c-text)]">{admin.username || "-"}</p>
          </div>
          <div>
            <label className="text-sm text-[var(--c-text-muted)]">Email</label>
            <p className="text-[var(--c-text)]">{admin.email || "-"}</p>
          </div>
          <div>
            <label className="text-sm text-[var(--c-text-muted)]">Status</label>
            <p className={admin.is_active ? "text-[var(--c-success)]" : "text-[var(--c-danger)]"}>
              {admin.is_active ? "Active" : "Inactive"}
            </p>
          </div>
          <div>
            <label className="text-sm text-[var(--c-text-muted)]">Created</label>
            <p className="text-[var(--c-text)]">
              {admin.inserted_at ? new Date(admin.inserted_at).toLocaleString() : "-"}
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
