"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export async function signOut(router: ReturnType<typeof useRouter>) {
  await createSupabaseBrowserClient().auth.signOut();
  router.replace("/");
  router.refresh();
}

/** Sign-out button for the profile page (the header hides it on phones). */
export function SignOutButton() {
  const t = useTranslations("nav");
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => signOut(router)}
      className="self-start rounded-full border border-cream/30 px-4 py-1.5 text-sm"
    >
      {t("logout")}
    </button>
  );
}
