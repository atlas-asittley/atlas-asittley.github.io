# Building-by-Building Art Direction Notes

## Global Style Rules

- **Palette:** warm earth tones — sun-baked clay, aged wood, warm stone. Mediterranean / ancient settlement vibe.
- **Silhouette first:** every building must be identifiable by outline alone at 48x48px.
- **Phone readability:** assets will render inside ~40-60px cells on mobile. Avoid interior detail that disappears at that scale. Favor bold shapes and strong value contrast.
- **Transparent background:** all sprites on transparent PNG. No baked ground plane — the map tile provides that.
- **Consistent lighting:** top-left light source across all buildings, soft shadow to bottom-right.
- **Industry color coding:** each industry group carries a dominant hue so players can cluster-read their city at a glance. See per-industry sections below.

---

## Industry Visual Identity Map

Quick reference for the color and shape language of each industry group.

| Industry | Dominant Hue | Shape Language | Identifying Motif |
|---|---|---|---|
| Forestry / Wood | Forest green `#3a7a4a` | Open sites, A-frames, timber piles | Logs, axes, sawdust |
| Stone / Masonry | Blue-gray `#5a5a7a` | Heavy blocks, low walls, chimneys | Stone blocks, chisels, scaffolding |
| Clay / Ceramics | Terracotta `#a06040` | Round kilns, open pits, stacked pots | Kilns, clay vessels, orange glow |
| Agriculture / Grain | Gold-tan `#c4a035` | Low fields, pitched roofs, silos | Wheat sheaves, millstones, ovens |
| Livestock | Warm tan `#8a7a50` | Fenced areas, barn shapes | Animals, fence posts, troughs |
| Textile / Clothing | Muted purple `#7a5a8a` | Workshops with hanging cloth | Draped fabric, dye vats, looms |
| Reed / Papyrus | Pale sage `#8a9a4a` | Waterside huts, drying racks | Reed bundles, flat sheets |
| Brewing | Amber `#9a6a2a` | Barrel shapes, squat buildings | Barrels, frothy vats, grain sacks |
| Fishing | Teal-blue `#4a7a8a` | Docks, stilts, nets | Nets, fish racks, boats |
| Mining / Metals | Dark charcoal `#5a5050` | Cave mouths, forges with glow | Ore piles, anvils, furnace glow |
| Luxury Goods | Rich gold `#9a7a3a` | Ornate stalls, fine workshops | Gems, bottles, draped canopies |
| Civic / Infrastructure | Warm gray `#7a7060` | Simple functional shapes | Roads, crates, market awnings |

---

## 1) Forestry / Wood

Industry color: forest green `#3a7a4a` / warm brown `#7a5a2a`

### Timber Camp

**What it is:** a simple logging station in the woods. Not a full building — more of a work site.

**Key visual elements:**
- A-frame lean-to or open-sided shelter made of rough logs
- Stacked cut logs / log pile nearby
- Tree stump with axe embedded (idle marker)
- Optional: small campfire or lantern for warmth

**Idle state:**
- Static scene. Axe resting in stump. Logs stacked neatly. No motion, no smoke. Feels quiet and abandoned.
- Muted colors — slightly desaturated greens and browns.

**Working state:**
- Visible activity: sawdust particles, an axe mid-swing (or motion blur on axe), a log being dragged.
- Small smoke/dust puff near the work area.
- Warmer, more saturated palette. Campfire lit if included.
- If sprite sheet: 3-4 frame loop of axe chopping motion + sawdust.

**Silhouette hint:** triangular lean-to + vertical log stack = instantly reads as "wood camp."

### Sawmill

**What it is:** a small timber-frame workshop with a large saw mechanism. Converts raw timber into lumber.

**Key visual elements:**
- A-frame or gabled workshop building, open front or large doorway
- Prominent circular saw blade or pit-saw visible through the opening
- Log on a feed rail entering the saw
- Stack of finished planks / lumber on the output side
- Sawdust pile

**Idle state:**
- Saw blade stationary. No log in the feed. Finished planks stacked neatly. Building closed up or dim inside. Silent.
- Slightly cooler browns, less saturated.

**Working state:**
- Saw blade spinning (motion lines or blur).
- Log actively feeding through — visible movement.
- Sawdust spray / debris particles.
- Warm glow from inside the workshop (lantern or activity light).
- If sprite sheet: 3-4 frame loop of blade spin + log feed + sawdust spray.

**Silhouette hint:** gabled roof + large circular element (saw blade) = reads as "sawmill" even in tiny form.

### Carpenter Yard

