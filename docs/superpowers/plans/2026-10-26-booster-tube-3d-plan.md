# Plan de mise en œuvre : tube de balles 3D, lueurs par paire, vrais joueurs

Conception de référence : `docs/superpowers/specs/2026-10-26-booster-tube-3d-design.md`.

Règles valables pour toutes les étapes :

- une étape = un commit, tests verts avant de passer à la suivante (`pnpm lint`, `pnpm typecheck`, `pnpm test`, plus les tests SQL quand la base est touchée) ;
- fichiers en LF ;
- aucun hex ni nom de marque dans `src/` (`brand.test.ts`).

## Étape 0 : vrais joueurs avec photo (sans code, avec toi)

1. Tu fournis un email de contact pour Wikimedia (`PIPELINE_CONTACT`).
2. `.\pipeline\run-import.ps1`, 200 joueurs.
3. `update public.players set in_catalog = false where is_dev_seed;`.
4. Contrôle des 80 % de photos avec la requête de la conception. Si on est en dessous, on regarde `pipeline/logs/*-issues.json` avant d'aller plus loin.
5. Vérification visuelle de quelques cartes dans la collection.

Rien n'est commité à cette étape, sauf si l'import révèle un bug du pipeline.

## Étape 1 : filtres Messieurs / Dames (≈ 30 min)

- `config/game.ts` : `atp` → `men`, `wta` → `women` dans `pools` et `dailyThemes.rotation`.
- `messages/fr.json`, `messages/en.json` : `pools.men` et `pools.women`, `dailyThemes.women`, suppression des anciennes clés.
- Nouvelle entrée du changelog ; corriger les items « pools » et « reveal » de l'entrée du 26/10. Monter `LATEST_CHANGELOG`.
- `supabase/tests/12_progression.sql` : lignes 81 à 85, `wta` → `women`.
- `pnpm config:generate`, puis application du seed avec `psql`.
- `docs/DECISIONS.md` : ligne sur les pools.
- Vérifier : tests unitaires et SQL, puis les libellés dans le navigateur.

## Étape 2 : couleurs et fonctions pures (≈ 1 h)

- `config/brand.ts` : ajouter
  - `packColors = { default, all, men, women, legends, daily, box, qualifiers }` ;
  - `glowColors = { 1, 2, 3 }` ;
  - `tube = { metal, aluminium, gold, puff }`.
- `src/lib/brand-css.ts` : variables `--pack-*` et `--glow-1..3`.
- `tests/unit/brand.test.ts` : hex valides pour ces trois groupes ; chaque pool a une couleur ou passe par `default`.
- `config/game.ts` : `glowTiers: Record<Rarity, 1 | 2 | 3>`.
- `src/lib/game/glow.ts` :
  - `glowTier(rarity)` ;
  - `isUpperOfPair(rarity)` ;
  - `stackLayout(count, cursor)`, qui renvoie les indices des bords visibles (au plus 6) et le nombre caché (« +N ») ;
  - `packLabel(source, pool, dailyTheme)`, qui renvoie la clé de message et la clé de couleur selon le tableau de la conception.
- `tests/unit/glow.test.ts` : les 6 raretés sur 3 niveaux, 2 par niveau, croissants ; `stackLayout` pour 5 et 20 cartes ; `packLabel` pour chaque source.

## Étape 3 : machine d'état (≈ 45 min)

- `src/lib/game/reveal.ts` :
  - états `idle | opening | emerging | revealing(cursor) | done` ;
  - actions `open`, `opened`, `failed`, `emerged`, `revealNext`, `revealAll`, `again`, `refill` ;
  - suppression de `revealed`, de `glowsBeforeFlip` et de la logique de retournement ;
  - `bestCard`, `fanOrder` et `openingSummary` restent.
- `tests/unit/reveal.test.ts` réécrit :
  - transitions nominales ;
  - `failed` pendant `opening` ;
  - `emerged` ignoré hors de `emerging` ;
  - `revealNext` jusqu'à `done` ;
  - `revealAll` ;
  - double clic.

## Étape 4 : carte cachée et pile (≈ 1 h 30)

- `CardFront` : prop `concealed` (cadre neutre, sans pastille ni texte de rareté, sans `card-holo`).
- `src/components/booster/reveal-stack.tsx` :
  - pile face visible, décalée de 8 px ;
  - halo de niveau sur l'élément de la pile ;
  - carte du dessus non cachée ; cadre dessiné en 300 ms ; reflet unique si `isUpperOfPair` ;
  - glissement vers le haut en 350 ms (`transform` et `opacity` seulement) ;
  - pastille « +N », compteur, `aria-live`, clavier, « Tout révéler ».
