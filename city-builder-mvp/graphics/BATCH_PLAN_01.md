# Art Generation Batch Plan 01 — Near-Term Gameplay Additions

Covers the four highest-priority asset groups for imminent gameplay features:
roads polish, housing tiers, grain/agriculture chain, and clay/ceramics chain.

**Total assets in this batch: 48**

---

## Generation Order Overview

Assets are grouped into 6 ordered waves. Each wave should be generated in a
single session to maximize style consistency. Complete and QA each wave before
starting the next.

| Wave | Group | Assets | Why this order |
|------|-------|--------|----------------|
| 1 | Road tiles | 14 | Unblocks road polish — no idle/working states, pure tiling exercise. Good warm-up for establishing the ground palette that all other buildings sit on. |
| 2 | Housing T1 + T2 | 6 | Depends on road palette being locked. Small count, fast. Establishes the residential visual language before production buildings. |
| 3 | Grain chain — idle states | 7 | All 4 grain buildings idle + 3 resource icons. Idle-first pass locks silhouettes and color identity before adding activity. |
| 4 | Grain chain — working states | 4 | Working variants of the 4 grain buildings. Generated with idle sprites as reference to ensure clear state contrast. |
| 5 | Clay chain — idle states | 6 | All 3 clay buildings idle + 3 resource icons. Same idle-first approach. |
| 6 | Clay chain — working states | 3 | Working variants of the 3 clay buildings. |

After all 6 waves: generate 8 remaining UI icons (64x64 building thumbnails) in
a final cleanup pass.

---

## Global Style Prefix

Prepend this to every building/resource prompt. Do NOT modify it between waves —
consistency depends on this anchor being identical across all generations.

> **Style prefix:** "2D top-down isometric game sprite, warm Mediterranean ancient settlement style, simple stylized art, strong silhouette, transparent background, soft top-left lighting, earth tone palette, pixel-friendly detail level, single building on clear background, 128x128 pixel target, no text or UI elements"

For resource icons, replace the size target:

> **Resource icon prefix:** "2D game resource icon, warm Mediterranean ancient settlement style, simple stylized art, transparent background, soft top-left lighting, earth tone palette, centered single object, 32x32 pixel target, no text or UI elements"

For UI icons, use:

> **UI icon prefix:** "2D game building thumbnail icon, warm Mediterranean ancient settlement style, simple stylized art, transparent background, soft top-left lighting, earth tone palette, centered building, 64x64 pixel target, no text or UI elements"

---

## Wave 1: Road Tiles (14 assets)

### Context

Roads are terrain overlays, not buildings. They have no idle/working states.
All 13 directional variants plus 1 UI icon. Each tile must seamlessly connect
to adjacent road tiles at its open edges.

**Critical constraint:** edges where roads connect must align at exactly the
same position and width so tiles join without visible seams. Generate the
straight-horizontal tile first, then use its edge profile as reference for all
other variants.

**Color:** warm sand-brown base `#b09060`, slightly raised stone borders
`#8a7a60`, subtle wheel rut marks in center `#9a8050`.

### Asset List

| # | Filename | Dir | Size | Description |
|---|----------|-----|------|-------------|
| 1 | `road_h.png` | `roads/` | 128x128 | Straight horizontal segment |
| 2 | `road_v.png` | `roads/` | 128x128 | Straight vertical segment |
| 3 | `road_corner_ne.png` | `roads/` | 128x128 | 90-degree corner, south-to-east |
| 4 | `road_corner_nw.png` | `roads/` | 128x128 | 90-degree corner, south-to-west |
| 5 | `road_corner_se.png` | `roads/` | 128x128 | 90-degree corner, north-to-east |
| 6 | `road_corner_sw.png` | `roads/` | 128x128 | 90-degree corner, north-to-west |
| 7 | `road_t_n.png` | `roads/` | 128x128 | T-junction open to north, east, west |
| 8 | `road_t_s.png` | `roads/` | 128x128 | T-junction open to south, east, west |
| 9 | `road_t_e.png` | `roads/` | 128x128 | T-junction open to north, south, east |
| 10 | `road_t_w.png` | `roads/` | 128x128 | T-junction open to north, south, west |
| 11 | `road_cross.png` | `roads/` | 128x128 | Crossroads, open all 4 directions |
| 12 | `road_dead_n.png` | `roads/` | 128x128 | Dead end, road enters from south, rounded terminus north |
| 13 | `road_dead_s.png` | `roads/` | 128x128 | Dead end, road enters from north, rounded terminus south |
| 14 | `road_dead_e.png` | `roads/` | 128x128 | Dead end, road enters from west, rounded terminus east |
| 15 | `road_dead_w.png` | `roads/` | 128x128 | Dead end, road enters from east, rounded terminus west |
| 16 | `road_icon.png` | `icons/` | 64x64 | UI build-menu icon |

