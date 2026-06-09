"use client";

import { useActionState } from "react";
import { regenerateSecret, type SecretState } from "./actions";

const initial: SecretState = { ok: false, message: "" };

export function RegenerateSecret({ clientId }: { clientId: string }) {
  const [state, action, pending] = useActionState(regenerateSecret, initial);
  return (
    <div className="mt-2">
      <form action={action}>
        <input type="hidden" name="clientId" value={clientId} />
        <button
          className="text-sm underline opacity-70 hover:opacity-100 disabled:opacity-40"
          disabled={pending}
        >
          {pending ? "Regenerating…" : "Regenerate secret"}
        </button>
      </form>
      {state.message && (
        <p
          className={`mt-1 text-sm ${
            state.ok ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
          }`}
        >
          {state.message}
        </p>
      )}
      {state.ok && state.secret && (
        <div className="mt-1 rounded-md bg-black/5 dark:bg-white/10 p-2 font-mono text-xs break-all">
          {state.secret}
        </div>
      )}
    </div>
  );
}