- `globals.css` :
  - ajouter les classes `stack-*`, `glow-*`, `frame-draw` et `frame-shine` ;
  - supprimer `card-tease`, `card-flip`, `card-face`, `booster-*` et `booster-lid*` ;
  - en `prefers-reduced-motion`, fondus seulement.
- Brancher temporairement la pile dans `booster-opener.tsx`, derrière l'ancien paquet, pour la vérifier seule dans `/fr/dev/booster`.

## Étape 5 : repli SVG et mode de rendu (≈ 1 h 30)

- `src/components/booster/tube/use-render-mode.ts` :
  - `"reduced"`, ou `"fallback"` (échec de `failIfMajorPerformanceCaveat`, ou moteur logiciel détecté par `WEBGL_debug_renderer_info`), ou `"3d"` ;
  - fonction `reportFps(avg)` appelée par la scène, avec un seuil de 24 ;
  - logique pure séparée (`decideRenderMode(probe)`) pour pouvoir la tester.
- `tests/unit/render-mode.test.ts` : réduction des animations, contexte refusé, SwiftShader / llvmpipe / Basic Render, fluidité trop faible.
- `src/components/booster/tube/tube-fallback.tsx` :
  - tube SVG avec étiquette (`packLabel`) et opercule ;
  - états fermé, à mi-course, ouvert ; doré (teinte or et bandeau) ;
  - le mode `"reduced"` utilise des fondus.
- `src/components/booster/tube/booster-tube.tsx` : même interface que la scène 3D (`pull`, `resolve(golden)`, `reject`, `onEmerged`). Cette étape n'utilise que le repli.
- `booster-opener.tsx` : remplacer `BoosterPack` et `RevealStage` par `BoosterTube` et `RevealStack`. Supprimer `booster-pack.tsx` et `reveal-stage.tsx`.
- Vérifier dans le navigateur : ouverture complète en repli, erreur « plus de stock », Coffret, doré forcé.

## Étape 6 : scène Three.js (≈ 3 h)

- `pnpm add three@<version figée ≥ 2 semaines>` et `@types/three` (versions exactes vérifiées avec `npm view`).
- `src/components/booster/tube/tube-scene.ts`, sans React :
  - caméra, éclairage (lumière d'ambiance et deux lumières directionnelles), environnement réfléchissant léger pour le métal ;
  - tube (`CylinderGeometry` et `LatheGeometry` pour le bourrelet), étiquette (`CanvasTexture`), opercule (disque segmenté, déformé pour l'enroulement), languette en anneau (`TorusGeometry`) ;
  - glisser la languette (raycaster) jusqu'à mi-course, puis `pull()` ;
  - `resolve(golden)` : passage à l'or, étincelles, fin de l'enroulement, bouffée de particules (`Points`), puis `onEmerged` ;
  - `reject()` : opercule recollé ;
  - rotation au repos et suivi du pointeur ;
  - mesure de la fluidité au repos, images ignorées quand `document.hidden` ;
  - `dispose()` complet (géométries, matériaux, textures, moteur de rendu).
- `booster-tube.tsx` : en mode `"3d"`, `await import("./tube-scene")` dans un effet ; toute exception fait passer en `"fallback"`.
- Vérifier dans le navigateur :
  - 3D sur ordinateur et en vue mobile ;
  - repli forcé (accélération désactivée, réduction des animations) ;
  - poids du JavaScript de la page Boosters avant et après (noté dans le commit).

## Étape 7 : finitions et vérification d'ensemble (≈ 1 h)

- Aperçu de développement `/fr/dev/booster` : données fictives adaptées (`golden` en alternance).
- `docs/DECISIONS.md` : révélation face visible, lueurs par paire, rendu 3D et repli.
- Vérifications complètes :
  - `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` ;
  - tests SQL sur base vide (schéma cloné) ;
  - parcours manuel de la conception, section 6 ;
  - aucune carte couverte ne laisse voir sa rareté exacte.
- Commit final, puis push après ton accord.

## Ordre et dépendances

```
0 (toi) ───────────────────────────────┐
1 ─► 2 ─► 3 ─► 4 ─► 5 ─► 6 ─► 7 ◄──────┘
```

L'étape 0 est indépendante et peut se faire à tout moment, idéalement avant l'étape 7 pour juger le rendu avec de vraies photos.

Estimation : environ 9 h de développement, plus l'étape 0.
