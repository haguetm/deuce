import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { brand } from "@config/brand";
import { getPathname } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { pushDispatchSecret } from "@/lib/server/private-settings";
import fr from "../../../../../messages/fr.json";
import en from "../../../../../messages/en.json";

const MESSAGES = { fr, en } as const;

interface Due {
  endpoint: string;
  p256dh: string;
  auth: string;
  kind: "stock_full" | "streak";
  locale: string;
  day: number | null;
}

function sameSecret(given: string, expected: string) {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Sends the due push reminders. Called every 10 minutes by pg_cron (pg_net)
 * with the shared secret; uses the service role to take the due
 * notifications, which marks them as sent in the same transaction.
 */
export async function POST(request: Request) {
  const secret = pushDispatchSecret();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!secret || !url || !serviceKey || !publicKey || !privateKey || !subject)
    return new Response("push not configured", { status: 503 });

  const auth = request.headers.get("authorization") ?? "";
  if (!sameSecret(auth, `Bearer ${secret}`))
    return new Response("forbidden", { status: 403 });

  webpush.setVapidDetails(subject, publicKey, privateKey);
  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.rpc("take_due_notifications");
  if (error) return new Response(error.message, { status: 500 });

  let sent = 0;
  for (const due of (data as Due[]) ?? []) {
    const locale = (
      routing.locales.includes(due.locale as Locale)
        ? due.locale
        : routing.defaultLocale
    ) as Locale;
    const m = MESSAGES[locale].push.notifications;
    const payload =
      due.kind === "stock_full"
        ? {
            title: m.stockFullTitle.replace("{name}", brand.name),
            body: m.stockFullBody,
            url: getPathname({ href: "/boosters", locale }),
            tag: "stock-full",
          }
        : {
            title: m.streakTitle,
            body: m.streakBody.replace("{day}", String(due.day ?? 1)),
            url: getPathname({ href: "/missions", locale }),
            tag: "streak",
          };
    try {
      await webpush.sendNotification(
        {
          endpoint: due.endpoint,
          keys: { p256dh: due.p256dh, auth: due.auth },
        },
        JSON.stringify(payload),
        { TTL: 3600 },
      );
      sent++;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      // Expired or unsubscribed device: forget it.
      if (status === 404 || status === 410)
        await supabase.rpc("remove_push_endpoint", {
          p_endpoint: due.endpoint,
        });
    }
  }
  return Response.json({ sent });
}
