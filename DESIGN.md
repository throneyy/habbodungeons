# Landing + Player Dashboard — design notes

## Brief

Adapt the structure of habbodungeons.com (a sibling fan project) into our
landing screen, and add a Player Dashboard screen modeled on
habbodungeons.com/dashboard — both rendered in OUR established visual language,
not theirs.

## Evidence

- **Remote structure** (extracted from the live site's bundle, 24 Jul 2026):
  - Landing: navbar (Monsters / Dungeons / Inventory / Login) → hero
    ("Start Your Adventure" / "Go to Dashboard" + "Browse Dungeons") →
    4-card feature grid (Epic Battles, Party System, Legendary Loot, Level Up)
    → "How to Play" 3 steps (Create Account, Join a Server, Battle & Loot) →
    fan-project disclaimer footer.
  - Dashboard: "Player Dashboard" pixel-art banner → Player Identity
    (avatar, username, motto, class & role, edit class, Habbo search) →
    Player Stats (Level, HP, MP, XP, ATK, DEF, SPD) → Inventory →
    Join Adventure → Treasure Chests → Skill Trees (Fishing / Gardening).
- **Local system** (`css/habbo-ui.css`, `showTitle()` in `js/main.js`):
  habboskills-style kit — Volter pixel type + crispify, navy starfield
  wallpaper, white cards with crimson strip headers, yellow stat pills,
  chunky drop-shadow buttons, habbofont.net ribbon logos, class chips.

## Design read

- **Surface:** hybrid — marketing landing + application dashboard; the game's
  overlay-screen SPA is the leader (no router, screens are functions).
- **Audience:** Habbo Origins players; desktop-first, nostalgic pixel-art
  taste; casual session lengths.
- **Single job:** landing → sign in and get into the game (Start Your
  Adventure); dashboard → see your hero at a glance and act (Continue Run /
  Begin Descent).
- **Auth model:** NO guest play. The only sign-in is the motto-code flow
  (Identity.makeCode → motto → Identity.verify against the live profile).
  Every entrance to the world (Play, Continue, Begin Descent, dungeon cards)
  is gated on `Identity.isVerified()`; the dashboard shows a sign-in gate
  when signed out.
- **Content:** all real data — Identity (name, motto, link state, fishing /
  gardening levels, calling), Run save (leader stats, gold, inventory,
  descent progress), catalogs (CLASSES, ITEMS, SKILL_TREES). No invented
  stats or testimonials.

## Thesis

Borrow the remote's page *architecture*, keep our *skin*. One visual language:
the existing hd-ui kit on the navy starfield, ribbon GIFs for headings
(added `assets/ui/logos/player-dashboard-ribbon.gif`, same habbofont.net
generator as every other heading). The dashboard's memorable device is the
character sheet: the live habbo-imaging avatar beside a column of yellow stat
pills, exactly like the game's camp screens, so the dashboard reads as "your
hero's page", not a web admin panel.

Mapping remote → ours:

Landing container order mirrors the remote's dashboard top (per user ref):
navbar → adventurer search → battles-today strip → club-font banner card,
then features, How to Play, dungeon cards, footer. There is NO sign-in card
on the landing: the navbar's third button is the auth entry — it reads
"Login" (green) signed out and routes to the dashboard's sign-in gate, or
"Dashboard" once verified. Navbar is just Monsters · Dungeons · Login/Dashboard.

| Remote section | Ours | Data source |
| --- | --- | --- |
| Adventurer search | live Origins profile lookup (avatar/motto/level/online) | fetchOriginsUser |
| Battles today | current save's cleared battles when saved today | Run save `savedAt` |
| Hero CTAs | Start Your Adventure / Continue Run / Browse Dungeons | explore, Run save |
| Feature grid | Tactics Battles · Your Real Habbo · Origins Skills · Legendary Loot | README facts |
| How to Play | Sign in with Habbo → Choose calling → Descend | actual flow |
| Login | Sign In with Habbo card (motto-code verify, shared renderSignIn) | Identity.verify |
| Player Identity | avatar + name/motto/verified pills + calling chips + sign out | Identity |
| Player Stats | Level/HP/ATK/DEF/SPD/MOV/RNG pills | run leader, else calling base |
| Inventory / Chests | leader gear + run satchel + gold | Run save, ITEMS/RARITY |
| Join Adventure | Expedition Records + Continue/Begin Descent | Run save |
| Skill Trees | Water/Nature trees + sync (shared with Account screen) | SKILL_TREES, Identity |

Title-screen "Expedition Records" / "Your Account" cards move to the
dashboard; the landing stays marketing-shaped.

## States

- Signed out: navbar shows Login; any play attempt routes to the dashboard's
  sign-in gate with an inline message; the gate is the only sign-in surface
  besides the Habbo Account screen.
- Signed in (verified): landing hero card shows avatar + calling picker +
  dashboard/sign-out; dashboard fills every section.
- No run save: records card zeros + Begin Descent only; inventory shows an
  honest empty state. Save present: Continue Run appears (landing + dashboard).
- Sync/network failures surface inline (`.result` line), same as Account.

## Craft notes

- Reuse only existing primitives: `.hd-card/-header/-body/-well`, `.hd-pill`,
  `.hd-btn`, `.hd-badge`, `.hd-class`, `.tree/.skill-item`, `.field-row`.
- Feature cards use `flex:1 1 220px` so 4-up on desktop, 2-up mid, 1-up narrow.
- Inputs keep visible context labels via `aria-label` + placeholder; all
  actions are real `<button>`s; images carry alt text.
- No new colors, radii, fonts, or motion; no em dashes in copy.
