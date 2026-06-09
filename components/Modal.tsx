"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

const widths = {
  md: "max-w-md",
  lg: "max-w-2xl",
} as const;

/**
 * A lightweight, dependency-free dialog. Portals to <body>, dims+blurs the page,
 * and closes on backdrop click, the X button, or Escape. Body scroll is locked
 * while open. Renders nothing when closed.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: keyof typeof widths;
}) {
  // Close on Escape + lock background scroll while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  // Modals only ever mount in response to a client interaction (their open state
  // starts closed on the server), so `document` is always available here.
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        // Only close when the press starts on the backdrop itself, so a drag
        // that ends outside the panel (e.g. selecting text) doesn't close it.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={`modal-panel ${widths[size]}`}
      >
        {(title || description) && (
          <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
            <div className="min-w-0">
              {title && (
                <h2 className="text-base font-semibold leading-tight">{title}</h2>
              )}
              {description && (
                <p className="mt-1 text-sm text-muted">{description}</p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-1.5 -mt-1 shrink-0 rounded-lg p-1.5 text-faint transition-colors hover:bg-surface-strong hover:text-ink"
            >
              <X size={18} />
            </button>
          </div>
        )}

        <div className="max-h-[70vh] overflow-y-auto px-6 py-5">{children}</div>

        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
