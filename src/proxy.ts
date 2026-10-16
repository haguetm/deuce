import createMiddleware from "next-intl/middleware";
import type { NextRequest } from "next/server";
import { routing } from "./i18n/routing";
import { refreshSession } from "./lib/supabase/proxy-session";

const handleI18n = createMiddleware(routing);

// Locale negotiation and redirects (/ -> /fr or /en), then Supabase session
// refresh for signed-in users.
export default async function proxy(request: NextRequest) {
  return refreshSession(request, handleI18n(request));
}

export const config = {
  // Skip API routes, the auth callback, Next internals and any file with an extension.
  matcher: "/((?!api|auth|_next|_vercel|.*\\..*).*)",
};
