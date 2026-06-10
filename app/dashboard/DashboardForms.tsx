"use client";

import { useActionState, useEffect, useState } from "react";
import { Copy, Check, Trash2 } from "lucide-react";
import {
  deleteOwnApp,
  fundAppBalance,
  regenerateSecret,
  updateIncomeDestination,
  updateAppListing,
  updateAppName,
  updateAppRedirects,
  updateAppWebhook,
  type FundingState,
  type SecretState,
  type WebhookState,
} from "./actions";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";

type FormsDict = Dictionary["dashboard"]["forms"];
type DetailsDict = Dictionary["dashboard"]["details"];

const secretInitial: SecretState = { ok: false, message: "" };
const webhookInitial: WebhookState = { ok: false, message: "" };
const fundingInitial: FundingState = { ok: false, message: "" };

const inputClass = "input";

function Notice({ ok, message }: { ok: boolean; message: string }) {
  if (!message) return null;
  return (
    <p className={`text-sm ${ok ? "text-success" : "text-danger"}`}>
      {message}
    </p>
  );
}

export function RegenerateSecret({
  clientId,
  t,
}: {
  clientId: string;
  t: FormsDict;
}) {
  const [state, action, pending] = useActionState(regenerateSecret, secretInitial);
  return (
    <div>
      <form action={action}>
        <input type="hidden" name="clientId" value={clientId} />
        <button type="submit" className="btn btn-secondary text-sm" disabled={pending}>
          {pending ? t.regenerating : t.regenerateSecret}
        </button>
      </form>
      <div className="mt-2">
        <Notice ok={state.ok} message={state.message} />
      </div>
      {state.ok && state.secret && (
        <div className="sunken mt-1 p-2 font-mono text-xs break-all">
          {state.secret}
        </div>
      )}
      {state.ok && state.prompt && <OneShotPrompt prompt={state.prompt} t={t} />}
    </div>
  );
}

export function EditName({
  clientId,
  name,
  t,
}: {
  clientId: string;
  name: string;
  t: FormsDict;
}) {
  const [state, action, pending] = useActionState(updateAppName, secretInitial);
  return (
    <form action={action} className="space-y-1.5">
      <input type="hidden" name="clientId" value={clientId} />
      <label className="text-sm font-medium" htmlFor="name">
        {t.nameLabel}
      </label>
      <input
        id="name"
        className={inputClass}
        name="name"
        placeholder={t.appNamePlaceholder}
        defaultValue={name}
      />
      <button type="submit" className="btn btn-secondary text-sm" disabled={pending}>
        {pending ? t.saving : t.saveName}
      </button>
      <Notice ok={state.ok} message={state.message} />
    </form>
  );
}

export function EditRedirects({
  clientId,
  redirectUris,
  t,
}: {
  clientId: string;
  redirectUris: string[];
  t: FormsDict;
}) {
  const [state, action, pending] = useActionState(updateAppRedirects, secretInitial);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="clientId" value={clientId} />
      <textarea
        className={inputClass}
        name="redirectUris"
        aria-label={t.redirectUrisMustMatch}
        rows={3}
        defaultValue={redirectUris.join("\n")}
      />
      <button type="submit" className="btn btn-secondary text-sm" disabled={pending}>
        {pending ? t.saving : t.saveRedirectUris}
      </button>
      <Notice ok={state.ok} message={state.message} />
    </form>
  );
}

export function WebhookSettings({
  clientId,
  webhookUrl,
  t,
}: {
  clientId: string;
  webhookUrl: string | null;
  t: FormsDict;
}) {
  const [state, action, pending] = useActionState(updateAppWebhook, webhookInitial);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="clientId" value={clientId} />
      <input
        className={inputClass}
        type="url"
        name="webhookUrl"
        aria-label={t.webhookUrlPlaceholder}
        placeholder={t.webhookUrlPlaceholder}
        defaultValue={webhookUrl ?? ""}
      />
      <button type="submit" className="btn btn-secondary text-sm" disabled={pending}>
        {pending ? t.saving : t.saveWebhook}
      </button>
      <Notice ok={state.ok} message={state.message} />
      {state.ok && state.secret && (
        <div>
          <p className="text-xs text-muted">{t.webhookSecretLabel}</p>
          <div className="sunken mt-1 p-2 font-mono text-xs break-all">
            {state.secret}
          </div>
        </div>
      )}
    </form>
  );
}

