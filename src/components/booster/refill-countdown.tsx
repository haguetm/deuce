"use client";

import { useEffect, useSyncExternalStore } from "react";

function subscribe(onTick: () => void) {
  const id = setInterval(onTick, 1000);
  return () => clearInterval(id);
}
// Rounded to the second so consecutive reads within a tick are identical.
const clientNow = () => Math.floor(Date.now() / 1000) * 1000;
// Server render has no clock: placeholder, so server and client HTML match.
const serverNow = () => null;

/** mm:ss until `target`; calls onElapsed once when it reaches zero. */
export function RefillCountdown({
  target,
  onElapsed,
}: {
  target: string;
  onElapsed?: () => void;
}) {
  const now = useSyncExternalStore(subscribe, clientNow, serverNow);
  const remaining =
    now === null ? null : Math.max(0, new Date(target).getTime() - now);

  useEffect(() => {
    if (remaining === 0) onElapsed?.();
  }, [remaining, onElapsed]);

  if (remaining === null) return <time dateTime={target}>--:--</time>;
  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  return (
    <time
      dateTime={target}
    >{`${minutes}:${String(seconds).padStart(2, "0")}`}</time>
  );
}
