#!/usr/bin/env python3
"""Bake per-class weapon icons from Habbo's real hand-item sprite art.

METHOD, AND WHY IT CHANGED
--------------------------
The first version of this script diffed two avatar renders -- `action=crr=N`
against the empty-hand `action=crr` -- and cropped the region that differed.
That approach is structurally broken:

  * habbo-imaging draws the avatar's FIST OVER THE GRIP, so those pixels are
    byte-identical in both renders. They cancel in the diff, punching a hole
    through the weapon's handle. The information is absent from the image pair,
    so no morphological repair recovers it -- anything that "fills" the gap is
    inventing pixels.
  * the arm does not move between the two actions, so the contamination in the
    unmasked variant was just the bounding RECTANGLE enclosing torso and sleeve
    behind the weapon, not a pose shift.

So the art now comes from source: tools/extract-handitems.py pulls Habbo's own
hh_human_item.swf off the live gordon build and exports every hand-item sprite
as its own PNG. Those sprites are the weapon alone, complete, with no avatar
over them -- no holes to repair and no body pixels to trim.

This script:
  1. maps the 8 classes in js/classWeapons.js to their crr ids
  2. finds every extracted sprite for that id (they are named
     hh_human_item_h_crr_ri_<itemId>_<direction>_<frame>)
  3. picks the direction that best matches direction 2, the direction the rest
     of the game renders at (js/sprites.js), by VERIFYING each candidate
     against the real `crr=N` avatar render: slide the sprite over the render
     and score how many of its opaque pixels land on the same colour. The
     winner is the sprite the avatar is actually holding.
  4. writes the winning sprite untouched to
     public/assets/ui/weapons/<classId>.png
  5. rebuilds the 4x contact sheet

Run:  python tools/extract-handitems.py     (once, to fetch + extract)
      python tools/bake-weapon-icons.py
"""

from __future__ import annotations

import io
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
HUB = HERE.parent
SPRITE_DIR = HUB / "tools" / "reference" / "handitems"
OUT_DIR = HUB / "public" / "assets" / "ui" / "weapons"

UPSTREAMS = (
    "https://www.habbo.com/habbo-imaging/avatarimage",
    "https://sandbox.habbo.com/habbo-imaging/avatarimage",
)
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)

DIRECTION = 2   # what js/sprites.js renders at
SIZE = "b"
SCALE = 4       # contact-sheet upscale, nearest-neighbour
TOLERANCE = 24  # per-channel RGB slack when matching sprite to render
MIN_SCORE = 0.55  # fraction of a sprite's opaque pixels that must match

# Per-class direction overrides, for items whose art near direction 2 is worse
# than another direction's.
#
#   bard (Telescope, id 136) -- directions 0..3 all ship the telescope in TWO
#   PIECES with a 3-5 row gap where the avatar's fist goes, so as a standalone
#   icon it reads as a broken object. Direction 4 draws it as one solid tube
#   (238 opaque px against 196-200) and is used instead. Verified straight off
#   the extracted sprites, not adjusted here.
DIRECTION_OVERRIDE = {
    "bard": 4,
}


# ---- source parsing ---------------------------------------------------------

def read_source(name: str) -> str:
    return (HUB / "js" / name).read_text(encoding="utf-8")


def parse_weapon_items() -> dict[str, int]:
    src = read_source("handItems.js")
    start = src.index("export const WEAPON_ITEMS")
    body = src[start : src.index("});", start)]
    out = {}
    for item_id, name in re.findall(r"^\s*(\d+):\s*'([A-Za-z0-9_]+)'", body, re.M):
        out[name] = int(item_id)
    if not out:
        sys.exit("could not parse WEAPON_ITEMS out of js/handItems.js")
    return out


def parse_class_weapons(by_name: dict[str, int]) -> dict[str, int]:
    """classId -> atk item id. `atk` is the one pose every class defines."""
    src = read_source("classWeapons.js")
    start = src.index("export const CLASS_WEAPON")
    body = src[start : src.index("});", start)]
    out = {}
    for class_id, fields in re.findall(r"^\s*([a-z]+):\s*\{([^}]*)\}", body, re.M):
        m = re.search(r"\batk:\s*ID\.([A-Za-z0-9_]+)", fields)
        if not m:
            continue
        weapon = m.group(1)
        if weapon not in by_name:
            sys.exit(f"{class_id}: ID.{weapon} is not in WEAPON_ITEMS")
        out[class_id] = by_name[weapon]
    if not out:
        sys.exit("could not parse CLASS_WEAPON out of js/classWeapons.js")
    return out


