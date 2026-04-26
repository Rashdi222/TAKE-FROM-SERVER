"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ProviderSetupForm } from "@/components/providers/ProviderSetupForm";
import { isApiError, type Provider } from "@/lib/api";
import { useSuperAdminProviders, useUpsertProvider } from "@/hooks/useSuperAdmin";
import { useState } from "react";

export default function CreateProviderPage() {
  const router = useRouter();
  const upsertProvider = useUpsertProvider();
  const { data } = useSuperAdminProviders();
  const [error, setError] = useState<string | null>(null);

  const providers: Provider[] = ((data as { data?: Provider[] } | undefined)?.data ?? []) as Provider[];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--c-accent)]">Providers</p>
          <h1 className="mt-2 text-3xl font-semibold text-[var(--c-text)]">Provider Setup</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--c-text-muted)]">
            Choose the provider first, then fill only the fields that matter for that provider. Advanced JSON is still available, but it is no longer the primary setup path.
          </p>
        </div>
        <Link href="/admin/providers" className="text-sm text-[var(--c-accent)] hover:text-[var(--c-text)]">
          Back to providers
        </Link>
      </div>

      <Card variant="surface-2" className="p-5 text-sm leading-6 text-[var(--c-text-muted)]">
        <p className="font-medium text-[var(--c-text)]">Recommended order</p>
        <p className="mt-2">1. Save provider credentials here.</p>
        <p>2. Return to Providers and enable the provider.</p>
        <p>3. Create a competition feed on the Feeds page.</p>
        <p>4. Import fixtures from the feed instead of manually calling raw provider endpoints.</p>
      </Card>

      <ProviderSetupForm
        providers={providers}
        isSubmitting={upsertProvider.isPending}
        error={error}
        onSubmit={async (payload) => {
          setError(null);

          try {
            await upsertProvider.mutateAsync(payload);
            router.push("/admin/providers");
          } catch (value) {
            if (isApiError(value)) {
              setError(value.message);
              return;
            }

            setError("Unable to save provider.");
          }
        }}
      />

      <Link href="/admin/providers">
        <Button type="button" variant="secondary">Cancel</Button>
      </Link>
    </div>
  );
}
