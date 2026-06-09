"use client";

import { useEffect, useState } from "react";
import { useNProgress } from "@tanem/react-nprogress";

/**
 * A slim, top-of-page progress bar that animates while a network request is in
 * flight. We patch window.fetch and keep a count of active requests: the App
 * Router dispatches both RSC navigations and server-action submissions through
 * fetch, so every "api call" lights up the bar without each form having to wire
 * it up. Background route prefetches are ignored so the bar doesn't flicker on
 * hover/scroll.
 */
export function TopProgress() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const original = window.fetch;
    const boundFetch = original.bind(window);
    let mounted = true;

    const settle = () =>
      mounted && setActive((n) => Math.max(0, n - 1));

    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      if (isPrefetch(input, init)) return boundFetch(input, init);
      if (mounted) setActive((n) => n + 1);
      return boundFetch(input, init).then(
        (res) => {
          settle();
          return res;
        },
        (err) => {
          settle();
          throw err;
        },
      );
    };

    return () => {
      mounted = false;
      window.fetch = original;
    };
  }, []);

  const { animationDuration, isFinished, progress } = useNProgress({
    isAnimating: active > 0,
  });

  return (
    <div
      aria-hidden
      style={{
        opacity: isFinished ? 0 : 1,
        pointerEvents: "none",
        transition: `opacity ${animationDuration}ms linear`,
      }}
    >
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          zIndex: 100,
          height: 2,
          width: "100%",
          background: "var(--color-brand-soft)",
          boxShadow:
            "0 0 8px var(--color-brand-soft), 0 0 4px var(--color-brand)",
          transform: `translate3d(${(-1 + progress) * 100}%, 0, 0)`,
          transition: `transform ${animationDuration}ms linear`,
        }}
      />
    </div>
  );
}

/**
 * Next prefetches routes in the background (on hover, on viewport entry). Those
 * carry the Next-Router-Prefetch header — skip them so the bar only reflects
 * navigations the user is actually waiting on, plus server actions.
 */
function isPrefetch(input: RequestInfo | URL, init?: RequestInit): boolean {
  const headers =
    input instanceof Request ? input.headers : new Headers(init?.headers);
  return (
    headers.has("Next-Router-Prefetch") ||
    headers.get("purpose") === "prefetch"
  );
}