def default_figure() -> str:
    m = re.search(r"DEFAULT_FIGURE\s*=\s*'([^']+)'", read_source("config.js"))
    if not m:
        sys.exit("could not find DEFAULT_FIGURE in js/config.js")
    return m.group(1)


# ---- reference render -------------------------------------------------------

def render(figure: str, action: str) -> Image.Image:
    query = (
        f"?figure={figure}&action={action}&direction={DIRECTION}"
        f"&head_direction={DIRECTION}&size={SIZE}&img_format=png"
    )
    last = None
    for attempt in range(3):
        for base in UPSTREAMS:
            try:
                req = urllib.request.Request(base + query, headers={"User-Agent": UA})
                with urllib.request.urlopen(req, timeout=20) as resp:
                    if resp.status != 200:
                        continue
                    data = resp.read()
                img = Image.open(io.BytesIO(data))
                img.load()
                return img.convert("RGBA")
            except (urllib.error.URLError, OSError) as exc:
                last = exc
        time.sleep(1 + attempt)
    raise RuntimeError(f"imaging failed for action={action}: {last}")


# ---- sprite selection + verification ----------------------------------------

SPRITE_RE = re.compile(r"_crr_ri_(\d+)_(\d+)_(\d+)$")


def sprites_for(item_id: int) -> list[tuple[int, Path]]:
    """[(direction, path)] for every extracted sprite of this item id."""
    found = []
    for path in SPRITE_DIR.glob("*.png"):
        m = SPRITE_RE.search(path.stem)
        if m and int(m.group(1)) == item_id:
            found.append((int(m.group(2)), path))
    return sorted(found)


def match_score(sprite: Image.Image, render_img: Image.Image) -> tuple[float, tuple[int, int]]:
    """Best (score, offset) for this sprite laid over the avatar render.

    Score is the fraction of the sprite's opaque pixels whose RGB lands within
    TOLERANCE of the render underneath. Slides over every offset that keeps the
    sprite fully inside the render, so a correct sprite finds the exact spot the
    avatar is holding it and a wrong-direction sprite cannot.
    """
    sp = np.asarray(sprite, dtype=np.int16)
    rn = np.asarray(render_img, dtype=np.int16)
    sh, sw = sp.shape[:2]
    rh, rw = rn.shape[:2]
    if sh > rh or sw > rw:
        return 0.0, (0, 0)

    opaque = sp[:, :, 3] > 128
    total = int(opaque.sum())
    if total == 0:
        return 0.0, (0, 0)
    s_rgb = sp[:, :, :3]

    best = (0.0, (0, 0))
    for oy in range(rh - sh + 1):
        for ox in range(rw - sw + 1):
            win = rn[oy : oy + sh, ox : ox + sw]
            close = (np.abs(win[:, :, :3] - s_rgb) <= TOLERANCE).all(axis=2)
            solid = win[:, :, 3] > 128
            hits = int((close & solid & opaque).sum())
            score = hits / total
            if score > best[0]:
                best = (score, (ox, oy))
    return best


def pick_sprite(item_id: int, render_img: Image.Image,
                force_direction: int | None = None) -> tuple[Image.Image, int, float, bool]:
    """(sprite, direction, score, mirrored) — the candidate the avatar holds.

    Habbo mirrors some directions rather than shipping art for all 8, so each
    candidate is scored both as-is and horizontally flipped. Ties break toward
    DIRECTION (2), the direction the rest of the game renders at.

    `force_direction` pins the choice to one direction (see DIRECTION_OVERRIDE)
    while still scoring it against the render, so a pinned pick is verified the
    same way an automatic one is.
    """
    candidates = sprites_for(item_id)
    if not candidates:
        raise RuntimeError(f"no extracted sprite for item id {item_id}")
    if force_direction is not None:
        candidates = [c for c in candidates if c[0] == force_direction]
        if not candidates:
            raise RuntimeError(
                f"item {item_id} has no sprite for forced direction {force_direction}")

    prefer = DIRECTION if force_direction is None else force_direction
    scored = []
    for direction, path in candidates:
        img = Image.open(path).convert("RGBA")
        for mirrored in (False, True):
            cand = img.transpose(Image.FLIP_LEFT_RIGHT) if mirrored else img
            score, _ = match_score(cand, render_img)
            # prefer the game's own direction when scores are close
            scored.append((round(score, 3), direction == prefer, -abs(direction - prefer),
                           not mirrored, direction, mirrored, cand))
    scored.sort(key=lambda t: t[:4], reverse=True)
    best = scored[0]
    return best[6], best[4], best[0], best[5]


