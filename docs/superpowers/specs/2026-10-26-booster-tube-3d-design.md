# Booster en tube de balles 3D, lueurs par paire de raretés, vrais joueurs

Date : 2026-10-26. Statut : validé par oral, en relecture.

## Objectif

Rendre l'ouverture d'un booster désirable : un tube de balles en 3D dont on arrache l'opercule, des cartes qui sortent face visible et un suspense de rareté lisible. Afficher les vrais joueurs avec leur photo et retirer toute mention « ATP / WTA » des filtres.

## Périmètre

1. **Vrais joueurs avec photo** : lancer l'import réel existant (`pipeline/run-import.ps1`), sans écrire de code. Les joueurs fictifs sont retirés du catalogue local.
2. **Filtres renommés** : « Tous / Messieurs / Dames / Légendes », clés internes `all / men / women / legends`.
3. **Tube 3D et nouvelle révélation** : opercule, « pschitt », cartes face visible empilées, lueurs par paire de raretés, contour à la rareté exacte.

Hors périmètre : illustrations de joueurs sur le tube, 3D ailleurs que sur la page Boosters, écran de fin (inchangé).

## 1. Vrais joueurs avec photo

- L'import se lance depuis la machine du joueur (Wikimedia filtre les IP cloud) :
  `$env:PIPELINE_CONTACT = "<email>"; .\pipeline\run-import.ps1`, 200 joueurs par défaut, `-Limit 500` pour plus.
- L'import stocke les photos Commons sous licence libre (CC BY, CC BY-SA, CC0, domaine public), avec l'auteur et la licence, en WebP 400 px. Le recto de carte les affiche déjà avec leur crédit.
- Les joueurs fictifs de développement sortent du catalogue : `update players set in_catalog = false where is_dev_seed`. Ils restent en base pour les tests et ne sont plus tirés.
- Critère : au moins 80 % des cartes du catalogue ont une photo visible. Le reste garde la silhouette, ce qui est légitime quand aucune photo libre n'existe.

## 2. Filtres renommés

- `config/game.ts` : `pools = { all, men: { sex: "male" }, women: { sex: "female" }, legends }`. Le thème du jour `wta` devient `women` (« Spécial Dames »).
- `messages/*.json` : `pools.men` = « Messieurs » / « Men », `pools.women` = « Dames » / « Women ».
- Base : `pnpm config:generate`, puis application du seed de configuration. Les ouvertures passées gardent `pool = 'atp' | 'wta'` comme historique ; rien ne les relit.
- Tests : `12_progression.sql` utilise `women` au lieu de `wta`. Le test des messages vérifie déjà que chaque pool a un texte.
- Ajouter un filtre plus tard = une ligne dans `pools` et deux textes.

## 3. Tube 3D

### Rendu

- Three.js (`three`, version figée), sans React Three Fiber. Le module est importé dynamiquement par la page Boosters seulement, sans rendu serveur (`next/dynamic`, `ssr: false`).
- Tube construit en code :
  - cylindre en métal brossé (`MeshStandardMaterial`, métallique 0,9, rugosité 0,35) ;
  - bourrelet au bord du haut ;
  - opercule en aluminium avec languette en anneau ;
  - couvercle en plastique translucide posé au-dessus.
- Étiquette : texture dessinée dans un canvas 2D, avec le mot-symbole de la marque, le nom du booster (`pools.*` ou `booster.dailyPack`) et la couleur du booster. Couleurs dans `config/brand.ts` (`packColors.{all,men,women,legends,daily}`), seul endroit autorisé pour les hex.
- Au repos : rotation lente (0,2 rad/s) et léger suivi du pointeur ou de l'inclinaison du téléphone (±8°).

### Ouverture

| Étape                 | Déclencheur                                             | Animation                                                                                   | Durée    |
| --------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------- | -------- |
| 1. Arrachage          | glisser la languette vers le haut, ou bouton « Ouvrir » | le couvercle se lève, l'opercule se décolle et s'enroule                                    | 600 ms   |
| 2. Attente serveur    | appel `open_booster` lancé dès le début de l'étape 1    | l'opercule reste à moitié ouvert et brille légèrement tant que la réponse n'est pas arrivée | variable |
| 3. Doré (si `golden`) | réponse du serveur                                      | le métal vire à l'or, étincelles                                                            | 500 ms   |
| 4. Pschitt            | réponse reçue                                           | bouffée de particules d'air ; son synthétisé en Web Audio (bruit filtré, sans fichier)      | 400 ms   |
| 5. Sortie             | fin du pschitt                                          | la pile de cartes monte hors du tube et se pose devant                                      | 500 ms   |

- Son coupé par défaut, interrupteur sur la page, choix mémorisé dans `localStorage`.
- Erreur serveur : l'opercule se recolle (animation inverse), le message d'erreur actuel s'affiche, rien n'est consommé côté client.

### Accélération matérielle et repli

`useRenderMode()` renvoie `"3d"` ou `"fallback"` :

1. `"fallback"` si `prefers-reduced-motion: reduce`.
2. `"fallback"` si `canvas.getContext("webgl2" | "webgl", { failIfMajorPerformanceCaveat: true })` échoue : pas de 3D, ou 3D rendue par le processeur.
3. Sinon `"3d"`, avec un contrôle de fluidité sur les 2 premières secondes. Si la moyenne tombe sous 30 images par seconde, la scène est libérée (`dispose`) et le jeu passe en `"fallback"`.
4. Toute exception de chargement ou de rendu du module 3D fait aussi passer en `"fallback"`.

