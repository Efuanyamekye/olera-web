"use client";

/**
 * v9.0 Phase 7 Commit F: canonical drawer chrome.
 *
 * Backdrop + sticky right-side aside + ESC handler + body scroll
 * region. The four drawer modes (Stakeholder / Provider / Site /
 * Candidate) compose this and supply their own header content.
 *
 * Header is a free-form slot — drawers vary in title structure
 * (contact-led for stakeholders, provider name + status line for
 * clients, site name + stage for sites). Trying to constrain the
 * header layout here would force every drawer to either fit the
 * shape or escape it; the slot pattern keeps DrawerShell focused on
 * the genuinely-shared chrome.
 *
 * Standard close button (× top-right) is provided by the shell so
 * each drawer doesn't reimplement it. Pass extra header actions via
 * `headerExtras` if needed (e.g., the stakeholder drawer's
 * Mark-as-unread overflow).
 */

import { useCallback, useEffect, type ReactNode } from "react";
import SaveStatus, { type SaveState } from "./SaveStatus";

interface DrawerShellProps {
  onClose: () => void;
  /** Free-form header content. Should NOT include a close button —
   *  the shell renders one. */
  header: ReactNode;
  /** Extra controls rendered before the close button. Useful for
   *  drawer-level overflow menus (e.g., Mark as unread). */
  headerExtras?: ReactNode;
  /** Sticky footer content rendered below the scroll area. */
  footer?: ReactNode;
  /**
   * Whether this drawer's last write landed.
   *
   * Rendered in the header, and it also guards the exits. A drawer that is
   * mid-save closes freely: the request is already with the server and
   * unmounting the drawer does not cancel it. A drawer whose last write
   * FAILED does not, because closing it is how somebody loses work and never
   * finds out. Escape and the backdrop go through the same check as the
   * close button, since they are the two ways a drawer gets shut by accident.
   *
   * Leave it out and the drawer behaves exactly as it did before.
   */
  save?: SaveState;
  children: ReactNode;
}

export function DrawerShell({
  onClose,
  header,
  headerExtras,
  footer,
  save,
  children,
}: DrawerShellProps) {
  const failed = save?.kind === "failed";
  const message = save?.kind === "failed" ? save.message : "";

  const tryClose = useCallback(() => {
    if (
      failed &&
      !window.confirm(
        `The last change was not saved.\n\n${message}\n\nClose anyway? What you typed will be lost.`,
      )
    ) {
      return;
    }
    onClose();
  }, [failed, message, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") tryClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tryClose]);

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/20"
        onClick={tryClose}
        aria-label="Close drawer"
      />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-4">
          <div className="min-w-0 flex-1">{header}</div>
          <div className="flex shrink-0 items-center gap-2">
            {save && <SaveStatus state={save} />}
            {headerExtras}
            <button
              onClick={tryClose}
              className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              aria-label="Close"
            >
              <span aria-hidden>×</span>
            </button>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>
        {footer && (
          <div className="shrink-0 border-t border-gray-100 bg-white px-6 py-4">
            {footer}
          </div>
        )}
      </aside>
    </>
  );
}