**What it is:** an open workshop yard where lumber is shaped into beams, frames, and construction-ready wood products.

**Key visual elements:**
- Open-air work area with a partial roof or awning
- Workbench with plane, saw, and mallet
- Stacked lumber on one side, finished beams/frames on the other
- Shavings and wood curls on the ground

**Idle state:**
- Tools resting on bench. Tidy stacks. No shavings in the air. Still and quiet.
- Muted green-brown tones.

**Working state:**
- Visible planing action or sawing motion at workbench.
- Wood shavings curling off the piece being worked.
- Warm tone shift, slightly brighter wood highlights.
- If sprite sheet: 3-4 frame loop of plane stroke + shavings.

**Silhouette hint:** open yard with awning + workbench shape. Distinct from the enclosed sawmill.

### Furniture Workshop

**What it is:** an enclosed workshop producing finished furniture from processed lumber.

**Key visual elements:**
- Small enclosed building with wide doorway
- Finished furniture piece visible (chair, table, or chest outline)
- Fine woodworking tools (lathe suggestion, chisels)
- Neat interior, more refined than the carpenter yard

**Idle state:**
- Finished piece sitting by the door. Tools hung up. No activity. Dim interior.
- Cool brown tones.

**Working state:**
- Warm glow from interior. Worker shaping a piece.
- Fine sawdust or wood curl particles near the door.
- Finished piece has "fresh" highlights (lighter wood tone).
- If sprite sheet: 3 frame loop of chisel/lathe motion.

**Silhouette hint:** small house-shaped building with a visible furniture silhouette (chair/table) near the entrance.

---

## 2) Stone / Masonry

Industry color: blue-gray `#5a5a7a` / brick red `#7a4a3a`

### Stone Quarry

**What it is:** an open-pit quarry cut into rock. Low walls of exposed stone with a work platform.

**Key visual elements:**
- Exposed rock face / cliff cut (layered stone bands for visual interest)
- Wooden scaffolding or ramp leaning against the rock
- Loose stone blocks / rubble at base
- Pick or hammer tool resting on a block

**Idle state:**
- Static rock face. Tools resting. Rubble settled. No dust. Feels like a pause between shifts.
- Cool gray-blue tones dominate.

**Working state:**
- Dust cloud near rock face (impact particles).
- Pick/hammer mid-swing or sparks at contact point.
- A stone block visibly being separated from the face.
- Warmer highlights on the exposed stone — suggests recent fracture.
- If sprite sheet: 3-4 frame loop of hammer strike + dust burst.

**Silhouette hint:** angled cliff face + scaffolding = reads as "quarry." Distinct from the boxy shapes of workshops.

### Mason Workshop

**What it is:** a stone-and-timber workshop with a kiln or furnace. Converts raw stone into finished brick.

**Key visual elements:**
- Solid stone-walled building with a low roof, slightly more substantial than the sawmill
- Visible chimney or kiln stack
- Work bench with chisel / hammer
- Raw stone blocks on one side, finished bricks stacked on the other
- Optional: water trough for brick cooling

**Idle state:**
- Chimney cold — no smoke. Tools resting on workbench. Bricks stacked but no new ones being made. Quiet.
- Cooler red-brown tones, muted.

**Working state:**
- Chimney smoking (thin wisp or steady plume).
- Hammer/chisel sparks at the workbench.
- Warm glow from kiln opening (orange-red).
- Visible brick on the workbench being shaped.
- If sprite sheet: 3-4 frame loop of chisel strike + spark + smoke drift.

**Silhouette hint:** blocky building + chimney = reads as "workshop/forge." The chimney distinguishes it from the sawmill's saw blade.

### Stone Depot

**What it is:** a storage and distribution yard for processed stone. Not a production building — a logistics node.

**Key visual elements:**
- Low open-walled structure or roofed shelter
- Neatly stacked stone blocks and pallets of cut stone
- Cart or sled for moving heavy loads
- Simple overhead beam or crane arm for lifting

**Idle state:**
- Stone stacked high. Cart empty and parked. No movement. Quiet depot.
- Cool gray-blue, slightly muted.

**Working state:**
- Cart being loaded or moved. Crane arm in different position.
- Worker presence suggested by activity near stacks.
- Slightly warmer highlights, dust near ground level.

**Silhouette hint:** wide, low shelter shape with tall stacked blocks. Reads as "storage" not "production."

### Monument Mason

**What it is:** a specialized mason workshop producing prestige cut stone for monuments and grand buildings.

