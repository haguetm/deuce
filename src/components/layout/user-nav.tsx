"use client";

import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { ChangelogDot } from "./changelog-dot";
import { signOut as supabaseSignOut } from "./sign-out-button";
import { useSession } from "./use-session";

/**
 * Signed-in links, resolved in the browser so public pages stay static and
 * cacheable (no per-user server rendering in the shared layout). On phones
 * the game links live in the bottom tab bar instead.
 */
export function UserNav() {
  const t = useTranslations("nav");
  const router = useRouter();
  const { signedIn } = useSession();

  const signOut = () => supabaseSignOut(router);

  return (
    <>
      <span className="hidden items-center gap-4 md:flex">
        <Link href="/boosters" className="hover:text-ball">
          {t("boosters")}
        </Link>
        {signedIn && (
          <>
            <Link href="/collection" className="hover:text-ball">
              {t("collection")}
            </Link>
            <Link href="/missions" className="hover:text-ball">
              {t("missions")}
            </Link>
            <Link href="/history" className="hover:text-ball">
              {t("history")}
            </Link>
            <Link href="/profile" className="hover:text-ball">
              {t("profile")}
            </Link>
          </>
        )}
      </span>
      <Link href="/changelog" className="hover:text-ball">
        {t("changelog")}
        <ChangelogDot />
      </Link>
      {signedIn ? (
        // On phones, signing out lives on the profile page (tab bar).
        <button
          type="button"
          onClick={signOut}
          className="hidden hover:text-ball md:inline"
        >
          {t("logout")}
        </button>
      ) : (
        <Link href="/login" className="hover:text-ball">
          {t("login")}
        </Link>
      )}
    </>
  );
}
