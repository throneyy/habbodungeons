# UI inventory — every class selector we define

Audit of the three stylesheets and the one JS window primitive that consume them.
**Nothing was added, renamed or deleted.** This is a read-only map.

Sources audited:

| File | Layers defined |
| --- | --- |
| `css/habbo-ui.css` | `hd-*` kit + `dr-*` daily-rewards |
| `css/retro-landing.css` | `rl-*` retro landing (page-local structure only) |
| `css/style.css` | `hw-*` window chrome + all unprefixed in-client families |
| `js/ui/habboWindow.js` | consumer/emitter of the `hw-*` markup (defines no CSS) |

Both HTML entry points load `style.css` + `habbo-ui.css`; only `index.html` also loads
`retro-landing.css` (`kitchen-sink.html` does not).

## Method

- Selectors extracted from the three CSS files with comments stripped; compound rules
  (`.hd-class.on`, `.hw-tab.is-active`) are folded into the **Variants / states** column
  of their base class rather than listed as separate entries.
- Usage searched across `js/`, `index.html`, `kitchen-sink.html`, `tests/`, `src/`,
  `tools/`, `docs/` — excluding `node_modules/`, `dist/`, `.gg/`, `tools/reference/`
  and e2e browser profiles/screenshots.
- Matches were restricted to class contexts (`class=`, `className`, `classList.*`,
  `querySelector`/`closest`/`matches`) to keep English words like `card`, `on`, `out`
  from producing false hits.
- Classes composed at runtime (`` `chat-bubble--${mode}` ``, `` `banner ${phase}` ``,
  `` `duel-count duel-count--${p.phase}` ``) were confirmed by hand and are marked
  **USED (dynamic)** with the file that builds the string.
- **UNUSED** means: no reference found anywhere in the searched tree. It is a finding,
  not an instruction to delete — some are deliberate spares.

---

## 1. `hd-*` — HabboSkills-style UI kit (`css/habbo-ui.css`)

Shared primitives used by every overlay screen (`js/main.js`, `js/runController.js`,
`js/screens/retroTitle.js`, `js/dailyReward*.js`).

### Shell & typography

| Selector | Variants / states | Purpose | Status |
| --- | --- | --- | --- |
| `.hd-page` | — | Tiled navy starfield wallpaper for the overlay/preview board. | USED — `js/main.js`, `kitchen-sink.html` |
| `.hd-ui` | element scopes: `button`, `input`, `select`, `h1–h3`, `p`, `label`; helper tones `.hd-ui .info`, `.hd-ui .info.dim`, `.hd-ui .dim` | Container class: Volter at 18px, no smoothing, `#crispify` filter on text. | USED — `js/main.js`, `js/runController.js`, `js/dailyRewardOverlay.js`, `js/dailyRewardDock.js` |

### Cards

| Selector | Variants / states | Purpose | Status |
| --- | --- | --- | --- |
| `.hd-card` | — | White panel: 1px ink border, 15px radius, soft drop shadow. | USED — `js/main.js`, `js/runController.js`, `js/screens/retroTitle.js`, `js/dailyRewardOverlay.js` |
| `.hd-card-body` | — | 18px padded card interior. | USED — `js/main.js`, `js/runController.js`, `js/screens/retroTitle.js`, `js/dailyRewardOverlay.js`, `tests/e2e/coopFallen.e2e.mjs` |
| `.hd-card-header` | — | Crimson title strip capping a card. | USED — `js/main.js`, `js/runController.js`, `js/screens/retroTitle.js`, `js/dailyRewardOverlay.js` |
| `.hd-card-well` | — | Tinted logo/art well inside a card. | **UNUSED** |

### Pills, badges, buttons

| Selector | Variants / states | Purpose | Status |
| --- | --- | --- | --- |
| `.hd-pill` | stacking rule `.hd-pill + .hd-pill` | Yellow stat row: bold label left, value right. | USED — `js/main.js`, `js/screens/retroTitle.js` |
| `.hd-pill-value` | — | Right-aligned value half of a pill. | USED — `js/main.js`, `js/screens/retroTitle.js` |
| `.hd-badge` | `--yellow` | Small round chip for counts/labels. | USED — `js/main.js`, `js/screens/retroTitle.js` |
| `.hd-badge--yellow` | — | Yellow fill variant of the badge. | USED — `js/main.js`, `js/screens/retroTitle.js` |
| `.hd-btn` | `:hover`, `:active`, `:disabled` | Chunky crimson action button, 3px hard drop. | USED — `js/main.js`, `js/runController.js`, `js/screens/retroTitle.js`, `js/dailyRewardOverlay.js` |
| `.hd-btn--green` | `:hover` | Positive/primary action colour. | USED — `js/main.js`, `js/runController.js`, `js/screens/retroTitle.js`, `js/dailyRewardOverlay.js` |
| `.hd-btn--red` | — | Destructive action colour. | **UNUSED** |
| `.hd-btn--white` | `:hover` | Secondary/outline button. | USED — `js/main.js`, `js/runController.js`, `js/screens/retroTitle.js` |
| `.hd-btn--disabled` | `:hover` (no-op) | Manual disabled look for non-`<button>` elements. | USED — `js/screens/retroTitle.js` |

### Logos & inputs

| Selector | Variants / states | Purpose | Status |
| --- | --- | --- | --- |
| `.hd-logo` | — | Outlined crimson Volter wordmark rebuilt from text-shadow rings. | USED — `js/main.js`, `js/roomBanner.js` (ribbon fallback) |
| `.hd-logo-img` | `--center` | Pre-generated habbofont phrase art, pixelated. | USED — `js/main.js` |
| `.hd-logo-img--center` | — | Centres the logo image in its row. | **UNUSED** |
| `.hd-input` | `::placeholder`, `:focus` | White text field matching the card language. | USED — `js/main.js`, `js/screens/retroTitle.js` |

### Class (calling) chips

| Selector | Variants / states | Purpose | Status |
| --- | --- | --- | --- |
| `.hd-class-row` | — | Wrapping row that holds the class chips. | USED — `js/main.js` |
| `.hd-class` | `:hover`, `.on`, children `b` / `span`, `.on b`, `.on span`; colour via inline `--cc` | Class picker chip with class-coloured left rib. | USED — `js/main.js` |

### Landing layout