**Key visual elements:**
- Larger than the basic mason workshop, with a more refined appearance
- A partially carved stone column, obelisk, or statue block in the yard
- Fine chisels and precision tools
- Scaffolding around the work piece

**Idle state:**
- Unfinished carved piece sitting still. Fine dust settled. Tools laid out but untouched.
- Cool blue-gray with subtle warm stone accents.

**Working state:**
- Active carving — chisel sparks and fine stone dust.
- Scaffolding has a worker silhouette.
- The carved piece appears more defined than in idle (progress suggestion).
- Warm highlights on fresh-cut stone surfaces.

**Silhouette hint:** workshop with a tall vertical element (column/obelisk). Distinct from the basic mason's chimney.

---

## 3) Clay / Ceramics

Industry color: terracotta `#a06040`

### Clay Pit

**What it is:** an open excavation site where clay is dug and collected. Raw extraction — similar spatial feel to the quarry but softer, muddier.

**Key visual elements:**
- Shallow open pit with visible reddish-brown clay walls
- Wooden bucket or basket at the pit edge
- Shovel or digging stick
- Wet, earthy look — puddle or damp sheen

**Idle state:**
- Pit still and quiet. Tools resting at the edge. Dried clay crust. No workers.
- Muted terracotta / dusty brown.

**Working state:**
- Digging motion — shovel in clay, clay chunks being lifted.
- Wet clay sheen. Muddy splash or particle near impact.
- Warmer orange-brown saturation.
- If sprite sheet: 3 frame loop of dig + lift.

**Silhouette hint:** shallow depression with raised edges + bucket shape. Lower profile than the stone quarry.

### Kiln

**What it is:** a beehive or bottle-shaped firing kiln that converts raw clay into pottery and fired brick.

**Key visual elements:**
- Distinctive round or domed kiln structure (beehive shape)
- Chimney vent at top
- Stacked unfired pots/bricks on one side, finished glazed pieces on the other
- Firewood pile near the kiln mouth

**Idle state:**
- Kiln cold. Chimney dark. Pots stacked but no glow. Firewood stacked neatly. Quiet.
- Cool terracotta, muted.

**Working state:**
- Bright orange-red glow from kiln mouth opening.
- Smoke or heat shimmer from chimney vent.
- Warm light cast on nearby ground and pots.
- If sprite sheet: 2-3 frame loop of glow pulse + smoke drift.

**Silhouette hint:** distinctive dome/beehive shape = instantly reads as "kiln." Unique among all buildings.

### Potter Workshop

**What it is:** a small workshop where fired clay is shaped into pottery, vessels, and ceramic goods.

**Key visual elements:**
- Small enclosed building with wide doorway or open front
- Potter's wheel visible (circular element)
- Shelves of finished pots and vessels
- Clay dust and water bucket nearby

**Idle state:**
- Wheel still. Finished pots on shelves. No worker. Dim interior.
- Muted warm terracotta.

**Working state:**
- Wheel spinning (motion lines). Clay being shaped.
- Warm interior glow. Fresh wet pot on the wheel.
- Clay splash / water droplet particles.
- If sprite sheet: 3 frame loop of wheel spin + clay shape change.

**Silhouette hint:** small building with a circular wheel element in the doorway + shelf profile.

---

## 4) Agriculture / Grain

Industry color: gold-tan `#c4a035`

### Grain Farm

**What it is:** a field of wheat or barley with a small farmhouse or shed at the edge. Extractor — open and wide.

**Key visual elements:**
- Low golden grain field taking up most of the tile
- Small shed or lean-to at one corner
- Scythe or sickle tool
- Bundled sheaves of harvested grain

**Idle state:**
- Field grown but unharvested. Grain stands tall and still. No workers. Shed door closed.
- Pale gold, slightly washed out.

**Working state:**
- Grain being cut — visible scythe motion or falling stalks.
- Harvested sheaves bundled in the field.
- Warmer, richer gold tones. Dust/chaff in the air.
- If sprite sheet: 3-4 frame loop of scythe swing + stalks falling.

**Silhouette hint:** wide low field with a small structure at the edge. Very different from the vertical production buildings.

### Granary

**What it is:** a raised storage building for grain. Keeps grain off the ground and dry.

**Key visual elements:**
- Tall, narrow building on stilts or raised platform
- Visible grain sacks or grain pouring from a chute
- Ladder or ramp for access
- Distinctive peaked or conical roof

**Idle state:**
- Sealed up. Sacks visible but static. No activity around the ramp.
- Muted gold-tan.

**Working state:**
- Grain being carried up the ramp or poured into storage.
- Dust/chaff falling from the chute.
- Warmer golden glow suggesting full stores.

