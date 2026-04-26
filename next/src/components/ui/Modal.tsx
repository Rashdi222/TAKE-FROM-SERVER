"use client";

import { ReactNode, useEffect } from "react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  className?: string;
  contentClassName?: string;
}

export function Modal({
  isOpen,
  onClose,
  children,
  title,
  className = "",
  contentClassName = "",
}: ModalProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div
        className="absolute inset-0 bg-black/65 backdrop-blur-[10px]"
        onClick={onClose}
      />
      <div className={`relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-[var(--r-md)] border border-[var(--c-border-strong)] bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.015))] bg-[var(--c-surface-nav)] shadow-[var(--shadow-2)] backdrop-blur-[24px] ${className}`}>
        {title && (
          <div className="border-b border-[var(--c-border)] px-5 py-4 sm:px-6">
            <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-[var(--c-text)]">{title}</h2>
          </div>
        )}
        <div className={`overflow-y-auto p-4 sm:p-6 ${contentClassName}`}>{children}</div>
      </div>
    </div>
  );
}
