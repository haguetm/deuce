# Booster en tube de balles 3D, lueurs par paire de raretés, vrais joueurs

Date : 2026-10-26. Statut : validé par oral, relu une fois (corrections intégrées).

## Objectif

Rendre l'ouverture d'un booster désirable : un tube de balles en 3D dont on arrache l'opercule, des cartes qui sortent face visible et un suspense de rareté lisible. Afficher les vrais joueurs avec leur photo et retirer toute mention « ATP / WTA » des filtres.

## Périmètre

1. **Vrais joueurs avec photo** : lancer l'import réel existant, sans écrire de code. Les joueurs fictifs sortent du catalogue local.
2. **Filtres renommés** : « Tous / Messieurs / Dames / Légendes », clés internes `all / men / women / legends`.
3. **Tube 3D et nouvelle révélation** : opercule, bouffée « pschitt », cartes face visible empilées, lueurs par paire de raretés, contour à la rareté exacte.

Hors périmètre :

- illustrations de joueurs sur le tube ;
- son du « pschitt » (suite possible) ;
- suivi de l'inclinaison du téléphone, qui demande une autorisation sur iOS ;
- 3D ailleurs que sur la page Boosters ;
- écran de fin, qui reste inchangé.

## 1. Vrais joueurs avec photo

- L'import se lance depuis la machine du joueur, car Wikimedia filtre les IP cloud. Supabase local doit tourner :
  `$env:PIPELINE_CONTACT = "<email>"; .\pipeline\run-import.ps1` (200 joueurs par défaut, `-Limit 500` pour plus).
- L'import stocke les photos Commons sous licence libre (CC BY, CC BY-SA, CC0, domaine public), avec l'auteur et la licence, en WebP 400 px. Le recto de carte les affiche déjà avec leur crédit.
- Les joueurs fictifs sortent du catalogue : `update public.players set in_catalog = false where is_dev_seed;`. Ils restent en base et peuvent être remis. La requête écrit une ligne d'audit par joueur (trigger existant), c'est attendu.
- Ne jamais lancer `supabase db reset` après l'import : cela efface les joueurs importés.
- Critère de réussite : au moins 80 % des cartes du catalogue ont une photo visible. La requête de contrôle :
  `select round(100.0 * count(i.id) / count(*)) from public.players p left join public.player_images i on i.player_id = p.id and i.is_primary and not i.hidden where p.in_catalog;`
  Les autres cartes gardent la silhouette, ce qui est légitime quand aucune photo libre n'existe.

## 2. Filtres renommés

- `config/game.ts` : `pools = { all, men: { sex: "male" }, women: { sex: "female" }, legends }`. Le thème du jour `wta` devient `women` (« Spécial Dames »).
- `messages/*.json` : `pools.men` = « Messieurs » / « Men », `pools.women` = « Dames » / « Women », `dailyThemes.women` = « Spécial Dames » / « Women special ».
- Base : `pnpm config:generate`, puis `docker exec -i supabase_db_deuce psql -U postgres -f - < supabase/seed-game-config.sql`. Le seed est un upsert, sans réinitialisation. Les ouvertures passées gardent `pool = 'atp' | 'wta'` comme historique ; rien ne les relit.
- Nouveautés : nouvelle entrée datée dans `changelog.entries`, avec les filtres renommés, le tube 3D et la révélation face visible. Les entrées du 26/10 qui citent « ATP, WTA » et « Leur dos brille » sont corrigées. `docs/DECISIONS.md` est mis à jour (choix du booster, révélation).
- Ajouter un filtre plus tard = une ligne dans `pools` et ses textes. La couleur de l'étiquette prend `packColors.default` si le filtre n'a pas de couleur propre.

## 3. Tube 3D

### Rendu

- Three.js (`three`, version figée). Pas de React Three Fiber.
- `boosters/page.tsx` reste un composant serveur. Le composant client `booster-tube.tsx` charge la scène dans un effet, avec `await import("./tube-scene")`, uniquement en mode `"3d"`. On n'utilise pas `next/dynamic` avec `ssr: false`, interdit dans un composant serveur.
- Tube construit en code :
  - cylindre en métal brossé (`MeshStandardMaterial`, métallique 0,9, rugosité 0,35) ;
  - bourrelet au bord du haut ;
  - opercule en aluminium avec languette en anneau. Pas de couvercle en plastique.
- Couleurs :
  - toutes dans `config/brand.ts`, seul endroit autorisé pour les hex ;
  - `brand.tube = { metal, aluminium, gold, puff }` pour les matériaux et la bouffée d'air ;
  - `brand.packColors = { default, all, men, women, legends, daily, box, qualifiers }` pour l'étiquette ;
  - les couleurs passent aussi en variables CSS par `src/lib/brand-css.ts` (`--pack-*`, `--glow-1..3`) pour le repli et les cartes ;
  - `brand.test.ts` vérifie que ces nouvelles valeurs sont des hex valides.
