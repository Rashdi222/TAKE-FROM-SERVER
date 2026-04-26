"use client";

import { useState } from "react";
import { useAccountCurrencies, useSuperAdminMasterAdmins } from "@/hooks/useSuperAdmin";
import { AccountCurrencyFilter } from "@/components/admin/AccountCurrencyFilter";
import { MasterAdminTable } from "@/components/admin/MasterAdminTable";
import { CreateMasterAdminForm } from "@/components/admin/CreateMasterAdminForm";
import { MasterAdminQuickViewModal } from "@/components/admin/MasterAdminQuickViewModal";
import { Button } from "@/components/ui/Button";

interface MasterAdmin {
  id: string;
  username?: string | null;
  email?: string;
  balance?: number | string;
  account_currency?: string;
  supported_account_currencies?: string[] | null;
  is_active?: boolean;
  inserted_at?: string;
}

export default function MasterAdminsPage() {
  const { data: currencyData } = useAccountCurrencies();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedMasterAdminId, setSelectedMasterAdminId] = useState<string | null>(null);
  const [currencyFilter, setCurrencyFilter] = useState("");

  const { data: filteredData, isLoading: filteredLoading } = useSuperAdminMasterAdmins(
    currencyFilter ? { account_currency: currencyFilter } : undefined
  );

  const masterAdmins: MasterAdmin[] = (filteredData as { data?: MasterAdmin[] })?.data || [];
  const currencies = (currencyData?.data ?? []).filter((currency) => currency.enabled !== false);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-[var(--c-text)]">Master Admins</h1>
        <Button variant="primary" onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? "Close" : "Create Master Admin"}
        </Button>
      </div>

      {showCreate && (
        <div className="mb-6 max-w-md">
          <CreateMasterAdminForm />
        </div>
      )}

      <div className="mb-6 max-w-xs">
        <AccountCurrencyFilter
          value={currencyFilter}
          onChange={setCurrencyFilter}
          currencies={currencies}
          label="Filter by account currency"
        />
      </div>

      {filteredLoading ? (
        <p className="text-[var(--c-text-muted)]">Loading master admins...</p>
      ) : (
        <MasterAdminTable masterAdmins={masterAdmins} onSelect={setSelectedMasterAdminId} />
      )}

      <MasterAdminQuickViewModal
        masterAdminId={selectedMasterAdminId}
        isOpen={!!selectedMasterAdminId}
        onClose={() => setSelectedMasterAdminId(null)}
      />
    </div>
  );
}
