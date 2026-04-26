import { HTMLAttributes, forwardRef } from "react";

type CardVariant = "surface-1" | "surface-2";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ variant = "surface-1", className = "", children, ...props }, ref) => {
    const baseStyles = "rounded-[var(--r-md)] border overflow-hidden";
    
    const variantStyles = {
      "surface-1":
        "bg-[linear-gradient(180deg,rgba(255,255,255,0.015),rgba(255,255,255,0.005))] bg-[var(--c-surface-1)] border-[var(--c-border)]",
      "surface-2":
        "border-[var(--c-border-strong)] bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.01))] bg-[var(--c-surface-2)] shadow-[var(--shadow-1)]",
    };

    return (
      <div
        ref={ref}
        className={`${baseStyles} ${variantStyles[variant]} ${className}`}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = "Card";