**Silhouette hint:** tall narrow shape on stilts with a peaked roof. Very distinct vertical profile.

### Mill

**What it is:** a grain mill with a visible grinding mechanism — either a millstone or small windmill/waterwheel.

**Key visual elements:**
- Small stone building with a prominent millstone or grinding wheel
- Optional: small sail/vane structure on top (wind) or waterwheel on the side
- Grain sack input, flour sack output
- Flour dust around the grinding area

**Idle state:**
- Millstone still. Sails/wheel motionless. Flour sacks stacked. No dust.
- Cool tan-gray.

**Working state:**
- Millstone turning (motion blur or rotation lines).
- Flour dust cloud around the grinder.
- Sails spinning or waterwheel turning.
- Warm golden-white highlights from flour.
- If sprite sheet: 3-4 frame loop of rotation + dust.

**Silhouette hint:** building with a prominent circular or sail element on top. Reads as "mill" at any size.

### Bakery

**What it is:** a small building with a brick oven producing bread from flour.

**Key visual elements:**
- Small stone or clay building with a prominent domed oven
- Chimney or oven vent
- Bread loaves displayed on a shelf or cooling rack outside
- Flour sacks by the door

**Idle state:**
- Oven cold. No smoke. Bread shelf empty or sparse. Door closed.
- Muted warm tan.

**Working state:**
- Warm orange glow from oven opening.
- Thin smoke from chimney.
- Fresh bread visible on the display shelf (golden-brown highlights).
- Pleasant warm color shift across the whole building.
- If sprite sheet: 2-3 frame loop of smoke drift + oven glow pulse.

**Silhouette hint:** small building with dome-oven bump. Similar to the kiln but paired with a proper building body and bread display.

---

## 5) Livestock / Animal Goods

Industry color: warm tan `#8a7a50`

### Cattle Ranch

**What it is:** a fenced grazing area with a simple barn or shelter.

**Key visual elements:**
- Wooden fence enclosure taking up much of the tile
- 1-2 simplified cow shapes inside the fence
- Simple barn or open shelter on one side
- Hay bale or feed trough

**Idle state:**
- Cows standing still. Fence intact. Trough empty. No workers.
- Muted tan-brown.

**Working state:**
- Cow(s) in different position (grazing or moving).
- Worker near the trough or fence.
- Fresh hay in the trough (bright yellow accent).
- Slightly more saturated warm tones.

**Silhouette hint:** fence perimeter + barn shape + animal silhouette. Reads as "ranch."

### Sheep Pasture

**What it is:** a fenced pasture with sheep, producing wool.

**Key visual elements:**
- Low stone or wood fence enclosure
- 2-3 small fluffy sheep shapes (white dots at small scale)
- Simple shelter or windbreak
- Shearing bench or wool basket

**Idle state:**
- Sheep huddled and still. No activity. Wool basket empty.
- Pale tan with white accents (sheep).

**Working state:**
- Sheep scattered and moving. Worker at shearing bench.
- Wool basket filling up (visible white wool).
- Grass appears freshly grazed (shorter, greener).

**Silhouette hint:** fence + white dots (sheep) + small shelter. The white dots make it distinct from the cattle ranch.

### Butcher

**What it is:** a small enclosed workshop where meat is processed.

**Key visual elements:**
- Stone or timber building with wide doorway
- Hanging meat cuts visible through the door (simplified shapes)
- Cutting block or table
- Blood-red accent on the table/block (use sparingly — just a red-brown hint)

**Idle state:**
- Empty hooks. Clean block. Door open but no activity.
- Cool muted tan-brown.

**Working state:**
- Meat hanging from hooks. Worker at the cutting block.
- Red-brown accents more visible. Activity suggestion near the block.
- Warm shift in building tone.

**Silhouette hint:** small building with visible hanging shapes in the doorway. Unique among workshops.

### Dairy

**What it is:** a small building where milk is collected and processed into dairy goods.

**Key visual elements:**
- Clean white-washed building (lighter than most buildings)
- Milk pails or churns outside the door
- Small covered porch or awning
- Optional: cheese wheel or butter churn shape

**Idle state:**
- Pails empty and overturned. No activity. Shuttered.
- Pale warm white-tan, muted.

**Working state:**
- Pails upright and full (white milk accent).
- Butter churn in motion or worker carrying a pail.
- Clean, bright look — slightly more saturated whites and creams.

**Silhouette hint:** clean rectangular building with pails/churns at the base. Lighter color makes it stand out.

---

## 6) Textile / Clothing

