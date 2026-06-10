"use client";

import { useState } from "react";
import { Plus, Boxes, Settings2 } from "lucide-react";
import { CreateAppWizard } from "./CreateAppWizard";
import { AppDetailsModal, type AppView } from "./AppDetailsModal";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";

type DashDict = Dictionary["dashboard"];

/**
 * Client orchestrator for the "Your apps" area: a card grid with a prominent
 * Create button, an explanatory empty state, and the two popups (create wizard
 * + per-app details). Mounts each modal only while open so their internal state
 * resets cleanly between uses.
 */
export function ProviderApps({
  apps,
  appUrl,
  canRegister,
  supportedScopes,
  scopeInfo,
  skillCmds,
  t,
}: {
  apps: AppView[];
  appUrl: string;
  canRegister: boolean;
  supportedScopes: string[];
  scopeInfo: Record<string, string>;
  skillCmds: { sh: string; ps1: string };
  t: DashDict;
}) {
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<AppView | null>(null);
  const a = t.apps;

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{a.heading}</h2>
          <p className="mt-1 max-w-xl text-sm text-muted">{a.desc}</p>
        </div>
        {canRegister && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="btn btn-primary text-sm"
          >
            <Plus size={16} />
            {a.create}
          </button>
        )}
      </div>

      {apps.length === 0 ? (
        <div className="card card-hover-border mt-4 flex flex-col items-center gap-3 px-6 py-12 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-surface-strong text-faint">
            <Boxes size={22} />
          </span>
          <div>
            <p className="font-medium">{a.emptyTitle}</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{a.emptyDesc}</p>
          </div>
          {canRegister ? (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="btn btn-primary mt-1 text-sm"
            >
              <Plus size={16} />
              {a.create}
            </button>
          ) : (
            <p className="mt-1 text-sm text-faint">{a.needAccess}</p>
          )}
        </div>
      ) : (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {apps.map((app) => (
            <li key={app.id} className="card card-hover-border flex flex-col p-5">
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0 wrap-break-word font-medium">{app.name}</span>
                <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                  {!app.isActive && (
                    <span className="badge badge-danger">{a.disabled}</span>
                  )}
                  {app.trusted && (
                    <span className="badge badge-success">{a.trusted}</span>
                  )}
                </div>
              </div>
              <p className="mt-1 font-mono text-xs text-faint break-all">
                {app.clientId}
              </p>
              <div className="mt-4 flex items-center justify-between gap-2 border-t border-border pt-3">
                <span className="badge">
                  {a.earned.replace("{n}", String(app.earned))}
                </span>
                <button
                  type="button"
                  onClick={() => setSelected(app)}
                  className="btn btn-ghost py-1.5! text-sm"
                >
                  <Settings2 size={15} />
                  {a.manage}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {creating && (
        <CreateAppWizard
          onClose={() => setCreating(false)}
          supportedScopes={supportedScopes}
          scopeInfo={scopeInfo}
          skillCmds={skillCmds}
          t={t.wizard}
          forms={t.forms}
          skillT={t.skill}
        />
      )}
      {selected && (
        <AppDetailsModal
          app={selected}
          appUrl={appUrl}
          t={t.details}
          appsT={t.apps}
          forms={t.forms}
          onClose={() => setSelected(null)}
        />
      )}
    </section>
  );
}