| Selector | Variants / states | Purpose | Status |
| --- | --- | --- | --- |
| `.hd-landing` | breakpoints 768/992/1200/1400 | Bootstrap-width stacked column for overlay screens. | USED — `js/main.js`, `js/runController.js` |
| `.hd-landing-row` | — | Two-column flex row inside the landing stack. | USED — `js/main.js` |
| `.hd-landing-col` | — | Flexible column (`flex: 1 1 320px`). | USED — `js/main.js` |
| `.hd-footer` | `a`, `a:hover` | Dim 9px footer strip under a landing page. | USED — `js/main.js` |

### Loading

| Selector | Variants / states | Purpose | Status |
| --- | --- | --- | --- |
| `.hd-loading` | `--center`, child `img` | Pixel "loading Habbos" row for any pending fetch. | USED — `js/main.js` |
| `.hd-loading--center` | child `img` at 102px | Stacked, centred loading variant. | USED — `js/main.js` |

### Inventory page

| Selector | Variants / states | Purpose | Status |
| --- | --- | --- | --- |
| `.hd-inv-empty-note` | — | Grey "nothing here yet" line on an empty inventory panel. | USED — `js/main.js` |
| `.hd-inv-section` | `+ .hd-inv-section` spacing | One titled panel per item type. | USED — `js/main.js` |
| `.hd-inv-section-title` | — | Section heading row (title + count). | **UNUSED** (sections use `.hd-card-header`) |
| `.hd-inv-section-count` | — | Small grey item count beside a section title. | **UNUSED** |
| `.hd-inv-cards` | — | Auto-fill grid of detailed item cards. | USED — `js/main.js` |
| `.hd-inv-card` | rarity via inline `--hd-rarity` / `--hd-rarity-glow` | Item card: art + body, rimmed and glowing by rarity. | USED — `js/main.js` |
| `.hd-inv-card-art` | — | 56px pixelated item sprite. | USED — `js/main.js` |
| `.hd-inv-card-body` | — | Text column of the item card. | USED — `js/main.js` |
| `.hd-inv-card-name` | rarity ink via `--hd-rarity-ink` | Item name line. | USED — `js/main.js` |
| `.hd-inv-card-meta` | — | Uppercase type/rarity meta row. | USED — `js/main.js` |
| `.hd-inv-card-rarity` | scoped under `.hd-inv-card-meta` | Rarity word, tinted to the rarity colour. | USED — `js/main.js` |
| `.hd-inv-equipped` | — | Green "equipped" chip inside the meta row. | USED — `js/main.js` |
| `.hd-inv-card-stat` | — | Bold stat line (e.g. damage) on the card. | USED — `js/main.js` |
| `.hd-inv-card-blurb` | — | Italic flavour text. | USED — `js/main.js` |
| `.hd-inv-stat-pills` | resets `.hd-pill + .hd-pill` margin | Grid of summary pills above the item sections. | USED — `js/main.js` |

### Dashboard stats & actions

| Selector | Variants / states | Purpose | Status |
| --- | --- | --- | --- |
| `.hd-stat-lead` | ≤560px collapses to 1 column | Two-up lead block (level + HP). | USED — `js/main.js` |
| `.hd-stat-big` | — | Crimson big-number block. | USED — `js/main.js` |
| `.hd-stat-big-label` | — | Uppercase label above the big number. | USED — `js/main.js` |
| `.hd-stat-big-value` | — | 34px big number. | USED — `js/main.js` |
| `.hd-hpbar-label` | — | "HP" label + numbers above the meter. | USED — `js/main.js` |
| `.hd-hpbar` | — | HP meter track. | USED — `js/main.js` |
| `.hd-hpbar-fill` | — | Yellow HP fill (width set inline). | USED — `js/main.js` |
| `.hd-statgrid` | — | Auto-fit grid of small stat blocks. | USED — `js/main.js` |
| `.hd-statblock` | `--blue` | Yellow chunky stat block. | USED — `js/main.js` |
| `.hd-statblock--blue` | — | Pale-blue variant for secondary stats. | USED (dynamic) — `js/main.js` (appended as `' hd-statblock--blue'`) |
| `.hd-statblock-label` | — | Uppercase stat name. | USED — `js/main.js` |
| `.hd-statblock-value` | — | 24px stat number. | USED — `js/main.js` |
| `.hd-action-body` | child `p` | Centred card body: blurb over one big button. | USED — `js/main.js` |

---

## 2. `dr-*` — daily rewards wheel + dock (`css/habbo-ui.css`)

Same file as the kit, separate family. Overlay = `js/dailyRewardOverlay.js`,
dock = `js/dailyRewardDock.js`.

