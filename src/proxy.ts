import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

// Locale negotiation and redirects (/ -> /fr or /en). Auth session refresh
// will be chained here in task 4.
export default createMiddleware(routing);

export const config = {
  // Skip API routes, Next internals and any file with an extension.
  matcher: "/((?!api|auth|_next|_vercel|.*\\..*).*)",
};