Industry color: muted purple `#7a5a8a`

### Weaver

**What it is:** a workshop with a loom producing cloth from raw fibers.

**Key visual elements:**
- Small building with open front or large window
- Prominent loom frame visible inside (rectangular grid shape)
- Hanging cloth or thread skeins
- Basket of raw fiber (linen/wool) at the entrance

**Idle state:**
- Loom empty or thread slack. Cloth draped but no movement. Fiber basket full but untouched.
- Muted purple-tan.

**Working state:**
- Loom shuttle moving (horizontal motion line).
- Cloth growing on the loom (visible progress).
- Thread tension visible. Warm interior glow.
- If sprite sheet: 3 frame loop of shuttle pass + cloth growth.

**Silhouette hint:** building with visible rectangular loom frame. Unique grid-like interior shape.

### Dyer

**What it is:** a workshop with large vats for dyeing cloth. Strong color identity.

**Key visual elements:**
- Open-air or semi-enclosed building with 2-3 large round vats
- Cloth hanging on lines to dry (colorful strips)
- Vats filled with richly colored liquid (purple, red, indigo)
- Dripping cloth over the vat edges

**Idle state:**
- Vats still. Cloth hanging dry and faded. No color dripping. Flat muted tones.
- Desaturated purple-gray.

**Working state:**
- Vats bubbling or steaming (small particle effects).
- Freshly dyed cloth in vivid colors hanging wet.
- Color drips from cloth into the vats.
- Rich saturated purples, reds, and indigos.
- If sprite sheet: 2-3 frame loop of steam + drip.

**Silhouette hint:** open structure with round vat shapes + horizontal cloth lines. Very distinct from enclosed workshops.

### Clothier

**What it is:** a finished-goods shop that converts dyed cloth into wearable clothing.

**Key visual elements:**
- Neat enclosed shop with a wide display window or open front
- Hanging garments visible (robes, tunics — simple draped shapes)
- Cutting table with fabric
- Thread, needle, or sewing suggestion

**Idle state:**
- Shop closed or dim. Garments hanging still. Table clear.
- Muted purple-tan.

**Working state:**
- Warm interior glow. Worker at the cutting table.
- New garment being assembled — fabric draped over the table.
- More garments displayed (shop looks fuller).
- Rich warm fabric colors.

**Silhouette hint:** shop-shaped building with visible hanging garment outlines. Reads as "clothing store."

---

## 7) Reed / Papyrus / Goods

Industry color: pale sage `#8a9a4a`

### Reed Gatherer

**What it is:** a waterside hut where reeds are cut and bundled. Extractor — open, marsh-like setting.

**Key visual elements:**
- Small stilted hut near water (blue accent at base)
- Tall reeds growing around the site
- Bundled reed stacks
- Simple cutting tool (sickle or knife)

**Idle state:**
- Reeds growing tall and still. Hut quiet. Bundles stacked but no new ones.
- Pale green-yellow, muted.

**Working state:**
- Reeds being cut — falling stalks and worker motion.
- New bundles being tied.
- Fresher green tones. Water ripple at the base.

**Silhouette hint:** stilted hut surrounded by tall vertical reed lines. Unique waterside profile.

### Papyrus Maker

**What it is:** a workshop where reeds are processed into papyrus sheets by soaking, pressing, and drying.

**Key visual elements:**
- Small building with a drying rack or frame outside
- Soaking trough or basin
- Flat papyrus sheets drying on racks (pale rectangles)
- Reed bundles at the entrance (input material)

**Idle state:**
- Racks empty. Trough dry. Reed bundles stacked but unprocessed.
- Muted sage-tan.

**Working state:**
- Sheets drying on racks (visible pale rectangles).
- Water in the trough (blue accent). Reed bundles being processed.
- Warmer green-yellow tones.

**Silhouette hint:** building with prominent horizontal drying rack lines. Distinct flat-sheet shapes.

### Scribe Supply Workshop

**What it is:** a refined workshop producing finished writing supplies from papyrus and other materials.

**Key visual elements:**
- Neat small building with shelves visible through a window
- Stacked papyrus scrolls (cylindrical shapes)
- Ink pots or pen supplies on a work surface
- More refined appearance than the papyrus maker

**Idle state:**
- Shelves stocked but no activity. Window shuttered. Quiet and tidy.
- Cool sage with warm tan accents.

**Working state:**
- Worker at the desk. Scrolls being assembled.
- Warm interior glow. Ink pot in use.
- Shelves look fuller. Slightly brighter tones.

**Silhouette hint:** small refined building with visible scroll shapes on shelves. More detailed than other workshops.

