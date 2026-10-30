"use client";

import { useEffect, useSyncExternalStore } from "react";
import { CHANGELOG_SEEN_KEY, LATEST_CHANGELOG } from "@/lib/changelog";

// localStorage can throw (private mode, blocked storage): treat as "seen".
function readSeen(): string | null {
  try {
    return localStorage.getItem(CHANGELOG_SEEN_KEY);
  } catch {
    return LATEST_CHANGELOG;
  }
}
const subscribe = (onChange: () => void) => {
  window.addEventListener("storage", onChange);
  window.addEventListener("changelog-seen", onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener("changelog-seen", onChange);
  };
};

/** Small dot next to the "What's new" link until the latest notes are read. */
export function ChangelogDot() {
  const unseen = useSyncExternalStore(
    subscribe,
    () => readSeen() !== LATEST_CHANGELOG,
    () => false,
  );
  if (!unseen) return null;
  return (
    <span
      className="ml-1 inline-block h-2 w-2 rounded-full bg-ball align-middle"
      aria-hidden="true"
    />
  );
}

/** Rendered on the changelog page: marks the latest notes as read. */
export function MarkChangelogSeen() {
  useEffect(() => {
    try {
      localStorage.setItem(CHANGELOG_SEEN_KEY, LATEST_CHANGELOG);
      window.dispatchEvent(new Event("changelog-seen"));
    } catch {
      // Storage unavailable: the dot simply stays hidden next time.
    }
  }, []);
  return null;
}
