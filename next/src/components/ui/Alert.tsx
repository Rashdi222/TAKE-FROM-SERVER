import { HTMLAttributes } from "react";

type AlertVariant = "success" | "error" | "warning" | "info";

interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  variant?: AlertVariant;
}

export function Alert({ variant = "info", className = "", children, ...props }: AlertProps) {
  const variantStyles = {
    success:
      "border-[rgba(100,181,19,0.28)] bg-[rgba(100,181,19,0.12)] text-[var(--c-text)]",
    error:
      "border-[rgba(255,60,60,0.28)] bg-[rgba(255,60,60,0.12)] text-[var(--c-text)]",
    warning:
      "border-[rgba(255,176,32,0.28)] bg-[rgba(255,176,32,0.12)] text-[var(--c-text)]",
    info:
      "border-[rgba(58,139,255,0.28)] bg-[rgba(58,139,255,0.12)] text-[var(--c-text)]",
  };

  return (
    <div
      className={`p-3 rounded-[var(--r-sm)] border backdrop-blur-[12px] ${variantStyles[variant]} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