# ---- contact sheet ----------------------------------------------------------

def contact_sheet(crops: dict[str, Image.Image], meta: dict[str, str]) -> Image.Image:
    pad = 12
    label_h = 34
    try:
        font = ImageFont.truetype("arial.ttf", 13)
        small = ImageFont.truetype("arial.ttf", 11)
    except OSError:
        font = small = ImageFont.load_default()

    scaled = {k: v.resize((v.width * SCALE, v.height * SCALE), Image.NEAREST)
              for k, v in crops.items()}
    cell_w = max(max((s.width for s in scaled.values()), default=1), 96) + pad * 2
    cell_h = max((s.height for s in scaled.values()), default=1) + pad * 2 + label_h

    sheet = Image.new("RGBA", (cell_w * len(scaled), cell_h), (34, 34, 40, 255))
    draw = ImageDraw.Draw(sheet)

    for i, (class_id, img) in enumerate(scaled.items()):
        ox = i * cell_w
        for cy in range(0, cell_h, 8):
            for cx in range(0, cell_w, 8):
                if (cx // 8 + cy // 8) % 2:
                    draw.rectangle([ox + cx, cy, ox + cx + 7, cy + 7],
                                   fill=(48, 48, 56, 255))
        px = ox + (cell_w - img.width) // 2
        py = pad + (cell_h - label_h - pad * 2 - img.height) // 2
        sheet.alpha_composite(img, (px, py))

        src = crops[class_id]
        line1 = f"{class_id}  {src.width}x{src.height}"
        line2 = meta.get(class_id, "")
        for text, fnt, dy in ((line1, font, 4), (line2, small, 19)):
            tw = draw.textlength(text, font=fnt)
            draw.text((ox + (cell_w - tw) / 2, cell_h - label_h + dy), text,
                      fill=(240, 240, 240, 255), font=fnt)
        if i:
            draw.line([(ox, 0), (ox, cell_h)], fill=(80, 80, 90, 255))
    return sheet


# ---- main -------------------------------------------------------------------

def main() -> int:
    if not SPRITE_DIR.exists():
        sys.exit(f"no extracted sprites at {SPRITE_DIR}\n"
                 "run: python tools/extract-handitems.py")

    by_name = parse_weapon_items()
    classes = parse_class_weapons(by_name)
    figure = default_figure()
    id_to_name = {v: k for k, v in by_name.items()}

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"figure   {figure}")
    print(f"sprites  {SPRITE_DIR}")
    print(f"out      {OUT_DIR}")
    print(f"classes  {len(classes)}\n")

    crops: dict[str, Image.Image] = {}
    meta: dict[str, str] = {}
    failures: list[str] = []

    for class_id, item_id in classes.items():
        name = id_to_name.get(item_id, "?")
        try:
            ref = render(figure, f"crr={item_id}")
            sprite, direction, score, mirrored = pick_sprite(
                item_id, ref, DIRECTION_OVERRIDE.get(class_id))
        except RuntimeError as exc:
            failures.append(f"{class_id}: {exc}")
            print(f"  FAIL {class_id:<10} crr={item_id:<4} {name:<11} {exc}")
            continue

        flag = "mirrored" if mirrored else "direct"
        if class_id in DIRECTION_OVERRIDE:
            flag += " pinned"
        if score < MIN_SCORE:
            failures.append(
                f"{class_id}: best match only {score:.0%} (dir {direction}, {flag})")
            print(f"  WEAK {class_id:<10} crr={item_id:<4} {name:<11} "
                  f"dir{direction} {flag} match={score:.0%}")
            continue

        path = OUT_DIR / f"{class_id}.png"
        sprite.save(path)
        crops[class_id] = sprite
        meta[class_id] = f"dir {direction} {flag}  match {score:.0%}"
        opaque = int((np.asarray(sprite)[:, :, 3] > 0).sum())
        print(f"  ok   {class_id:<10} crr={item_id:<4} {name:<11} "
              f"{sprite.width}x{sprite.height}  dir{direction} {flag} "
              f"match={score:.0%} opaque={opaque}  -> {path.name}")

    if crops:
        sheet_path = OUT_DIR / "_contact-sheet.png"
        contact_sheet(crops, meta).save(sheet_path)
        print(f"\ncontact sheet -> {sheet_path} ({len(crops)} weapons)")

    if failures:
        print("\nFAILURES:")
        for f in failures:
            print("  " + f)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
