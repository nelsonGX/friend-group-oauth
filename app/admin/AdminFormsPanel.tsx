"use client";

import type { RefObject } from "react";
import { GrantCreditsForm } from "./GrantCreditsForm";
import { NewClientForm } from "./NewClientForm";
import { NewRedeemCodeForm } from "./NewRedeemCodeForm";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";

type AdminDict = Dictionary["admin"];

export function AdminFormsPanel({
  grantRef,
  grantId,
  setGrantId,
  t,
}: {
  grantRef: RefObject<HTMLDivElement | null>;
  grantId: string;
  setGrantId: (value: string) => void;
  t: AdminDict;
}) {
  return (
    <div className="mt-7 grid gap-5 md:grid-cols-2">
      <section
        ref={grantRef}
        className="reveal card card-hover-border p-6"
        style={{ animationDelay: "120ms" }}
      >
        <h2 className="font-semibold">{t.grantCredits}</h2>
        <p className="mb-4 mt-1 text-sm text-muted">{t.grantCreditsDesc}</p>
        <GrantCreditsForm
          t={t.forms}
          discordId={grantId}
          onDiscordIdChange={setGrantId}
        />
      </section>

      <section
        className="reveal card card-hover-border p-6"
        style={{ animationDelay: "180ms" }}
      >
        <h2 className="font-semibold">{t.registerProvider}</h2>
        <p className="mb-4 mt-1 text-sm text-muted">{t.registerProviderDesc}</p>
        <NewClientForm t={t.forms} />
      </section>

      <section
        className="reveal card card-hover-border p-6"
        style={{ animationDelay: "240ms" }}
      >
        <h2 className="font-semibold">{t.createRedeemCode}</h2>
        <p className="mb-4 mt-1 text-sm text-muted">{t.createRedeemCodeDesc}</p>
        <NewRedeemCodeForm t={t.forms} />
      </section>
    </div>
  );
}
