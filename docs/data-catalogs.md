# Data catalogs

Scripts for growing location and clothing libraries used by generators.

## Random location pool

Named scene locations power random scene rolls, Background, Character, and Topics seeds. The pool is split across batch files under `src/lib/` and merged at build time.

| Command                          | Purpose                                            |
| -------------------------------- | -------------------------------------------------- |
| `npm run locations:count`        | Show current unique location count                 |
| `npm run locations:generate`     | Add **500** new locations (writes next batch file) |
| `npm run locations:generate:dry` | Preview generation without writing files           |

Advanced CLI (`node scripts/generate-locations.mjs`):

```bash
# Grow pool to a target size
npm run locations:generate -- --target 5000

# Add a specific number with a reproducible seed
npm run locations:generate -- --add 1000 --seed 42

# Write a specific batch number
npm run locations:generate -- --add 250 --batch 4
```

New batches land in `src/lib/scene/location-catalog-extra-N.ts`. The script updates `src/lib/scene/location-catalog-batches.ts` automatically — do not edit that index by hand. Word pools live in `scripts/location-word-pools.mjs`.

## Clothing library

The character tool includes a **2,000+ entry clothing catalog** (outfits, tops, bottoms, outerwear, footwear, accessories) used for wardrobe presets and random outfit rolls.

| Command                         | Purpose                                                |
| ------------------------------- | ------------------------------------------------------ |
| `npm run clothing:count`        | Show catalog size by category                          |
| `npm run clothing:dedupe`       | Remove duplicate category+label entries across batches |
| `npm run clothing:generate`     | Add **500** new clothing entries                       |
| `npm run clothing:generate:dry` | Preview without writing files                          |

```bash
npm run clothing:generate -- --target 5000
npm run clothing:generate -- --add 1000 --seed 42
```

In the Character tool, open **Wardrobe & props** presets to pick library items (grouped dropdowns covering all **16 categories**: tops, bottoms, outerwear, footwear, swimwear, intimates, hosiery, formalwear, sleepwear, underwear, socks, headwear, traditional dress, and more). Custom text fields override library picks. **Every catalog item is always selectable** in the dropdowns (gender filtering only). Random outfit rolls still respect scene context for specialized items. Word pools: `scripts/clothing-word-pools.mjs`.
