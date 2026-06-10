"use client";

import { useActionState, useReducer, useRef, useState } from "react";
import { Plus, Trash2, Check, AlertTriangle, Sparkles, PencilLine } from "lucide-react";
import { Modal } from "@/components/Modal";
import { createOwnApp, type AppState } from "./actions";
import { CopyButton, OneShotPrompt } from "./DashboardForms";
import { SkillInstall } from "./SkillInstall";
import { format } from "@/lib/i18n/format";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";

type WizardDict = Dictionary["dashboard"]["wizard"];
type FormsDict = Dictionary["dashboard"]["forms"];
type SkillDict = Dictionary["dashboard"]["skill"];

const appInitial: AppState = { ok: false, message: "" };
const TOTAL_STEPS = 3;

type UriRow = {
  id: string;
  value: string;
};

type WizardFormState = {
  step: number;
  name: string;
  uris: UriRow[];
  scopes: string[];
  error: string;
};

type WizardFormAction =
  | { type: "setError"; error: string }
  | { type: "setStep"; step: number }
  | { type: "setName"; name: string }
  | { type: "setUri"; id: string; value: string }
  | { type: "addUri"; uri: UriRow }
  | { type: "removeUri"; id: string }
  | { type: "toggleScope"; scope: string };

function wizardFormReducer(
  state: WizardFormState,
  action: WizardFormAction,
): WizardFormState {
  switch (action.type) {
    case "setError":
      return { ...state, error: action.error };
    case "setStep":
      return { ...state, step: action.step };
    case "setName":
      return { ...state, name: action.name };
    case "setUri":
      return {
        ...state,
        uris: state.uris.map((u) =>
          u.id === action.id ? { ...u, value: action.value } : u,
        ),
      };
    case "addUri":
      return { ...state, uris: [...state.uris, action.uri] };
    case "removeUri":
      return { ...state, uris: state.uris.filter((u) => u.id !== action.id) };
    case "toggleScope":
      return {
        ...state,
        scopes: state.scopes.includes(action.scope)
          ? state.scopes.filter((s) => s !== action.scope)
          : [...state.scopes, action.scope],
      };
  }
}

/**
 * Create-app popup. Opens on a chooser: the recommended one-click integration
 * (install the coding-agent skill, which registers the app for you via the
 * browser-approved device flow) on top, an "or" divider, and a manual path
 * below. The manual path is the guided name → redirect URIs → scopes wizard,
 * which surfaces the one-time secret on a dedicated success screen. Manual
 * state is collected in React and submitted via hidden inputs so the
 * `createOwnApp` server action keeps its existing FormData shape.
 */
