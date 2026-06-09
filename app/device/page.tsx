import { redirect } from "next/navigation";
import { TriangleAlert, KeyRound } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { getDictionary } from "@/lib/i18n";
import { getPendingByUserCode, normalizeUserCode, formatUserCode } from "@/lib/devices";
import { DeviceApproval } from "./DeviceApproval";

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 items-center justify-center p-6">{children}</main>
  );
}

/**
 * Browser approval screen for the device flow. A coding-agent skill sends the
 * user here (with `?code=USER_CODE`); after the user reviews and approves, the
 * skill's next poll receives the freshly created client credentials.
 */
export default async function DevicePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const { t } = await getDictionary();
  const d = t.device;
  const raw = Array.isArray(sp.code) ? sp.code[0] : sp.code;
  const code = raw ? normalizeUserCode(raw) : "";

  // Require a logged-in session; come back here afterwards.
  const user = await getCurrentUser();
  if (!user) {
    const back = code ? `/device?code=${encodeURIComponent(code)}` : "/device";
    redirect(`/login?return=${encodeURIComponent(back)}`);
  }

  if (!user.allowed && !user.isAdmin) {
    return (
      <Centered>
        <div className="reveal card w-full max-w-md border-danger/30 p-8 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl border border-danger/30 bg-danger/10 text-danger">
            <TriangleAlert size={24} strokeWidth={1.7} />
          </span>
          <h1 className="mt-4 text-lg font-semibold text-danger">{d.title}</h1>
          <p className="mt-2 text-sm text-muted">{d.needAccess}</p>
        </div>
      </Centered>
    );
  }

  const pending = code ? await getPendingByUserCode(code) : null;

  // No (valid) code yet — prompt the user to enter the one their agent printed.
  if (!pending) {
    return (
      <Centered>
        <div className="reveal card w-full max-w-md p-8">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-surface-strong text-brand-soft">
              <KeyRound size={20} strokeWidth={1.7} />
            </span>
            <div>
              <p className="text-xs uppercase tracking-wide text-faint">
                {d.title}
              </p>
              <h1 className="text-xl font-semibold leading-tight">
                {d.enterCodeTitle}
              </h1>
            </div>
          </div>
          <p className="mt-4 text-sm text-muted">
            {code ? d.codeNotFound : d.enterCodeDesc}
          </p>
          <form method="get" action="/device" className="mt-5 space-y-3">
            <input
              className="input text-center font-mono tracking-widest uppercase"
              name="code"
              placeholder="XXXX-XXXX"
              defaultValue={code ? formatUserCode(code) : ""}
              autoFocus
            />
            <button className="btn btn-primary w-full" type="submit">
              {d.continue}
            </button>
          </form>
        </div>
      </Centered>
    );
  }

  return (
    <Centered>
      <DeviceApproval
        userCode={pending.userCode}
        name={pending.requestedName}
        redirectUris={pending.requestedRedirectUris}
        scopes={pending.requestedScopes}
        scopeLabels={t.authorize.scopes}
        t={d}
      />
    </Centered>
  );
}
