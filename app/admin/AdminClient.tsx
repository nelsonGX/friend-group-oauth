"use client";

import { useRef, useState } from "react";
import { AdminFormsPanel } from "./AdminFormsPanel";
import { ProvidersSection } from "./ProvidersSection";
import { RedeemCodesSection } from "./RedeemCodesSection";
import { UsersSection } from "./UsersSection";
import { WithdrawalsSection } from "./WithdrawalsSection";
import type {
  AdminProviderRow,
  AdminRedeemRow,
  AdminUserRow,
  AdminWithdrawalView,
} from "./AdminTypes";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";

type AdminDict = Dictionary["admin"];

/**
 * Interactive admin surface. Section-local filters live with each table; this
 * coordinator only owns the grant target so user rows can prefill the form.
 */
export function AdminClient({
  users,
  providers,
  redeemCodes,
  withdrawals,
  t,
}: {
  users: AdminUserRow[];
  providers: AdminProviderRow[];
  redeemCodes: AdminRedeemRow[];
  withdrawals: AdminWithdrawalView[];
  t: AdminDict;
}) {
  const [grantId, setGrantId] = useState("");
  const grantRef = useRef<HTMLDivElement>(null);

  function targetUser(discordId: string) {
    setGrantId(discordId);
    grantRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <>
      <AdminFormsPanel
        grantRef={grantRef}
        grantId={grantId}
        setGrantId={setGrantId}
        t={t}
      />
      <ProvidersSection providers={providers} t={t} />
      <RedeemCodesSection redeemCodes={redeemCodes} t={t} />
      <WithdrawalsSection withdrawals={withdrawals} t={t} />
      <UsersSection users={users} onGrant={targetUser} t={t} />
    </>
  );
}
