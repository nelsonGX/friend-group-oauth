"use client";

import { useState } from "react";
import { AlertTriangle, Check, Copy } from "lucide-react";
import { Modal } from "@/components/Modal";
import {
  CopyButton,
  DeleteApp,
  EditListing,
  EditName,
  EditRedirects,
  Field,
  FundingSettings,
  RegenerateSecret,
  WebhookSettings,
} from "./DashboardForms";
import { AppDataViewer } from "./AppDataViewer";
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
  appBalance: number;
  incomeDestination: "owner" | "app_balance";
  webhookUrl: string | null;
  displayTitle: string | null;
  description: string | null;
  iconUrl: string | null;
  websiteUrl: string | null;
  category: "tools" | "fun";
  listed: boolean;
  createdAt: string;
}

type DetailsDict = Dictionary["dashboard"]["details"];
type AppsDict = Dictionary["dashboard"]["apps"];
type FormsDict = Dictionary["dashboard"]["forms"];
type DataDict = Dictionary["dashboard"]["data"];

type Tab =
  | "display"
  | "integration"
  | "redirects"
  | "webhook"
  | "funding"
  | "data"
  | "secret"
  | "danger";

/** Tabbed management surface for one provider app, opened from its card. */
export function AppDetailsModal({
  app,
  appUrl,
  t,
  appsT,
  forms,
  dataT,
  onClose,
}: {
  app: AppView;
  appUrl: string;
  t: DetailsDict;
  appsT: AppsDict;
  forms: FormsDict;
  dataT: DataDict;
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
    { key: "funding", label: t.tabFunding },
    { key: "data", label: t.tabData },
    { key: "secret", label: t.tabSecret },
    { key: "danger", label: t.tabDanger },
  ];

  return (
    <Modal open onClose={onClose} title={app.name} size="lg">
      {/* status badges + copyable client identifier */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className={`badge ${app.isActive ? "badge-success" : "badge-danger"}`}>
          <span className="dot" />
          {app.isActive ? appsT.active : appsT.disabled}
        </span>
        {app.trusted && <span className="badge badge-success">{appsT.trusted}</span>}
        <span className="badge">{appsT.earned.replace("{n}", String(app.earned))}</span>
        <span className="badge">{appsT.appBalance.replace("{n}", String(app.appBalance))}</span>
        <CopyClientId clientId={app.clientId} copiedLabel={forms.copied} className="ml-auto" />
      </div>

      {/* section rail (left) + section content (right) */}
      <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:gap-6">
        <nav
          aria-label={app.name}
          className="flex shrink-0 gap-0.5 overflow-x-auto rounded-xl border border-border bg-black/25 p-1 sm:w-40 sm:flex-col sm:self-start sm:overflow-x-visible sm:sticky sm:top-0"
        >
          {tabs.map((tb) => (
            <button
              key={tb.key}
              type="button"
              onClick={() => setTab(tb.key)}
              aria-current={tab === tb.key}
              className={`shrink-0 cursor-pointer whitespace-nowrap rounded-lg px-3 py-2 text-left text-[0.8125rem] font-medium transition-all active:scale-[0.97] sm:w-full ${
                tab === tb.key
                  ? "bg-surface-strong text-ink"
                  : "text-muted hover:bg-white/5 hover:text-ink"
              }`}
            >
              {tb.label}
            </button>
          ))}
        </nav>

        <div className="min-w-0 flex-1">
        {tab === "display" && (
          <div className="space-y-3">
            <EditName clientId={app.clientId} name={app.name} t={forms} />
            <hr className="border-border" />
            <p className="text-sm text-muted">{forms.displayDesc}</p>
            <EditListing
              clientId={app.clientId}
              displayTitle={app.displayTitle}
              description={app.description}
              iconUrl={app.iconUrl}
              websiteUrl={app.websiteUrl}
              category={app.category}
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
              <pre className="sunken mt-2 max-h-72 overflow-auto p-3 font-mono text-xs whitespace-pre-wrap wrap-break-word text-muted">
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
                <Field label="Reverse pay" value={`${appUrl}/api/pay/reverse`} />
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

        {tab === "funding" && (
          <FundingSettings
            clientId={app.clientId}
            appBalance={app.appBalance}
            incomeDestination={app.incomeDestination}
            endpoint={`${appUrl}/api/pay/reverse`}
            t={forms}
            details={t}
          />
        )}

        {tab === "data" && (
          <AppDataViewer clientId={app.clientId} t={dataT} />
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
      </div>
    </Modal>
  );
}

/** Compact, copy-on-click pill showing the app's client ID. */
function CopyClientId({
  clientId,
  copiedLabel,
  className = "",
}: {
  clientId: string;
  copiedLabel: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(clientId);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          setCopied(false);
        }
      }}
      title={copied ? copiedLabel : clientId}
      aria-label={clientId}
      className={`group flex max-w-full items-center gap-1.5 rounded-lg border border-border bg-black/25 px-2.5 py-1 font-mono text-xs text-muted transition-colors hover:border-border-strong hover:text-ink ${className}`}
    >
      <span className="truncate">{clientId}</span>
      {copied ? (
        <Check size={13} className="shrink-0 text-success" />
      ) : (
        <Copy size={13} className="shrink-0 text-faint transition-colors group-hover:text-ink" />
      )}
    </button>
  );
}