---

## 8) Brewing

Industry color: amber `#9a6a2a`

### Brewery

**What it is:** a production building where grain is fermented into beer. Warm, aromatic atmosphere.

**Key visual elements:**
- Squat, sturdy building with wide doorway
- Large brewing vats visible inside (round barrel shapes)
- Grain sacks at the entrance
- Froth or foam suggestion on vat tops
- Steam/aroma wisps from the top

**Idle state:**
- Vats sealed. No steam. Grain sacks stacked neatly. Door closed or dim.
- Cool amber-brown, muted.

**Working state:**
- Steam or aroma wisps rising from the building/vats.
- Frothy foam visible on vat tops.
- Warm amber glow from interior.
- Grain sacks open and being poured.
- If sprite sheet: 2-3 frame loop of steam rise + foam bubble.

**Silhouette hint:** wide squat building with round vat shapes visible. The barrel/vat forms distinguish it.

### Beer Storehouse

**What it is:** a storage and distribution building for finished beer. Cool, cellar-like.

**Key visual elements:**
- Long, low building with arched doorway (cellar entrance feel)
- Stacked barrels and amphora
- Cool interior suggestion (stone walls, low light)
- Cart or sled for deliveries

**Idle state:**
- Barrels stacked. Door closed. Cart parked. No movement.
- Cool amber-gray.

**Working state:**
- Door open. Barrels being rolled or loaded onto cart.
- Worker activity near the entrance.
- Slightly warmer tones. Delivery in progress feel.

**Silhouette hint:** long low building with arched doorway + barrel stack silhouette.

---

## 9) Fishing / River Economy

Industry color: teal-blue `#4a7a8a`

### Fishing Wharf

**What it is:** a waterside dock where fish are caught. Extractor — strong waterfront identity.

**Key visual elements:**
- Wooden dock or pier extending over water (blue base)
- Small boat tied to the dock
- Fishing nets draped or hung
- Fish basket or crate

**Idle state:**
- Boat moored and still. Nets hanging dry. Basket empty. Calm water.
- Muted teal-blue, desaturated.

**Working state:**
- Nets being pulled or cast (motion in the net shapes).
- Fish visible in basket/crate (silver-white accents).
- Water ripple animation. Boat shifted position.
- Brighter teal-blue, more saturated.
- If sprite sheet: 3 frame loop of net pull + water ripple.

**Silhouette hint:** dock/pier extending outward + boat shape + hanging net. Strong waterfront read.

### Fishmonger

**What it is:** a market stall or small shop selling fresh fish.

**Key visual elements:**
- Open-front stall with awning or canopy
- Display table with fish laid out (silver shapes)
- Cutting board and knife
- Ice or salt barrel for preservation

**Idle state:**
- Stall closed or empty display. Awning furled. No customer activity.
- Muted cool blue-gray.

**Working state:**
- Fish on display. Cutting activity at the board.
- Customer silhouette or busy stall feel.
- Brighter, more alive teal tones. Silver fish accents catch the light.

**Silhouette hint:** open stall shape with awning + flat display table. Market-like, not industrial.

### Smokehouse

**What it is:** a small building where fish is smoked and preserved for storage and trade.

**Key visual elements:**
- Small enclosed building with prominent chimney or smoke vent
- Fish hanging on racks inside (visible through open door)
- Smoke wisps from chimney and door
- Firewood stack at the base

**Idle state:**
- No smoke. Fish racks empty. Firewood stacked but cold. Dim.
- Muted cool brown-blue.

**Working state:**
- Thick smoke from chimney and door (heavier than other chimneys).
- Fish visible on hanging racks — golden-brown smoked color.
- Warm orange glow from the fire inside.
- If sprite sheet: 3 frame loop of smoke billow + glow flicker.

**Silhouette hint:** small building with a large chimney and visible hanging shapes inside.

---

## 10) Mining / Metals

Industry color: dark charcoal `#5a5050` with orange forge glow

### Copper Mine

**What it is:** a hillside or underground mine entrance for extracting copper ore.

**Key visual elements:**
- Dark cave or tunnel mouth cut into rock
- Wooden support beams at the entrance
- Mine cart or ore basket on a rail
- Greenish copper-stained rock around the entrance

**Idle state:**
- Dark cave mouth. Cart parked and empty. No activity. Tools leaning against the wall.
- Cool dark gray with green-tinted copper staining.

**Working state:**
- Lantern glow from inside the tunnel.
- Cart loaded with greenish ore chunks.
- Dust near the entrance. Worker entering/exiting.
- Warm orange lantern glow contrasts with cool rock.

