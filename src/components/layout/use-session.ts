"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { supabaseEnv } from "@/lib/supabase/env";

/**
 * Session state read in the browser (the shared layout stays static).
 * Reading the session never creates one: no cookie for visitors.
 */
export function useSession() {
  const [session, setSession] = useState({
    signedIn: false,
    anonymous: false,
  });

  useEffect(() => {
    if (!supabaseEnv()) return;
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getSession().then(({ data }) =>
      setSession({
        signedIn: Boolean(data.session),
        anonymous: Boolean(data.session?.user.is_anonymous),
      }),
    );
    const { data } = supabase.auth.onAuthStateChange((_event, s) =>
      setSession({
        signedIn: Boolean(s),
        anonymous: Boolean(s?.user.is_anonymous),
      }),
    );
    return () => data.subscription.unsubscribe();
  }, []);

  return session;
}
