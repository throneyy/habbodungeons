# World Inventory — every named thing in Habbo Dungeons

Pure inventory of existing flavor and lore, compiled from source. Nothing here is
invented; every entry cites where it lives. Organized by place, then by the
systems that cut across places.

Sources swept: `js/dungeon.js`, `js/events.js`, `js/items.js`, `js/rooms.js`,
`js/classes.js`, `js/skills.js`, `js/encounters.js`, `js/music.js`,
`js/config.js`, `js/main.js`, `js/runController.js`, `js/battle.js`,
`tools/build-manual.js`, `manual.html`, `data/room-layouts.json`.

---

## 1 · The Hub (Free Roam public rooms) — `js/rooms.js`

Two connected social rooms, linked by paired `rp_arrow` teleports
(tavern ↔ square, auto-wired round-robin by `wireArrows`).

### The Gilded Tankard (`tavern`)
- Comment flavor: *"a Habbo-lobby-style tavern"*, *"warm Steelscar timber
  underfoot, smoke-stained walls — the classic 'first room you idle in'
  public-space vibe"*. Spawn faces the bar.
- **Named fixtures (default layout comments):**
  - The bar: counter of dividers, **keeper** (`fantasy_c22_craftsman`) + barrels behind
  - "The tavern's high seat by the bar's end" — `vikings_throne` *(default layout only; the live admin layout in `data/room-layouts.json` currently omits the throne and seats 6 stools instead of 5)*
  - The hearth along the east wall (`hween_c19_fireplace`)
  - Two long tables (`vikings_table_r`) with stools pulled up, "food + drink on top"
  - **The bard** in the SW corner (`fantasy_c22_bard`)
  - Clutter: candles by the door (`gothic_candles`), "herbs drying near the bar" (`fantasy_c22_herbs`)
  - Hanging flags + shop signs (`fantasy_c22_hangingflags`, `fantasy_c22_shopsigns`)
  - RP arrow "out to the courtyard"
- **Ambience** (`js/music.js`): medieval tavern ambience (YouTube loop).
- Visual kit note: the tavern reuses the **Steelscar** timber palette
  (same `vikings_floor` kit as the Mead Hall realm — an implied link between
  the hub tavern and Steelscar).

### The Old Town Square (`square`)
- Comment flavor: *"the village yard outside the tavern, laid out like the
  classic Fantasy Village rooms"*. Spawn is "walking in from the south road"
  (a paved apron juts south of the plaza).