**Silhouette hint:** dark cave mouth shape with support beams. Mine cart at the base. Reads as "mine."

### Tin Mine

**What it is:** visually similar to copper mine but with different ore coloring for distinction.

**Key visual elements:**
- Same mine-mouth structure as copper mine
- Silver-gray ore instead of green-copper tones
- Slightly different support beam style (cross-braced vs. simple)
- Tin ore chunks have a metallic gray shimmer

**Idle state:**
- Like copper mine idle but with silver-gray ore staining instead of green.
- Cool dark gray, no green tint.

**Working state:**
- Like copper mine working but ore in the cart is silver-gray.
- Same lantern glow and dust effects.

**Silhouette hint:** same as copper mine. Distinction is color, not shape — acceptable since they serve the same mechanical role.

### Smelter

**What it is:** a large furnace building that melts ore into refined metal. The most dramatic building in the metals chain.

**Key visual elements:**
- Heavy stone building with a large chimney or furnace stack
- Visible bellows at the furnace mouth
- Crucible or mold shapes nearby
- Ore pile input, ingot stack output
- Strong orange-red glow from the furnace

**Idle state:**
- Furnace dark and cold. Chimney with no smoke. Ore and ingots stacked but no glow.
- Cool dark charcoal, no warm accents.

**Working state:**
- Intense orange-red furnace glow from the opening.
- Thick smoke from chimney.
- Bellows in motion (compressed/expanded). Sparks near the furnace mouth.
- Molten metal glow on nearby surfaces.
- If sprite sheet: 3-4 frame loop of bellows pump + spark burst + smoke.

**Silhouette hint:** heavy building with oversized chimney + bellows element. Largest and most dramatic in the metals chain.

### Bronze Smith

**What it is:** a workshop where smelted bronze is hammered and shaped into tools, weapons, and goods.

**Key visual elements:**
- Enclosed stone workshop with open doorway
- Anvil prominently visible
- Hammer and tongs
- Bronze ingots on one side, finished tools/items on the other
- Smaller forge or hearth for reheating

**Idle state:**
- Anvil bare. Tools hung up. Forge cold. Ingots stacked. Quiet.
- Cool dark gray-brown.

**Working state:**
- Hammer striking anvil — sparks flying.
- Warm forge glow from the hearth.
- Bronze highlights on the finished goods (golden-orange).
- Ring of hammer suggested by spark particles.
- If sprite sheet: 3 frame loop of hammer strike + sparks.

**Silhouette hint:** workshop with prominent anvil shape in the doorway. Distinct from the smelter's bellows.

---

## 11) Luxury Goods

Industry color: rich gold `#9a7a3a`

### Jewel Workshop

**What it is:** a fine workshop where gems and precious metals are crafted into jewelry.

**Key visual elements:**
- Small, well-built workshop with a detailed doorway
- Magnifying lens or jeweler's loupe suggestion
- Workbench with tiny gem-like sparkle points
- Display of finished jewelry (necklace, ring shapes — simplified)

**Idle state:**
- Workshop closed. Display covered or dim. No sparkle. Refined but quiet.
- Muted gold-brown.

**Working state:**
- Gem sparkle points visible (tiny bright highlights — white, blue, red).
- Warm interior glow on the workbench.
- Worker hunched over precise work.
- Display pieces catch the light.

**Silhouette hint:** refined small building with sparkle accents. The gem sparkle points read even at small scale.

### Perfumery

**What it is:** a fragrant workshop producing perfumes from flowers, oils, and resins.

**Key visual elements:**
- Elegant small building with arched doorway
- Distillation apparatus (glass bulb + tube shapes)
- Flower baskets at the entrance (color accents — pink, purple, yellow)
- Rows of small bottles/amphora on shelves

**Idle state:**
- Apparatus still. Flowers wilted or absent. Bottles on shelves but no activity.
- Muted warm gold-rose.

**Working state:**
- Steam or aromatic wisps from the distillation apparatus.
- Fresh flowers in baskets (vivid color accents).
- Warm glow through the bottles (amber, rose tones).
- Gentle, elegant activity feel.

**Silhouette hint:** building with distinctive distillation bulb shape and flower-basket accents at the base.

### Luxury Bazaar

**What it is:** a market stall or open-air shop displaying luxury goods for trade and sale.