| Selector | Variants / states | Purpose | Status |
| --- | --- | --- | --- |
| `.dr-backdrop` | — | Fixed dimmed backdrop behind the claim modal. | USED — `js/dailyRewardOverlay.js` |
| `.dr-modal` | `@keyframes dr-pop`; reduced-motion disables | The claim card itself (max 560px, scrolls). | USED — `js/dailyRewardOverlay.js`, `tests/e2e/dailyReward.e2e.mjs` |
| `.dr-head` | — | Title row of the modal. | USED — `js/dailyRewardOverlay.js` |
| `.dr-x` | `:hover` | Close button on the crimson header. | USED — `js/dailyRewardOverlay.js`, `tests/e2e/dailyReward.e2e.mjs` |
| `.dr-stage` | ≤520px stacks | Two-column wheel/legend area. | USED — `js/dailyRewardOverlay.js` |
| `.dr-wheel-col` | — | Left column holding the wheel + result. | USED — `js/dailyRewardOverlay.js` |
| `.dr-wheel-wrap` | — | Tinted well framing the wheel canvas. | USED — `js/dailyRewardOverlay.js` |
| `.dr-wheel` | — | The habbowheel furni canvas. | USED — `js/dailyRewardOverlay.js` |
| `.dr-result` | children `.dr-win`, `.dr-sub` | Result line under the wheel. | USED — `js/dailyRewardOverlay.js`, `tests/e2e/dailyReward.e2e.mjs` |
| `.dr-win` | — | Green "you won" emphasis inside the result. | USED — `js/dailyRewardOverlay.js` |
| `.dr-sub` | — | Small grey sub-line under the result. | USED — `js/dailyRewardOverlay.js` |
| `.dr-legend-col` | — | Right column: the prize legend. | USED — `js/dailyRewardOverlay.js` |
| `.dr-leg-title` | — | Uppercase "prizes" caption. | USED — `js/dailyRewardOverlay.js` |
| `.dr-leg` | `.won`, `.won .dr-amt`; children `.dr-sw`, `.dr-no`, `.dr-amt` | One yellow legend row per wedge. | USED — `js/dailyRewardOverlay.js`, `tests/e2e/dailyReward.e2e.mjs` |
| `.dr-sw` | — | Colour swatch matching the wedge. | USED — `js/dailyRewardOverlay.js` |
| `.dr-no` | — | Wedge number. | USED — `js/dailyRewardOverlay.js` |
| `.dr-amt` | — | Prize amount, pushed right. | USED — `js/dailyRewardOverlay.js` |
| `.dr-streak` | — | 7-day streak row. | USED — `js/dailyRewardOverlay.js` |
| `.dr-pips` | — | Container for the streak pips. | USED — `js/dailyRewardOverlay.js` |
| `.dr-pip` | `.on`, `.today` | One day pip. | USED (dynamic) — `js/dailyRewardOverlay.js` (`'dr-pip on'` / `'dr-pip today'`) |
| `.dr-streak-txt` | child `b` | "N-day streak" caption. | USED — `js/dailyRewardOverlay.js` |
| `.dr-cta` | — | Centred spin/claim button row. | USED — `js/dailyRewardOverlay.js` |
| `.dr-cooldown` | — | "Next spin in…" line. | USED — `js/dailyRewardOverlay.js`, `tests/e2e/dailyReward.e2e.mjs` |
| `.dr-dock` | `:hover`, `:focus-visible` | Always-visible Daily Spin widget, top-right of the square. | USED — `js/dailyRewardDock.js`, `tests/e2e/dailyReward.e2e.mjs` (+ several e2e helpers) |
| `.dr-dock-head` | — | Crimson dock header. | USED — `js/dailyRewardDock.js` |
| `.dr-dock-canvas-wrap` | — | White band holding the mini wheel. | USED — `js/dailyRewardDock.js` |
| `.dr-dock-canvas` | — | The dock's mini wheel canvas. | USED — `js/dailyRewardDock.js` |
| `.dr-dock-foot` | — | Footer padding block of the dock. | USED — `js/dailyRewardDock.js` |
| `.dr-dock-cta` | pressed look via `.dr-dock:hover .dr-dock-cta`; reduced-motion kills transition | Green "spin" pill inside the dock. | USED — `js/dailyRewardDock.js`, `tests/e2e/dailyReward.e2e.mjs` |
| `.dr-dock-dot` | `.pulse` + `@keyframes dr-dotpulse`; reduced-motion disables | "Ready" alert badge over the dock corner. | USED — `js/dailyRewardDock.js`, `tests/e2e/dailyReward.e2e.mjs` |

---

## 3. `rl-*` — retro landing (`css/retro-landing.css`)

Page-local structure for the 2006 portal title screen. Markup: `js/screens/retroTitle.js`
(the **only** consumer of this layer). It restyles no primitive — every panel is `hd-*`.

### Shell

| Selector | Variants / states | Purpose | Status |
| --- | --- | --- | --- |
| `.rl-screen` | weight overrides scoped here: `.hd-pill`, `.hd-pill-value`, `.rl-rank`, `.hd-badge`, `.rl-toolbar`, `.rl-note b`, `.rl-news h3`, `.rl-entry h3` | Screen root; also the scope for this page's type-weight rules. | USED — `js/screens/retroTitle.js` |
| `.rl-page` | defines `--rl-slab`, `--rl-slab-dark`, `--rl-slab-ink`; `:focus-visible` ring for `a`/`button`/`input`; reduced-motion block | 960px page column and the slab colour tokens. | USED — `js/screens/retroTitle.js` |
| `.rl-band` | — | 14px side gutter shared by every horizontal band. | USED — `js/screens/retroTitle.js` |
| `.rl-skip` | `:focus` | Skip-to-content link, off-screen until focused. | **UNUSED** |

### Toolbar / hero / nav / headline

| Selector | Variants / states | Purpose | Status |
| --- | --- | --- | --- |
| `.rl-toolbar` | children `b`, `.rl-dot` | 29px utility strip above the nav bar. | USED — `js/screens/retroTitle.js` |
| `.rl-toolbar-set` | — | One group of items inside the toolbar. | USED — `js/screens/retroTitle.js` |
| `.rl-dot` | — | Green status dot in the toolbar. | USED — `js/screens/retroTitle.js` |
| `.rl-hero` | `::after` colour wash; ≤760px re-ramps | Hero band holding art + masthead. | USED — `js/screens/retroTitle.js` |
| `.rl-hero-art` | ≤760px pulls right to `-300px` | 688×473 room render at 1:1, cropped by the band. | USED — `js/screens/retroTitle.js` |
| `.rl-masthead` | child `img`; ≤760px shorter | Logo + tagline + actions row over the hero. | USED — `js/screens/retroTitle.js` |
| `.rl-masthead-copy` | ≤760px narrower | Left copy column of the masthead. | USED — `js/screens/retroTitle.js` |
| `.rl-tagline` | — | 34ch tagline under the logo. | USED — `js/screens/retroTitle.js` |
| `.rl-masthead-actions` | — | Entry buttons row in the masthead. | USED — `js/screens/retroTitle.js` |
| `.rl-navbar` | child `ul` | Crimson 39px tab strip bar. | USED — `js/screens/retroTitle.js` |
| `.rl-tab` | `:hover`, `[aria-current='page']`, child `img` (21×21) | One nav tab with its 2006 navi icon. | USED — `js/screens/retroTitle.js` |
| `.rl-headline` | child `h2` | 47px headline bar under the tabs. | USED — `js/screens/retroTitle.js` |
| `.rl-crumbs` | — | 9px breadcrumb text in the headline bar. | USED — `js/screens/retroTitle.js` |

### Slab & columns

