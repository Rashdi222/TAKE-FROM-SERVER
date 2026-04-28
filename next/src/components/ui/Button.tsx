import { ButtonHTMLAttributes, forwardRef } from "react";

type ButtonVariant = "primary" | "secondary" | "destructive" | "ghost";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size, className = "", ...props }, ref) => {
    const baseStyles =
      "rounded-[var(--r-pill)] font-medium tracking-[0.01em] transition-all duration-[var(--dur-3)] ease-[var(--ease-operator)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(99,32,232,0.65)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--c-bg)] disabled:opacity-50 disabled:cursor-not-allowed";
    const sizeStyles = size === "sm" ? "px-3 py-1.5 text-sm" : size === "lg" ? "px-8 py-4 text-lg" : "px-6 py-3";
    
    const variantStyles = {
      primary:
        "border border-[rgba(161,121,241,0.26)] bg-[var(--c-accent)] text-[var(--c-text)] shadow-[0_10px_32px_rgba(99,32,232,0.28)] hover:bg-[var(--c-accent-2)] hover:-translate-y-1.5",
      secondary:
        "border border-[var(--c-accent)] bg-transparent text-[var(--c-text-muted)] hover:bg-[var(--c-accent-soft)] hover:text-[var(--c-text)] hover:-translate-y-0.5",
      destructive:
        "border border-[rgba(255,60,60,0.25)] bg-[var(--c-danger)] text-[var(--c-text)] shadow-[0_10px_28px_rgba(255,60,60,0.18)] hover:bg-[#e63535] hover:-translate-y-0.5",
      ghost:
        "border border-transparent bg-transparent text-[var(--c-text-muted)] hover:bg-[var(--c-surface-2)] hover:text-[var(--c-text)]",
    };

    return (
      <button
        ref={ref}
        className={`${baseStyles} ${sizeStyles} ${variantStyles[variant]} ${className}`}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";