export function CreateAppWizard({
  onClose,
  supportedScopes,
  scopeInfo,
  skillCmds,
  t,
  forms,
  skillT,
}: {
  onClose: () => void;
  supportedScopes: string[];
  scopeInfo: Record<string, string>;
  skillCmds: { sh: string; ps1: string };
  t: WizardDict;
  forms: FormsDict;
  skillT: SkillDict;
}) {
  const [state, action, pending] = useActionState(createOwnApp, appInitial);

  // "choose" shows the one-click vs manual chooser; "manual" runs the wizard.
  const [mode, setMode] = useState<"choose" | "manual">("choose");
  const [form, dispatch] = useReducer(wizardFormReducer, {
    step: 1,
    name: "",
    uris: [{ id: "initial", value: "" }],
    scopes: ["identify"],
    error: "",
  });
  const nextUriId = useRef(1);
  const { step, name, uris, scopes, error } = form;

  // On a successful create, the action revalidates the dashboard and returns the
  // secret — the success screen renders in place of the form.
  const done = state.ok && !!state.clientId;

  function setUri(id: string, value: string) {
    dispatch({ type: "setUri", id, value });
  }
  function addUri() {
    const id = `uri-${nextUriId.current}`;
    nextUriId.current += 1;
    dispatch({ type: "addUri", uri: { id, value: "" } });
  }
  function removeUri(id: string) {
    dispatch({ type: "removeUri", id });
  }
  function toggleScope(scope: string) {
    dispatch({ type: "toggleScope", scope });
  }

  function next() {
    if (step === 1) {
      if (!name.trim()) return dispatch({ type: "setError", error: t.nameRequired });
    }
    if (step === 2) {
      const filled = uris.flatMap((u) => {
        const uri = u.value.trim();
        return uri ? [uri] : [];
      });
      if (filled.length === 0) return dispatch({ type: "setError", error: t.uriRequired });
      for (const uri of filled) {
        try {
          new URL(uri);
        } catch {
          return dispatch({
            type: "setError",
            error: format(t.uriInvalid, { uri }),
          });
        }
      }
    }
    dispatch({ type: "setError", error: "" });
    dispatch({ type: "setStep", step: Math.min(step + 1, TOTAL_STEPS) });
  }
  function back() {
    dispatch({ type: "setError", error: "" });
    // From the first step, step back out to the one-click / manual chooser.
    if (step === 1) {
      setMode("choose");
      return;
    }
    dispatch({ type: "setStep", step: Math.max(step - 1, 1) });
  }

  const cleanUris = uris.flatMap((u) => {
    const uri = u.value.trim();
    return uri ? [uri] : [];
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={done ? t.doneTitle : t.title}
      description={
        done || mode === "choose"
          ? undefined
          : format(t.step, { n: step, total: TOTAL_STEPS })
      }
      size="lg"
    >
      {done ? (
        <SuccessView
          clientId={state.clientId!}
          secret={state.secret}
          prompt={state.prompt}
          t={t}
          forms={forms}
          onClose={onClose}
        />
      ) : mode === "choose" ? (
        <ChooseView
          skillCmds={skillCmds}
          skillT={skillT}
          t={t}
          onManual={() => {
            dispatch({ type: "setError", error: "" });
            dispatch({ type: "setStep", step: 1 });
            setMode("manual");
          }}
        />
      ) : (
        <form action={action}>
          {/* serialized state — the action reads these names */}
          <input type="hidden" name="name" value={name} />
          <input type="hidden" name="redirectUris" value={cleanUris.join("\n")} />
          <input type="hidden" name="scopes" value={scopes.join(" ")} />

          {/* progress bar */}
          <div className="mb-5 flex gap-1.5" aria-hidden>
            {Array.from({ length: TOTAL_STEPS }, (_, i) => (
              <span
                key={i}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  i < step ? "bg-brand" : "bg-border"
                }`}
              />
            ))}
          </div>

          {step === 1 && (
            <div className="space-y-2">
              <h3 className="text-base font-semibold">{t.basicsTitle}</h3>
              <p className="help">{t.basicsDesc}</p>
              <label className="label mt-3" htmlFor="wiz-name">
                {t.nameLabel}
              </label>
              <input
                id="wiz-name"
                className="input"
                value={name}
                placeholder={t.namePlaceholder}
                onChange={(e) =>
                  dispatch({ type: "setName", name: e.target.value })
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    next();
                  }
                }}
              />
            </div>
          )}

          {step === 2 && (
            <div className="space-y-2">
              <h3 className="text-base font-semibold">{t.redirectsTitle}</h3>
              <p className="help">{t.redirectsDesc}</p>
              <label className="label mt-3">{t.redirectLabel}</label>
              <div className="space-y-2">
                {uris.map((uri, i) => (
                  <div key={uri.id} className="flex items-center gap-2">
                    <input
                      className="input"
                      value={uri.value}
                      aria-label={`${t.redirectLabel} ${i + 1}`}
                      placeholder={t.redirectPlaceholder}
                      onChange={(e) => setUri(uri.id, e.target.value)}
                      onKeyDown={(e) => {
                        // Without this, Enter in the lone URI field triggers the
                        // browser's implicit form submission — running the create
                        // action and skipping the scopes step. Advance instead.
                        if (e.key === "Enter") {
                          e.preventDefault();
                          next();
                        }
                      }}
                    />
                    {uris.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeUri(uri.id)}
                        aria-label={t.removeUri}
                        className="shrink-0 rounded-lg p-2 text-faint transition-colors hover:bg-surface-strong hover:text-danger"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={addUri}
                className="link inline-flex items-center gap-1.5 text-sm"
              >
                <Plus size={15} />
                {t.addUri}
              </button>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-2">
              <h3 className="text-base font-semibold">{t.scopesTitle}</h3>
              <p className="help">{t.scopesDesc}</p>
              <div className="mt-3 space-y-2">
                {supportedScopes.map((scope) => {
                  const checked = scopes.includes(scope);
                  return (
                    <label
                      key={scope}
                      className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
                        checked
                          ? "border-brand/50 bg-brand/10"
                          : "border-border bg-surface hover:bg-surface-strong"
                      }`}
                    >
                      <span
                        className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border transition-colors ${
                          checked
                            ? "border-brand bg-brand text-white"
                            : "border-border-strong"
                        }`}
                      >
                        {checked && <Check size={13} strokeWidth={3} />}
                      </span>
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={checked}
                        onChange={() => toggleScope(scope)}
                      />
                      <span className="min-w-0">
                        <span className="block font-mono text-sm font-medium">
                          {scope}
                        </span>
                        <span className="block text-sm text-muted">
                          {scopeInfo[scope] ?? scope}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {(error || (!state.ok && state.message)) && (
            <p className="mt-4 flex items-center gap-1.5 text-sm text-danger">
              <AlertTriangle size={14} />
              {error || state.message}
            </p>
          )}

          {/* footer */}
          <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
            <button
              type="button"
              onClick={back}
              className={`btn btn-ghost text-sm ${step === 1 ? "invisible" : ""}`}
            >
              {t.back}
            </button>
            {step < TOTAL_STEPS ? (
              <button
                key="wizard-next"
                type="button"
                onClick={next}
                className="btn btn-primary text-sm"
              >
                {t.next}
              </button>
            ) : (
              <button
                key="wizard-create"
                type="submit"
                className="btn btn-primary text-sm"
                disabled={pending}
              >
                {pending ? t.creating : t.create}
              </button>
            )}
          </div>
        </form>
      )}
    </Modal>
  );
}

/**
 * The popup's first screen: the recommended one-click integration on top, an
 * "or" divider, then a button to drop into the manual wizard below.
 */
function ChooseView({
  skillCmds,
  skillT,
  t,
  onManual,
}: {
  skillCmds: { sh: string; ps1: string };
  skillT: SkillDict;
  t: WizardDict;
  onManual: () => void;
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand text-white">
          <Sparkles size={18} />
        </span>
        <div>
          <h3 className="text-base font-semibold leading-tight">{skillT.heading}</h3>
          <p className="mt-1 text-sm text-muted">{skillT.desc}</p>
        </div>
      </div>

      <SkillInstall sh={skillCmds.sh} ps1={skillCmds.ps1} zipUrl="/api/skill" t={skillT} />

      <p className="text-xs text-faint">{skillT.flowNote}</p>

      {/* divider */}
      <div className="flex items-center gap-3" aria-hidden>
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs font-medium uppercase tracking-wide text-faint">
          {t.or}
        </span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">{t.manualHint}</p>
        <button type="button" onClick={onManual} className="btn btn-secondary text-sm">
          <PencilLine size={15} />
          {t.manual}
        </button>
      </div>
    </div>
  );
}

function SuccessView({
  clientId,
  secret,
  prompt,
  t,
  forms,
  onClose,
}: {
  clientId: string;
  secret?: string;
  prompt?: string;
  t: WizardDict;
  forms: FormsDict;
  onClose: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-xl border border-success/30 bg-success/10 p-3">
        <Check size={16} className="mt-0.5 shrink-0 text-success" />
        <p className="text-sm text-muted">{t.doneDesc}</p>
      </div>

      <div className="sunken space-y-3 p-4 font-mono text-xs break-all">
        <div>
          <span className="block text-faint">{t.clientId}</span>
          <span className="flex items-center justify-between gap-3">
            <span>{clientId}</span>
            <CopyButton text={clientId} t={forms} />
          </span>
        </div>
        {secret && (
          <div className="border-t border-border pt-3">
            <span className="block text-faint">{t.clientSecret}</span>
            <span className="flex items-center justify-between gap-3">
              <span>{secret}</span>
              <CopyButton text={secret} t={forms} />
            </span>
          </div>
        )}
      </div>

      {prompt && <OneShotPrompt prompt={prompt} t={forms} />}

      <div className="flex justify-end border-t border-border pt-4">
        <button type="button" onClick={onClose} className="btn btn-primary text-sm">
          {t.done}
        </button>
      </div>
    </div>
  );
}
