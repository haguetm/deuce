import {
  getFormatter,
  getTranslations,
  setRequestLocale,
} from "next-intl/server";
import { MarkChangelogSeen } from "@/components/layout/changelog-dot";

interface Entry {
  title: string;
  items: Record<string, string>;
}

/** Release notes, newest first (messages: changelog.entries). */
export default async function ChangelogPage({
  params,
}: PageProps<"/[locale]/changelog">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("changelog");
  const format = await getFormatter();
  const entries = Object.entries(t.raw("entries") as Record<string, Entry>);

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10">
      <MarkChangelogSeen />
      <header>
        <h1 className="text-4xl font-semibold">{t("title")}</h1>
        <p className="mt-2 text-cream/70">{t("subtitle")}</p>
      </header>
      {entries.map(([date, entry]) => (
        <article
          key={date}
          className="flex flex-col gap-3 rounded-2xl border border-cream/20 p-5"
        >
          <p className="text-xs uppercase tracking-widest text-gold">
            <time dateTime={date}>
              {format.dateTime(new Date(`${date}T12:00:00Z`), {
                dateStyle: "long",
              })}
            </time>
          </p>
          <h2 className="text-2xl font-semibold">{entry.title}</h2>
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-cream/85">
            {Object.entries(entry.items).map(([key, item]) => (
              <li key={key}>{item}</li>
            ))}
          </ul>
        </article>
      ))}
    </section>
  );
}
