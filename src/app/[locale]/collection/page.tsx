import {
  getFormatter,
  getTranslations,
  setRequestLocale,
} from "next-intl/server";
import { RARITIES, type Rarity } from "@config/game";
import { CountryFlag } from "@/components/card/country-flag";
import {
  CollectionCard,
  type CollectionCardData,
} from "@/components/collection/collection-card";
import {
  RecyclePanel,
  type RecyclePreview,
} from "@/components/collection/recycle-panel";
import {
  GradedList,
  type GradedCard,
} from "@/components/collection/graded-list";
import { Link, redirect } from "@/i18n/navigation";
import {
  createSupabaseServerClient,
  getCurrentUser,
} from "@/lib/supabase/server";

// Per-user page: never prerendered or cached.
export const dynamic = "force-dynamic";

const PAGE_SIZE = 48;
const FILTERS = ["owned", "missing", "wished", "duplicates", "all"] as const;
type Filter = (typeof FILTERS)[number];

interface Albums {
  nations: {
    country: string;
    total: number;
    owned: number;
    by_rarity: Partial<Record<Rarity, [number, number]>>;
  }[];
  collections: { key: string; total: number; owned: number }[];
}

interface CollectionPageData {
  total: number;
  cards: CollectionCardData[];
  stats: {
    distinct: number;
    copies: number;
    catalog_size: number;
    showcase: number[] | null;
  };
}