- Étiquette : texture dessinée dans un canvas 2D, avec `brand.wordmark` et le nom du booster.

| Source                  | Nom affiché                                                | Couleur                            |
| ----------------------- | ---------------------------------------------------------- | ---------------------------------- |
| `free`, `bonus`, `aces` | nom du filtre choisi (`pools.*`)                           | `packColors[pool]` sinon `default` |
| `daily`                 | thème du jour (`dailyThemes.*`), sinon `booster.dailyPack` | `daily`                            |
| `box`                   | `shop.box.name`                                            | `box`                              |
| `qualifiers`            | `shop.qualifiers.name`                                     | `qualifiers`                       |

- Au repos : rotation lente (0,2 rad/s) et léger suivi du pointeur (±8°), sur ordinateur uniquement.

### Ouverture

| Étape                         | Déclencheur                                             | Animation                                                                                            | Durée    |
| ----------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------- |
| 1. Arrachage                  | glisser la languette vers le haut, ou bouton « Ouvrir » | l'opercule se décolle jusqu'à **mi-course** ; l'appel `open_booster` part au même moment             | 600 ms   |
| 2. Attente                    | réponse pas encore arrivée                              | l'opercule reste à mi-course et brille légèrement                                                    | variable |
| 3. Doré (si `opening.golden`) | réponse reçue                                           | le métal vire à l'or, étincelles                                                                     | 500 ms   |
| 4. Pschitt                    | réponse reçue                                           | l'opercule finit de s'enrouler et se détache ; bouffée de particules                                 | 400 ms   |
| 5. Sortie                     | fin du pschitt                                          | la pile de cartes monte hors du tube et se pose devant ; la scène prévient alors React (`onEmerged`) | 500 ms   |

- Erreur serveur : l'opercule revient en place (animation inverse) et le message d'erreur actuel s'affiche.
- Le doré et le pschitt ne vivent que dans la scène, qui lit `opening.golden`. La machine d'état ne les connaît pas.

### Accélération matérielle et repli

`useRenderMode()` renvoie `"3d"`, `"fallback"` ou `"reduced"`. La décision est prise au chargement, avant toute interaction, et ne change plus pendant une ouverture.

1. `"reduced"` si `prefers-reduced-motion: reduce`.
2. `"fallback"` si `canvas.getContext("webgl2" | "webgl", { failIfMajorPerformanceCaveat: true })` échoue : pas de 3D, ou 3D rendue par le processeur.
3. `"fallback"` si le nom du moteur de rendu (extension `WEBGL_debug_renderer_info`) désigne un rendu logiciel : SwiftShader, llvmpipe, Microsoft Basic Render.
4. Sinon `"3d"`. La scène tourne au repos ; si la moyenne mesurée sur les 2 premières secondes visibles (images ignorées quand `document.hidden`) est **sous 24 images par seconde**, la scène est libérée (`dispose`) et le jeu passe en `"fallback"`. Ce contrôle n'a lieu qu'au repos, jamais pendant une ouverture.
5. Toute exception de chargement ou de rendu du module 3D fait passer en `"fallback"`.

Repli :

- `"fallback"` : un tube en SVG statique, avec le même déroulé (bouton « Ouvrir », opercule qui se décolle en CSS, sortie des cartes).
- `"reduced"` : le même tube SVG, en fondus seulement, sans déplacement.
- Dans ces deux modes, un booster doré colore le tube SVG en or et affiche le bandeau « Booster doré ! » (`booster.goldenBooster`).

Côté cartes, les animations n'utilisent que `transform` et `opacity`, avec `will-change` pendant l'animation seulement.

## 4. Révélation face visible

### Pile

- Toutes les cartes sortent **face visible**, empilées. La carte n° 1 est au-dessus ; chaque suivante est décalée de 8 px vers le bas et la droite.
- On voit entièrement la carte du dessus. Des autres, on ne voit que le bord.
- Un clic (ou Espace, Entrée, flèche droite) fait **glisser la carte du dessus vers le haut** (`translateY(-120%)`, 350 ms) et découvre la suivante.
- La pile montre au plus 6 bords ; au-delà, une pastille « +N » (Coffret de 20 cartes).
- La bande de miniatures disparaît, remplacée par la pile. Compteur « 2/5 » conservé.
- « Tout révéler » mène à l'écran de fin.
- La carte au-dessus de la pile compte comme révélée dès qu'elle y arrive : l'annonce vocale (`aria-live`) de son nom et de sa rareté, et le dessin du cadre, démarrent à ce moment.

### Lueur et contour

- **Lueur** (halo extérieur) : 3 niveaux pour 6 raretés, par paire. Visible dès qu'une carte est dans la pile, et **identique avant et après la découverte**.
  - Niveau 1 : `common`, `uncommon`.
  - Niveau 2 : `rare`, `epic`.
  - Niveau 3 : `legendary`, `mythic`.
