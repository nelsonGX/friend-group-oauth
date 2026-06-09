import { redirect } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { getDictionary } from "@/lib/i18n";
import { getHandoffByPublicId } from "@/lib/handoff";
import { HandoffApproval } from "./HandoffApproval";

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 items-center justify-center p-6">{children}</main>
  );
}

/**
 * Phone-side approval for a cross-device login hand-off. The QR shown on another
 * device points here; after the user signs in (the normal Discord flow) and
 * approves, the waiting browser is signed in as this user on its next poll.
 */
export default async function HandoffPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { t } = await getDictionary();
  const h = t.handoff;

  // Require a logged-in session; come back here afterwards to approve.
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/login?return=${encodeURIComponent(`/handoff/${id}`)}`);
  }

  const handoff = await getHandoffByPublicId(id);
  if (!handoff) {
    return (
      <Centered>
        <div className="reveal card card-hover w-full max-w-md border-danger/30 p-8 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl border border-danger/30 bg-danger/10 text-danger">
            <TriangleAlert size={24} strokeWidth={1.7} />
          </span>
          <h1 className="mt-4 text-lg font-semibold text-danger">
            {h.expiredTitle}
          </h1>
          <p className="mt-2 text-sm text-muted">{h.expiredBody}</p>
        </div>
      </Centered>
    );
  }

  const displayName = user.globalName ?? user.username;

  return (
    <Centered>
      <HandoffApproval publicId={handoff.publicId} displayName={displayName} t={h} />
    </Centered>
  );
}
