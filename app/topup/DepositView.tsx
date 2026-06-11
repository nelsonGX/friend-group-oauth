"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { Copy, Check, RefreshCw, AlertTriangle, ExternalLink } from "lucide-react";
import { format } from "@/lib/i18n/format";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";

type TopupDict = Dictionary["topup"];

export interface DepositRow {
  id: string;
  network: string;
  token: string;
  amount: string;
  credits: number;
  time: string;
  txUrl: string | null;
}

const AUTO_REFRESH_MS = 12000;

export function DepositView({
  address,
  qr,
  rate,
  networks,
  initialDeposits,
  t,
}: {
  address: string;
  qr: string;
  rate: number;
  networks: { name: string; network: string }[];
  initialDeposits: DepositRow[];
  t: TopupDict;
}) {
  const [deposits, setDeposits] = useState<DepositRow[]>(initialDeposits);
  const [copied, setCopied] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [estimate, setEstimate] = useState("");

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/topups/refresh", { method: "POST", cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as { deposits: DepositRow[] };
        if (Array.isArray(data.deposits)) setDeposits(data.deposits);
      }
    } catch {
      // transient — the next tick retries
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Quietly poll for new deposits while the page is open.
  useEffect(() => {
    const id = setInterval(() => refresh(), AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [refresh]);

  const estCredits = (() => {
    const n = Number(estimate);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.floor(n * rate);
  })();

  return (
    <>
      <section className="reveal card card-hover-border mt-8 p-6" style={{ animationDelay: "60ms" }}>
        <h2 className="text-lg font-semibold">{t.addressHeading}</h2>
        <p className="mt-1 text-sm text-muted">{t.addressDesc}</p>

        {qr && (
          <div className="mt-5 flex justify-center">
            <div className="rounded-2xl bg-white p-3">
              <Image src={qr} alt={address} width={168} height={168} unoptimized />
            </div>
          </div>
        )}

        <div className="sunken mt-4 flex items-center gap-2 rounded-lg p-2">
          <code className="flex-1 overflow-x-auto whitespace-nowrap px-1 font-mono text-xs sm:text-sm">
            {address}
          </code>
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(address);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              } catch {
                setCopied(false);
              }
            }}
            className={`${copied ? "btn btn-secondary" : "btn btn-primary"} shrink-0 py-1.5! text-xs`}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? t.copied : t.copyAddress}
          </button>
        </div>

        <p className="mt-3 text-xs text-faint">{format(t.rateNote, { rate })}</p>

        {/* supported networks */}
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-faint">{t.networksLabel}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {networks.map((n) => (
              <span key={n.network} className="badge">
                {n.network}
              </span>
            ))}
          </div>
        </div>

        <p className="mt-4 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{t.important}</span>
        </p>

        {/* estimator */}
        <div className="mt-4">
          <label htmlFor="topup-estimate" className="text-sm font-medium">
            {t.estimatorLabel}
          </label>
          <div className="mt-1.5 flex items-center gap-3">
            <input
              id="topup-estimate"
              className="input"
              type="number"
              min={0}
              step="any"
              inputMode="decimal"
              placeholder={t.estimatorPlaceholder}
              value={estimate}
              onChange={(e) => setEstimate(e.target.value)}
            />
            <span className="shrink-0 text-sm text-muted">
              {format(t.estimatorResult, { credits: estCredits })}
            </span>
          </div>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            className="btn btn-ghost text-sm"
          >
            <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
            {refreshing ? t.refreshing : t.refresh}
          </button>
          <span className="text-xs text-faint">{t.refreshHint}</span>
        </div>
      </section>

      <section className="reveal mt-8" style={{ animationDelay: "120ms" }}>
        <h2 className="text-lg font-semibold">{t.historyHeading}</h2>
        {deposits.length === 0 ? (
          <p className="mt-3 text-sm text-muted">{t.noDeposits}</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-faint">
                  <th className="py-2 pr-4 font-medium">{t.thDate}</th>
                  <th className="py-2 pr-4 font-medium">{t.thNetwork}</th>
                  <th className="py-2 pr-4 font-medium">{t.thAmount}</th>
                  <th className="py-2 pr-4 font-medium">{t.thCredits}</th>
                  <th className="py-2 font-medium">{t.thTx}</th>
                </tr>
              </thead>
              <tbody>
                {deposits.map((d) => (
                  <tr key={d.id} className="border-b border-border/60">
                    <td className="py-2.5 pr-4 text-muted">{d.time}</td>
                    <td className="py-2.5 pr-4 text-muted">{d.network}</td>
                    <td className="py-2.5 pr-4 font-mono text-xs">
                      {d.amount} {d.token}
                    </td>
                    <td className="py-2.5 pr-4 font-medium text-success">+{d.credits}</td>
                    <td className="py-2.5">
                      {d.txUrl ? (
                        <a
                          href={d.txUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-brand-soft hover:underline"
                        >
                          {t.viewTx}
                          <ExternalLink size={13} />
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
