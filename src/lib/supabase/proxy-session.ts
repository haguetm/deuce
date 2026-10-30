import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";
import { supabaseEnv } from "./env";

/**
 * Refreshes the Supabase session cookie on the outgoing response. Only acts
 * when a session cookie exists, so anonymous visitors never get a cookie.
 */
export async function refreshSession(
  request: NextRequest,
  response: NextResponse,
) {
  const env = supabaseEnv();
  const hasSession = request.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-"));
  if (!env || !hasSession) return response;

  const supabase = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value, options } of toSet)
          response.cookies.set(name, value, options);
      },
    },
  });
  await supabase.auth.getUser();
  return response;
}
