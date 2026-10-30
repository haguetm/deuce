"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import {
  setPreferencesAction,
  setUsernameAction,
  type ProfileResult,
} from "@/app/[locale]/profile/actions";

/** Username and privacy choices (feed and public profile). */
export function ProfileSettings({
  username,
  showInFeed,
  publicProfile,
}: {
  username: string | null;
  showInFeed: boolean;
  publicProfile: boolean;
}) {
  const t = useTranslations("profile");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(username ?? "");
  const [message, setMessage] = useState<string | null>(null);

  const run = (action: () => Promise<ProfileResult>, success: string) =>
    startTransition(async () => {
      const result = await action();
      setMessage(
        result.ok
          ? success
          : t(
              t.has(`errors.${result.error}`)
                ? `errors.${result.error}`
                : "errors.unknown",
            ),
      );
      if (result.ok) router.refresh();
    });

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-cream/20 p-4">
      <h2 className="text-xl font-semibold">{t("identityTitle")}</h2>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => setUsernameAction(name), t("usernameSaved"));
        }}
      >
        <label className="flex flex-col gap-1 text-sm">
          {t("username")}
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            pattern="[A-Za-z0-9_]{3,20}"
            required
            className="rounded-lg border border-cream/30 bg-night px-3 py-1.5"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-ball px-4 py-1.5 text-sm font-semibold text-night"
        >
          {t("save")}
        </button>
      </form>
      <p className="text-xs text-cream/60">{t("usernameHelp")}</p>

      <fieldset className="flex flex-col gap-2" disabled={pending}>
        <legend className="mb-1 text-sm font-semibold">
          {t("privacyTitle")}
        </legend>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            defaultChecked={showInFeed}
            onChange={(e) =>
              run(
                () => setPreferencesAction(e.target.checked, publicProfile),
                t("saved"),
              )
            }
          />
          {t("showInFeed")}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            defaultChecked={publicProfile}
            onChange={(e) =>
              run(
                () => setPreferencesAction(showInFeed, e.target.checked),
                t("saved"),
              )
            }
          />
          {t("publicProfile")}
        </label>
      </fieldset>
      <p role="status" aria-live="polite" className="min-h-5 text-sm text-ball">
        {message}
      </p>
    </section>
  );
}