**Key visual elements:**
- Wide open stall with ornate canopy or awning (richer than the fishmonger's)
- Draped fabrics, displayed jewelry, perfume bottles
- Gold and purple accent colors on the canopy
- More decorative than any other market building

**Idle state:**
- Stall covered or canopy closed. Goods stored. No customers.
- Muted gold-purple.

**Working state:**
- Canopy open and richly colored. Goods on display — sparkle accents.
- Customer silhouette or busy feel.
- Gold and jewel-tone highlights. Most colorful building in the game.

**Silhouette hint:** wide stall with ornate canopy profile. Richer, more decorative than the fishmonger stall.

---

## 12) Civic / Infrastructure

Industry color: warm gray `#7a7060`

### Housing — Tier 1 (Hut / Shelter)

**General approach:**
- Simple round or rectangular hut with thatch roof.

**Idle (empty):**
- Dark windows, no smoke, feels uninhabited.

**Occupied:**
- Warm light in window, thin smoke from chimney/roof hole, laundry line or pot outside.

**Silhouette:** round/low shape. Obviously residential, not industrial.

### Housing — Tier 2 (House)

**General approach:**
- Larger rectangular building, tile or clay roof, second story or visible upper floor.

**Idle (empty):**
- Shuttered windows, no activity.

**Occupied:**
- Open shutters, warm light, thin chimney smoke, flower box or hanging goods.

**Silhouette progression:** taller/rectangular with visible roof detail. Clearly upgraded from Tier 1.

### Road

**What it is:** a tile-based path connecting buildings. Not a building — a terrain overlay.

**Key visual elements:**
- Packed earth or simple stone paving
- Edges slightly raised or bordered
- Warm sand-brown base color
- Wear marks or wheel ruts in the center

**Variants needed:**
- Straight (H/V), corners (4), T-junctions (4), crossroads (1), dead ends (4) = 13 tiles minimum.
- All tiles must connect seamlessly at edges.

**No idle/working distinction.** Roads are always the same. Optional: busier look when labor walkers are present (handled by game layer, not art).

### Storage Yard

**What it is:** an open yard for storing mixed goods. General-purpose logistics.

**Key visual elements:**
- Low fence or wall enclosure
- Stacked crates, barrels, and sacks (variety of shapes)
- Simple shelter or roof over part of the yard
- Cart access point

**Idle (empty):**
- Yard open but sparse. Few crates. Low activity feel.
- Muted warm gray.

**Active (stocked):**
- Yard full of varied goods. Crates stacked high. Worker organizing.
- Warmer tones, more saturated.

**Silhouette hint:** open yard with varied stacked shapes (crates + barrels). Reads as "warehouse."

### Market Hall

**What it is:** a public building where goods are distributed to housing. Hub of commercial activity.

**Key visual elements:**
- Larger than most buildings — wide footprint
- Open sides or arched entrances
- Prominent roof or awning structure
- Display tables or stalls inside
- Colorful goods on display (food, cloth, pottery)

**Idle (empty):**
- Open but empty stalls. No goods displayed. Quiet.
- Muted warm gray.

**Active:**
- Stalls full of colorful goods (orange pottery, gold grain, purple cloth).
- Customer silhouettes or foot traffic suggestion.
- Warm, inviting, most colorful civic building.

**Silhouette hint:** widest building with distinctive arched/open sides. Reads as "market" — larger and more open than any production building.

### Labor Office

**What it is:** an administrative building that manages worker allocation. Small, functional, civic.

**Key visual elements:**
- Simple stone building with a prominent doorway
- Notice board or posting wall beside the door
- Lantern or torch by the entrance
- Small official-looking details (lintel carving, flag, or symbol)

**Idle (unstaffed):**
- Door closed. Notice board empty. Lantern unlit.
- Muted warm gray.

**Active (staffed):**
- Door open. Notice board has postings (small rectangles).
- Lantern lit (warm glow). Worker entering/exiting.
- Slightly warmer civic tones.

**Silhouette hint:** small official building with notice board beside the door. Distinct from production buildings — no chimney, no tools, no goods.

---

## Cross-Building Readability Tests

When all buildings are placed on the map at phone scale (~48px cells), a player should be able to answer these without zooming:

1. **Which industry?** Each industry has a distinct color family (see identity map above).
2. **Which tier?** Extractors (camps, pits, quarries, wharfs, mines, farms) are open and rough. Processors (mills, workshops, smiths) are enclosed. Markets/bazaars are wide and open.
3. **Is it working?** Working buildings have visible motion cues: smoke, particles, glow, motion blur. Idle buildings are static and muted.
4. **Is it civic?** Civic buildings use neutral warm gray and lack the strong industry hue.
5. **What does it store?** Storage and market buildings are wider and lower with visible goods variety rather than single-material stacks.