export function FundingSettings({
  clientId,
  appBalance,
  incomeDestination,
  endpoint,
  t,
  details,
}: {
  clientId: string;
  appBalance: number;
  incomeDestination: "owner" | "app_balance";
  endpoint: string;
  t: FormsDict;
  details: DetailsDict;
}) {
  const [fundState, fundAction, funding] = useActionState(
    fundAppBalance,
    fundingInitial,
  );
  const [routeState, routeAction, routing] = useActionState(
    updateIncomeDestination,
    fundingInitial,
  );

  return (
    <div className="space-y-5">
      <div>
        <h4 className="text-sm font-semibold">{details.fundingTitle}</h4>
        <p className="mt-1 text-sm text-muted">{details.fundingDesc}</p>
      </div>

      <div className="rounded-xl border border-border bg-surface px-4 py-3">
        <p className="text-xs uppercase tracking-wide text-faint">
          {t.appBalanceLabel}
        </p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">
          {appBalance}
          <span className="ml-1.5 text-sm font-normal text-muted">
            {t.credits}
          </span>
        </p>
      </div>

      <form action={fundAction} className="space-y-2">
        <input type="hidden" name="clientId" value={clientId} />
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="fundAmount">
              {t.fundAmountLabel}
            </label>
            <input
              id="fundAmount"
              className={inputClass}
              type="number"
              min={1}
              step={1}
              name="amount"
              placeholder={t.fundAmountPlaceholder}
              required
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="fundReason">
              {t.fundReasonLabel}
            </label>
            <input
              id="fundReason"
              className={inputClass}
              name="reason"
              placeholder={t.fundReasonPlaceholder}
            />
          </div>
        </div>
        <button type="submit" className="btn btn-secondary text-sm" disabled={funding}>
          {funding ? t.funding : t.fundAppBalance}
        </button>
        <Notice ok={fundState.ok} message={fundState.message} />
      </form>

      <form action={routeAction} className="space-y-2">
        <input type="hidden" name="clientId" value={clientId} />
        <label className="text-sm font-medium" htmlFor="incomeDestination">
          {t.incomeDestinationLabel}
        </label>
        <select
          id="incomeDestination"
          className={inputClass}
          name="incomeDestination"
          defaultValue={incomeDestination}
        >
          <option value="owner">{t.incomeDestinationOwner}</option>
          <option value="app_balance">{t.incomeDestinationAppBalance}</option>
        </select>
        <p className="text-xs text-muted">{t.incomeDestinationHint}</p>
        <button type="submit" className="btn btn-secondary text-sm" disabled={routing}>
          {routing ? t.saving : t.saveIncomeDestination}
        </button>
        <Notice ok={routeState.ok} message={routeState.message} />
      </form>

      <div>
        <p className="text-sm font-medium">{t.reversePayEndpoint}</p>
        <div className="sunken mt-1 p-2 font-mono text-xs break-all">
          {endpoint}
        </div>
        <p className="mt-1 text-xs text-muted">{t.reversePayHint}</p>
      </div>
    </div>
  );
}

