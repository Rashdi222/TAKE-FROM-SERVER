import { InputHTMLAttributes, forwardRef } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string | string[];
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = "", ...props }, ref) => {
    const errorMessage = Array.isArray(error) ? error[0] : error;

    return (
      <div className="flex flex-col gap-2">
        {label && (
          <label className="text-sm font-medium tracking-[0.01em] text-[var(--c-text)]">
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={`px-4 py-2.5 rounded-[var(--r-sm)] border bg-[linear-gradient(180deg,rgba(255,255,255,0.025),rgba(255,255,255,0.01))] bg-[var(--c-surface-1)] text-[var(--c-text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] placeholder:text-[var(--c-text-faint)] transition-colors focus:outline-none focus:border-[var(--c-accent)] focus:ring-2 focus:ring-[rgba(99,32,232,0.18)] ${
            error ? "border-[var(--c-danger)]" : ""
          } ${className}`}
          {...props}
        />
        {errorMessage && (
          <span className="text-sm text-[var(--c-danger)]">{errorMessage}</span>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";
