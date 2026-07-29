# Habbo.com — 28 Sep 2006 layout reference

Reconstructed from the archived capture in this folder. Every value below is quoted
from a local file; nothing is from memory.

| File | What it is |
| --- | --- |
| `index.html` | Raw markup, `https://web.archive.org/web/20060928123858id_/http://www.habbo.com/` |
| `assets/style.css` | Site-wide stylesheet, `images.habbohotel.com/web/web-1.0.1_b39/styles/style.css` |
| `assets/boxes.css` | Panel/box chrome, same build |
| `assets/ads.css` | Ad frame chrome, same build |
| `assets/style_custom_com.css` | Per-hotel skin overrides, served from `www.habbo.com/styles/` |

Build stamp in the page: `index.html:33` — `<!-- 1.0.1_b39 - 20060822121202  - com -->`.
Doctype is `XHTML 1.0 Transitional` (`index.html:1`); stylesheets load in the order
style → ads → boxes (`index.html:9-11`), then the hotel skin (`index.html:23`).

---

## 1. Page shell

`style.css:3-11` sets the body:

```css
body {
	background-color: #083940;
	background-image: url(.../images/bg_patterns/habbo.gif);
	margin: 0;
	padding: 0;
	font-size: 11px;
	font-family: Verdana, Arial, Helvetica, sans-serif;
	text-align: center;
}
```

The `text-align: center` + `margin: 0 auto` pair is the classic IE5 centering hack —
`#wrapper` re-lefts the text (`style.css:34-38`):

```css
#wrapper {
	margin: 0 auto;
	text-align: left;
	width: 928px;
}
```

**928px is the fixed page width**, repeated verbatim on `#toolbar` (`style.css:63`),
`#toolbar-wrapper` (`:68`), `#top` (`:158`), `#topsub` (`:164`), `#top-elements` (`:168`),
`#menu` (`:194`), `#submenu` (`:334`), `#main-content` (`:364`), `#page-headline` (`:373`),
`#footer` (`:1052`), `#footer-top` (`:1059`), `#footer-bottom` (`:1080`).

Vertical stack in `index.html`: leaderboard ad (`:41`) → `#toolbar` (`:59`) →
`#top` (`:104`) containing `#top-elements`/`#mainmenu` → `#main-content` (`:122`) →
`#footer` (`:825`).

Header band heights: `#toolbar` `height: 29px` with `margin-top: 8px` (`style.css:61-65`),
`#top` `height: 179px` (`style.css:157`, note the commented-out `/*height: 190px;*/` above it),
`#top-elements` `height: 118px` (`style.css:169`).

