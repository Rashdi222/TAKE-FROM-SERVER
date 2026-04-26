"use client";

import { ForgotPasswordSupportLookup } from "@/components/support-reset/ForgotPasswordSupportLookup";

export default function ForgotPasswordPage() {
  return (
    <div className="relative min-h-[92vh] overflow-hidden sb-auth-bg">
      <div className="relative mx-auto flex min-h-[92vh] max-w-3xl items-center justify-center px-6 py-16">
        <div className="w-full max-w-xl">
          <ForgotPasswordSupportLookup />
        </div>
      </div>
    </div>
  );
}
