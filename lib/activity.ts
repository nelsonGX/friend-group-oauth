import { format } from "@/lib/i18n/format";
import type { ActivityEntry } from "@/lib/credits";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";

/** Human label for a wallet activity row, derived from its kind + counterparty. */
export function activityLabel(entry: ActivityEntry, d: Dictionary["dashboard"]): string {
  const name = entry.counterpartyName ?? d.someone;
  switch (entry.kind) {
    case "transfer_out":
      return format(d.transferOut, { name });
    case "transfer_in":
      return format(d.transferIn, { name });
    case "income":
      return format(d.paymentFrom, { name });
    case "app_payout":
      return (
        entry.reason ??
        (entry.appName ? format(d.payoutFrom, { name: entry.appName }) : d.topUp)
      );
    case "charge":
      return (
        entry.reason ??
        (entry.appName ? format(d.paymentTo, { name: entry.appName }) : d.charge)
      );
    case "topup":
      return entry.reason ?? d.topUp;
    case "redeem":
      return entry.reason ?? d.redeem;
    case "withdrawal":
      return entry.reason ?? d.withdrawal;
    case "withdrawal_refund":
      return entry.reason ?? d.withdrawalRefund;
    case "app_fund":
      return (
        entry.reason ??
        (entry.appName ? format(d.appFund, { name: entry.appName }) : d.charge)
      );
    case "app_withdrawal":
      return (
        entry.reason ??
        (entry.appName
          ? format(d.appWithdrawal, { name: entry.appName })
          : d.topUp)
      );
    default:
      return entry.reason ?? (entry.delta > 0 ? d.topUp : d.charge);
  }
}