| Selector | Variants / states | Purpose | Status |
| --- | --- | --- | --- |
| `.rl-slab` | — | The opaque mid-navy content slab every panel sits in. | USED — `js/screens/retroTitle.js` |
| `.rl-grid` | ≤900px single column | 215 / 429 / 215 three-column grid. | USED — `js/screens/retroTitle.js` |
| `.rl-col` | `--lead`, `--left`, `--right` (mobile order 1/2/3) | A column of stacked panels. | USED — `js/screens/retroTitle.js` |
| `.rl-col--lead` | — | Wide middle column; first on mobile. | USED — `js/screens/retroTitle.js` |
| `.rl-col--left` | — | Left rail; second on mobile. | USED — `js/screens/retroTitle.js` |
| `.rl-col--right` | — | Right rail; third on mobile. | USED — `js/screens/retroTitle.js` |
| `.rl-footer` | child `p` | Footer band closing the page. | USED — `js/screens/retroTitle.js` |
| `.rl-tint-darker` | applies to `.hd-card-body` | `#f3f3f3` panel-body zoning tint. | USED — `js/screens/retroTitle.js` |
| `.rl-tint-darkest` | applies to `.hd-card-body` | `#e4e4e4` panel-body zoning tint. | USED — `js/screens/retroTitle.js` |

### Panel rhythm

| Selector | Variants / states | Purpose | Status |
| --- | --- | --- | --- |
| `.rl-well` | — | 178px letterbox art window on the hero card. | **UNUSED** |
| `.rl-well-art` | — | The 300×387 dungeon render cropped inside `.rl-well`. | **UNUSED** |
| `.rl-body` | `> *` / `> :last-child` spacing; scopes `.hd-pill`, `.hd-pill-value`, `.hd-card-header` to rail sizes | Dense 11px panel body replacing `.hd-card-body`. | USED — `js/screens/retroTitle.js` |
| `.rl-lead` | — | Slightly larger 12px lead paragraph. | **UNUSED** |
| `.rl-note` | child `b` (weight relaxed) | 9px footnote copy. | USED — `js/screens/retroTitle.js` |
| `.rl-actions` | scopes `.hd-btn` to `flex:1 1 auto` | Action row closing a panel. | USED — `js/screens/retroTitle.js` |
| `.rl-rule` | — | 1px hairline divider inside a panel. | USED — `js/screens/retroTitle.js` |

### Calling picker, dungeons, news, boards, search

| Selector | Variants / states | Purpose | Status |
| --- | --- | --- | --- |
| `.rl-callings` | — | 4×2 grid of square class tiles. | USED — `js/screens/retroTitle.js` |
| `.rl-calling` | `:hover`, `:active`, `[aria-pressed='true']`, `[aria-pressed='true'] b`, child `img`; reduced-motion kills lift; colour via inline `--cc` | One caption-less class tile carrying its weapon icon. | USED — `js/screens/retroTitle.js` |
| `.rl-selected` | — | Line under the grid naming the selected calling. | USED — `js/screens/retroTitle.js` |
| `.rl-entry` | child `h3` | A dungeon entry block (name, sub, rooms). | USED — `js/screens/retroTitle.js` |
| `.rl-rooms` | scopes `.hd-badge` to a 20px chip | Row of that dungeon's battle-room badges. | USED — `js/screens/retroTitle.js` |
| `.rl-news` | `li + li`, `h3`, `p` | What's-new list with dotted separators. | USED — `js/screens/retroTitle.js` |
| `.rl-date` | — | Crimson `[MM/DD/YY]` dateline. | USED — `js/screens/retroTitle.js` |
| `.rl-rank` | — | Fixed 14px rank column in a leaderboard pill. | USED — `js/screens/retroTitle.js` |
| `.rl-who` | — | Flexing, ellipsising name column in a leaderboard pill. | USED — `js/screens/retroTitle.js` |
| `.rl-credit` | child `a` | Quiet attribution under a scraped board. | USED — `js/screens/retroTitle.js` |
| `.rl-field` | child `label`, `.hd-input` | Labelled full-width form field. | **UNUSED** |
| `.rl-search` | scopes `.hd-input` / `.hd-btn` to full width | Stacked adventurer-search form for the 215px rail. | USED — `js/screens/retroTitle.js` |

ID rule in this file: `#searchResult` (+ `#searchResult img`) — sizes the search result block.

---

## 4. `hw-*` — Habbo window primitive (`css/style.css`, driven by `js/ui/habboWindow.js`)

The v31 Shockwave window chrome. `habboWindow.js` emits `hw`, `hw-titlebar`, `hw-title`,
`hw-close`, `hw-tabs`, `hw-tab`, `hw--tabbed`, `hw-panel`, `hw-body`, `hw-footer`;
the content classes (`hw-grid`, `hw-socket`, `hw-qty`, `hw-detail*`, `hw-gold`, `hw-btn`)
are dressings a caller fills the slots with.

**Updated 29 Jul 2026:** `kitchen-sink.html` was rebuilt as the `hd-*`/`dr-*` component
catalog and its two-specimen window section was removed rather than left half-populated.
That demo was the only caller of the dressing classes, so they now have **no caller at
all** — the rows below record that, not a deletion. `habboWindow.js` itself is unchanged
and still emits the frame classes.

