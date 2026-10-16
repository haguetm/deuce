import { getTranslations, setRequestLocale } from "next-intl/server";
import { supabaseEnv } from "@/lib/supabase/env";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  params,
  searchParams,
}: PageProps<"/[locale]/login">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { error } = await searchParams;
  const t = await getTranslations("auth");
  return (
    <section className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-6 px-4 py-12">
      <h1 className="text-3xl font-semibold">{t("title")}</h1>
      <p className="text-center text-cream/80">{t("subtitle")}</p>
      <LoginForm
        configured={supabaseEnv() !== null}
        initialError={error === "auth"}
      />
    </section>
  );
}
