"use client";

import { useState } from "react";
import { Modal } from "@/components/Modal";
import { revokeAppAccess } from "./actions";
import { format } from "@/lib/i18n/format";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";

type DashDict = Dictionary["dashboard"];

interface Connected {
  clientId: string;
  name: string | null;
}

/**
 * Connected-apps list. Revoking now goes through a confirmation popup so a
 * stray click can't silently cut an app's access.
 */
export function ConnectedApps({
  apps,
  t,
}: {
  apps: Connected[];
  t: DashDict;
}) {
  const [confirming, setConfirming] = useState<Connected | null>(null);

  return (
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-faint">
        {t.connectedApps}
      </h2>
      {apps.length === 0 ? (
        <p className="mt-3 text-sm text-muted">{t.noAppsConnected}</p>
      ) : (
        <ul className="card card-hover-border mt-3 glass-divide overflow-hidden">
          {apps.map((c) => (
            <li
              key={c.clientId}
              className="flex items-center justify-between gap-3 p-4"
            >
              <span className="min-w-0 wrap-break-word text-sm font-medium">
                {c.name ?? c.clientId}
              </span>
              <button
                type="button"
                onClick={() => setConfirming(c)}
                className="shrink-0 text-sm text-danger transition-opacity hover:opacity-80"
              >
                {t.revoke}
              </button>
            </li>
          ))}
        </ul>
      )}

      {confirming && (
        <Modal open onClose={() => setConfirming(null)} title={t.revokeConfirm.title}>
          <p className="text-sm text-muted">
            {format(t.revokeConfirm.desc, { name: confirming.name ?? confirming.clientId })}
          </p>
          <div className="mt-6 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirming(null)}
              className="btn btn-ghost text-sm"
            >
              {t.revokeConfirm.cancel}
            </button>
            <form action={revokeAppAccess} onSubmit={() => setConfirming(null)}>
              <input type="hidden" name="clientId" value={confirming.clientId} />
              <button type="submit" className="btn btn-primary text-sm">
                {t.revokeConfirm.confirm}
              </button>
            </form>
          </div>
        </Modal>
      )}
    </section>
  );
}
