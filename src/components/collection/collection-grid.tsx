"use client";

import { useState } from "react";
import { CardViewer } from "@/components/card/card-viewer";
import { CollectionCard, type CollectionCardData } from "./collection-card";

/** The collection grid; a card opens in the viewer, arrows move through the page. */
export function CollectionGrid({
  cards,
  catalogSize,
  showcase,
}: {
  cards: CollectionCardData[];
  catalogSize: number;
  showcase: number[];
}) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <>
      <ul className="card-grid grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
        {cards.map((card, i) => (
          <CollectionCard
            key={card.player_id}
            card={card}
            catalogSize={catalogSize}
            showcase={showcase}
            onOpen={() => setOpen(i)}
          />
        ))}
      </ul>
      {open !== null && (
        <CardViewer
          cards={cards}
          index={open}
          catalogSize={catalogSize}
          onIndex={setOpen}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}