**Note:** `road_dead_*` variants were listed as 4 in the checklist. This plan
includes all 4, bringing the road set to 13 directional + 1 icon = 14 total.
(ASSET_CHECKLIST.md counts 13 tile variants + 1 icon.)

### Prompts

#### road_h.png — Straight Horizontal

> [Style prefix], a packed earth road segment for a top-down tile-based city builder, oriented horizontally left-to-right filling the full tile width, warm sand-brown color (#b09060), slightly raised stone borders along the north and south edges (#8a7a60), subtle wheel ruts running horizontally through the center (#9a8050), worn and well-traveled surface, seamless tileable left and right edges (road meets tile edge at identical position and width), transparent background above and below the road strip, top-down isometric view, warm neutral tones.

#### road_v.png — Straight Vertical

> [Style prefix], a packed earth road segment oriented vertically top-to-bottom filling the full tile height, warm sand-brown color (#b09060), slightly raised stone borders along the east and west edges, subtle wheel ruts running vertically, seamless tileable top and bottom edges matching the horizontal tile's road width and edge position, transparent background left and right.

#### road_corner_ne.png — Corner NE (south-to-east turn)

> [Style prefix], a packed earth road corner segment turning from south edge to east edge (90-degree bend, inner corner at southwest), warm sand-brown color (#b09060), slightly raised stone borders on the outer curve, subtle wheel ruts following the curve, seamless connection at south and east tile edges matching straight road width, transparent background on unused corners.

#### road_corner_nw.png — Corner NW

> [Same as corner_ne but] turning from south edge to west edge, inner corner at southeast.

#### road_corner_se.png — Corner SE

> [Same as corner_ne but] turning from north edge to east edge, inner corner at northwest.

#### road_corner_sw.png — Corner SW

> [Same as corner_ne but] turning from north edge to west edge, inner corner at northeast.

#### road_t_n.png — T-Junction North

> [Style prefix], a packed earth road T-junction segment, road enters from east, west, and north edges (closed on south), warm sand-brown color (#b09060), slightly raised stone borders on the south edge where the road ends, seamless connection at north, east, and west tile edges, transparent background at unused south corners.

#### road_t_s.png / road_t_e.png / road_t_w.png

> [Same T-junction pattern, rotated.] road_t_s: open south/east/west. road_t_e: open north/south/east. road_t_w: open north/south/west.

#### road_cross.png — Crossroads

> [Style prefix], a packed earth road crossroads segment, road extends to all four tile edges (north, south, east, west), warm sand-brown color, stone borders only at the four corners where road doesn't reach, seamless connection on all four edges, subtle wheel ruts crossing in both directions.

#### road_dead_n.png — Dead End North

> [Style prefix], a packed earth road dead end, road enters from south edge and terminates in a rounded bulge toward the north, warm sand-brown color, stone border curving around the terminus, seamless at south edge, transparent background around the terminus. Adapt for \_s (enters north, ends south), \_e (enters west, ends east), \_w (enters east, ends west).

#### road_icon.png — UI Icon

> [UI icon prefix], a small top-down road segment icon, packed earth path with stone borders, warm sand-brown tones, simplified for 64x64 pixel display, clear and readable at small size.

### QA Checklist — Wave 1

- [ ] Lay road_h next to road_h: edges align perfectly, no visible seam
- [ ] Lay road_v next to road_v: same test
- [ ] Build an L-shape with road_v + road_corner_se + road_h: all three connect
- [ ] Build a T: road_h + road_t_n + road_h: north stem connects to road_v
- [ ] Build a cross: road_cross surrounded by 4 straight tiles
- [ ] Dead ends: each dead end connects to its matching straight
- [ ] Shrink all tiles to 48px: road path still clearly visible
- [ ] Color consistency: all tiles use the same sand-brown family

---

## Wave 2: Housing T1 + T2 (6 assets)

### Context

Housing provides workers. T1 (Hut) exists in-game now. T2 (House) is the planned
upgrade. Each tier has idle (empty/unoccupied) and occupied states, plus a UI icon.

**Color family:** warm gray `#7a7060` — neutral civic tone, distinct from all
industry hues.

### Asset List

| # | Filename | Dir | Size | Description |
|---|----------|-----|------|-------------|
| 1 | `housing_t1_idle.png` | `assets/` | 128x128 | Tier 1 hut, empty |
| 2 | `housing_t1_working.png` | `assets/` | 128x128 | Tier 1 hut, occupied |
| 3 | `housing_t1_icon.png` | `icons/` | 64x64 | Tier 1 build-menu icon |
| 4 | `housing_t2_idle.png` | `assets/` | 128x128 | Tier 2 house, empty |
| 5 | `housing_t2_working.png` | `assets/` | 128x128 | Tier 2 house, occupied |
| 6 | `housing_t2_icon.png` | `icons/` | 64x64 | Tier 2 build-menu icon |

### Prompts

#### housing_t1_idle.png — Hut, Empty

> [Style prefix], a small humble dwelling hut, empty and unoccupied. Simple round or rectangular hut with rough thatch roof, dark empty window openings, no smoke from the roof hole, no signs of life, slightly weathered and neglected look with cracked mud walls, muted warm gray-brown tones (#7a7060). Ground contact at bottom 15% of canvas. Clearly residential — no tools, no production materials. Silhouette reads as a low rounded or rectangular domestic shape, distinct from any workshop.

#### housing_t1_working.png — Hut, Occupied

> [Style prefix], a small humble dwelling hut, occupied and lived-in. Same round or rectangular hut shape as the idle version but alive — warm golden-orange light glowing from the window openings, thin wispy smoke rising from a roof hole or small clay chimney, a simple laundry line with cloth or a clay cooking pot outside, welcoming cozy atmosphere. Warmer more saturated tones than idle. Must be clearly the same building as t1_idle but with obvious life signs.

#### housing_t1_icon.png

> [UI icon prefix], a small humble thatch-roofed hut, simplified for 64x64 display, warm gray-brown tones, clear residential silhouette, cozy dwelling.

#### housing_t2_idle.png — House, Empty

> [Style prefix], a small two-story house, empty and unoccupied. Rectangular stone-and-timber building with clay tile roof in terracotta tones, all window shutters closed, no smoke from the chimney, no hanging goods or flower boxes, clean but lifeless, muted warm tones (#7a7060). Noticeably taller than the Tier 1 hut — visible second story or upper floor with its own windows. Silhouette progression: obviously an upgrade from the round/low T1 hut.

#### housing_t2_working.png — House, Occupied

> [Style prefix], a small two-story house, occupied and lived-in. Same rectangular stone-and-timber form as t2_idle but alive — open shutters with warm golden light inside on both floors, thin chimney smoke, a flower box in an upper window, hanging baskets or drying goods outside, lively domestic feel. Warmer saturated tones. Must be clearly the same building as t2_idle but with obvious habitation.

#### housing_t2_icon.png

> [UI icon prefix], a small two-story stone-and-timber house with clay tile roof, simplified for 64x64 display, warm tones, clear upgraded residential silhouette, taller than a hut.

### QA Checklist — Wave 2

- [ ] T1 idle vs occupied: side by side, occupied is clearly "alive" (light, smoke)
- [ ] T2 idle vs occupied: same test
- [ ] T1 vs T2: T2 is visibly larger/taller — clear upgrade progression
- [ ] Both tiers at 48px: residential shape reads, not confused with workshops
- [ ] Color: both use neutral warm gray, not industry-coded
- [ ] Both sit properly on road tiles (ground contact aligns)

---

## Wave 3: Grain Chain — Idle States (7 assets)

### Context

Agriculture/Grain is the most likely first new industry. Chain: Grain Farm
(extractor) -> Granary (storage) -> Mill (processor) -> Bakery (processor).

**Color family:** gold-tan `#c4a035` — warm golden wheat tones.

### Asset List

| # | Filename | Dir | Size | Description |
|---|----------|-----|------|-------------|
| 1 | `grain_farm_idle.png` | `assets/` | 128x128 | Wheat field, unharvested |
| 2 | `granary_idle.png` | `assets/` | 128x128 | Raised storage, sealed |
| 3 | `mill_idle.png` | `assets/` | 128x128 | Grain mill, stationary |
| 4 | `bakery_idle.png` | `assets/` | 128x128 | Brick oven bakery, cold |
| 5 | `res_grain.png` | `resources/` | 32x32 | Grain resource icon |
| 6 | `res_flour.png` | `resources/` | 32x32 | Flour resource icon |
| 7 | `res_bread.png` | `resources/` | 32x32 | Bread resource icon |

### Prompts

#### grain_farm_idle.png — Grain Farm, Idle

> [Style prefix], a small grain farm with a golden wheat field, idle and unharvested. The wheat field takes up most of the tile — low, wide, horizontal composition emphasizing open farmland. A small wooden shed or lean-to sits at one corner (not dominating the scene). A scythe rests against the shed wall. Tall golden grain stalks stand still and untouched, slightly swaying feel but no workers or activity. Pale washed-out gold tones (#c4a035 desaturated). Ground contact: field sits at ground level. Silhouette is distinctly flat and wide — reads as "farm" not "building." Extractor identity: open, raw, no walls or enclosure.

#### granary_idle.png — Granary, Idle

> [Style prefix], a raised grain storage building, idle and sealed. Tall narrow building elevated on wooden stilts or a raised stone platform — distinctive peaked or conical thatched roof. Grain sacks visible inside through slat walls but static. A wooden ladder or ramp leads up to the entrance. No workers, no activity, sealed up tight. Muted gold-tan tones. Silhouette: uniquely tall and narrow with a pointed top on stilts — unlike any other building in the game. Much taller than the low grain farm.

#### mill_idle.png — Mill, Idle

> [Style prefix], a small grain mill building, idle and still. Compact stone building with a prominent visible millstone or grinding wheel element. Small windmill sail structure on top, sails stationary and unmoving. Grain sacks stacked at the entrance, flour sacks on the output side. No dust, no rotation, no grinding. Cool tan-gray tones (#c4a035 shifted cool). Silhouette: building body with a distinctive circular or sail element on top — reads as "mill" at any size. Processor identity: enclosed, walls, roof.

#### bakery_idle.png — Bakery, Idle

> [Style prefix], a small bakery with a prominent brick oven, idle and cold. Small stone or clay building body with a distinctive domed brick oven bump on one side — the dome is the key silhouette element. A chimney or oven vent rises from the dome with no smoke. A bread display shelf or cooling rack outside sits empty or with just one old loaf. Flour sacks lean by the door. Oven opening is dark — no glow. Muted warm tan tones. Silhouette: building + dome bump. Similar to the kiln's dome but paired with a proper building body and shelf — distinct from the standalone beehive kiln shape.

#### res_grain.png — Grain Icon

> [Resource icon prefix], a small bundle of golden wheat stalks tied together in a sheaf, warm gold-tan color (#c4a035), 3-5 stalks with grain heads visible at the top fanning outward, simple and bold, instantly readable as "wheat" or "grain" at 32x32 pixels.

#### res_flour.png — Flour Icon

> [Resource icon prefix], a small open sack of white flour, pale cream-white color with a warm tan sack, flour slightly spilling or mounded at the top of the sack, simple and bold, reads as "flour" at 32x32 pixels.

#### res_bread.png — Bread Icon

> [Resource icon prefix], a single round loaf of golden-brown bread, warm brown crust with lighter score marks on top, simple artisan round shape, reads as "bread" at 32x32 pixels, appetizing warm tones.

### QA Checklist — Wave 3

- [ ] Grain farm reads as an open field, not a building
- [ ] Granary reads as a tall storage structure, not a workshop
- [ ] Mill has a clear circular/sail element distinguishing it
- [ ] Bakery dome is distinct from the kiln dome (has building body + shelf)
- [ ] All 4 buildings share the gold-tan color family
- [ ] At 48px: can tell farm from granary from mill from bakery
- [ ] Resource icons readable at 32px and 16px
- [ ] Grain → Flour → Bread progression makes visual sense (raw → processed → finished)

---

## Wave 4: Grain Chain — Working States (4 assets)

### Context

Generate working variants with idle sprites open as reference. Each working
state must be the same building but obviously active — brighter colors, visible
motion cues, warm glow where applicable.

### Asset List

| # | Filename | Dir | Size |
|---|----------|-----|------|
| 1 | `grain_farm_working.png` | `assets/` | 128x128 |
| 2 | `granary_working.png` | `assets/` | 128x128 |
| 3 | `mill_working.png` | `assets/` | 128x128 |
| 4 | `bakery_working.png` | `assets/` | 128x128 |

### Prompts

#### grain_farm_working.png — Grain Farm, Working

> [Style prefix], a small grain farm actively being harvested — same field and shed layout as the idle version but now alive with activity. A worker swings a scythe through the golden wheat, stalks falling and being gathered. Bundled sheaves of harvested grain are stacked in the cut portion of the field. Chaff and golden dust particles float in the air. Rich warm saturated gold tones (#c4a035 at full saturation) — noticeably warmer and brighter than the idle version. The field is partially cut (some tall grain remains, some is harvested) showing progress.

#### granary_working.png — Granary, Working

> [Style prefix], the same raised granary building as the idle version but actively receiving grain. A worker carries a grain sack up the ramp or ladder. Grain dust and chaff particles fall from a chute at the side. The building has a warm golden interior glow suggesting full stores inside, visible through the slat walls. Warmer, richer gold-tan tones than idle. Activity and purpose — grain is flowing in.

#### mill_working.png — Mill, Working

> [Style prefix], the same grain mill building as the idle version but actively grinding. The millstone is turning — visible rotation motion blur on the grinding wheel. Windmill sails are spinning on top (motion blur or angled positions suggesting rotation). A flour dust cloud floats around the grinder area and near the output side. Grain sacks are being emptied into the hopper. Warm golden-white flour highlights. Richer, more saturated gold tones than idle. The circular elements are clearly in motion.

#### bakery_working.png — Bakery, Working

> [Style prefix], the same bakery building as the idle version but actively baking. The domed brick oven glows warm orange-red from the opening — strongest glow in the grain chain. Thin wispy smoke rises from the chimney vent. Fresh golden-brown bread loaves are displayed on the cooling shelf outside (3-4 round loaves with warm highlights). Flour sacks are open by the door. The entire building radiates warm inviting tones — golden, amber, bread-brown. Must feel welcoming and productive. Noticeably warmer and more colorful than the cold idle version.

### QA Checklist — Wave 4

- [ ] Each working state is clearly the same building as its idle counterpart
- [ ] Each working state is obviously more active (motion, glow, particles)
- [ ] State contrast test: idle and working side by side at 48px — can tell which is active
- [ ] Grain farm: partially harvested field reads as "in progress"
- [ ] Bakery: oven glow is the warmest/brightest element in the chain
- [ ] Color saturation increases from idle → working across all 4

---

## Wave 5: Clay Chain — Idle States (6 assets)

### Context

Clay/Ceramics chain: Clay Pit (extractor) -> Kiln (processor) -> Potter Workshop
(processor). Three buildings, three resource icons.

**Color family:** terracotta `#a06040` — warm reddish-brown earth tones.

### Asset List

| # | Filename | Dir | Size | Description |
|---|----------|-----|------|-------------|
| 1 | `clay_pit_idle.png` | `assets/` | 128x128 | Open clay excavation, dormant |
| 2 | `kiln_idle.png` | `assets/` | 128x128 | Beehive kiln, cold |
| 3 | `potter_workshop_idle.png` | `assets/` | 128x128 | Pottery workshop, quiet |
| 4 | `res_clay.png` | `resources/` | 32x32 | Clay resource icon |
| 5 | `res_pottery.png` | `resources/` | 32x32 | Pottery resource icon |
| 6 | `res_fired_brick.png` | `resources/` | 32x32 | Fired brick resource icon |

### Prompts

#### clay_pit_idle.png — Clay Pit, Idle

> [Style prefix], a shallow open clay excavation pit, idle and dormant. A depression in the ground with visible reddish-brown clay walls — the pit takes up most of the tile. A wooden bucket or woven basket sits at the pit edge. A shovel rests against the clay bank. The exposed clay surface has a dried, cracked crust from the sun. No workers, no wet sheen. Muted dusty terracotta-brown tones (#a06040 desaturated). Silhouette: a shallow depression with raised edges and a bucket shape — lower profile than the stone quarry's cliff face. Extractor identity: open, raw, no enclosure. Sun-baked and still.

#### kiln_idle.png — Kiln, Idle

> [Style prefix], a beehive-shaped pottery firing kiln, idle and cold. Distinctive round domed structure — the dome is the defining silhouette element, unique among all buildings. A small chimney vent sits on top of the dome. Stacked unfired clay pots and bricks sit on one side waiting. A firewood pile is stacked neatly near the kiln mouth opening. The kiln mouth is dark — no glow, no heat. No smoke from the vent. Muted cool terracotta tones (#a06040 cooled). The dome shape must read clearly even at 48px — this building's identity IS the dome.

#### potter_workshop_idle.png — Potter Workshop, Idle

> [Style prefix], a small pottery workshop, idle and quiet. Small enclosed building with a wide arched doorway or open front. Inside, a potter's wheel is visible — a distinctive circular element — but stationary and empty. Shelves along the back wall hold finished clay pots and vessels of various sizes. A water bucket and clay dust on the floor near the wheel. Dim interior, no workers. Muted warm terracotta tones. Silhouette: enclosed building with a circular wheel element visible in the doorway + shelf profile. Processor identity: enclosed, has walls and roof, more refined than the open pit.

#### res_clay.png — Clay Icon

> [Resource icon prefix], a lump of wet reddish-brown clay, earthy terracotta color (#a06040), irregular rounded mound shape with a slight wet sheen highlight, simple and bold, reads as "raw clay" at 32x32 pixels.

#### res_pottery.png — Pottery Icon

> [Resource icon prefix], a small finished clay pot or amphora, terracotta-orange color with a slightly darker rim, classic rounded vessel shape with a narrow neck, simple and bold, reads as "pottery" at 32x32 pixels.

#### res_fired_brick.png — Fired Brick Icon

> [Resource icon prefix], two stacked fired clay bricks, warm terracotta-red color (#a06040 slightly redder), rectangular brick shapes with visible mortar line between them, simple and bold, reads as "brick" at 32x32 pixels.

### QA Checklist — Wave 5

- [ ] Clay pit reads as an open depression, not a building
- [ ] Kiln dome is immediately recognizable — the most distinctive shape in the chain
- [ ] Potter workshop is clearly enclosed (processor) vs clay pit (extractor)
- [ ] Kiln dome vs bakery dome (Wave 3): kiln is a standalone dome, bakery dome is attached to a building body — they should not be confused
- [ ] All 3 buildings share the terracotta color family, distinct from grain's gold-tan
- [ ] Resource icons readable at 32px
- [ ] Clay → Pottery → Fired Brick: visual progression from raw lump to shaped vessel to structural block

---

## Wave 6: Clay Chain — Working States (3 assets)

### Asset List

| # | Filename | Dir | Size |
|---|----------|-----|------|
| 1 | `clay_pit_working.png` | `assets/` | 128x128 |
| 2 | `kiln_working.png` | `assets/` | 128x128 |
| 3 | `potter_workshop_working.png` | `assets/` | 128x128 |

### Prompts

#### clay_pit_working.png — Clay Pit, Working

> [Style prefix], the same shallow clay excavation pit as the idle version but actively being dug. A worker digs with a shovel, lifting wet clay chunks into a bucket. The clay walls have a damp wet sheen with puddle reflections in the pit bottom (subtle blue-water accent). Muddy splash particles near the dig point. Warmer saturated orange-brown terracotta tones (#a06040 at full saturation) — wetter and more alive than the dry idle version. The bucket is being filled. Earthy, muddy, productive.

#### kiln_working.png — Kiln, Working

> [Style prefix], the same beehive-shaped kiln as the idle version but actively firing. Bright orange-red glow pours from the kiln mouth opening — this is the dramatic focal point. Smoke and heat shimmer wisps rise from the chimney vent on top. Warm orange-red light is cast on the ground nearby and on the stacked pots waiting to be fired. The firewood pile is partially consumed. Rich warm terracotta and glowing orange tones. The glow from the mouth is the strongest single light source in the clay chain — it should read even at 48px as "this kiln is hot."

#### potter_workshop_working.png — Potter Workshop, Working

> [Style prefix], the same pottery workshop as the idle version but actively producing. The potter's wheel spins — motion lines or blur on the circular wheel element. A clay form is being shaped on the spinning wheel, wet and glistening. The interior has a warm glow. Water and clay splash droplets near the wheel. The shelves are filling with freshly made pots (more pots than idle, some with wet sheen). Warm saturated terracotta tones. The spinning wheel motion is the key activity indicator.

### QA Checklist — Wave 6

- [ ] Each working state matches its idle building shape
- [ ] Clay pit: wet vs dry is the key visual difference
- [ ] Kiln: mouth glow is unmissable, even at small scale
- [ ] Potter: wheel motion is visible
- [ ] State contrast: idle and working side by side — clearly different activity levels
- [ ] Kiln glow and bakery glow (Wave 4): similar concept but different dome shapes prevent confusion

---

## Final Pass: UI Icons (8 assets)

After all waves are complete, generate build-menu icons for the 8 new buildings.
Base each icon on the working-state sprite (occupied for housing) since the
working state is more visually interesting and recognizable.

| # | Filename | Dir | Size | Source reference |
|---|----------|-----|------|-----------------|
| 1 | `grain_farm_icon.png` | `icons/` | 64x64 | grain_farm_working |
| 2 | `granary_icon.png` | `icons/` | 64x64 | granary_working |
| 3 | `mill_icon.png` | `icons/` | 64x64 | mill_working |
| 4 | `bakery_icon.png` | `icons/` | 64x64 | bakery_working |
| 5 | `clay_pit_icon.png` | `icons/` | 64x64 | clay_pit_working |
| 6 | `kiln_icon.png` | `icons/` | 64x64 | kiln_working |
| 7 | `potter_workshop_icon.png` | `icons/` | 64x64 | potter_workshop_working |
| 8 | `road_icon.png` | `icons/` | 64x64 | road_h (already in Wave 1) |

Icon prompt pattern:

> [UI icon prefix], [building name] simplified for 64x64 display, based on the working/active state, [key identifying element], [industry color], clear silhouette at small scale.

---

## Post-Generation Processing Pipeline

Apply to every asset after generation, before marking as done in ASSET_CHECKLIST.md.

1. **Background removal** — run through rembg or equivalent. Verify clean alpha edges with no color fringing.
2. **Resize to target** — 128x128 for sprites, 64x64 for icons, 32x32 for resource icons. Use nearest-neighbor or Lanczos resampling, not bilinear (avoids mushiness at pixel scale).
3. **Center and position** — building fills center 80-90% of canvas. Ground contact at bottom 15%.
4. **Strip ICC profile** — export as sRGB PNG-32 RGBA, no embedded profile, no interlacing.
5. **48px shrink test** — scale to 48x48 and verify: can you identify the building? Can you distinguish idle from working? Can you tell the industry color?
6. **Seamless edge test (roads only)** — tile horizontally and vertically, check for visible seams.
7. **Rename to convention** — verify filename matches NAMING_CONVENTIONS.md exactly.
8. **Place in correct directory** — `assets/`, `icons/`, `resources/`, or `roads/` per the directory structure.

---

## Summary

| Wave | Count | Category |
|------|-------|----------|
| 1 | 14 | Road tiles + icon |
| 2 | 6 | Housing T1 + T2 (idle, occupied, icons) |
| 3 | 7 | Grain chain idle + resource icons |
| 4 | 4 | Grain chain working |
| 5 | 6 | Clay chain idle + resource icons |
| 6 | 3 | Clay chain working |
| Final | 7 | UI icons (grain + clay buildings) |
| **Total** | **47** | |

This batch covers Priority Tiers 1B (Roads + Housing), 2 (Grain), and 3 (Clay)
from ASSET_CHECKLIST.md. On completion, update each asset's status from `[ ]` to
`[x]` in ASSET_CHECKLIST.md.
