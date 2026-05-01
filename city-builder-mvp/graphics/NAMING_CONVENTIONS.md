# Naming & Export Conventions

## File Naming Pattern

```
{building_key}_{state}.png
```

- `building_key` matches the database key exactly (see full registry below)
- `state` is one of: `idle`, `working`
- Always lowercase, underscores only, no spaces or hyphens

### Examples

```
timber_camp_idle.png
timber_camp_working.png
grain_farm_idle.png
grain_farm_working.png
smelter_idle.png
smelter_working.png
```

### Sprite Sheets (future)

When animated sprite sheets are needed, append `_sheet` and include a sidecar JSON:

```
timber_camp_working_sheet.png
timber_camp_working_sheet.json   ← frame count, frame size, loop info
```

### Icons / Thumbnails

For UI panel icons (build menu, tooltips):

```
timber_camp_icon.png
grain_farm_icon.png
smelter_icon.png
```

### Resource Icons

Prefixed with `res_`:

```
res_timber.png
res_grain.png
res_copper_ore.png
res_luxury_goods.png
```

### Road Tiles

Roads use directional suffixes instead of state:

```
road_h.png              ← horizontal straight
road_v.png              ← vertical straight
road_corner_ne.png      ← corner variants: ne, nw, se, sw
road_t_n.png            ← T-junction variants: n, s, e, w
road_cross.png          ← crossroads
road_dead_n.png         ← dead end variants: n, s, e, w
road_icon.png           ← UI icon
```

### Shared / Map Assets

```
city_center.png
tile_highlight.png
```

---

## Building Key Registry

Complete list of all building keys across all industries. Each key is the canonical identifier used in filenames, code references, and asset lookups.

### Forestry / Wood
| Building | Key |
|---|---|
| Timber Camp | `timber_camp` |
| Sawmill | `sawmill` |
| Carpenter Yard | `carpenter_yard` |
| Furniture Workshop | `furniture_workshop` |

### Stone / Masonry
| Building | Key |
|---|---|
| Stone Quarry | `stone_quarry` |
| Mason Workshop | `mason_workshop` |
| Stone Depot | `stone_depot` |
| Monument Mason | `monument_mason` |

### Clay / Ceramics
| Building | Key |
|---|---|
| Clay Pit | `clay_pit` |
| Kiln | `kiln` |
| Potter Workshop | `potter_workshop` |

### Agriculture / Grain
| Building | Key |
|---|---|
| Grain Farm | `grain_farm` |
| Granary | `granary` |
| Mill | `mill` |
| Bakery | `bakery` |

### Livestock / Animal Goods
| Building | Key |
|---|---|
| Cattle Ranch | `cattle_ranch` |
| Sheep Pasture | `sheep_pasture` |
| Butcher | `butcher` |
| Dairy | `dairy` |

### Textile / Clothing
| Building | Key |
|---|---|
| Weaver | `weaver` |
| Dyer | `dyer` |
| Clothier | `clothier` |

### Reed / Papyrus
| Building | Key |
|---|---|
| Reed Gatherer | `reed_gatherer` |
| Papyrus Maker | `papyrus_maker` |
| Scribe Supply Workshop | `scribe_supply_workshop` |

### Brewing
| Building | Key |
|---|---|
| Brewery | `brewery` |
| Beer Storehouse | `beer_storehouse` |

### Fishing / River Economy
| Building | Key |
|---|---|
| Fishing Wharf | `fishing_wharf` |
| Fishmonger | `fishmonger` |
| Smokehouse | `smokehouse` |

### Mining / Metals
| Building | Key |
|---|---|
| Copper Mine | `copper_mine` |
| Tin Mine | `tin_mine` |
| Smelter | `smelter` |
| Bronze Smith | `bronze_smith` |

### Luxury Goods
| Building | Key |
|---|---|
| Jewel Workshop | `jewel_workshop` |
| Perfumery | `perfumery` |
| Luxury Bazaar | `luxury_bazaar` |

### Civic / Infrastructure
| Building | Key |
|---|---|
| Housing Tier 1 | `housing_t1` |
| Housing Tier 2 | `housing_t2` |
| Road | `road` |
| Storage Yard | `storage_yard` |
| Market Hall | `market_hall` |
| Labor Office | `labor_office` |

---

## Resource Icon Registry

Complete list of all resource icon keys.

