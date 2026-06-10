"use client";

import { useEffect, useReducer, useState } from "react";
import { Check, Copy, Database, RefreshCw, Search, Trash2, User } from "lucide-react";
import {
  deleteAppDataEntry,
  fetchAppData,
  type AppDataResult,
  type AppDataRow,
} from "./actions";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";

type DataDict = Dictionary["dashboard"]["data"];
type Scope = "app" | "user";
type Stats = AppDataResult["stats"];

/** Stable React/identity key for a row (keys aren't unique across users). */
function rowId(r: AppDataRow): string {
  return `${r.userId ?? "app"} ${r.key}`;
}

interface State {
  scope: Scope;
  draft: string;
  prefix: string;
  entries: AppDataRow[];
  nextCursor: string | null;
  stats: Stats;
  loading: boolean;
  loadingMore: boolean;
  error: boolean;
  confirmId: string | null;
  deletingId: string | null;
}

type Action =
  | { type: "setDraft"; value: string }
  | { type: "switchScope"; scope: Scope }
  | { type: "search"; prefix: string }
  | { type: "loadStart" }
  | { type: "loadOk"; result: AppDataResult }
  | { type: "loadError" }
  | { type: "loadMoreStart" }
  | { type: "loadMoreOk"; result: AppDataResult }
  | { type: "loadMoreError" }
  | { type: "confirm"; id: string }
  | { type: "cancelConfirm" }
  | { type: "deleteStart"; id: string }
  | { type: "deleteEnd" };

const initialState: State = {
  scope: "app",
  draft: "",
  prefix: "",
  entries: [],
  nextCursor: null,
  stats: { appKeys: 0, userKeys: 0, users: 0 },
  loading: true,
  loadingMore: false,
  error: false,
  confirmId: null,
  deletingId: null,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "setDraft":
      return { ...state, draft: action.value };
    case "switchScope":
      return {
        ...state,
        scope: action.scope,
        draft: "",
        prefix: "",
        loading: true,
        error: false,
        confirmId: null,
      };
    case "search":
      return { ...state, prefix: action.prefix, loading: true, confirmId: null };
    case "loadStart":
      return { ...state, loading: true, error: false, confirmId: null };
    case "loadOk":
      return {
        ...state,
        entries: action.result.entries,
        nextCursor: action.result.nextCursor,
        stats: action.result.stats,
        loading: false,
        error: false,
        confirmId: null,
      };
    case "loadError":
      return { ...state, loading: false, error: true, entries: [], nextCursor: null };
    case "loadMoreStart":
      return { ...state, loadingMore: true };
    case "loadMoreOk":
      return {
        ...state,
        entries: [...state.entries, ...action.result.entries],
        nextCursor: action.result.nextCursor,
        stats: action.result.stats,
        loadingMore: false,
      };
    case "loadMoreError":
      return { ...state, loadingMore: false };
    case "confirm":
      return { ...state, confirmId: action.id };
    case "cancelConfirm":
      return { ...state, confirmId: null };
    case "deleteStart":
      return { ...state, deletingId: action.id };
    case "deleteEnd":
      return { ...state, deletingId: null };
  }
}

/**
 * The "Data" tab of an app's management modal: browse the JSON the app has
 * stored, by scope (app-global vs per-user), with a key-prefix filter, keyset
 * "load more" paging, and per-key delete. All reads/writes go through the
 * owner-gated server actions in ./actions. State is a reducer so the mount/scope
 * effect dispatches (rather than calling setState synchronously) on load.
 */
