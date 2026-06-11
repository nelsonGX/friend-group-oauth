import Link from "next/link";
import { Coins, ArrowRight } from "lucide-react";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";

type TopUpPanelDict = Dictionary["explore"]["topup"];

/** Entry point to the USDT top-up flow, shown in the member wallet sidebar. */
export function TopUpPanel({ t }: { t: TopUpPanelDict }) {
  return (
    <section className="card card-hover-border p-6">
      <div className="flex items-center gap-2.5">
        <Coins size={18} className="text-brand-soft" />
        <h2 className="text-lg font-semibold">{t.heading}</h2>
      </div>
      <p className="mt-1 text-sm text-muted">{t.desc}</p>
      <Link href="/topup" className="btn btn-primary mt-4 w-full text-sm">
        <Coins size={15} />
        {t.cta}
        <ArrowRight size={15} />
      </Link>
    </section>
  );
}
