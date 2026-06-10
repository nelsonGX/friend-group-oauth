"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";

type SkillDict = Dictionary["dashboard"]["skill"];

function CommandRow({
  label,
  command,
  copyLabel,
  copiedLabel,
}: {
  label: string;
  command: string;
  copyLabel: string;
  copiedLabel: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-faint">
        {label}
      </p>
      <div className="sunken mt-1 flex items-center gap-2 rounded-lg p-2">
        <code className="flex-1 overflow-x-auto whitespace-nowrap px-1 font-mono text-xs text-muted">
          {command}
        </code>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(command);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              setCopied(false);
            }
          }}
          className={`${copied ? "btn btn-secondary" : "btn btn-primary"} shrink-0 py-1.5! text-xs`}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? copiedLabel : copyLabel}
        </button>
      </div>
    </div>
  );
}

/** A copyable block for longer, wrapping text (the starter prompt). */
function PromptBlock({
  text,
  copyLabel,
  copiedLabel,
}: {
  text: string;
  copyLabel: string;
  copiedLabel: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="sunken rounded-lg p-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm leading-relaxed text-muted">{text}</p>
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
          className={`${copied ? "btn btn-secondary" : "btn btn-primary"} shrink-0 py-1.5! text-xs`}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? copiedLabel : copyLabel}
        </button>
      </div>
    </div>
  );
}

/** The "install with one command" block for the dashboard's integration panel. */
export function SkillInstall({
  sh,
  ps1,
  zipUrl,
  t,
}: {
  sh: string;
  ps1: string;
  zipUrl: string;
  t: SkillDict;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">{t.installCommand}</p>
      <CommandRow label={t.macLinux} command={sh} copyLabel={t.copy} copiedLabel={t.copied} />
      <CommandRow label={t.windows} command={ps1} copyLabel={t.copy} copiedLabel={t.copied} />
      <div className="pt-1">
        <p className="text-sm font-medium">{t.promptLabel}</p>
        <div className="mt-1.5">
          <PromptBlock text={t.examplePrompt} copyLabel={t.copy} copiedLabel={t.copied} />
        </div>
      </div>
      <p className="text-xs text-faint">
        {t.installNote}{" "}
        <a href={zipUrl} className="underline hover:text-muted" download>
          {t.orDownload}
        </a>
        .
      </p>
    </div>
  );
}
