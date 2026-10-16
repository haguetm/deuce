import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { routing } from "@/i18n/routing";

/**
 * OAuth (Discord, Google) and email magic-link landing: exchanges the code
 * for a session cookie, then redirects to a same-site path only.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? `/${routing.defaultLocale}/boosters`;
  const safeNext =
    next.startsWith("/") && !next.startsWith("//")
      ? next
      : `/${routing.defaultLocale}`;

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(safeNext, origin));
  }
  return NextResponse.redirect(
    new URL(`/${routing.defaultLocale}/connexion?error=auth`, origin),
  );
}
