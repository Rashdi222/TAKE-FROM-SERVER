"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useDeposit, usePaymentMethods, usePaymentSupportContacts } from "@/hooks/usePayments";
import { Card } from "../ui/Card";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";
import { Alert } from "../ui/Alert";
import { ApiError } from "@/lib/api/errors";
import { PaymentMethodSelector } from "./PaymentMethodSelector";
import { useBalance } from "@/hooks/useProfile";
import { formatCurrency } from "@/lib/format";
import { ReceiptUploadField } from "./ReceiptUploadField";
import { useToast } from "@/components/ui/Toast";
import { PaymentSupportContactsCard } from "@/components/payments/PaymentSupportContactsCard";

export function DepositForm() {
  const [amount, setAmount] = useState("");
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [receiptPath, setReceiptPath] = useState("");
  const redirectTimerRef = useRef<number | null>(null);
  const router = useRouter();
  const { showToast } = useToast();
  const { data: methodsResponse, isLoading: methodsLoading } = usePaymentMethods("deposit");
  const { data: supportContactsData } = usePaymentSupportContacts();
  const { data: balanceData } = useBalance();
  const deposit = useDeposit();
  const methods = methodsResponse?.data ?? [];
  const currency = String(balanceData?.account_currency ?? "USD");
  const numericAmount = Number(amount || 0);

  useEffect(() => {
    return () => {
      if (redirectTimerRef.current) {
        window.clearTimeout(redirectTimerRef.current);
      }
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!paymentMethodId || !receiptPath) {
      return;
    }

    try {
      await deposit.mutateAsync({ amount: Number(amount), payment_method_id: paymentMethodId, receipt_path: receiptPath });
      showToast("Deposit request submitted. Your balance updates after approval.", "success");
      setAmount("");
      setPaymentMethodId("");
      setReceiptPath("");
      redirectTimerRef.current = window.setTimeout(() => {
        router.push("/wallet");
      }, 2000);
    } catch {
      // Error handled by useDeposit state
    }
  };

  return (
    <div className="space-y-5">
      <Card variant="surface-2" className="p-6">
        <h3 className="text-xl font-semibold text-[var(--c-text)] mb-4">Deposit Funds</h3>

        {deposit.isError && (
          <Alert variant="error" className="mb-4">
            {deposit.error instanceof ApiError ? deposit.error.message : "Deposit failed"}
          </Alert>
        )}

        <div className="mb-4 rounded-[var(--r-md)] border border-[var(--c-border)] bg-[rgba(255,255,255,0.03)] p-4 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[var(--c-text-muted)]">Account currency</span>
            <span className="font-semibold text-[var(--c-text)]">{currency}</span>
          </div>
          {numericAmount > 0 ? (
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="text-[var(--c-text-muted)]">Requested deposit</span>
              <span className="font-semibold text-[var(--c-text)]">{formatCurrency(numericAmount, currency)}</span>
            </div>
          ) : null}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Amount"
            type="number"
            min="100"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            placeholder={`Minimum 100 ${currency}`}
          />

          <PaymentMethodSelector
            methods={methods}
            value={paymentMethodId}
            onChange={setPaymentMethodId}
            label="Payment Method"
            placeholder={methodsLoading ? "Loading methods..." : "Select a payment method"}
            purpose="deposit"
            disabled={methodsLoading || methods.length === 0}
          />

          {!methodsLoading && methods.length === 0 && (
            <Alert variant="warning">No active payment methods are available right now.</Alert>
          )}

          <ReceiptUploadField value={receiptPath} onChange={setReceiptPath} />

          <Button type="submit" variant="primary" className="w-full" disabled={deposit.isPending || methods.length === 0 || !paymentMethodId || !receiptPath}>
            {deposit.isPending ? "Processing..." : "Deposit"}
          </Button>
        </form>
      </Card>

      <PaymentSupportContactsCard
        title="Need deposit help?"
        description="If your account manager balance is not available or your request needs manual attention, contact the assigned support owner directly from here."
        result={supportContactsData?.data ?? null}
        requestedAmount={amount ? formatCurrency(Number(amount || 0), currency) : null}
      />
    </div>
  );
}