- Paires dans `config/game.ts` (`glowTiers: Record<Rarity, 1 | 2 | 3>`), couleurs dans `config/brand.ts` (`glowColors`).
- **Contour** (cadre) : couleur de la **rareté exacte**, visible seulement une fois la carte au-dessus. Le cadre se dessine en 300 ms. Si la carte est la rareté haute de sa paire, un reflet unique parcourt le cadre : c'est la surprise, et le halo ne bouge pas.
- **Carte cachée** : `CardFront` reçoit un prop `concealed` qui affiche :
  - un cadre neutre ;
  - pas de pastille ni de texte de rareté ;
  - pas de reflet holographique (`card-holo` laisserait deviner la rareté exacte).

  Toutes les cartes encore couvertes sont rendues `concealed`. Le halo de la paire est porté par l'élément de la pile, pas par la carte.

## 5. Découpage du code

| Unité                                            | Rôle                                                                                                                                            | Dépend de              |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `src/lib/game/reveal.ts`                         | machine d'état (détail ci-dessous) ; plus de retournement                                                                                       | types                  |
| `src/lib/game/glow.ts`                           | `glowTier(rarity)`, `isUpperOfPair(rarity)`, `stackLayout(count, cursor)` (bords visibles, « +N »)                                              | `config/game.ts`       |
| `src/components/booster/tube/use-render-mode.ts` | détection 3D, rendu logiciel, fluidité, réduction des animations                                                                                | navigateur             |
| `src/components/booster/tube/tube-scene.ts`      | scène Three.js : construction, animations, `dispose` ; expose `create(canvas, options)` avec `pull`, `resolve(golden)`, `reject()`, `onEmerged` | `three`                |
| `src/components/booster/tube/booster-tube.tsx`   | client : charge la scène ou le repli, relaie geste, réponse et sortie                                                                           | les deux précédents    |
| `src/components/booster/tube/tube-fallback.tsx`  | tube SVG, animations CSS ou fondus                                                                                                              | —                      |
| `src/components/booster/reveal-stack.tsx`        | pile face visible, glissement, lueur et contour                                                                                                 | `glow.ts`, `CardFront` |
| `src/components/booster/booster-opener.tsx`      | orchestration                                                                                                                                   | tout ce qui précède    |

Machine d'état (`revealReducer`) :

- `idle` → `open` → `opening` (le tube s'ouvre, appel serveur en cours).
- `opening` → `opened(opening)` → `emerging` (la scène joue doré, pschitt et sortie).
- `opening` → `failed(error)` → `idle` avec l'erreur.
- `emerging` → `emerged` (envoyé par `BoosterTube` quand la scène appelle `onEmerged`) → `revealing`, avec `cursor = 0`.
- `revealing` → `revealNext` → `cursor + 1`, ou `done` après la dernière carte ; `revealAll` → `done`.
- `done` → `again` → `idle`.

À supprimer : `booster-pack.tsx`, `reveal-stage.tsx`, `glowsBeforeFlip`, les classes CSS `card-tease`, `card-flip`, `booster-*` et `booster-lid*`. `RevealSummary` reste tel quel.

## 6. Tests

- **Unitaires (Vitest)** :
  - `reveal.test.ts` réécrit selon la nouvelle machine d'état : transitions, erreur pendant `opening`, `emerged`, `revealNext` jusqu'à `done`, `revealAll` ;
  - `glowTier` couvre les 6 raretés sur exactement 3 niveaux, avec 2 raretés par niveau, croissants ;
  - `stackLayout` pour 5 et 20 cartes ;
  - `useRenderMode` avec un faux `getContext`, un faux nom de moteur de rendu et un faux compteur d'images ;
  - `brand.test.ts` étendu à `packColors`, `glowColors` et `tube` ;
  - test des messages : chaque pool a un texte ;
  - `brand.test.ts` : chaque pool a une couleur d'étiquette ou passe par `packColors.default`.
- **SQL** : `12_progression.sql`, dans le bloc des pools (lignes 81 à 85), passe de `wta` à `women` (appel, libellé, valeur enregistrée).
- **Manuels** (navigateur intégré, ordinateur et vue mobile) :
  - ouverture complète en 3D, en repli et en mode réduit ;
  - booster doré (forcé en local avec `chance_bp = 10000`) ;
  - erreur « plus de stock » ;
  - Coffret de 20 cartes ;
  - aucune carte couverte ne laisse voir sa rareté exacte ;
  - poids du JavaScript de la page Boosters avant et après ;
  - cartes avec vraies photos après l'import.

## 7. Risques et mesures

- **Poids** : three.js ajoute environ 150 Ko compressés, chargés seulement sur la page Boosters en mode `"3d"`, après l'affichage du reste de la page.
- **Téléphones faibles ou en économie d'énergie** : seuil à 24 images par seconde et repli automatique.
- **Licences des photos** : déjà filtrées par le pipeline, crédit affiché sur chaque carte.
