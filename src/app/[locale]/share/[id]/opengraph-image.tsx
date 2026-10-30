import { ImageResponse } from "next/og";
import { getTranslations } from "next-intl/server";
import { brand } from "@config/brand";
import { bestCardFront } from "@/lib/game/best-card";
import { loadSharedOpening } from "@/lib/game/shared-opening";

export const alt = "";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 86400;

/**
 * Link preview of a shared pull: the five cards as rarity-colored tiles with
 * the names, the best one larger. No photo (credits could not be shown).
 */
export default async function Image({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const opening = await loadSharedOpening(id);
  const t = await getTranslations({ locale, namespace: "share" });
  const tRarity = await getTranslations({ locale, namespace: "rarity" });
  const cards = opening?.cards ?? [];
  const best = bestCardFront(cards);

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 32,
        background: brand.colors.night,
        color: brand.colors.cream,
        fontSize: 32,
      }}
    >
      <div style={{ display: "flex", fontSize: 40, letterSpacing: 8 }}>
        {brand.wordmark}
      </div>
      <div style={{ display: "flex", gap: 20, alignItems: "flex-end" }}>
        {cards.slice(0, 5).map((c) => {
          const color = brand.rarityColors[c.rarity];
          const big = c === best;
          return (
            <div
              key={c.slot}
              style={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "flex-end",
                width: big ? 230 : 180,
                height: big ? 322 : 252,
                padding: 16,
                borderRadius: 18,
                border: `6px solid ${color}`,
                background: brand.colors.emerald,
              }}
            >
              <div
                style={{
                  display: "flex",
                  fontSize: big ? 30 : 24,
                  fontWeight: 700,
                }}
              >
                {c.name}
              </div>
              <div style={{ display: "flex", fontSize: 18, color }}>
                {tRarity(c.rarity)}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", color: brand.colors.ball }}>
        {best ? t("metaTitle", { name: best.name }) : t("title")}
      </div>
    </div>,
    size,
  );
}