| Selector | Variants / states | Purpose | Status |
| --- | --- | --- | --- |
| `.hw` | `--tabbed`; local tokens `--hw-teal`, `--hw-teal-lit`, `--hw-teal-dim`, `--hw-face`, `--hw-socket`, `--hw-locked`, `--hw-scroll` | Window frame: teal body, black outline, inset bevels. | USED — `js/ui/habboWindow.js` |
| `.hw--tabbed` | affects `.hw-panel`, `.hw-titlebar` | Set when the window has a tab strip. | USED — `js/ui/habboWindow.js` |
| `.hw-titlebar` | `::before` checkerboard dither | 28px title bar. | USED — `js/ui/habboWindow.js` |
| `.hw-title` | — | Solid title plate that keeps the dither off the text. | USED — `js/ui/habboWindow.js` |
| `.hw-close` | `::before`/`::after` (the ✕ strokes), `:hover` | Outlined close button. | USED — `js/ui/habboWindow.js` |
| `.hw-tabs` | `.hidden` when there are no tabs | Tab strip container. | USED — `js/ui/habboWindow.js` |
| `.hw-tab` | `:hover:not(.is-active)`, `.is-active`, `.is-active::after` | One 21px tab cap; the active one fuses into the panel. | USED — `js/ui/habboWindow.js` |
| `.hw-panel` | `.hw--tabbed .hw-panel` squares the top corners | `#efefef` face inset 9px into the frame. | USED — `js/ui/habboWindow.js` |
| `.hw-body` | `::-webkit-scrollbar` (track / thumb / thumb:hover / buttons), `@supports` Firefox fallback | Scrollable content slot with client-style 15px scrollbar. | USED — `js/ui/habboWindow.js` |
| `.hw-footer` | `--detail` | Optional footer bar under the body. | USED — `js/ui/habboWindow.js` |
| `.hw-footer--detail` | — | Fixed 58px clipping footer for the detail dressing. | **UNUSED** (was `kitchen-sink.html`) |
| `.hw-detail` | `.is-empty` | Left zone of the footer: selected item's detail. | **UNUSED** (named in the usage comment of `js/ui/habboWindow.js`) |
| `.hw-detail-name` | — | Bold item name in the footer. | **UNUSED** (was `kitchen-sink.html`) |
| `.hw-detail-line` | — | Grey stat line, ellipsised. | **UNUSED** (was `kitchen-sink.html`) |
| `.hw-detail-blurb` | — | Dimmer flavour line, ellipsised. | **UNUSED** (was `kitchen-sink.html`) |
| `.hw-gold` | — | Right zone of the footer: the run's gold. | **UNUSED** (named in the usage comment of `js/ui/habboWindow.js`) |
| `.hw-grid` | column count via `--hw-cols` (default 6) | Reusable 46px socket grid for container windows. | **UNUSED** (named in the usage comment of `js/ui/habboWindow.js`) |
| `.hw-socket` | `.is-filled`, `.is-filled:hover`, `.is-selected`, children `img`/`canvas`/`svg` | One item well. | **UNUSED** (was `kitchen-sink.html`) |
| `.hw-qty` | — | White-on-black-outline quantity stamp, bottom-right of a socket. | **UNUSED** (was `kitchen-sink.html`) |
| `.hw-btn` | `:hover` | Plain footer button (the Keep Notice OK). | **UNUSED** (was `kitchen-sink.html`) |

---

## 5. Unprefixed families in `css/style.css`

Not part of the three named layers, but defined in an audited file, so listed for completeness.

### Global / battle HUD

| Selector | Variants / states | Purpose | Status |
| --- | --- | --- | --- |
| `.hidden` | — | `display:none !important` utility. | USED — `index.html`, `js/main.js`, `js/hand.js`, `js/npc.js`, `js/runController.js`, `js/roomEditor.js`, `js/botCatalog.js`, `js/clothingCatalog.js`, `js/consumablesCatalog.js`, `js/furniCatalog.js`, `js/dailyReward*.js`, `js/ui/habboWindow.js`, 4 e2e specs |
| `.info` | `.dim` | Small grey helper line under a HUD/form block. | USED — `index.html`, `js/main.js` |
| `.dim` | also `.slot .dim` | Muted inline text. | USED — `index.html`, `js/main.js`, `js/runController.js` |
| `button.primary` | `:hover` | Green emphasis for the HUD's main button (End Turn). | **UNUSED** |
| `.banner` | `b`, `::before`/`::after` tail, `.obj`, `.obj::before`, phase tints `.player`, `.enemy`, `.won`, `.lost`, `.fallen`, `.out` | 2006 chat-bubble banner over the battle stage. | USED (dynamic) — `js/battleController.js`, `js/coopBattle.js` (`.fallen`/`.out`), `js/duelBattle.js`, `index.html` |
| `.roster-row` | `.player`, `.enemy`, `.sel`, `.done`, `.dead`, `.ghost`, `.enemy .rhp-fill` | One combatant row in the HUD roster. | USED (dynamic) — `js/battleController.js`, `js/coopBattle.js`, `js/duelBattle.js`, `tests/e2e/coopFallen.e2e.mjs`, `tests/e2e/duelLive.e2e.mjs` |
| `.rname` | — | Combatant name cell. | USED — `js/battleController.js`, `js/coopBattle.js`, `js/duelBattle.js` |
| `.rcls` | — | Class label cell. | USED — `js/battleController.js`, `js/coopBattle.js`, `js/duelBattle.js` |
| `.rbars` | — | Stacked HP/MP bar cell. | USED — `js/battleController.js` |
| `.rhp` / `.rhp-fill` | enemy tint via `.roster-row.enemy` | HP track and fill. | USED — `js/battleController.js`, `js/coopBattle.js` |
| `.rmp` / `.rmp-fill` | — | Slimmer MP track and fill (pool units only). | USED — `js/battleController.js` |
| `.rhpn` | — | Right-aligned HP number. | USED — `js/battleController.js`, `js/coopBattle.js`, `js/duelBattle.js` |

### Overlay screens (title / camp / squad / account / skills)

| Selector | Variants / states | Purpose | Status |
| --- | --- | --- | --- |
| `.choices` | — | Flex row of choice buttons on an overlay screen. | USED — `js/runController.js` |
| `.camp-actions` | — | Right-aligned action row at camp. | USED — `js/main.js`, `js/runController.js`, `tests/e2e/coopFallen.e2e.mjs` |
| `.result` | — | Crimson result line on an overlay. | USED — `js/main.js`, `js/runController.js` |
| `.squad-grid` | — | Auto-fill grid of squad cards. | USED — `js/runController.js`, `tests/e2e/coopFallen.e2e.mjs` |
| `.card` | `.sel`, `.downed`, `.downed .card-hp` | Squad/camp member card. | USED — `js/runController.js` |
| `.card-head` | — | Card title line (name + class/level). | USED — `js/runController.js` |
| `.card-hp` | red when `.downed` | Green HP/MP line on the card. | USED — `js/runController.js` |
| `.card-stats` | — | 10px stat line on the card. | USED — `js/runController.js` |
| `.slots` | — | Row of equipment slots under a card. | USED — `js/main.js`, `js/runController.js` |
| `.slot` | child `.dim`; rarity border set inline | One equipment slot button. | USED — `js/runController.js`, `js/hand.js` |
| `.inv` | — | Wrapping row of inventory chips. | USED — `js/runController.js` |
| `.chip` | rarity border set inline | One inventory item chip. | USED — `js/runController.js` |
| `.field-row` | — | Label + input + button row on the account screen. | USED — `js/main.js` |
| `.acct-ok` | — | Green "linked" confirmation line. | USED — `js/main.js` |
| `.code-block` | — | Wrapper above the motto verification code. | USED — `js/main.js` |
| `.code` | — | Big monospace verification code plate. | USED — `js/main.js` |
| `.trees` | — | Grid of skill trees. | USED — `js/main.js` |
| `.tree` | tree colour set inline | One skill-tree card. | USED — `js/main.js` |
| `.tree-head` | — | Skill-tree heading. | USED — `js/main.js` |
| `.skill-item` | `.on .sk-name`, `.off .sk-name`, `.on .sk-req` | One skill row inside a tree. | USED — `js/main.js` |
| `.sk-name` | — | Skill name (tinted by on/off). | USED — `js/main.js` |
| `.sk-req` | green when `.on` | Uppercase requirement text. | USED — `js/main.js` |

