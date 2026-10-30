"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import {
  deletePushAction,
  getPushAction,
  savePushAction,
} from "@/app/[locale]/profile/actions";

const VAPID_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = (value + "=".repeat((4 - (value.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

type Support = "checking" | "unsupported" | "ready";

const noSubscribe = () => () => {};
// Client-only capability check; null during the server render.
const capableNow = () =>
  Boolean(VAPID_KEY) && "serviceWorker" in navigator && "PushManager" in window;

/**
 * Opt-in reminders on this device: full stock and the evening streak
 * reminder. Uses the service worker in public/sw.js; nothing is asked or
 * sent until the player turns it on.
 */
export function PushPanel() {
  const t = useTranslations("push");
  const capable = useSyncExternalStore(noSubscribe, capableNow, () => null);
  const [registered, setRegistered] = useState<Support>("checking");
  const support: Support = capable === false ? "unsupported" : registered;
  const [subscription, setSubscription] = useState<PushSubscription | null>(
    null,
  );
  const [prefs, setPrefs] = useState({ stockFull: true, streak: true });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!capable) return;
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => reg.pushManager.getSubscription())
      .then(async (sub) => {
        setSubscription(sub);
        if (sub) {
          const saved = await getPushAction(sub.endpoint);
          if (saved)
            setPrefs({ stockFull: saved.stock_full, streak: saved.streak });
        }
        setRegistered("ready");
      })
      .catch(() => setRegistered("unsupported"));
  }, [capable]);

  const save = async (sub: PushSubscription, next: typeof prefs) => {
    const json = sub.toJSON();
    const result = await savePushAction({
      endpoint: sub.endpoint,
      p256dh: json.keys?.p256dh ?? "",
      auth: json.keys?.auth ?? "",
      stockFull: next.stockFull,
      streak: next.streak,
    });
    setError(result.ok ? null : t("error"));
  };

  const enable = async () => {
    setError(null);
    if ((await Notification.requestPermission()) !== "granted") {
      setError(t("denied"));
      return;
    }
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToBytes(VAPID_KEY),
    });
    setSubscription(sub);
    await save(sub, prefs);
  };

  const disable = async () => {
    if (!subscription) return;
    await deletePushAction(subscription.endpoint);
    await subscription.unsubscribe();
    setSubscription(null);
  };

  const toggle = async (key: keyof typeof prefs, value: boolean) => {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    if (subscription) await save(subscription, next);
  };

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-cream/20 p-4">
      <h2 className="text-xl font-semibold">{t("title")}</h2>
      {support === "unsupported" ? (
        <p className="text-sm text-cream/60">{t("unsupported")}</p>
      ) : support === "checking" ? null : (
        <>
          <p className="text-sm text-cream/70">{t("help")}</p>
          <button
            type="button"
            onClick={subscription ? disable : enable}
            className={`self-start rounded-full px-4 py-1.5 text-sm font-semibold ${subscription ? "border border-cream/40 text-cream" : "bg-ball text-night"}`}
          >
            {subscription ? t("disable") : t("enable")}
          </button>
          {subscription && (
            <div className="flex flex-col gap-2 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={prefs.stockFull}
                  onChange={(e) => toggle("stockFull", e.target.checked)}
                />
                {t("stockFull")}
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={prefs.streak}
                  onChange={(e) => toggle("streak", e.target.checked)}
                />
                {t("streak")}
              </label>
            </div>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-cream/70">
          {error}
        </p>
      )}
    </section>
  );
}
