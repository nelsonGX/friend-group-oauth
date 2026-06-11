import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Coins, ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { getDictionary } from "@/lib/i18n";
import { getChain } from "@/lib/chains";
import { qrDataUrl } from "@/lib/qr";
import {
  getOrCreateDepositAddress,
  getTopupConfig,
  listUserDeposits,
  microsToUsdtString,
  toChecksumAddress,
} from "@/lib/topups";
import { DepositView, type DepositRow } from "./DepositView";

export const metadata: Metadata = {
  title: "Top up | Friend Group Auth",
  description: "Add credits with USDT.",
};

/** The member-facing crypto top-up page: a personal deposit address + history. */
export default async function TopupPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?return=/topup");
  if (!user.inGuild) redirect("/no-access");

  const [{ t }, config] = await Promise.all([getDictionary(), getTopupConfig()]);
  const tp = t.topup;
  const allowed = user.allowed || user.isAdmin;

  if (!allowed || !config.enabled) {
    return (
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-10">
        <Link href="/explore" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
          <ArrowLeft size={15} />
          {tp.backToExplore}
        </Link>
        <div className="reveal card card-hover mt-8 p-8 text-center">
          <h1 className="text-lg font-semibold">{allowed ? tp.disabledTitle : tp.heading}</h1>
          <p className="mt-2 text-sm text-muted">{allowed ? tp.disabledDesc : tp.notAllowed}</p>
        </div>
      </main>
    );
  }

  const address = await getOrCreateDepositAddress(user.id);
  const checksummed = toChecksumAddress(address);
  const [qr, deposits] = await Promise.all([
    qrDataUrl(checksummed),
    listUserDeposits(user.id),
  ]);

  const rows: DepositRow[] = deposits.map((d) => {
    const chain = getChain(d.chainId);
    return {
      id: d.id,
      network: chain?.name ?? String(d.chainId),
      token: d.token,
      amount: microsToUsdtString(d.valueMicros),
      credits: d.credits,
      time: d.createdAt.toISOString().slice(0, 16).replace("T", " "),
      txUrl: chain ? `${chain.explorerTxBase}${d.txHash}` : null,
    };
  });

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-10">
      <Link href="/explore" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft size={15} />
        {tp.backToExplore}
      </Link>

      <div className="reveal mt-6">
        <div className="flex items-center gap-2.5">
          <Coins size={20} className="text-brand-soft" />
          <h1 className="text-xl font-semibold">{tp.heading}</h1>
        </div>
        <p className="mt-1.5 max-w-xl text-sm text-muted">{tp.desc}</p>
      </div>

      <DepositView
        address={checksummed}
        qr={qr}
        rate={config.creditsPerUsdt}
        networks={config.chains.map((c) => ({ name: c.name, network: c.network }))}
        initialDeposits={rows}
        t={tp}
      />
    </main>
  );
}
