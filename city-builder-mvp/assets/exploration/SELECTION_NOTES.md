# Graphics Lab — Asset Exploration Batch 1

**Branch:** `atlas/graphics-lab`
**Preview:** Open `assets/exploration/preview.html` in a browser to compare all options visually.

---

## Resource Tiles (4 resources × 4 variants each = 16 SVGs)

All SVGs are 34×34px (native tile size), designed as CSS `background-image` replacements.
Each uses the same base gradient + noise filter approach as the current tiles, with added illustrative detail.

### Timber (`resource-tiles/timber_*.svg`)

| Option | File | Description | Notes |
|--------|------|-------------|-------|
| A | `timber_a_dense_canopy.svg` | Overlapping tree crown circles | Strongest "forest" read. May tile well across multi-cell resource patches. |
| B | `timber_b_scattered_pines.svg` | Diamond-shaped conifer silhouettes | Distinct evergreen feel. Trunk dots add detail. |
| C | `timber_c_mixed_forest.svg` | Mixed round + pointed trees | Most naturalistic variety. Two tree species visible. |
| D | `timber_d_old_growth.svg` | Large canopy with trunk circles | Dense, mature forest. Big shapes read well at small scale. |

### Stone (`resource-tiles/stone_*.svg`)

| Option | File | Description | Notes |
|--------|------|-------------|-------|
| A | `stone_a_quarry_blocks.svg` | Cut stone faces + ledges | Most "quarry" feel. Clear cut blocks + crack lines. |
| B | `stone_b_boulder_field.svg` | Scattered rounded boulders | Natural outcrop. Shadows under boulders add depth. |
| C | `stone_c_cliff_face.svg` | Horizontal strata layers | Geological layering. Strong horizontal reads. |
| D | `stone_d_rubble_pit.svg` | Open quarry pit with rubble | Most "worked" feel. Dark center pit + rim blocks. |

### Grain (`resource-tiles/grain_*.svg`)

| Option | File | Description | Notes |
|--------|------|-------------|-------|
| A | `grain_a_wheat_rows.svg` | Wheat stalks in furrow rows | Most readable "farm". Clear row structure + wheat heads. |
| B | `grain_b_golden_field.svg` | Wavy lines suggesting wind | Poetic/ambient. Golden color wash. |
| C | `grain_c_plowed_earth.svg` | Plowed furrows + green sprouts | Shows "in progress" farming. Soil texture + growth. |
| D | `grain_d_harvest_ready.svg` | Dense vertical stalks, heavy heads | Mature field ready for harvest. Dense golden tops. |

### Clay (`resource-tiles/clay_*.svg`)

| Option | File | Description | Notes |
|--------|------|-------------|-------|
| A | `clay_a_wet_deposit.svg` | Wet clay mounds + puddles | River-bank extraction site. Moist feel. |
| B | `clay_b_terracotta_earth.svg` | Exposed clay seams in earth | Geological cross-section. Terracotta color bands. |
| C | `clay_c_cracked_flats.svg` | Dried mud crack pattern | Strong identity — immediately reads as "clay". |
| D | `clay_d_dig_site.svg` | Excavated pit + piled clay | Worked deposit. Dark center pit + tool marks. |

---

## Road Styles (5 variants)

All SVGs are 34×34px. These show the full-tile texture; the game's clip-path system would still control connectivity shapes.

| Option | File | Description | Notes |
|--------|------|-------------|-------|
| A | `road_a_dirt_path.svg` | Worn earth path + grass edges | Most primitive. Grass tufts at margins. |
| B | `road_b_cobblestone.svg` | Irregular fitted cobblestones | Classic ancient Mediterranean. Good texture density. |
| C | `road_c_packed_gravel.svg` | Compacted gravel + wheel ruts | Middle ground — worked but not paved. Rut lines suggest cart traffic. |
| D | `road_d_flagstone.svg` | Large flat stone slabs | More advanced civilization look. Bold irregular polygons. |
| E | `road_e_sandy_track.svg` | Sandy path + footprint marks | Desert/arid variant. Soft edges blend into terrain. |

**Current road:** Solid gray `#525558` with yellow dashed centerline marks — reads as modern highway.

---

## Walker Styles (9 job types, 2–3 variants each = 24 options)

CSS file: `walkers/walker-variants.css`

All use the game's existing walker anatomy (6px head circle + 8px body rect). Job identity conveyed through body gradient color and optional accessories (caps, apron accents via box-shadow).

| Job | Variants | Color Family | Key Differentiation |
|-----|----------|-------------|-------------------|
| Citizen | A, B, C | Browns / off-white | Baseline resident. A=current, B=lighter, C=white+sash |
| Timber | A, B, C | Forest green | Green body vs brown citizen. C has green cap. |
| Sawmill | A, B, C | Warm brown | Warmer/redder brown than citizen. B has sawdust effect. |
| Stone | A, B, C | Blue-gray | Most distinct — cool gray vs warm earth tones. |
| Mason | A, B, C | Terracotta/brick | Red-shifted stone family. B has red accent stripe. |
| Clay | A, B | Mud brown | Darker, muddier brown. B has clay smear. |
| Grain | A, B | Gold/straw | Warm gold. B has straw hat accent. |
| Fisher | A, B | Teal/blue | Cool blue. Clearly ocean-related. |
| Brewer | A, B | Amber | Warm amber. B has copper accent. |

**Palette source:** Industry color coding from `graphics/ART_DIRECTION.md`.

---

## Integration Notes

- **Resource tiles:** Each SVG can be converted to a data URI and dropped into the existing `::before` background-image pattern in `css/styles.css` lines 103-110. The base gradient backgrounds would remain.
- **Roads:** Road SVGs would replace the current solid `#525558` background on `.road-surface`. The clip-path connectivity system stays unchanged.
- **Walkers:** Walker CSS classes map directly to the `.walker-dot::after` pattern. Add a job-type class (e.g., `walker-job-timber`) alongside the existing tier class.

---

## How to Review

1. Open `assets/exploration/preview.html` in any browser
2. Each section shows the current baseline alongside new options
3. Tiles shown at 2x (68px) and at game scale (35px)
4. Walkers shown at 2.5x scale with animation on dark road background
5. Section 7 shows all walker jobs side-by-side for differentiation check