### Room chat, name tags, discovery banner

| Selector | Variants / states | Purpose | Status |
| --- | --- | --- | --- |
| `.chat-bubble` | `b`, `--shout .chat-msg`, `--whisper .chat-msg`, `--bot`, `--bot b` | Classic tail-less white chat pill. | USED — `js/chat.js`, `js/battleController.js` |
| `.chat-bubble--shout` | — | Bold text for shouts. | USED (dynamic) — `js/chat.js`, fed by `js/botChatter.js` |
| `.chat-bubble--whisper` | — | Italic grey text for whispers. | USED (dynamic) — `js/chat.js` |
| `.chat-bubble--bot` | — | Pale grey pill for NPC/bot lines. | USED (dynamic) — `js/chat.js` (`sayAs`) |
| `.chat-msg` | — | The message span inside a bubble. | USED — `js/chat.js` |
| `.chat-say` | scoped `#chatToolbar .chat-say` | "Say" mode selector in the chat pill. | USED — `js/chat.js` |
| `.name-tag` | `--duel` | Dark pill floating above a remote head. | USED — `js/remotePlayers.js`, `js/roomBots.js` |
| `.name-tag--duel` | — | Red/gold tag for duelling players. | USED — `js/duelSpectator.js`, `tests/e2e/duelLive.e2e.mjs` |
| `.rd-play` | `#roomDiscovery.rd-play` + `@keyframes rd-discover` | Runs the room-discovery fade. | USED — `js/roomBanner.js`, `tests/e2e/coopFallen.e2e.mjs` |
| `.rd-ribbon` | — | Ribbon art for the discovered room name. | USED — `js/roomBanner.js` |
| `.rd-text` | — | Volter fallback when the ribbon GIF fails. | USED — `js/roomBanner.js` |

### Infostand (furni + human)

| Selector | Variants / states | Purpose | Status |
| --- | --- | --- | --- |
| `.infostand` | `--human` | Dark translucent object-displayer panel. | USED — `js/humanInfostand.js`, `js/roomBots.js`, `js/roomEditor.js` |
| `.infostand--human` | scopes `.infostand-preview--human`, `.infostand-motto` | Human branch of the displayer. | USED — `js/humanInfostand.js`, `js/party.js`, `js/roomBots.js` |
| `.infostand-info` | — | Padded info block. | USED — `js/humanInfostand.js`, `js/roomBots.js`, `js/roomEditor.js` |
| `.infostand-name` | child `span` | Bold name row with close button. | USED — `js/humanInfostand.js`, `js/roomBots.js`, `js/roomEditor.js` |
| `.infostand-close` | `:hover` | ✕ in the name row. | USED — `js/humanInfostand.js`, `js/roomBots.js`, `js/roomEditor.js` |
| `.infostand-preview` | child `canvas`; `--human` variant + `img` | Art preview area. | USED — `js/humanInfostand.js`, `js/roomBots.js`, `js/roomEditor.js` |
| `.infostand-preview--human` | — | Taller preview for full-body renders. | USED — `js/humanInfostand.js`, `js/roomBots.js` |
| `.infostand-motto` | — | Italic motto line. | USED — `js/humanInfostand.js`, `js/roomBots.js` |
| `.infostand-desc` | — | Centred description text. | USED — `js/humanInfostand.js`, `js/roomBots.js`, `js/roomEditor.js` |
| `.infostand-actions` | — | Bordered action zone. | USED — `js/humanInfostand.js`, `js/roomBots.js`, `js/roomEditor.js` |
| `.infostand-buttons` | `.hidden` | Wrapping row of action pills. | USED — `js/humanInfostand.js`, `js/roomBots.js`, `js/roomEditor.js` |
| `.infostand-btn` | `:hover`, `.active`, `:disabled`, `:disabled:hover` | 15px white-outline action pill. | USED — `js/humanInfostand.js`, `js/roomBots.js`, `js/roomEditor.js`, `js/party.js`, `js/duelWindow.js`, `js/tradeWindow.js`, `js/main.js` |
| `.infostand-toggle` | `:hover` | «/» actions toggle. | USED — `js/roomEditor.js` |

### Party formation

| Selector | Variants / states | Purpose | Status |
| --- | --- | --- | --- |
| `.party-title` | — | Uppercase "party" caption in the rail. | USED — `js/party.js` |
| `.party-list` | — | Member list. | USED — `js/party.js` |
| `.party-row` | `.me` | One member row. | USED — `js/party.js` |
| `.party-row-head` | child `img`, `img.is-missing` | Fixed 26px head socket. | USED — `js/party.js` |
| `.party-crown` | — | Leader crown over the head's corner. | USED — `js/party.js` |
| `.party-row-main` | — | Name + HP column. | USED — `js/party.js` |
| `.party-row-name` | — | Ellipsising member name. | USED — `js/party.js` |
| `.party-hp` | — | Reserved HP row (deliberately empty). | USED — `js/party.js` |
| `.party-hp-track` | — | Empty HP track awaiting a real fill. | USED — `js/party.js` |
| `.party-leave` | — | Leave-party button in the rail. | USED — `js/party.js` |
| `.party-sr` | — | Screen-reader-only "(leader)" text. | USED — `js/party.js` |
| `.party-prompt` | — | Centred invite/confirm prompt above the toolbar. | USED — `js/party.js`, `js/main.js`, `js/duelWindow.js`, `js/tradeWindow.js` |
| `.party-prompt-text` | — | Prompt copy. | USED — `js/party.js`, `js/main.js`, `js/duelWindow.js`, `js/tradeWindow.js` |
| `.party-prompt-btns` | — | Prompt button pair. | USED — `js/party.js`, `js/main.js`, `js/duelWindow.js`, `js/tradeWindow.js` |

### Safe Trading window