Repli : un tube en SVG statique, au même déroulé (bouton « Ouvrir », opercule en fondu, sortie des cartes), sans 3D. Le jeu reste jouable partout.

Côté cartes, les animations n'utilisent que `transform` et `opacity`, ce qui les garde sur la carte graphique, avec `will-change` posé pendant l'animation seulement.

## 4. Révélation face visible

### Pile

- Toutes les cartes sortent **face visible**, empilées. La carte n° 1 est au-dessus ; chaque carte suivante est décalée de 8 px vers le bas et la droite.
- On voit entièrement la carte du dessus. Des autres, on ne voit que le bord.
- Un clic (ou Espace, Entrée, flèche droite) fait **glisser la carte du dessus vers le haut** : elle sort du cadre (`translateY(-120%)`, 350 ms) et découvre la suivante.
- La pile montre au plus 6 bords ; au-delà, une pastille « +N » (Coffret de 20 cartes).
- « Tout révéler » mène à l'écran de fin. Petit compteur « 2/5 » conservé, annonce vocale (`aria-live`) du nom et de la rareté de chaque carte découverte.

### Lueur et contour

- **Lueur** (halo extérieur) : 3 niveaux pour 6 raretés, par paire. Visible dès qu'une carte est dans la pile, et **identique avant et après la découverte**.
  - Niveau 1 : `common`, `uncommon`.
  - Niveau 2 : `rare`, `epic`.
  - Niveau 3 : `legendary`, `mythic`.
- Paires et couleurs dans la config : `config/game.ts` `glowTiers: Record<Rarity, 1 | 2 | 3>` et `config/brand.ts` `glowColors: { 1, 2, 3 }`.
- **Contour** (cadre de la carte) : couleur de la **rareté exacte** (`rarityColors`), visible seulement quand la carte est découverte. Quand une carte arrive au-dessus de la pile, le cadre se « dessine » en 300 ms. Si c'est la rareté haute de sa paire, un reflet unique parcourt le cadre : c'est la surprise, et le halo ne bouge pas.
- Une carte encore cachée ne laisse voir aucun signe de sa rareté exacte : cadre neutre, pastille de rareté masquée par la carte du dessus.

## 5. Découpage du code

| Unité                                            | Rôle                                                                                               | Dépend de              |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------- | ---------------------- |
| `src/lib/game/reveal.ts`                         | machine d'état : `idle → opening → emerging → revealing(cursor) → done` ; plus de retournement     | types                  |
| `src/lib/game/glow.ts`                           | `glowTier(rarity)`, `isUpperOfPair(rarity)`, `stackLayout(count, cursor)` (bords visibles, « +N ») | `config/game.ts`       |
| `src/components/booster/tube/use-render-mode.ts` | détection 3D, accélération matérielle, fluidité                                                    | navigateur             |
| `src/components/booster/tube/tube-scene.ts`      | scène Three.js : construction, animations, `dispose` (aucun React)                                 | `three`                |
| `src/components/booster/tube/booster-tube.tsx`   | enveloppe React : charge la scène ou le repli, relaie geste, état et doré                          | les deux précédents    |
| `src/components/booster/tube/tube-fallback.tsx`  | tube SVG et animations CSS                                                                         | —                      |
| `src/components/booster/tube/pschitt-sound.ts`   | son Web Audio, interrupteur                                                                        | navigateur             |
| `src/components/booster/reveal-stack.tsx`        | pile face visible, glissement, lueur et contour                                                    | `glow.ts`, `CardFront` |
| `src/components/booster/booster-opener.tsx`      | orchestration (remplace `BoosterPack` et `RevealStage`)                                            | tout ce qui précède    |

`booster-pack.tsx` et `reveal-stage.tsx` sont supprimés. `RevealSummary` ne change pas.

## 6. Tests

- **Unitaires (Vitest)** :
  - machine d'état : transitions, erreur pendant `opening`, `revealNext` jusqu'à `done`, `revealAll` ;
  - `glowTier` couvre les 6 raretés sur exactement 3 niveaux, avec 2 raretés par niveau ;
  - `stackLayout` pour 5 et 20 cartes ;
  - `useRenderMode` avec un faux `getContext` et un faux compteur d'images (réduction des animations, échec du contexte, fluidité faible) ;
  - nouveaux textes de pools.
- **SQL** : `12_progression.sql` mis à jour pour `women`.
- **Manuels** (navigateur intégré, ordinateur et vue mobile) :
  - ouverture complète en 3D et en repli ;
  - booster doré (forcé en local avec `chance_bp = 10000`) ;
  - erreur « plus de stock » ;
  - Coffret de 20 cartes ;
  - poids du JavaScript de la page Boosters avant et après ;
  - cartes avec vraies photos après l'import.

## 7. Risques et mesures

- **Poids** : three.js ajoute environ 150 Ko compressés, chargés seulement sur la page Boosters et après l'affichage du reste de la page.
- **Téléphones faibles** : repli automatique sur le tube SVG.
- **Licences des photos** : déjà filtrées par le pipeline, crédit affiché sur chaque carte.