- **Named fixtures (2026 village redesign):**
  - The guild hall front along the west: timber wall, the **clock tower**
    (`fantasy_c22_guildhall`), the arch, the **balcony** with its hay
    (`fantasy_c22_balcony`), shop signs and a barrel
  - The timber-framed tavern row along the north (`fantasy_c22_tavern`
    "THE BARD" front + `building1/building2` walls); bunting strung across
    (`fantasy_c22_hangingflags`); the RP arrow back into the tavern sits in
    the doorway's threshold
  - The market under its awnings east: stall, goods, straw canopy
    (`fantasy_c22_marketstall/marketgoods/strawcanopy`)
  - The green SE corner: grass, the **bright transitional tree**
    (`fantasy_c22_tree`), purple roses, mossy rail fences, a barrel
  - The dirt **training yard** SW: goblin statue, the **training dummy**
    (`fantasy_c22_trainingdummy`) — the one attackable prop in Free Roam
    (`HITTABLE`, `js/rooms.js`) — two practice targets, an arrow bucket,
    garden weeds sprouting in the dirt
  - "**The guild's** quest board" by the south entrance (`fantasy_c22_adventureboard`) — only mention of a guild anywhere
  - A sewer drain where the plaza meets the south road (`fantasy_c22_sewers`)
  - **The Gatekeeper** (`js/npc.js`, `js/dialogueData.js`) — the old money
    tree (`neopets_c25_moneytree`) rooted in the tavern row's open NE bay.
    First talking NPC: "The arch beside me opens nowhere until I tell it
    otherwise." Coins hang in his branches — "folk keep planting them"; he
    doesn't ask why. Tap him from an adjacent tile to talk.
  - **The arch** (`GATE_FURNI = fantasy_c22_archway`, `js/rooms.js`) — the
    square's ONE dungeon door, a wooden medieval archway with candles, set
    into the guild hall's west front beside the clock tower. It has no
    destination of its own: a Gatekeeper dialogue choice ("The old keep
    below." / "The realm trials.") aims it, then stepping through begins that
    descent. Step in unaimed and he calls out: "The arch answers to me, not
    to boots."
  - Retired by the redesign (available to admins via `:furni`): the golden
    fountain, the old well, the env trees, the picnic snacks
- **Ambience**: medieval village ambience.

### Hub ↔ world framing (`js/main.js`)
- Title-screen tagline: "Turn-based tactics for your Habbo Origins avatar".
- Free Roam link text: "**wander the halls of the keep**" — frames the hub as
  part of the same keep the Dungeon descends into.
- Title records language: "Current **descent**", "Battles cleared",
  "Gold carried", "**Heroes standing**". Dungeon cards say "**Begin Descent ▸**".
- The player's leader unit is named **You** — "your Habbo fights as its leader"
  (`js/encounters.js`, squad builder copy).

---

## 2 · The Dungeon (`id: dungeon`) — `js/dungeon.js`

Registry line: **"The Dungeon" — *"An old keep sunk in dark stone"***.
Five nodes: battle → event → battle → event → boss. Kit: dark flagstone
(`dng_floor`), dark-stone palette.

### Battle 1 — The Antechamber (`antechamber`)
- Open antechamber, low central ridge, 4 pits; Fantasy Village clutter
  (barrels, wood, arrow bundles).
- Treasure: **"a dusty cache"** — "a dusty treasure chest sits in the far
  corner" (20 gold).
- Enemies: **Skeleton** (Fighter L1), **Sewer Rat** (Rogue L1),
  **Crypt Spider** (Ranger L1, on the ridge).

### Battle 2 — The Sunken Nave (`nave`)
- "A sunken nave: central void pit ringed by a height-1 ledge." Runes and
  crystals in the corners; flanking lanes hide **spike traps**; "an old
  **bonfire** smoulders mid-approach".
- Objective: survive 3 turns — "the nave's guardians only need to be outlasted".
- Enemies: **Restless Undead** (Fighter L2), **Greedy Goblin** (Fighter L2 —
  "statue foe"), **Grave Wraith** (Ranger L2, ghostly, on the ledge),
  **Ember Elemental** (Mage L2, on the ledge).

### Battle 3 — The Crumbling Rampart (`rampart`)
- "The keep's gatehouse." A cursed cave-stone wall seals the yard; "beyond it
  is void — **the unseen keep interior**". The only opening is a real 1×2
  **portcullis** gate.
- Left platform: "the **garrison's** supply dump" (barrel, arrow bundles,
  spilled coin pile). Treasure: **"the garrison's coin"** (25 gold).
- Right platform: "the **winch** that raises the portcullis" (switch effect:
  "something rumbles open!").
- Objective: escape THROUGH the gate with your leader.
- Enemies: **Crypt Spider** ("nests in the supply dump"), **Ember Elemental**
  ("guards the winch"), **Restless Undead** ("posted at the gate"),
  **Greedy Goblin** ("statue rear-guard in the yard").

### Battle 4 (boss) — Throne of the Dread Knight (`throne`)
- "The throne hall": height-2 dais, grand central staircase, crowned by the
  **Cursed Throne** (`hween_r17_lichthrone` — a *lich* throne) with witch
  candles/torches flanking. "Plunder stacked in the hall's corners."
  One-shot spike traps beside the dais.
- Boss: **Dread Knight Commander** (Fighter L4, tag `boss`) — "stands before
  his seat"/"before his throne". Objective label: "the Dread Knight Commander".
- Minions: **Restless Undead** (Rogue L2), **Gnoll Sentinel** (Fighter L2 —
  statue foe), **Mystic Shaman** (Mage L3).
- Victory text (`js/runController.js`): "**The Dread Knight's hold is broken.**"
- Defeat text: "Your party falls in the Dungeon. **The dungeon reclaims the dark.**"

### The keep's curse (implied lore)
- `js/dungeon.js` LOOKS comment: "Fantasy Village statues, **woken by the
  keep's curse** (furni monsters)" — explains Greedy Goblin and Gnoll Sentinel.
- Manual flavor (`tools/build-manual.js`): "A plunder-hoarding statue the frost
  saw fit to wake" / "A trophy of an old hunt, standing its post again".

---

## 3 · Trials of the Realms (`id: realms`) — `js/dungeon.js`

Registry line: **"Trials of the Realms" — *"Four realm-gates, four trials"***.
"A gauntlet of four realm-gates, each a different land." Same 6-node rhythm.

### Realm 1 — The Whispering Glade (`glade`) · forest kit
- "A forest clearing walled by a **living hedge**; the only way onward is the
  **fairy ring** set into the hedge's single gap" (`easter_c19_magicringtele`).
  Beyond the hedge: "the deep woods".
- Named fixtures: "the **soothsayer stone** at the knoll's foot, **fairies** in
  attendance" (`easter_c19_wisestone`, `easter_c19_littlefairies`);
  "luminescent flowers flank the ring's gateway"; "the woodland's critters
  watch from the bramble".
- Hazards: **toxic spores** (mushroom patches). Treasure: **"an enchanted
  egg, abandoned in the far corner"** (20 gold).
- Objective: reach the fairy ring ("don't clear the glade — escape it").
- Enemies: **Ravenous Wolf** (Fighter L1, "prowls the path"),
  **Savage Hippogriff** (Ranger L1, "perched on the knoll"),
  **Bear Owl** (Fighter L2, "body-blocks the ring's gateway").

### Realm 2 — Court of the Ancients (`ruin`) · Greek kit
- "A ruined marble court"; "sun-bleached Greek ruin… the one BRIGHT room in
  the game so far." Height-2 **sanctum dais** holds "**the ancients' relic**"
  (the **Master Monument**, `easter_c20_zenmaster`), lit temple torches,
  offering vases, "what's left of the colonnade court" (harp, benches,
  a chariot).
- Treasure: **"a temple offering, dropped in the rout"**
  (`greek_c19_pythagorascup`, 25 gold) — "the rout" implies the court fell
  in a past battle.
- Objective: "hold the altar before the Master Monument for four turns while
  **the ruin's guardians** pour in from the collapsed end of the court."
  Player spawns ON the dais ("defenders hold the dais").
- Enemies: **Bronze Warrior** ×2 (Fighter L2 — "bronze come alive"),
  **Nemean Lion** (Fighter L3, "golden-maned"), **Siren of the Ruin**
  (Mage L2, "a siren on her rock").

### Realm 3 — Steelscar Mead Hall (`meadhall`) · viking kit
- "The **chief's** high seat crowns a height-2 dais; his prized **longship**
  rests along the west wall, feast tables flank the **longfire** pit down the
  centre aisle, and his hoard sits spilling by the dais."
- Named fixtures: high seat throne, burning torches, war banners, armory
  (`vikings_weapon`), a **runestone**, the kitchen wall ("cooking pit + the
  night's meat").
- Hazard: **the longfire** (all four tiles burn on end-turn). Treasure:
  **"the chief's hoard"** (30 gold).
- Objective: "Clear the hall — a straight brawl" / "clear **Steelscar's**
  defenders".
- Enemies: **Hall Bear** (Fighter L3, "the chief's chained bear"),
  **War Boar** ×2 (Fighter L2), **Odin's Raven** (Mage L2, "perched by the
  high seat", prop `sw_raven`) — the one explicit mythological name
  ("Odin's watcher" in the LOOKS comment).
- **Steelscar** is the realm/culture name; the hub tavern shares its timber
  kit ("warm Steelscar timber", `js/rooms.js`).

### Realm 4 (boss) — Den of the Bog Witch (`hollow`) · witch kit
- "Her **skull throne** crowns the dais (one crooked stair up), her
  **familiar** curled beside it; the hearth and **cauldron** burn low,
  **ghost-lights** drift" (`hween12_orb`), "the only light comes from the
  hearth, the cauldron and her drifting ghost-lights."
- Named corners: "the brewing corner" (broom-staff stand, bewitched cauldron,
  potions, witchcraft), "the divining corner" (bewitched table, crystal ball,
  tarot), pumpkin patches whose **grasping vines** grab ankles.
- Treasure: **"the witch's satchel"** — "her ingredient satchel, forgotten by
  the door" (25 gold).
- Boss: **The Bog Witch** (Mage L4, tag `boss`) — "slay the witch herself —
  her creatures are incidental." Look: zombie skin under "a BLACK
  star-spangled witch hat (**a black cat rides the brim**) and black robe".
- Minions: **Ravenous Werewolf** (Fighter L3, `hween_c19_darkwerewolf`),
  **Living Slime** (Fighter L2), **Spirit Owl** (Ranger L2).

---

## 4 · Bestiary roster (names → looks) — `js/dungeon.js` LOOKS/FIGURES

| Name (encounter) | Look source | Notes |
|---|---|---|
| Skeleton | figure: Skeleton Outfit (set 6248) | "the keep's old garrison" (manual) |
| Sewer Rat | pet: cat, gray tint | "terrier is black in every palette" |
| Crypt Spider | pet: spider | |
| Restless Undead | figure: Zombie Eyes 3603 + teal rags | |
| Grave Wraith | figure: all-shadow body, red eyes, ghost 0.62 | "arrows pass through the cold" (manual, legacy) |
| Ember Elemental | pet: dragon | "the red dragon reads as living ember" |
| Mystic Shaman | figure: Wizard robe/hat/beard (6275/6273/6271) | "keeper of the nave's rites" (manual, legacy) |
| Dread Knight Commander | figure: Light Guardian armor (3448/3449) + gold crown (3859) | boss, The Dungeon |
| Greedy Goblin | prop: fantasy_c22_goblin | statue woken by the keep's curse |
| Gnoll Sentinel | prop: fantasy_c22_gnoll | statue woken by the keep's curse |
| Ravenous Wolf | prop: easter_c19_wolf | glade |
| Savage Hippogriff | prop: easter_c19_hippogriff | glade |
| Bear Owl | prop: easter_c19_bearowl | glade |
| Bronze Warrior | prop: greek_c19_statue | "bronze come alive" |
| Siren of the Ruin | prop: easter_c20_darkrock | "a siren on her rock" |
| Nemean Lion | pet: lion, golden tint | Greek-myth name |
| Hall Bear | pet: bear, brown tint | "the chief's chained bear" |
| War Boar | pet: pig, dour tint | "pink farm pig → dour war boar" |
| Odin's Raven | prop: sw_raven | "Odin's watcher" |
| The Bog Witch | figure: zombie skin + black witch hat/robe | boss, Trials |
| Ravenous Werewolf | prop: hween_c19_darkwerewolf | den |
| Living Slime | prop: hween_c19_slimeblob | den |
| Spirit Owl | prop: hween_c19_spiritowl | den |

---

## 5 · Events (shared between dungeons) — `js/events.js`

- **The Silent Shrine** (`shrine`): "A cracked shrine hums with faint warmth
  beneath the dust. **Something here still listens.**" Choices: Pray for
  mending (heal), Pry loose its offerings ("**It bites back**" — gold +
  self-damage), Leave it be ("Nothing ventured.").
- **Abandoned Cache** (`cache`): "A supply crate lies half-buried in the
  rubble, its lock long shattered." Take the supplies (item) / Sell it for
  scrap (20 gold).
- **The Wounded Wanderer** (`wanderer`): "A stranger slumps against the
  crumbling wall, clutching a small pouch." Share your supplies (they gift an
  item and limp away) / Take the pouch ("**The wanderer says nothing.**") /
  Walk past ("You leave the stranger to the dark.").

---

## 6 · Items — `js/items.js`

Rarities: Common / Uncommon / Rare / Epic / Legendary.

- **Weapons:** Rusty Blade ("Chipped, but it bites."), Iron Sword ("Honest
  steel."), Emberedge ("A blade that never cools."), Frostbrand ("Rimed with
  **eternal winter**."), Arcane Staff, Ancient Staff ("pulsing with arcane
  power"), **Kingslayer** ("**It has tasted crowns.**").
- **Armor:** Padded Vest, Chainmail, Fire Robes, Wizard Robes ("worn by
  powerful wizards"), **Kingsguard Plate** ("Legendary armor **forged for
  kings**."). Armor visibly dresses the leader's habbo-imaging figure.
- **Trinkets:** Swift Boots, Vigor Charm, Warding Amulet ("Turns aside ill
  fortune."), **Silver Tiara** ("fit for **nobility**").
- Implied relationships: Kingslayer/Kingsguard Plate/Silver Tiara/crowns imply
  a fallen royalty theme; Frostbrand's "eternal winter" is a survivor of the
  old Frostkeep theme (see §9).

---

## 7 · Classes — `js/classes.js`

Eight classes "carried over from v1", triangle melee > ranged > magic > melee:
- **Fighter** — "Frontline blade-and-shield. Endures where others fall."
- **Barbarian** — "Raw fury over finesse."
- **Rogue** — "Fast striker… fragile."
- **Ranger** — "Bowfire from afar. Wants distance and high ground."
- **Mage** — "Glass cannon. Ignores armor, dies to a stiff breeze."
- **Warlock** — "Cursed power."
- **Cleric** — "Holy support. Mends allies with **Heal**."
- **Bard** — "Battlefield songs. **Inspire** buffs an ally's next hit."
  (Doubles as flavor for the tavern's bard prop.)

---

## 8 · Origins skill trees — `js/skills.js`

Gated by real Habbo Origins skill levels (Fishing/Gardening):
- **Water** — "**Fisherfolk magic** — nets, tides, and **the things below**."
  Net, Foam Barrier, Tidal Wave, Whirlpool, **Deep Sea Beast** ("Summon the
  **leviathan**").
- **Nature** — "**Gardener magic** — growth, blessing, and creeping rot."
  Sapling Barrier, Life Wave, Nature's Blessing, Decaying Flowers, Thorns.

---

## 9 · Legacy layer: the Frostkeep (pre-retheme naming)

The Dungeon was originally "**Descent into the Frostkeep**"; `buildDungeon`
still maps legacy save id `frostkeep` → `dungeon`. Stale names survive in:
- `tools/build-manual.js` FLAVOR/OUTFIT tables + generated `manual.html`:
  **Frost Rat**, **Frostbite Spider**, **Frost Undead**, **Frost Wraith**,
  **Ice Elemental**, **Ice Knight Commander** ("**Lord of the Frostkeep. The
  cold answers to him.**"), "Crown of Frost".
- `README.md` and `ROADMAP.md` prose.
- Item **Frostbrand** ("eternal winter") fits the old theme.

Current canon names (per `js/dungeon.js` encounters): Sewer Rat, Crypt Spider,
Restless Undead, Grave Wraith, Ember Elemental, Dread Knight Commander.
The manual's bestiary flavor has NOT been updated to match.

---

## 10 · Name index (every proper noun, A–Z)

**Places:** The Antechamber · Court of the Ancients · The Crumbling Rampart ·
Den of the Bog Witch · The Dungeon (dungeon, "an old keep sunk in dark
stone") · The Gilded Tankard · The Old Town Square · Steelscar Mead Hall ·
The Sunken Nave · Throne of the Dread Knight · Trials of the Realms · The
Whispering Glade · (legacy: the Frostkeep)

**Beings:** Bear Owl · The Bog Witch · Bronze Warrior · Crypt Spider · Dread
Knight Commander · Ember Elemental · **The Gatekeeper** (money-tree NPC, the
square) · Gnoll Sentinel · Grave Wraith · Greedy
Goblin · Hall Bear · Living Slime · Mystic Shaman · Nemean Lion · Odin's
Raven · Ravenous Werewolf · Ravenous Wolf · Restless Undead · Savage
Hippogriff · Sewer Rat · Siren of the Ruin · Skeleton · Spirit Owl · War
Boar · You (the leader) · the bard · the keeper (tavern craftsman) · the
chief (Steelscar, absent) · the ancients (absent) · the garrison (absent) ·
the guild (absent, quest board) · the Wounded Wanderer · (legacy: Ice Knight
Commander, Lord of the Frostkeep)

**Things:** the Cursed Throne · Deep Sea Beast (leviathan) · the Master
Monument / the ancients' relic · the chief's hoard · the chief's longship ·
the enchanted egg · the fairy ring · the garrison's coin · Kingslayer ·
Kingsguard Plate · the longfire · the portcullis + winch · the skull throne ·
the soothsayer stone · the witch's satchel · (full item list in §6)

**Forces / mysteries (implied, never explained):** the keep's curse (wakes
statues) · whatever the Silent Shrine listens to · the rout that emptied the
Court of the Ancients · the unseen keep interior beyond the rampart gate ·
the deep woods beyond the glade hedge · "the things below" (Water tree).