| Selector | Variants / states | Purpose | Status |
| --- | --- | --- | --- |
| `.trade-window` | — | Grey classic trade frame. | USED — `js/tradeWindow.js` |
| `.trade-titlebar` | — | Gradient title strip. | USED — `js/tradeWindow.js` |
| `.trade-body` | — | Padded frame interior. | USED — `js/tradeWindow.js` |
| `.trade-panes` | — | Two-pane row (theirs / yours). | USED — `js/tradeWindow.js` |
| `.trade-pane` | — | One recessed offer pane. | USED — `js/tradeWindow.js` |
| `.trade-pane-head` | — | Pane caption. | USED — `js/tradeWindow.js` |
| `.trade-grid` | — | 3-column socket grid. | USED — `js/tradeWindow.js` |
| `.trade-cell` | `> .trade-socket:only-child` keeps badge height | Badge + socket stack. | USED — `js/tradeWindow.js` |
| `.trade-badge` | — | Type-ID badge over a socket. | USED — `js/tradeWindow.js` |
| `.trade-socket` | `.filled`, `.filled:hover`, child `canvas` | One offer socket. | USED — `js/tradeWindow.js` |
| `.trade-agree` | child `input` | "Agrees" checkbox row. | USED — `js/tradeWindow.js` |
| `.trade-foot` | — | Footer row (status + actions). | USED — `js/tradeWindow.js` |
| `.trade-status` | `.lock`, `.good` | Status text with locked/confirmed tints. | USED — `js/tradeWindow.js` |
| `.trade-actions` | — | Footer button group. | USED — `js/tradeWindow.js` |
| `.trade-btn` | `:hover`, `--confirm` | White-pill footer button. | USED — `js/tradeWindow.js`, `js/duelWindow.js` |
| `.trade-btn--confirm` | — | Green confirm variant. | USED — `js/tradeWindow.js` |

### Duel window

| Selector | Variants / states | Purpose | Status |
| --- | --- | --- | --- |
| `.duel-window` | — | Challenge handshake frame (trade chrome). | USED — `js/duelWindow.js` |
| `.duel-titlebar` | — | Title strip. | USED — `js/duelWindow.js` |
| `.duel-body` | — | Frame interior. | USED — `js/duelWindow.js` |
| `.duel-foes` | — | "A vs B" name row. | USED — `js/duelWindow.js` |
| `.duel-vs` | — | Red "vs". | USED — `js/duelWindow.js` |
| `.duel-count` | `--go`, `--ready` | 3-2-1-GO counter plate. | USED — `js/duelWindow.js`, `tests/e2e/duelLive.e2e.mjs` |
| `.duel-count--go` | — | Green GO state. | USED (dynamic) — `js/duelWindow.js` (`duel-count--${p.phase}`) |
| `.duel-count--ready` | — | Amber "duel ready" state. | USED (dynamic) — `js/duelWindow.js` |
| `.duel-foot` | — | Footer row. | USED — `js/duelWindow.js` |
| `.duel-status` | `.lock` | Status text with locked tint. | USED — `js/duelWindow.js` |

### The Hand (inventory container)

| Selector | Variants / states | Purpose | Status |
| --- | --- | --- | --- |
| `.hand` | — | Fixed positioning root for the hand. | USED — `js/hand.js`, `js/main.js` |
| `.hand-buttons` | — | prev / close / next window above the board. | USED — `js/hand.js` |
| `.hand-btn` | `:hover` | One white-pill hand button. | USED — `js/hand.js` |
| `.hand-board` | — | Grey 3×3 board frame. | USED — `js/hand.js` |
| `.hand-title` | — | Board caption. | USED — `js/hand.js` |
| `.hand-grid` | — | 3-column socket grid. | USED — `js/hand.js` |
| `.hand-socket` | `.filled`, `.filled:hover`, `.selected`, `.worn canvas`, child `canvas` | One 44px item well. | USED — `js/hand.js` |
| `.hand-foot` | — | Page/count line under the grid. | USED — `js/hand.js` |
| `.hand-detail` | — | Dark detail card under the board. | USED — `js/hand.js` |
| `.hand-detail-name` | — | Bold item name. | USED — `js/hand.js` |
| `.hand-detail-line` | — | Stat line. | USED — `js/hand.js` |
| `.hand-detail-blurb` | — | Italic flavour line. | USED — `js/hand.js` |
| `.hand-detail-hint` | — | Gold hint line. | USED — `js/hand.js` |
| `.hand-detail-btn` | `:hover` | Action button in the detail card. | USED — `js/hand.js` |
| `.hand-preview` | child `canvas`, `span` | Native-res hover preview beside the hand. | USED — `js/hand.js` |
| `.hand-drag-ghost` | — | Item art riding the cursor while dragging. | USED — `js/hand.js` |
| `.hand-hint` | — | Small grey hint above the board. | USED — `js/hand.js` |

### Catalogues (`:furni`, `:npc`, `:clothing`, consumables)

| Selector | Variants / states | Purpose | Status |
| --- | --- | --- | --- |
| `.furni-cat` | — | Catalogue window frame. | USED — `js/furniCatalog.js`, `js/botCatalog.js`, `js/clothingCatalog.js`, `js/consumablesCatalog.js` |
| `.furni-cat-head` | child `span`; draggable | Title bar. | USED — same four catalogues |
| `.furni-cat-close` | `:hover` | ✕ button. | USED — same four catalogues |
| `.furni-cat-sub` | — | Subtitle line. | USED — same four catalogues |
| `.furni-cat-search` | — | Search field. | USED — `js/furniCatalog.js`, `js/botCatalog.js` |
| `.furni-cat-grid` | — | Scrolling 3-column shelf. | USED — same four catalogues |
| `.furni-cell` | `:hover`, child `canvas`, `.fc-name` | One item cell. | USED — same four catalogues |
| `.fc-name` | — | Ellipsised cell caption. | USED — same four catalogues |
| `.bot-cell` | child `img`, `.fc-motto` | Bot cell with a live avatar render. | USED — `js/botCatalog.js` |
| `.fc-motto` | — | Bot motto, second line of the cell. | USED — `js/botCatalog.js` |
| `.bot-cat-preview` | child `img` | Bot hover preview at native width. | USED — `js/botCatalog.js` |
| `.clothing-cat-slot` | — | Slot group header spanning the grid. | USED — `js/clothingCatalog.js` |
| `.furni-cat-empty` | — | "No matches" cell. | USED — `js/furniCatalog.js`, `js/botCatalog.js` |
| `.furni-cat-foot` | — | Footer count line. | USED — same four catalogues |
| `.furni-cat-preview` | children `canvas`, `span` | Dark 1:1 hover preview panel. | USED — same four catalogues |
| `.furni-move-pic` | — | Half-opacity move preview riding the cursor. | USED — `js/roomEditor.js` |
| `.poof` / `.poof-cloud` | — | Clothing-change pixel poof layer and puffs. | USED — `js/clothingPoof.js` |

