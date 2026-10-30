"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

/**
 * Starts an anonymous trial account (Supabase anonymous sign-in). The session
 * cookie is only set after this explicit click. The account is linked to
 * Discord, Google or an email later from the login page.
 */
export function TryWithoutAccount() {
  const t = useTranslations("booster");
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "busy" | "error">("idle");

  const start = async () => {
    setStatus("busy");
    const { error } =
      await createSupabaseBrowserClient().auth.signInAnonymously();
    if (error) return setStatus("error");
    router.refresh();
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={start}
        disabled={status === "busy"}
        className="rounded-full bg-ball px-8 py-3 text-lg font-semibold text-night disabled:opacity-50"
      >
        {t("tryWithoutAccount")}
      </button>
      <p className="text-xs text-cream/60">{t("trialCookie")}</p>
      {status === "error" && (
        <p role="alert" className="text-sm text-cream/80">
          {t("trialError")}
        </p>
      )}
    </div>
  );
}