Logo and enter button are background-image anchors, not `<img>` (`style.css:178-193`):
`a#logo-link` is `160px × 66px`, `#enter-hotel-link` is `103px × 105px`.
`style_custom_com.css:12,17,23` swaps all three per hotel and documents the intended
sizes in comments — hotel view `width: 928px, height: 154px`, logo `160×66`,
enter button `105×106` (that last one disagrees by 1px with `style.css`'s `103px`).

---

## 2. Column grid

`#main-content` is the blue content slab (`style.css:360-366`):

```css
#main-content {
	background: url(.../images/content_bkg/content_mid.gif) repeat-y;
	background-color: #47839d;
	width: 928px;
	padding: 0;
	margin: 0;
}
```

`content_mid.gif` is `928×1`, solid `#47839D` — a 1px vertical tile matching the
declared background-color exactly.

The grid is a table, not floats (`index.html:123`):
`<table border="0" cellpadding="0" cellspacing="0" width="100%">`. Widths come from
inline styles on the cells:

| Cell | Width | Source |
| --- | --- | --- |
| Left gutter | `8px` | `index.html:129` `<td rowspan="2" style="width: 8px;">` |
| Main column | `740px` | `index.html:131` |
| Gutter | `4px` | `index.html:755` |
| Right rail | `176px` | `index.html:757` |

`8 + 740 + 4 + 176 = 928`, exactly `#wrapper`.

Inside the 740px main column, a nested table (`index.html:133`) holds a full-width
promo row (`colspan="3"`, `padding-bottom: 3px`, `index.html:134`) above three panel
columns (`index.html:234, 293, 543`):

| Column | Inline style | Class |
| --- | --- | --- |
| 1 | `width: 215px; height: 400px;` | `habboPage-col` |
| 2 | `width: 215px; height: 400px;` | `habboPage-col` |
| 3 | `width: 310px; height: 400px;` | `habboPage-col rightmost` |

`215 + 215 + 310 = 740`. The `height: 400px` is a minimum-height prop, not a real cap.

Gutters between panels come from `boxes.css:367-381` — every box type gets
`margin: 0 5px 5px 0`, and `.rightmost` zeroes the right margin so the last column
flushes to the table edge:

```css
td.habboPage-col div.portlet-scale,
td.habboPage-col div.content-white-outer,
td.habboPage-col div.nobox,
td.habboPage-col div.v2box,
td.habboPage-col div.maskbox {
    margin: 0 5px 5px 0;
}
```

So real panel content widths are 210px / 210px / 310px.

The right rail (176px) holds `.cooperation` — `width: 166px; margin-left: 1px;
padding-bottom: 7px; text-align: center` (`style.css:40-45`) — then a 160×600 skyscraper.

### Promo area (left of the top row, 429px)

`style.css:409-412` and `:414-426`:

```css
#promoarea { width: 429px; float: left; }
#promoheader { width: 429px; height: 29px; ... color: #fff; font-size: 10px;
	font-weight: bold; text-transform: uppercase; }
```

`#promoheader h2` is `font-size: 10px`, `padding: 10px`, `float: left`
(`style.css:428-435`). The 1/2/3 rotator selectors float right with
`padding: 0 10px 0 0` (`style.css:437-441`); each `li a` is
`color: #999; padding: 1px 3px; border: 1px solid #999` and the active one flips to
`color: white; border: 1px solid white` (`style.css:447-457`).

`#promocontent` (`style.css:464-475`):

```css
#promocontent {
	width: 429px;
	height: 222px;
	overflow: hidden;
	background: url(.../images/promo_area/promo_footer.gif) no-repeat;
	background-position: bottom left;
	font-size: 11px;
	color: white;
	text-align: left;
}
```

Only `#promobody-1` is visible by default — `div.promobody { display: none; }` and
`#promobody-1 { display: block; }` (`style.css:477-483`). The promo image strip is
`height: 178px; overflow: hidden; border-bottom: 1px solid white; margin: 0 0 0 4px`
(`style.css:485-490`), text column `width: 295px; float: left` (`style.css:492-495`)
with `padding: 4px 10px` on its paragraphs (`:497-500`).

Promo header 29px + content 222px = **251px**, exactly the `#newsbox` height.

### News box (right of the top row, 311px)

`style.css:533-543`:

```css
#newsbox {
	background: url(.../images/promo_area/news_box.gif) no-repeat;
	width: 311px;
    height: 251px;
    color: #fff;
    color: #000000;
    padding: 0;
    margin: 0;
    float: right;
}
```

Note the duplicated `color` — `#000000` wins, overriding `#fff`.
`429 + 311 = 740`, the main column exactly, with no explicit gutter (they are a
`float: left` / `float: right` pair).

| Part | Box model | Source |
| --- | --- | --- |
| `#newsbox-header` | `width: 300px; height: 29px; overflow: hidden; color: #fff; text-transform: uppercase; font-weight: bold` | `style.css:545-556` |
| `#newsbox-header h2` | `font-size: 10px; margin: 0; padding: 10px; float: left` | `style.css:558-565` |
| `#newsbox-header img` | `float: right; margin: 10px 0 0 0` (the RSS feed icon) | `style.css:567-570` |
| `#newsbox-text` | `width: 287px; height: 190px; font-size: 10px; padding: 3px 12px 0 10px; color: #fff; overflow: hidden` | `style.css:572-579` |
| `#newsbox-footer` | `color: #fff; text-align: right; padding-right: 10px; float: right` | `style.css:621-626` |

Header 29 + text 190 + padding-top 3 = 222, leaving 29px for the footer strip inside 251px.

News item internals: `.newsitem { margin-bottom: 8px; clear: both }` (`style.css:581-584`),
`h3 { font-size: 1.1em; margin: 0 0 3px 0 }` (`:589-593`) but the anchor inside is pinned
to `font-size: 10px` (`:599-601`) and `.articledate` to `9px` (`:595-597`).
Item paragraphs are `width: 240px; font-size: 10px` (`:603-607`), item images
`float: right` (`:609-611`). The separator is not an `<hr>` — it is
`.hr { height: 1px; font-size: 1px; border-bottom: 1px dotted #ccc }` (`style.css:613-619`).
Markup confirms the structure at `index.html:188-201`.

---

## 3. Nav tab strip

Markup is a `<ul>` of `<li>` where each tab is three pieces — a left cap span, the
`<a>` (icon + label), and a right cap span (`index.html:158-208`, indentation collapsed):

```html
<div id="mainmenu">
  <ul>
    <li id="leftspacer">&nbsp;</li>
    <li id="active" >
      <span class="left"></span>
      <a href="/"><img src="/images/navi/tab_icon_01_home.gif" alt=""/> Home</a>
      <span class="right"></span>
    </li>
    ...
    <li class="last">
      <span class="left"></span>
      <a href="/help"><img src=".../tab_icon_08_hep.gif" alt=""/> Help</a>
      <span class="right"></span>
    </li>
  </ul>
</div>
```

Eight tabs in order: Home (active), Habbo Hotel, Buy Coins, Community, Games,
Entertainment, Shop, Help. Active state is `id="active"` (an id, reused illegally as a
state hook); the final tab carries `class="last"`.

The strip itself (`style.css:212-226`):

```css
#mainmenu {
	width: 100%;
	background: transparent url(.../images/navi/navi_bar_slice_top.gif) no-repeat;
	background-position: bottom left;
	height: 39px;
	line-height: 39px;
	text-align: left;
	text-transform: uppercase;
	color: #ffffff;
	font: bold 10px verdana;
}
```

**Tabs are 39px tall, uppercase, bold 10px Verdana.** `#mainmenu ul` has
`margin: 0 0 0 5px; list-style: none` (`style.css:228-233`); `li` is `float: left`
(`:235-241`) and `#leftspacer` is a `12px` shim (`:243-248`).

Tab body and caps — all sliced GIFs:

| Piece | Image | Size | Source |
| --- | --- | --- | --- |
| Inactive body | `navi/tab_mid.gif` `repeat-x` | `height: 33px`(→`39px !important`) | `style.css:251-266` |
| Inactive left cap | `navi/tab_left.gif` | `width: 5px; height: 39px` | `style.css:290-296` |
| Inactive right cap | `navi/tab_right.gif` | `width: 4px; height: 39px` | `style.css:298-303` |
| Active body | `navi/tab_act_mid.gif` | `height: 33px`, `color: #000` | `style.css:274-283` |
| Active left cap | `navi/tab_act_left.gif` | `width: 5px` | `style.css:305-311` |
| Active right cap | `navi/tab_act_right.gif` | `width: 4px` | `style.css:313-319` |
| Strip end (last tab) | `navi/tab_end.gif` | `width: 14px; height: 39px` | `style.css:321-325` |
| Strip end (last + active) | `navi/tab_act_end.gif` | `width: 14px` | `style.css:327-331` |
| Far-left bar end | `navi/navi_bar_end_left.gif` | `width: 8px` | `style.css:285-288` |

The inactive/active distinction is **text color plus a drop shadow**, not just the slice
(`style.css:257-259` vs `:277-282`):

```css
#mainmenu li a      { text-shadow: black 2px 2px 2px; font-weight: bold; color: #fff; }
#mainmenu li#active a { color: #000; text-shadow: none; }
```

White text with a black shadow on the raised tab; plain black text on the active (lit) tab.
Padding is `6px 8px 0 0` with an `!important` `0 8px 0 0` for standards-mode browsers
(`style.css:262-265`) — the triple-declaration `height /**/: 27px` pattern throughout is
the box-model hack for IE5.

Tab icons are 21×21 GIFs (`assets/c_images/navi_icons/*.gif`, verified), vertically
centered via `#mainmenu li a img { vertical-align: middle }` (`style.css:268-272`).
Note `tab_icon_01_home.gif` is served locally (`index.html:161`) while the rest come from
`images.habbohotel.com/c_images/navi_icons/`.

Below it sits the breadcrumb sub-strip `#submenu` — `width: 928px; height: 22px;
padding: 0 0 0 6px` on `navi_bar_slice_btm.gif` (`style.css:332-340`), with
`.subnav` at `color: #930; font-size: 10px; text-transform: none` (`style.css:342-351`)
and its links `color: #000; text-decoration: underline` (`:353-358`).

`#page-headline` is the 47px title bar (`style.css:370-377`), with breadcrumbs at
`color: #9cc; font-size: 9px` (`:379-387`) and the title at
`color: #ffffff; text-transform: uppercase; font-weight: bold; font-size: 16px`
(`style.css:392-401`) — **16px is the largest type on the page.**

---

## 4. Box types

### 4a. `.v2box` — the panel used on this page

All nine panels in the 3-column grid are v2boxes. Markup is a rigid five-div stack
(`index.html:235-244`):

```html
<div class="v2box red darkest">
 <div class="headline"><h3>New to Habbo? CLICK HERE!</h3></div>
 <div class="border"><div></div></div>
 <div class="body">
  ...content...
  <div class="clear"></div>
 </div>
 <div class="bottom"><div></div></div>
</div>
```

Each of `headline`, `border`, `bottom` carries a left-corner GIF on the outer div and a
right-corner GIF on an inner div offset by a margin — the 2006 way to fake rounded corners.

| Layer | Declaration | Source |
| --- | --- | --- |
| `div.headline`, `div.border`, `div.border div` | `background-repeat: no-repeat` | `boxes.css:96-98` |
| `h3` | `background-position: top right; padding: 5px 12px 0 5px; color: white; font-size: 11px` | `boxes.css:100-106` |
| `h3` (v2box only) | `margin: 0 0 0 7px` — the 7px left inset that reveals the `-tl` corner | `boxes.css:108-110` |
| `div.border` | `background-color: white; height: 4px; font-size: 1%` | `boxes.css:112-117` |
| `div.border div` | `background-position: top right; height: 4px; margin: 0 0 0 7px` | `boxes.css:119-123` |
| `div.body` | `background-color: white; padding: 5px 9px` | `boxes.css:125-128` |
| `div.bottom` | `light-bl.gif` no-repeat; `height: 6px; font-size: 1%` | `boxes.css:130-134` |
| `div.bottom div` | `light-br.gif` top right; `height: 6px; margin: 0 0 0 6px` | `boxes.css:136-140` |

`font-size: 1%` on the spacer divs is the standard trick to stop IE giving an empty div
a minimum line-height.

**Header bar:** there is no separate header background — the `h3`'s own `-tr` GIF is a
750px-wide tile (verified: `red-darkest-tr.gif` is `750×50`) and the `-tl` GIF is `7×50`.
Header height is therefore driven by text + `padding: 5px 12px 0 5px` at `font-size: 11px`.
Body text inherits the `11px` Verdana body default.

**Tone modifiers** change only the fill of `border` + `body`, and the bottom corner GIFs
(`boxes.css:142-159`):

| Modifier | `div.border` / `div.body` background | Bottom corners |
| --- | --- | --- |
| *(none)* | `white` (`boxes.css:113,126`) | `light-bl.gif` / `light-br.gif` |
| `.darker` | `#F3F3F3` (`boxes.css:142-144`) | `darker-bl.gif` / `darker-br.gif` |
| `.darkest` | `#E4E4E4` (`boxes.css:145-147`) | `darkest-bl.gif` / `darkest-br.gif` |

**Hue modifiers** swap the corner/header GIFs and the link color. Only the four `-tl`/`-tr`
header GIFs and two `-bl`/`-br` border GIFs differ; `.darker`/`.darkest` variants exist for
the headline pair only:

| Hue | Link color | Header corners (light) | Border corners | Source |
| --- | --- | --- | --- | --- |
| red *(default `div.v2box a`)* | `#D75C03` | `red-light-tl/tr.gif` | `red-bl/br.gif` | `boxes.css:92-94, 163-173` |
| blue | `#47839D` | `blue-light-tl/tr.gif` | `blue-bl/br.gif` | `boxes.css:190-203` |
| green | `#508F54` | `green-light-tl/tr.gif` | `green-bl/br.gif` | `boxes.css:220-233` |

Sampled from the GIFs themselves, the header fill is the same hex as the link color:
`red-darkest-tr.gif` → `#D75C03`, `green-light-tr.gif` → `#508F54`. The `.darker`/`.darkest`
header GIFs differ from `-light` only in the corner anti-aliasing color (`#F3F3F3` vs
`#E4E4E4`), matching the body fill they sit above.

This page uses only `red darkest` (×3), `green darkest` (×3), `blue darkest` (×2)
(`index.html`, `class="v2box …"` occurrences) — i.e. white header bar over `#E4E4E4` body.

### 4b. `.maskbox`

Same body/bottom rules as `.v2box` (shared selectors, `boxes.css:100,125,130,136`) but the
headline is a four-div nest — `headline` / `headline-inner` / `headline-inner-inner` / `h3`
each taking one corner (`boxes.css:266-283`), giving a fully rounded header block rather
than a header-over-border sandwich. Its `h3` has `margin: 0; padding-bottom: 5px`
(`boxes.css:259-262`) and links default to `#47839D` (`boxes.css:252-254`). Only the `snow`
hue is defined (`#2FB7ED`, sampled from `snow-light-tl.gif`).

### 4c. `.portlet-*` — fixed-width three-slice boxes

The older system. Each width has its own GIF triplet and an identical rule shape
(`style.css:698-963`). Widths available: **200, 213, 308, 334, 429, 537, 740**, plus the
legacy `210x25`/`532x25` pair (`style.css:966-1013`).

Taking 537 as the template (`style.css:893-926`):

```css
.portlet-top-537 {
    background-image: url(.../images/boxes/content_box_537_top.gif);
    text-transform: uppercase;
    font-weight: bold;
    font-size: 11px;
    width: 537px;
    height: 25px;
}
.portlet-537-header { width: 521px; height: 18px; overflow: hidden; padding: 7px 8px 0px 8px; }
.portlet-body-537  { background-repeat: repeat-y; background-color: #fff;
                     width: 521px !important; width /**/: 537px;
                     padding: 6px 8px 4px 8px; }
.portlet-bottom-537 { width: 537px; height: 7px; }
```

**Header bar is 25px tall, uppercase bold 11px; body is white with 8px side padding;
bottom cap is 7px.** Inner width is always outer − 16 (8px padding each side), expressed
with the `!important` / `/**/` box-model hack. `.portlet { margin: 0 0 3px 0 }`
(`style.css:694-696`). Sampled: `content_box_200_top.gif` is `200×25` and its dominant
color is `#FFCB00` — the portlet header bar is **yellow**, unlike the v2box hues.
`content_box_200_mid.gif` is `200×1` white; `content_box_537_mid.gif` is `537×1` white.

### 4d. `.portlet-scale` / gold — the elastic box

`boxes.css:1-52`. Header `h3` is `text-transform: uppercase; font-size: 11px; font-weight: bold`
with `margin: 0` (`boxes.css:8-13`). Gold variant: header has `border-bottom: 1px solid black`
and `padding-left: 7px` (`boxes.css:15-19`), `h3` gets `padding: 5px 7px 5px 0`
(`boxes.css:21-24`), body pads `7px 6px 7px 0` (`boxes.css:31-34`), and the bottom uses the
**white** corners `white-bl.gif` / `white-br.gif` with `margin-left: 11px; padding-top: 11px`
(`boxes.css:36-52`). Sampled `gold-top-l.gif` is `10×143` dominant `#FFCB00`;
`white-bl.gif` is `11×11`, `white-br.gif` `1500×11` — an **11px radius**, the largest in the set.

### 4e. `.content-dblue`

Four-corner scaling box, `4px` insets throughout — `margin-left: 4px; padding-top: 4px;
padding-right: 4px` (`boxes.css:63-69`) and `margin-left: 4px; padding-top: 4px` on the
bottom (`boxes.css:80-86`). Corners `dblue-tl/tr/bl/br.gif`.

### 4f. `.content-white` / `.content-red`

Shares one rule pair (`boxes.css:290-350`). Uses the same white 11px corners:
body `margin: 0 0 0 11px; padding: 11px 11px 0 0; line-height: 1.2em` (`boxes.css:298-305`),
bottom `margin-left: 11px; padding-top: 11px` (`boxes.css:340-348`).
`h4` inside is `font-size: 11px; font-weight: bold; text-transform: uppercase; margin: 0`
(`boxes.css:311-316`). `div.content-white h3, div.nobox h3` → `margin-top: 0; font-size: 11px`
(`boxes.css:362-365`).

### 4g. `#third-level-box` — sidebar nav box

`style.css:1443-1483`. `margin: 0 5px 5px 0` matching the grid gutter, `7px` corner insets
(`margin-left: 7px; padding-top: 7px; padding-right: 7px`) using `third-navi-*.gif`.
Sampled `third-navi-tl.gif` is `7×300` dominant `#093D55` — a **dark navy box on the blue
slab**, with active items `color: white; font-weight: bold` and inactive
`color: #66CCFF; font-weight: normal` (`style.css:1471-1477`).

### 4h. Ad frames — `.ad-scale`

`ads.css`. A 3×3 table of 4px corner cells (`ads.css:22-32, 46-58…`), label
`h5 { color: #777777; font-size: 10px; font-weight: bold; padding: 3px 4px }`
(`ads.css:5-11`). `.ad160` header is `width: 160px`, `.ad300` is `width: 300px`
(`ads.css:39-45`); both get `margin-top: 0; margin-bottom: 3px` (`ads.css:34-37`).
Markup at `index.html:42-47` (leaderboard 728×90), `:545-567` (300×250), `:804-812` (160×600).

### 4i. Footer

`style.css:1050-1084`: `#footer-top` `height: 10px`, `#footer-body`
`background-color: #fff; font-size: 9px; width: 912px` (with `!important`/`/**/` hack to
928), `text-align: center; padding: 6px 8px 4px 8px`, `#footer-bottom` `height: 14px`.
Footer links are `text-decoration: none; color: #7295aa` going `#ffffff` on hover
(`style.css:1094-1101`).

---

## 5. Buttons

There is no generic button class — three distinct treatments:

**`.promo-button` — the sliced GIF pill** (`style.css:656-670`):

```css
.promo-button { background: url(.../images/promo_area/promo_link_btn.gif) no-repeat;
	width: 121px; height: 16px; }
.promo-button a { display: block; padding-top: 1px; padding-right: 25px;
	color: white; text-decoration: none; font-size: 10px; }
```

`121×16`, white 10px text, **right-padded 25px** so the label sits left of the arrow baked
into the GIF. Identical rules are inlined for the promo rotator list items
(`div.promolinks ul li`, `style.css:646-654`, same image and dimensions). Used at
`index.html:198` (`More News`).

**`.china-button` — same pattern, different slice** (`style.css:1359-1373`):
`width: 96px; height: 18px; line-height: 18px; padding-top: 1px; padding-right: 25px`
on `hh_china_choose_gobutton.gif`.

**`a.ml` — the pure-CSS button** (`style.css:1428-1439`):

```css
a.ml {
    border-style: solid;
    border-color: black;
    border-width: 1px;
    background-color: #FC6303;
    padding: 2px 0.5em 2px 0.5em;
    text-decoration: none;
    text-transform: uppercase;
    color: white;
}
```

Orange fill, **1px hard black border**, uppercase white label — this is the closest thing
to a reusable button token in the whole stylesheet.

The high-score nav is a fourth variant (`style.css:1310-1322`): `padding: 1px 10px;
border: 1px solid black; background-color: #C60; color: white`, selected →
`background-color: #FC0; color: black`. Same recipe: flat fill, 1px black border,
invert on active.

Global link style (`style.css:13-16`): `color: #f16100; font-weight: bold` — **all links
are bold orange** unless a box overrides them.

---

## 6. Palette

Every hex in the four stylesheets, plus values sampled from the downloaded GIFs.

### From CSS

| Hex | Used for | Source |
| --- | --- | --- |
| `#083940` | Page background behind the tiled pattern | `style.css:4` |
| `#47839D` | `#main-content` slab; `.v2box.blue` links; `.maskbox` links | `style.css:362`, `boxes.css:191, 253` |
| `#f16100` | Default link color, bold | `style.css:14` |
| `#D75C03` | `.v2box` default (red) link; `#vp-scroll h3 span` highlight | `boxes.css:93`, `style.css:1263` |
| `#508F54` | `.v2box.green` link | `boxes.css:221` |
| `#7295AA` | Footer text and footer links | `style.css:1051, 1099` |
| `#004979` | Video/vote thumbnail borders and label fill; ad `#ad-container` | `style.css:1279, 1319`, `ads.css:101` |
| `#083D55` | High-score table header row | `style.css:1147` |
| `#C3DFF1` | High-score even rows | `style.css:1155` |
| `#A52200` | `#header` bar | `style.css:1044` |
| `#F3F3F3` | `.darker` box border + body fill | `boxes.css:143` |
| `#E4E4E4` | `.darkest` box border + body fill | `boxes.css:146` |
| `#FFFFFF` / `#fff` | Default box body/border fill; portlet bodies; footer body; header text | `boxes.css:113, 126`, `style.css:1073` |
| `#FFCE00` | Selected video thumbnail border | `style.css:1283` |
| `#FC6303` | `a.ml` button fill | `style.css:1433` |
| `#FC0` | Selected high-score nav | `style.css:1321` |
| `#C60` | High-score nav default | `style.css:1317` |
| `#930` | `#submenu .subnav` breadcrumb text | `style.css:343` |
| `#9CC` | `#page-headline-breadcrums` text and links | `style.css:380, 390` |
| `#999` | Promo rotator selector text + border (unselected) | `style.css:449-450` |
| `#CCC` | `.hr` dotted news separator; `.scores-navi-wrapper` fill | `style.css:618, 1194` |
| `#777777` | Ad "Advertisement" label | `ads.css:7` |
| `#66CCFF` | `#third-level-box` inactive nav items | `style.css:1476` |
| `#000000` / `#000` | `hr`; active tab text; submenu links | `style.css:29-30, 278, 354` |

### Sampled from the GIFs

| Hex | Where | Sampled from |
| --- | --- | --- |
| `#525D63` | Dominant tone of the tiled page-background pattern (190×190) | `bg_patterns/habbo.gif` |
| `#47839D` | `#main-content` tile — matches the CSS `background-color` exactly | `content_bkg/content_mid.gif` (928×1) |
| `#D75C03` | v2box red header fill and border | `boxes-v2/red-darkest-tr.gif`, `red-br.gif` |
| `#508F54` | v2box green header fill and border | `boxes-v2/green-light-tr.gif`, `green-bl.gif` |
| `#2FB7ED` | maskbox "snow" header fill | `boxes-v2/snow-light-tl.gif` |
| `#FFCB00` | Portlet header bar; gold portlet-scale header | `boxes/content_box_200_top.gif`, `box-scale/gold-top-l.gif` |
| `#093D55` | `#third-level-box` navy fill | `box-scale/third-navi-tl.gif` |
| `#CDD5E6` | Nav tab icon background (all five 21×21 icons) | `c_images/navi_icons/*.gif` |
| `#8C3C02` | Nav tab icon outline brown | `c_images/navi_icons/*.gif` |
| `#FFFF00` / `#FFCE00` / `#FE6301` | Habbo wordmark yellow, gold shade, orange | `c_images/WebLogos/habbo_logo_com.gif` (160×66) |
| `#FF00FF` | Transparency key in the enter button — **not** a real color | `c_images/enterbuttons/enterHH_uk.gif` (105×106) |

### Inline in the markup

| Hex | Used for | Source |
| --- | --- | --- |
| `#9dd1e7` | Classifieds table row fill (×6) | `index.html` `bgcolor` |
| `#e6efef` | Alternate table row fill (×3) | `index.html` `bgcolor` |
| `#083d55` | Classifieds table header cells (×3) | `index.html` `bgcolor` |
| `#565051` | One inline text color | `index.html` |

---

## 7. Font sizes

Verdana, Arial, Helvetica, sans-serif throughout (`style.css:9`). Sizes are all px, no `em`
except two spots.

| px | Applied to | Source |
| --- | --- | --- |
| `16px` | `#page-headline-text` — page title, uppercase bold. Largest on the page | `style.css:396` |
| `11px` | `body` base; `input`; v2box/maskbox `h3`; portlet headers; `.content-white h4`/`h3`; `#promocontent`; `#vp-info-content h3` | `style.css:7, 24, 397…`, `boxes.css:11, 105, 313, 364` |
| `10px` | Nav tabs (`font: bold 10px verdana`); `#submenu .subnav` and links; `#promoheader` + its `h2`; `#newsbox-header h2`; `#newsbox-text`; news `h3 a`; `.promo-button a`; `.china-button a`; ad `h5` | `style.css:200, 219, 345, 356, 419, 429, 559, 574, 600, 669`, `ads.css:8` |
| `9px` | `#toolbar` and its `select`; `#page-headline-breadcrums`; `.articledate`; `#footer-body`; `#client-topbar` | `style.css:64, 138, 381, 596, 1072, 1128` |
| `1%` | Zero-height spacer divs (`div.border`, `div.bottom`, `.content-*-bottom`) — IE min-height hack | `boxes.css:116, 133, 139, 82` |
| `1px` | `.hr` news separator | `style.css:617` |
| `1.1em` | `#newsbox-text .newsitem h3` — immediately overridden to 10px on the inner `<a>` | `style.css:590` |
| `1.2em` | `line-height` on `.content-white-body` | `boxes.css:304` |

Weight/transform pairings worth copying: nav tabs, portlet headers, `.content-white h4`,
`#page-headline-text`, `#toolbar-register`, and `a.ml` are all
`font-weight: bold` + `text-transform: uppercase`.

---

## 8. Corner GIFs → `border-radius`

Every "rounded" corner in 2006 is a sliced GIF because `border-radius` did not exist.
Measured dimensions of the files in `assets/`:

| Family | Corner file | Measured size | Implied radius |
| --- | --- | --- | --- |
| `boxes-v2` header | `red-darkest-tl.gif` | `7×50` | corner 4px, tile 50px tall |
| `boxes-v2` header right | `red-darkest-tr.gif` | `750×50` | 750px scaling tile |
| `boxes-v2` border | `green-bl.gif`, `red-br.gif` | `7×4`, `750×4` | **4px** |
| `boxes-v2` bottom | `light-bl.gif`, `darker-bl.gif` | `6×6` | **6px** |
| `boxes-v2` snow | `snow-light-bl.gif` | `7×4` | 4px |
| `box-scale` white | `white-bl.gif`, `white-br.gif` | `11×11`, `1500×11` | **11px** |
| `box-scale` third-navi | `third-navi-tl.gif`, `third-navi-bl.gif` | `7×300`, `7×7` | **7px** |
| `box-scale` gold | `gold-top-l.gif` | `10×143` | ~10px |
| `ads-scale` | corner cells | `4px` per `ads.css:23-24` | **4px** |

> **Reproduce these with `border-radius`, not images.** The v2box stack resolves to a
> **4px** radius on the header/border corners and **6px** on the bottom; the `content-white`
> and gold `portlet-scale` families are **11px**; `third-level-box` is **7px**; ad frames are
> **4px**. The `7px` left offsets you see everywhere (`margin: 0 0 0 7px` in `boxes.css:109,
> 122`) are the width of the left corner slice, not real padding — they disappear when the
> multi-div stack collapses into a single element with `border-radius`. Likewise
> `font-size: 1%` on the spacer divs and every `width /**/:` / `!important` pair is an
> IE5/IE6 hack with no modern equivalent — drop them.

Net modern translation of a `.v2box red darkest`: one element, `border-radius: 4px`,
`background: #E4E4E4`, header bar `background: #D75C03` with white bold 11px uppercase-ish
text at `padding: 5px 12px 0 5px`, body `padding: 5px 9px`, 4px white rule between header
and body, `margin: 0 5px 5px 0` in the grid.

---

## 9. Asset inventory

`assets/` holds 57 files, none empty: the four stylesheets plus box corners
(`boxes-v2/`, `box-scale/`), portlet slices (`boxes/`), nav icons
(`c_images/navi_icons/`), the content slab tile (`content_bkg/`), the page pattern
(`bg_patterns/`), ad frame slices (`ads-scale/`), and the hotel skin images
(`c_images/WebLogos/`, `enterbuttons/`, `hotelviews/`, `album600/`).

Some corner GIFs are absent — archive.org began refusing connections partway through and
several `boxes-v2` variants (e.g. `blue-darker-tl.gif`) 404 at the timestamps the
stylesheets reference. This does not affect the reconstruction: each missing file has a
sampled sibling in the same family with identical geometry, and all of them are being
replaced by `border-radius` anyway. `fetch-assets.sh` in this folder can re-pull them
later; it is serial and back-off-aware because parallel fetching triggers the block.