### Toolbar, pop-overs, music

| Selector | Variants / states | Purpose | Status |
| --- | --- | --- | --- |
| `.toolbar-icons` | — | Row of native toolbar cutouts. | USED — `js/toolbarIcons.js` |
| `.tb-icon` | `:hover`, `:active`, `.active`, child `img` | One toolbar icon button. | USED — `js/toolbarIcons.js`, `js/main.js` |
| `.tb-pop-wrap` | `.open .tb-pop` | Anchor for a pop-over above an icon. | USED — `js/toolbarIcons.js` |
| `.tb-pop` | — | Dark pop-over panel. | USED — `js/toolbarIcons.js` |
| `.tb-pop-title` | — | Pop-over heading. | USED — `js/toolbarIcons.js` |
| `.tb-dim` | also `#adminPanel button.tb-dim` | Dimmed text/button inside a pop-over. | USED — `js/toolbarIcons.js` |
| `.console-pop` | shares sizing with `.inv-pop` | Friends console pop-over body. | USED (dynamic) — `js/toolbarIcons.js` (`mkPop('console-pop', …)`) |
| `.friend-row` | child `span` | One friend row. | USED — `js/toolbarIcons.js` |
| `.friend-del` | `:hover` | Remove-friend ✕. | USED — `js/toolbarIcons.js` |
| `.friend-add` | children `input`, `button`, `button:hover` | Add-friend field + button. | USED — `js/toolbarIcons.js` |
| `.nav-room` | `:hover`, `.here` | Room entry in the navigator pop-over. | USED — `js/toolbarIcons.js` |
| `.help-pop` | — | Wider pop-over for help. | USED (dynamic) — `js/toolbarIcons.js` (`mkPop('help-pop', …)`) |
| `.help-line` | — | One help line. | USED — `js/main.js` |
| `.inv-pop` | — | Inventory pop-over body. | **UNUSED** (the inventory icon now opens the Hand) |
| `.inv-member` | `:first-child` | Squad member heading in the old inventory pop-over. | **UNUSED** |
| `.inv-row` | — | Item row in the old inventory pop-over. | **UNUSED** |
| `.inv-gold` | — | Gold line in the old inventory pop-over. | **UNUSED** |
| `.music-ctl` | `.open .music-pop` | Volume control root beside the chat input. | USED — `js/music.js`, `js/toolbarIcons.js` |
| `.music-btn` | `:hover`, `:active`, `.muted`, `.loud` | Speaker button (3 SVG states). | USED — `js/music.js` |
| `.music-pop` | `input[type='range']` + webkit/moz track & thumb | Press-to-reveal slider pop-over. | USED — `js/music.js` |
| `.music-val` | — | Numeric volume readout. | USED — `js/music.js` |

---

## Findings

**Dead (no reference anywhere) — 25 classes:**

- `hd-*`: `.hd-card-well`, `.hd-btn--red`, `.hd-logo-img--center`, `.hd-inv-section-title`, `.hd-inv-section-count`
- `rl-*`: `.rl-skip`, `.rl-well`, `.rl-well-art`, `.rl-lead`, `.rl-field`
- `hw-*`: `.hw-footer--detail`, `.hw-detail`, `.hw-detail-name`, `.hw-detail-line`, `.hw-detail-blurb`, `.hw-gold`, `.hw-grid`, `.hw-socket`, `.hw-qty`, `.hw-btn` (all ten as of 29 Jul 2026 — see the `hw-*` section)
- `style.css`: `button.primary`, `.inv-pop`, `.inv-member`, `.inv-row`, `.inv-gold`

Notes on intent, so nothing is cut blindly later:

- `.rl-well` / `.rl-well-art` are documented at length as the 2006 promo letterbox — the
  landing now leads with `.rl-hero-art` instead, so this is superseded, not spare.
- `.rl-skip` is an accessibility affordance that was styled but never emitted; the fix is
  markup, not CSS.
- `.inv-*` pop-over rules are genuinely orphaned: `js/toolbarIcons.js` hands the inventory
  icon to the Hand.
- `.hd-btn--red` and `.hd-card-well` are kit completeness (a red button and a tinted well
  exist in the source fansite language) with no caller yet.

**Built but not wired:** no live screen constructs a `HabboWindow`. The frame classes are
still emitted by `js/ui/habboWindow.js`, but since the catalog rebuild on 29 Jul 2026 the
ten dressing classes have no caller anywhere — the primitive is complete and entirely
unexercised. Either wire it into a screen or retire the layer deliberately; right now it
is neither.

**Duplication worth knowing before building anything new:** `style.css` re-declares the
`hd-card` values by hand for `#panel`, `#exploreBar`, `#runHeader` and `.card`/`.chip`
(same `#fff` / `1px #050a0e` / 15px radius / shadow), and `.card.sel`, `.roster-row.sel`,
`#modeTabs button.active`, `#rooms button.active`, `#exploreBar #editRoom.active` all
repeat the same `#f4d35e` + `2px #8eda55` outline selection treatment that `.hd-class.on`
uses. Three window frames (`.trade-window`, `.duel-window`, `.furni-cat`) and two dark
panels (`.infostand`, `#partyStrip`, plus `.hand-detail` / `.hand-preview` /
`.furni-cat-preview` / `.tb-pop` / `.music-pop` / `#adminPanel`) each restate the same
chrome inline.

**Out of scope of this pass:** ID-scoped rules in the audited files — `#game`, `#panel`,
`#modeTabs`, `#actions`, `#roster`, `#log`, `#rooms`, `#runHeader`, `#overlay`,
`#chatLayer`, `#chatToolbar`, `#dialoguePanel`, `#nameTagLayer`, `#botTagLayer`,
`#partyStrip`, `#exploreBar`, `#adminHint`, `#adminPanel`, `#roomDiscovery` (style.css)
and `#searchResult` (retro-landing.css). They carry real layout, so any kit consolidation
has to account for them.