| Resource | Filename |
|---|---|
| Timber | `res_timber.png` |
| Lumber | `res_lumber.png` |
| Furniture | `res_furniture.png` |
| Stone | `res_stone.png` |
| Brick | `res_brick.png` |
| Cut Stone | `res_cut_stone.png` |
| Clay | `res_clay.png` |
| Pottery | `res_pottery.png` |
| Fired Brick | `res_fired_brick.png` |
| Grain | `res_grain.png` |
| Flour | `res_flour.png` |
| Bread | `res_bread.png` |
| Meat | `res_meat.png` |
| Milk | `res_milk.png` |
| Wool | `res_wool.png` |
| Hides | `res_hides.png` |
| Cloth | `res_cloth.png` |
| Dyed Cloth | `res_dyed_cloth.png` |
| Clothing | `res_clothing.png` |
| Reeds | `res_reeds.png` |
| Papyrus | `res_papyrus.png` |
| Beer | `res_beer.png` |
| Fish | `res_fish.png` |
| Dried Fish | `res_dried_fish.png` |
| Copper Ore | `res_copper_ore.png` |
| Tin Ore | `res_tin_ore.png` |
| Bronze | `res_bronze.png` |
| Tools | `res_tools.png` |
| Jewelry | `res_jewelry.png` |
| Perfume | `res_perfume.png` |
| Luxury Goods | `res_luxury_goods.png` |

---

## Export Specifications

### Sprite Dimensions

| Use case | Size | Notes |
|---|---|---|
| Map sprite (primary) | **128x128 px** | Renders down to ~48-60px on screen. 128px source gives clean 2x/3x downscaling. |
| UI icon / thumbnail | **64x64 px** | For build panel, tooltips, resource bars. |
| Resource icon | **32x32 px** | For resource counters and trade panels. |
| Sprite sheet frame | **128x128 px per frame** | Horizontal strip. 3-4 frames typical. |
| Road tile | **128x128 px** | Must tile seamlessly at edges. |

### Format Rules

- **Format:** PNG-32 (RGBA)
- **Background:** fully transparent (alpha = 0)
- **Color space:** sRGB
- **No embedded ICC profiles** — strip on export for consistency
- **No interlacing** — smaller file size
- **Trim whitespace:** sprite should fill the canvas with minimal padding (~4px margin max)

### Art Bounds

- The building graphic should occupy roughly the **center 80-90%** of the 128x128 canvas.
- Leave a few pixels of transparent margin on all sides so buildings don't visually touch cell edges.
- Ground contact should be at the **bottom ~15%** of the canvas — buildings sit on the tile, not float in the center.

### Animation Sprite Sheets

- Frames arranged **horizontally** in a single row.
- All frames same size (128x128).
- Sidecar `.json` spec:

```json
{
  "frames": 4,
  "frameWidth": 128,
  "frameHeight": 128,
  "loop": true,
  "frameDuration": 250
}
```

---

## Directory Structure

```
graphics/
  assets/              ← final production sprites go here
    timber_camp_idle.png
    timber_camp_working.png
    grain_farm_idle.png
    ...
  icons/               ← UI icons (64x64 building icons)
    timber_camp_icon.png
    grain_farm_icon.png
    ...
  resources/           ← resource icons (32x32)
    res_timber.png
    res_grain.png
    ...
  roads/               ← road tile variants (128x128)
    road_h.png
    road_v.png
    road_corner_ne.png
    ...
  sheets/              ← animated sprite sheets + JSON
    timber_camp_working_sheet.png
    timber_camp_working_sheet.json
    ...
  concepts/            ← early concepts, explorations, AI generations (not shipped)
```

---

## Code Integration Notes

The current MVP uses hardcoded CSS colors (see `css/styles.css` lines 75-80) and 2-letter labels (see `js/map.js` lines 7-10 `BLDG_LABELS`). When sprites are ready:

- Building divs (`.bldg` in `map.js`) would get a `background-image` instead of `background-color`
- The 2-letter label can be hidden or kept as a fallback
- The `BLDG_LABELS` map in `map.js` could be extended to include asset paths, e.g.:

```js
const BLDG_ASSETS = {
  timber_camp:    'graphics/assets/timber_camp',
  sawmill:        'graphics/assets/sawmill',
  stone_quarry:   'graphics/assets/stone_quarry',
  mason_workshop: 'graphics/assets/mason_workshop',
  grain_farm:     'graphics/assets/grain_farm',
  // ...
};
```

State suffix (`_idle` or `_working`) gets appended based on building `status` at render time.

This is noted for reference only — no code changes until assets are ready.
