import { getCurrentUser } from "@/lib/session";
import { getChain } from "@/lib/chains";
import { microsToUsdtString, refreshUserDeposits } from "@/lib/topups";

/**
 * On-demand deposit check for the signed-in member. The top-up page calls this
 * while open; it nudges a (throttled) blockchain scan of the member's own
 * address and returns their settled deposits. Owner-scoped — only ever the
 * caller's own deposits.
 */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const deposits = await refreshUserDeposits(user.id);
  return Response.json(
    {
      deposits: deposits.map((d) => {
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
      }),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
