"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

/** Discord first (priority channel), then Google, then email magic link. */
export function LoginForm({
  configured,
  initialError,
}: {
  configured: boolean;
  initialError: boolean;
}) {
  const t = useTranslations("auth");
  const locale = useLocale();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sent" | "error" | "taken">(
    initialError ? "error" : "idle",
  );
  // Anonymous trial session: link an identity instead of signing in, so the
  // trial cards stay on the same account.
  const [anonymous, setAnonymous] = useState(false);
  useEffect(() => {
    if (!configured) return;
    createSupabaseBrowserClient()
      .auth.getUser()
      .then(({ data }) => setAnonymous(Boolean(data.user?.is_anonymous)));
  }, [configured]);

  if (!configured) return <p role="alert">{t("notConfigured")}</p>;

  // Computed on click: `window` does not exist during the server render.
  const redirectTo = () =>
    `${window.location.origin}/auth/callback?next=/${locale}/boosters`;
  const supabase = () => createSupabaseBrowserClient();

  const oauth = async (provider: "discord" | "google") => {
    const options = { redirectTo: redirectTo() };
    const { error } = anonymous
      ? await supabase().auth.linkIdentity({ provider, options })
      : await supabase().auth.signInWithOAuth({ provider, options });
    if (error) setStatus(anonymous ? "taken" : "error");
  };

  const sendLink = async (event: React.FormEvent) => {
    event.preventDefault();
    if (anonymous) {
      // Confirming this email turns the trial account into a regular one.
      const { error } = await supabase().auth.updateUser(
        { email },
        { emailRedirectTo: redirectTo() },
      );
      return setStatus(error ? "taken" : "sent");
    }
    const { error } = await supabase().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo() },
    });
    setStatus(error ? "error" : "sent");
  };

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      {anonymous && (
        <p className="rounded-lg border border-ball/50 bg-ball/10 px-3 py-2 text-center text-sm">
          {t("linkTrial")}
        </p>
      )}
      <button
        type="button"
        onClick={() => oauth("discord")}
        className="rounded-full bg-ball px-6 py-3 font-semibold text-night"
      >
        {t("discord")}
      </button>
      <button
        type="button"
        onClick={() => oauth("google")}
        className="rounded-full border border-cream/40 px-6 py-3 font-medium"
      >
        {t("google")}
      </button>
      <p className="text-center text-sm text-cream/60">{t("or")}</p>
      <form onSubmit={sendLink} className="flex flex-col gap-2">
        <label htmlFor="email" className="text-sm">
          {t("emailLabel")}
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-lg border border-cream/30 bg-night px-3 py-2 text-cream"
        />
        <button
          type="submit"
          className="rounded-full border border-ball px-6 py-2 text-ball"
        >
          {t("emailSubmit")}
        </button>
      </form>
      <p
        aria-live="polite"
        role={status === "error" ? "alert" : undefined}
        className="min-h-6 text-sm"
      >
        {status === "sent" && t("emailSent")}
        {status === "error" && t("error")}
        {status === "taken" && t("linkTaken")}
      </p>
    </div>
  );
}
