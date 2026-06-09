"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Modal } from "@/components/Modal";
import {
  CopyButton,
  DeleteApp,
  EditListing,
  EditRedirects,
  Field,
  RegenerateSecret,
  WebhookSettings,
} from "./DashboardForms";
import { buildIntegrationPrompt } from "@/lib/integrationPrompt";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";

export interface AppView {
  id: string;
  name: string;
  clientId: string;
  allowedScopes: string[];
  redirectUris: string[];
  isActive: boolean;
  trusted: boolean;
  earned: number;
  webhookUrl: string | null;
  displayTitle: string | null;
  description: string | null;
  iconUrl: string | null;
  websiteUrl: string | null;
  listed: boolean;
  createdAt: string;
}

type DetailsDict = Dictionary["dashboard"]["details"];
type AppsDict = Dictionary["dashboard"]["apps"];
type FormsDict = Dictionary["dashboard"]["forms"];

type Tab = "display" | "integration" | "redirects" | "webhook" | "secret" | "danger";

/** Tabbed management surface for one provider app, opened from its card. */
export function AppDetailsModal({
  app,
  appUrl,
  t,
  appsT,
  forms,
  onClose,
}: {
  app: AppView;
  appUrl: string;
  t: DetailsDict;
  appsT: AppsDict;
  forms: FormsDict;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("display");

  const prompt = buildIntegrationPrompt({
    appUrl,
    clientId: app.clientId,
    redirectUri: app.redirectUris[0] ?? "https://your-site.example/callback",
    scopes: app.allowedScopes,
  });

  const tabs: { key: Tab; label: string }[] = [
    { key: "display", label: t.tabDisplay },
    { key: "integration", label: t.tabIntegration },
    { key: "redirects", label: t.tabRedirects },
    { key: "webhook", label: t.tabWebhook },
    { key: "secret", label: t.tabSecret },
    { key: "danger", label: t.tabDanger },
  ];

  return (
    <Modal open onClose={onClose} title={app.name} size="lg">
      {/* status + identifier */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className={`badge ${app.isActive ? "badge-success" : "badge-danger"}`}>
          <span className="dot" />
          {app.isActive ? appsT.active : appsT.disabled}
        </span>
        {app.trusted && <span className="badge badge-success">{appsT.trusted}</span>}
        <span className="badge">{appsT.earned.replace("{n}", String(app.earned))}</span>
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <span className="font-mono text-xs text-faint break-all">{app.clientId}</span>
        <CopyButton text={app.clientId} t={forms} />
      </div>

      {/* tabs */}
      <div className="tablist mt-4">
        {tabs.map((tb) => (
          <button
            key={tb.key}
            type="button"
            onClick={() => setTab(tb.key)}
            className={`tab ${tab === tb.key ? "tab-active" : ""}`}
          >
            {tb.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === "display" && (
          <div className="space-y-3">
            <p className="text-sm text-muted">{forms.displayDesc}</p>
            <EditListing
              clientId={app.clientId}
              displayTitle={app.displayTitle}
              description={app.description}
              iconUrl={app.iconUrl}
              websiteUrl={app.websiteUrl}
              listed={app.listed}
              t={forms}
            />
          </div>
        )}

        {tab === "integration" && (
          <div className="space-y-4">
            <div>
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm text-muted">{forms.pastePrompt}</p>
                <CopyButton text={prompt} t={forms} />
              </div>
              <pre className="sunken mt-2 max-h-72 overflow-auto p-3 font-mono text-xs whitespace-pre-wrap break-words text-muted">
{prompt}
              </pre>
            </div>

            <div>
              <h4 className="text-sm font-semibold">{t.endpoints}</h4>
              <div className="mt-2 space-y-1 font-mono text-xs">
                <Field label="Discovery" value={`${appUrl}/.well-known/oauth-authorization-server`} />
                <Field label="Authorize" value={`${appUrl}/oauth/authorize`} />
                <Field label="Token" value={`${appUrl}/api/oauth/token`} />
                <Field label="Userinfo" value={`${appUrl}/api/oauth/userinfo`} />
                <Field label="Revoke" value={`${appUrl}/api/oauth/revoke`} />
                <Field label="Pay (intent)" value={`${appUrl}/api/pay/intent`} />
                <Field label="Pay (confirm)" value={`${appUrl}/pay`} />
                <Field label="Pay (verify)" value={`${appUrl}/api/pay/verify`} />
              </div>
            </div>
          </div>
        )}

        {tab === "redirects" && (
          <div className="space-y-2">
            <p className="text-sm text-muted">{forms.redirectUrisMustMatch}</p>
            <EditRedirects
              clientId={app.clientId}
              redirectUris={app.redirectUris}
              t={forms}
            />
          </div>
        )}

        {tab === "webhook" && (
          <div className="space-y-3">
            <h4 className="text-sm font-semibold">{t.webhookTitle}</h4>
            <p className="text-sm text-muted">{t.webhookDesc}</p>
            <WebhookSettings
              clientId={app.clientId}
              webhookUrl={app.webhookUrl}
              t={forms}
            />
          </div>
        )}

        {tab === "secret" && (
          <div className="space-y-3">
            <h4 className="text-sm font-semibold">{t.secretTitle}</h4>
            <p className="flex items-start gap-2 text-sm text-muted">
              <AlertTriangle size={15} className="mt-0.5 shrink-0 text-danger" />
              {t.secretDesc}
            </p>
            <RegenerateSecret clientId={app.clientId} t={forms} />
          </div>
        )}

        {tab === "danger" && (
          <div className="space-y-3">
            <h4 className="text-sm font-semibold">{t.deleteTitle}</h4>
            <p className="flex items-start gap-2 text-sm text-muted">
              <AlertTriangle size={15} className="mt-0.5 shrink-0 text-danger" />
              {t.deleteDesc}
            </p>
            <DeleteApp clientId={app.clientId} t={forms} onDeleted={onClose} />
          </div>
        )}
      </div>
    </Modal>
  );
}