export function EditListing({
  clientId,
  displayTitle,
  description,
  iconUrl,
  websiteUrl,
  listed,
  t,
}: {
  clientId: string;
  displayTitle: string | null;
  description: string | null;
  iconUrl: string | null;
  websiteUrl: string | null;
  listed: boolean;
  t: FormsDict;
}) {
  const [state, action, pending] = useActionState(updateAppListing, secretInitial);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="clientId" value={clientId} />
      <div className="space-y-1.5">
        <label className="text-sm font-medium" htmlFor="displayTitle">
          {t.displayTitleLabel}
        </label>
        <input
          id="displayTitle"
          className={inputClass}
          name="displayTitle"
          placeholder={t.displayTitlePlaceholder}
          defaultValue={displayTitle ?? ""}
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium" htmlFor="description">
          {t.descriptionLabel}
        </label>
        <textarea
          id="description"
          className={inputClass}
          name="description"
          rows={2}
          placeholder={t.descriptionPlaceholder}
          defaultValue={description ?? ""}
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium" htmlFor="iconUrl">
          {t.iconUrlLabel}
        </label>
        <input
          id="iconUrl"
          className={inputClass}
          type="url"
          name="iconUrl"
          placeholder={t.iconUrlPlaceholder}
          defaultValue={iconUrl ?? ""}
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium" htmlFor="websiteUrl">
          {t.websiteUrlLabel}
        </label>
        <input
          id="websiteUrl"
          className={inputClass}
          type="url"
          name="websiteUrl"
          placeholder={t.websiteUrlPlaceholder}
          defaultValue={websiteUrl ?? ""}
        />
      </div>
      <label className="flex items-center gap-2.5 text-sm">
        <input
          type="checkbox"
          name="listed"
          defaultChecked={listed}
          className="h-4 w-4 accent-brand"
        />
        {t.listedLabel}
      </label>
      <button type="submit" className="btn btn-secondary text-sm" disabled={pending}>
        {pending ? t.saving : t.saveDisplay}
      </button>
      <Notice ok={state.ok} message={state.message} />
    </form>
  );
}

/**
 * Danger-zone control: a two-step delete (button → inline confirm) so a stray
 * click can't wipe an app. On success the server revalidates the dashboard and
 * `onDeleted` closes the surrounding modal so the now-gone app doesn't linger.
 */
export function DeleteApp({
  clientId,
  t,
  onDeleted,
}: {
  clientId: string;
  t: FormsDict;
  onDeleted: () => void;
}) {
  const [state, action, pending] = useActionState(deleteOwnApp, secretInitial);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (state.ok) onDeleted();
  }, [state.ok, onDeleted]);

  if (!confirming) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="btn btn-danger text-sm"
        >
          <Trash2 size={15} />
          {t.deleteApp}
        </button>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="clientId" value={clientId} />
      <p className="text-sm text-danger">{t.deleteConfirm}</p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="btn btn-ghost text-sm"
          disabled={pending}
        >
          {t.cancel}
        </button>
        <button type="submit" className="btn btn-danger text-sm" disabled={pending}>
          <Trash2 size={15} />
          {pending ? t.deleting : t.deleteConfirmYes}
        </button>
      </div>
      <Notice ok={state.ok} message={state.message} />
    </form>
  );
}

export function Field({ label, value }: { label: string; value: string }) {  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
      <span className="w-28 shrink-0 text-faint">{label}</span>
      <span className="break-all text-muted">{value}</span>
    </div>
  );
}

export function CopyButton({ text, t }: { text: string; t: FormsDict }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          setCopied(false);
        }
      }}
      className={`${copied ? "btn btn-secondary" : "btn btn-primary"} shrink-0 text-sm`}
    >
      {copied ? <Check size={15} /> : <Copy size={15} />}
      {copied ? t.copied : t.copyPrompt}
    </button>
  );
}

/**
 * Renders a complete, copy-paste integration prompt with the freshly issued
 * secret baked in. Shown only at creation/regeneration — the one moment the
 * plaintext secret exists (it's hashed at rest and never recoverable after).
 */
export function OneShotPrompt({ prompt, t }: { prompt: string; t: FormsDict }) {
  return (
    <div className="mt-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-muted">{t.pastePrompt}</p>
        <CopyButton text={prompt} t={t} />
      </div>
      <pre className="sunken mt-2 max-h-72 overflow-auto p-3 font-mono text-xs whitespace-pre-wrap wrap-break-word text-muted">
{prompt}
      </pre>
    </div>
  );
}