export default async function CollectionPage({
  params,
  searchParams,
}: PageProps<"/[locale]/collection">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await getCurrentUser();
  if (!user) return redirect({ href: "/login", locale });

  const sp = await searchParams;
  const one = (v: string | string[] | undefined) =>
    typeof v === "string" && v.length > 0 ? v : undefined;
  const view = one(sp.view) === "albums" ? "albums" : "cards";
  const filter: Filter = FILTERS.includes(one(sp.filter) as Filter)
    ? (one(sp.filter) as Filter)
    : "owned";
  const rarity = RARITIES.includes(one(sp.rarity) as Rarity)
    ? (one(sp.rarity) as Rarity)
    : undefined;
  const country = one(sp.country)?.match(/^[A-Za-z]{2}$/)?.[0];
  const set = one(sp.set)?.match(/^[A-Za-z0-9]{1,40}$/)?.[0];
  const q = one(sp.q)?.slice(0, 60);
  const page = Math.max(1, Number(one(sp.page) ?? 1) || 1);

  const supabase = await createSupabaseServerClient();
  const [collection, albums, preview, graded, state] = await Promise.all([
    supabase.rpc("get_collection", {
      p_filter: filter,
      p_rarity: rarity ?? null,
      p_country: country ?? null,
      p_collection: set ?? null,
      p_query: q ?? null,
      p_offset: (page - 1) * PAGE_SIZE,
      p_limit: PAGE_SIZE,
    }),
    supabase.rpc("get_albums"),
    supabase.rpc("recycle_preview"),
    supabase.rpc("get_graded_cards"),
    supabase.rpc("get_booster_state"),
  ]);
  for (const r of [collection, albums, preview, graded, state])
    if (r.error) throw new Error(r.error.message);

  const data = collection.data as CollectionPageData;
  const albumData = albums.data as Albums;
  const t = await getTranslations("collection");
  const tRarity = await getTranslations("rarity");
  const tSets = await getTranslations("collections");
  const tShort = await getTranslations("rarityShort");
  const format = await getFormatter();
  const { distinct, copies, catalog_size: catalogSize } = data.stats;
  const completion = catalogSize ? (100 * distinct) / catalogSize : 0;
  const showcase = (data.stats.showcase ?? []).map(Number);
  const aces = Number((state.data as { aces?: number }).aces ?? 0);
  const pages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));

  const query = (patch: Record<string, string | number | undefined>) => {
    const next: Record<string, string> = {};
    const merged = { view, filter, rarity, country, set, q, page, ...patch };
    for (const [k, v] of Object.entries(merged))
      if (v !== undefined && v !== "" && !(k === "page" && v === 1))
        next[k] = String(v);
    return next;
  };

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10">
      <header className="flex flex-col gap-4">
        <h1 className="text-4xl font-semibold">{t("title")}</h1>
        <dl className="grid grid-cols-3 gap-3 sm:max-w-xl">
          <Stat label={t("unique")} value={`${distinct}/${catalogSize}`} />
          <Stat
            label={t("completion")}
            value={format.number(completion / 100, {
              style: "percent",
              maximumFractionDigits: 1,
            })}
          />
          <Stat label={t("duplicates")} value={String(copies - distinct)} />
        </dl>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <RecyclePanel preview={preview.data as RecyclePreview} />
        <GradedList cards={graded.data as GradedCard[]} />
      </div>

      <nav className="flex gap-2" aria-label={t("views")}>
        {(["cards", "albums"] as const).map((v) => (
          <Link
            key={v}
            href={{
              pathname: "/collection",
              query: v === "cards" ? {} : { view: v },
            }}
            aria-current={view === v ? "page" : undefined}
            className={`rounded-full border px-4 py-1.5 text-sm ${view === v ? "border-ball bg-ball text-night" : "border-cream/30"}`}
          >
            {t(`view.${v}`)}
          </Link>
        ))}
      </nav>

      {view === "albums" ? (
        <div className="flex flex-col gap-8">
          {albumData.collections.length > 0 && (
            <section>
              <h2 className="mb-3 text-xl font-semibold">
                {t("collectionsTitle")}
              </h2>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {albumData.collections.map((c) => (
                  <li key={c.key}>
                    <Link
                      href={{
                        pathname: "/collection",
                        query: { filter: "all", set: c.key },
                      }}
                      className="flex flex-col gap-2 rounded-xl border border-gold/40 p-4 hover:border-gold"
                    >
                      <span className="font-semibold">
                        {tSets.has(c.key) ? tSets(c.key as never) : c.key}
                      </span>
                      <Progress owned={c.owned} total={c.total} />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section>
            <h2 className="mb-1 text-xl font-semibold">{t("nationsTitle")}</h2>
            <p className="mb-3 text-sm text-cream/60">{t("nationsHelp")}</p>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {albumData.nations.map((n) => (
                <li key={n.country}>
                  <Link
                    href={{
                      pathname: "/collection",
                      query: { filter: "all", country: n.country },
                    }}
                    className="flex flex-col gap-2 rounded-xl border border-cream/20 p-4 hover:border-ball"
                  >
                    <span className="flex items-center gap-2 font-semibold">
                      <CountryFlag code={n.country} />
                      <RegionName code={n.country} locale={locale} />
                    </span>
                    <Progress owned={n.owned} total={n.total} />
                    <span className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-xs">
                      {RARITIES.filter((r) => n.by_rarity[r]).map((r) => (
                        <span
                          key={r}
                          style={{ color: `var(--rarity-${r})` }}
                          title={tRarity(r)}
                        >
                          {t("rarityCount", {
                            code: tShort(r),
                            owned: n.by_rarity[r]![0],
                            total: n.by_rarity[r]![1],
                          })}
                        </span>
                      ))}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <form className="flex flex-wrap items-end gap-3" action="">
            <label className="flex flex-col gap-1 text-sm">
              {t("search")}
              <input
                name="q"
                defaultValue={q}
                className="rounded-lg border border-cream/30 bg-night px-3 py-1.5"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t("filterLabel")}
              <select
                name="filter"
                defaultValue={filter}
                className="rounded-lg border border-cream/30 bg-night px-3 py-1.5"
              >
                {FILTERS.map((f) => (
                  <option key={f} value={f}>
                    {t(`filter.${f}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t("rarityLabel")}
              <select
                name="rarity"
                defaultValue={rarity ?? ""}
                className="rounded-lg border border-cream/30 bg-night px-3 py-1.5"
              >
                <option value="">{t("allRarities")}</option>
                {RARITIES.map((r) => (
                  <option key={r} value={r}>
                    {tRarity(r)}
                  </option>
                ))}
              </select>
            </label>
            {country && <input type="hidden" name="country" value={country} />}
            {set && <input type="hidden" name="set" value={set} />}
            <button
              type="submit"
              className="rounded-full bg-ball px-5 py-1.5 text-sm font-semibold text-night"
            >
              {t("apply")}
            </button>
            {(country || set || q || rarity) && (
              <Link
                href="/collection"
                className="text-sm text-cream/70 underline"
              >
                {t("reset")}
              </Link>
            )}
          </form>

          <p className="text-sm text-cream/60">
            {t("results", { count: data.total })}
            {country && (
              <>
                {" · "}
                <RegionName code={country} locale={locale} />
              </>
            )}
            {set && <> · {tSets.has(set) ? tSets(set as never) : set}</>}
          </p>

          {data.cards.length === 0 ? (
            <p className="text-cream/70">{t(`empty.${filter}`)}</p>
          ) : (
            <ul className="card-grid grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
              {data.cards.map((card) => (
                <CollectionCard
                  key={card.player_id}
                  card={card}
                  catalogSize={catalogSize}
                  showcase={showcase}
                  aces={aces}
                />
              ))}
            </ul>
          )}

          {pages > 1 && (
            <nav
              className="flex items-center justify-center gap-4 text-sm"
              aria-label={t("pagination")}
            >
              {page > 1 && (
                <Link
                  href={{
                    pathname: "/collection",
                    query: query({ page: page - 1 }),
                  }}
                  className="underline"
                >
                  {t("previous")}
                </Link>
              )}
              <span>{t("page", { page, pages })}</span>
              {page < pages && (
                <Link
                  href={{
                    pathname: "/collection",
                    query: query({ page: page + 1 }),
                  }}
                  className="underline"
                >
                  {t("next")}
                </Link>
              )}
            </nav>
          )}
        </div>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-cream/20 px-3 py-2">
      <dt className="text-xs uppercase tracking-wider text-cream/60">
        {label}
      </dt>
      <dd className="text-2xl font-semibold">{value}</dd>
    </div>
  );
}

function Progress({ owned, total }: { owned: number; total: number }) {
  const pct = total ? Math.round((100 * owned) / total) : 0;
  return (
    <span className="flex items-center gap-2 text-sm">
      <span className="h-2 flex-1 overflow-hidden rounded-full bg-cream/10">
        <span
          className="block h-full rounded-full bg-ball"
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="font-mono text-xs text-cream/80">
        {owned}/{total}
      </span>
    </span>
  );
}

function RegionName({ code, locale }: { code: string; locale: string }) {
  return (
    <>
      {new Intl.DisplayNames([locale], { type: "region" }).of(
        code.toUpperCase(),
      ) ?? code}
    </>
  );
}
