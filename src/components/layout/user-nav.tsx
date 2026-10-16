"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { supabaseEnv } from "@/lib/supabase/env";

/**
 * Signed-in links, resolved in the browser so public pages stay static and
 * cacheable (no per-user server rendering in the shared layout).
 */
export function UserNav() {
  const t = useTranslations("nav");
  const router = useRouter();
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    if (!supabaseEnv()) return;
    const supabase = createSupabaseBrowserClient();
    supabase.auth
      .getSession()
      .then(({ data }) => setSignedIn(Boolean(data.session)));
    const { data } = supabase.auth.onAuthStateChange((_event, session) =>
      setSignedIn(Boolean(session)),
    );
    return () => data.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await createSupabaseBrowserClient().auth.signOut();
    router.replace("/");
    router.refresh();
  };

  return (
    <>
      <Link href="/boosters" className="hover:text-ball">
        {t("boosters")}
      </Link>
      {signedIn && (
        <Link href="/history" className="hover:text-ball">
          {t("history")}
        </Link>
      )}
      {signedIn ? (
        <button type="button" onClick={signOut} className="hover:text-ball">
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
