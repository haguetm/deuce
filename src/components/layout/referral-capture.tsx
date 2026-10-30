"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { supabaseEnv } from "@/lib/supabase/env";

const KEY = "referral-code";

/**
 * Referral links (?ref=CODE): the code is kept in localStorage (no cookie)
 * until the visitor has a regular account, then sent once to
 * claim_referral. The database decides whether it counts.
 */
export function ReferralCapture() {
  const params = useSearchParams();

  useEffect(() => {
    const code = params.get("ref");
    try {
      if (code && /^[a-z0-9]{4,20}$/i.test(code))
        localStorage.setItem(KEY, code);
    } catch {
      return;
    }
    if (!supabaseEnv()) return;
    const supabase = createSupabaseBrowserClient();
    const claim = async () => {
      let stored: string | null = null;
      try {
        stored = localStorage.getItem(KEY);
      } catch {
        return;
      }
      if (!stored) return;
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      if (!user || user.is_anonymous) return;
      await supabase.rpc("claim_referral", { p_code: stored });
      // Claimed or refused for good (own code, already referred, too late).
      localStorage.removeItem(KEY);
    };
    claim();
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "USER_UPDATED") claim();
    });
    return () => data.subscription.unsubscribe();
  }, [params]);

  return null;
}