export function AppDataViewer({
  clientId,
  t,
}: {
  clientId: string;
  t: DataDict;
}) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const { scope, draft, prefix, entries, nextCursor, stats } = state;

  async function load(nextScope: Scope, nextPrefix: string) {
    const res = await fetchAppData({
      clientId,
      scope: nextScope,
      prefix: nextPrefix || undefined,
    });
    dispatch(res.ok ? { type: "loadOk", result: res } : { type: "loadError" });
  }

  // Reload from the top whenever the scope changes (and on first mount).
  // Switching scope clears the filter, so the effect always loads unfiltered.
  useEffect(() => {
    void load(scope, "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  async function loadMore() {
    if (!nextCursor || state.loadingMore) return;
    dispatch({ type: "loadMoreStart" });
    const res = await fetchAppData({
      clientId,
      scope,
      prefix: prefix || undefined,
      cursor: nextCursor,
    });
    dispatch(res.ok ? { type: "loadMoreOk", result: res } : { type: "loadMoreError" });
  }

  function onSearch(e: React.FormEvent) {
    e.preventDefault();
    const next = draft.trim();
    dispatch({ type: "search", prefix: next });
    void load(scope, next);
  }

  async function onDelete(r: AppDataRow) {
    const id = rowId(r);
    dispatch({ type: "deleteStart", id });
    const res = await deleteAppDataEntry({
      clientId,
      scope,
      userId: r.userId,
      key: r.key,
    });
    dispatch({ type: "deleteEnd" });
    if (res.ok) {
      dispatch({ type: "loadStart" });
      await load(scope, prefix);
    } else {
      dispatch({ type: "cancelConfirm" });
    }
  }

  const scopes: { key: Scope; label: string }[] = [
    { key: "app", label: t.scopeApp },
    { key: "user", label: t.scopeUser },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold">{t.title}</h4>
          <p className="mt-1 text-sm text-muted">{t.desc}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            dispatch({ type: "loadStart" });
            void load(scope, prefix);
          }}
          className="btn btn-ghost shrink-0 py-1.5! text-sm"
          disabled={state.loading}
        >
          <RefreshCw size={15} className={state.loading ? "animate-spin" : ""} />
          {t.refresh}
        </button>
      </div>

      {/* scope toggle + counts */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="tablist">
          {scopes.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => scope !== s.key && dispatch({ type: "switchScope", scope: s.key })}
              className={`tab ${scope === s.key ? "tab-active" : ""}`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <span className="badge">
          {scope === "app"
            ? t.appCount.replace("{n}", String(stats.appKeys))
            : t.userCount
                .replace("{n}", String(stats.userKeys))
                .replace("{u}", String(stats.users))}
        </span>
      </div>

      {/* prefix filter */}
      <form onSubmit={onSearch} className="relative">
        <Search
          size={15}
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint"
        />
        <input
          className="input pl-9"
          value={draft}
          onChange={(e) => dispatch({ type: "setDraft", value: e.target.value })}
          placeholder={t.searchPlaceholder}
          aria-label={t.searchPlaceholder}
        />
      </form>

      {/* list */}
      {state.loading ? (
        <p className="py-10 text-center text-sm text-muted">{t.loading}</p>
      ) : state.error ? (
        <p className="py-10 text-center text-sm text-danger">{t.error}</p>
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <Database size={22} className="text-faint" />
          <p className="text-sm text-muted">
            {prefix ? t.emptyFiltered : t.empty}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {entries.map((r) => {
            const id = rowId(r);
            const confirming = state.confirmId === id;
            const deleting = state.deletingId === id;
            return (
              <li key={id} className="sunken p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-semibold break-all">
                      {r.key}
                    </span>
                    {r.userId !== null && (
                      <span className="badge">
                        <User size={12} />
                        {r.userLabel ?? t.unknownUser}
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className="text-xs text-faint">
                      {t.updated.replace("{date}", r.updatedAt)}
                    </span>
                    <CopyValue text={r.valueJson} t={t} />
                    {confirming ? (
                      <span className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => dispatch({ type: "cancelConfirm" })}
                          className="btn btn-ghost py-1! text-xs"
                          disabled={deleting}
                        >
                          {t.cancel}
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(r)}
                          className="btn btn-danger py-1! text-xs"
                          disabled={deleting}
                        >
                          <Trash2 size={13} />
                          {deleting ? t.deleting : t.confirmYes}
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => dispatch({ type: "confirm", id })}
                        aria-label={t.delete}
                        title={t.delete}
                        className="rounded-lg p-1.5 text-faint transition-colors hover:bg-surface-strong hover:text-danger"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </div>
                {confirming && (
                  <p className="mt-2 text-xs text-danger">{t.deleteConfirm}</p>
                )}
                <pre className="mt-2 max-h-56 overflow-auto font-mono text-xs whitespace-pre-wrap wrap-break-word text-muted">
{r.valueJson}
                </pre>
              </li>
            );
          })}
        </ul>
      )}

      {nextCursor && !state.loading && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={loadMore}
            className="btn btn-secondary text-sm"
            disabled={state.loadingMore}
          >
            {state.loadingMore ? t.loading : t.loadMore}
          </button>
        </div>
      )}
    </div>
  );
}

function CopyValue({ text, t }: { text: string; t: DataDict }) {
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
      aria-label={t.copy}
      title={copied ? t.copied : t.copy}
      className="rounded-lg p-1.5 text-faint transition-colors hover:bg-surface-strong hover:text-ink"
    >
      {copied ? <Check size={15} /> : <Copy size={15} />}
    </button>
  );
}
