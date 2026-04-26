"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { usePaymentMethods, useWithdraw } from "@/hooks/usePayments";
import { useBalance } from "@/hooks/useProfile";
import { Card } from "../ui/Card";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";
import { Alert } from "../ui/Alert";
import { ApiError } from "@/lib/api/errors";
import { PaymentMethodSelector } from "./PaymentMethodSelector";
import { formatCurrency } from "@/lib/format";
import { useToast } from "@/components/ui/Toast";

export function WithdrawForm() {
  const [amount, setAmount] = useState("");
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [accountTitle, setAccountTitle] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const redirectTimerRef = useRef<number | null>(null);
  const router = useRouter();
  const { showToast } = useToast();
  
  const withdraw = useWithdraw();
  const { data: balanceData } = useBalance();
  const { data: methodsResponse, isLoading: methodsLoading } = usePaymentMethods("withdrawal");
  const methods = methodsResponse?.data ?? [];
  const selectedMethod = methods.find((method) => method.id === paymentMethodId);
  const accountTitleLabel = "Account Title";
  const accountTitlePlaceholder =
    String(selectedMethod?.account_label_hint ?? "").trim() || "Enter the account title exactly as it should receive the withdrawal";
  const accountNumberLabel = String(selectedMethod?.account_number_label ?? "").trim() || "Account Number";
  const accountNumberPlaceholder =
    String(selectedMethod?.account_number_placeholder ?? "").trim() || "Enter your account or wallet number";

  useEffect(() => {
    return () => {
      if (redirectTimerRef.current) {
        window.clearTimeout(redirectTimerRef.current);
      }
    };
  }, []);

  const handlePaymentMethodChange = (nextMethodId: string) => {
    setPaymentMethodId(nextMethodId);
    setAccountTitle("");
    setAccountNumber("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const balance = Number(balanceData?.balance ?? 0);
    const withdrawAmount = Number(amount);

    if (withdrawAmount > balance) {
      return;
    }

    if (!paymentMethodId) {
      return;
    }

    if (!accountTitle.trim() || !accountNumber.trim()) {
      return;
    }

    try {
      await withdraw.mutateAsync({
        amount: withdrawAmount,
        payment_method_id: paymentMethodId,
        account_title: accountTitle.trim(),
        account_number: accountNumber.trim(),
      });
      showToast("Withdrawal request submitted. It stays pending until an admin approves it.", "success");
      setAmount("");
      setPaymentMethodId("");
      setAccountTitle("");
      setAccountNumber("");
      redirectTimerRef.current = window.setTimeout(() => {
        router.push("/wallet");
      }, 2000);
    } catch {
      // Error handled by useWithdraw state
    }
  };

  const balance = Number(balanceData?.balance ?? 0);
  const currency = String(balanceData?.account_currency ?? "USD");
  const withdrawAmount = Number(amount);

  return (
    <Card variant="surface-2" className="p-6">
      <h3 className="text-xl font-semibold text-[var(--c-text)] mb-4">Withdraw Funds</h3>
      
      {withdraw.isError && (
        <Alert variant="error" className="mb-4">
          {withdraw.error instanceof ApiError ? withdraw.error.message : "Withdrawal failed"}
        </Alert>
      )}
      
      <div className="mb-4 rounded-[var(--r-md)] border border-[var(--c-border)] bg-[rgba(255,255,255,0.03)] p-4 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[var(--c-text-muted)]">Available balance</span>
          <span className="font-semibold text-[var(--c-text)]">{formatCurrency(balance, currency)}</span>
        </div>
        <div className="mt-2 flex items-center justify-between gap-3">
          <span className="text-[var(--c-text-muted)]">Account currency</span>
          <span className="font-semibold text-[var(--c-text)]">{currency}</span>
        </div>
        <div className="mt-3 rounded-[var(--r-sm)] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-3 py-3 text-xs leading-6 text-[var(--c-text-muted)]">
          Your balance stays playable until this withdrawal is approved. If you use those credits before approval, the request can be rejected and you will need to submit a new withdrawal for the remaining balance.
        </div>
      </div>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Amount"
          type="number"
          min="100"
          max={balance}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
          placeholder={`Min 100 ${currency}, max available balance`}
        />
        
        <PaymentMethodSelector
          methods={methods}
          value={paymentMethodId}
          onChange={handlePaymentMethodChange}
          label="Payment Method"
          placeholder={methodsLoading ? "Loading methods..." : "Select a withdrawal method"}
          purpose="withdrawal"
          disabled={methodsLoading || methods.length === 0}
        />

        {!methodsLoading && methods.length === 0 && (
          <Alert variant="warning">No active withdrawal methods are available right now.</Alert>
        )}

        {selectedMethod ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Input
              label={accountTitleLabel}
              value={accountTitle}
              onChange={(e) => setAccountTitle(e.target.value)}
              required
              placeholder={accountTitlePlaceholder}
            />
            <Input
              label={accountNumberLabel}
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              required
              placeholder={accountNumberPlaceholder}
            />
          </div>
        ) : null}

        {withdrawAmount > balance && amount && (
          <Alert variant="warning">Insufficient balance</Alert>
        )}

        {withdrawAmount > 0 && withdrawAmount <= balance ? (
          <Alert variant="info">
            You are requesting {formatCurrency(withdrawAmount, currency)} from your available balance.
          </Alert>
        ) : null}
        
        <Button 
          type="submit" 
          variant="primary" 
          className="w-full" 
          disabled={
            withdraw.isPending ||
            withdrawAmount > balance ||
            !amount ||
            !paymentMethodId ||
            !accountTitle.trim() ||
            !accountNumber.trim() ||
            methods.length === 0
          }
        >
          {withdraw.isPending ? "Processing..." : "Withdraw"}
        </Button>
      </form>
    </Card>
  );
}
