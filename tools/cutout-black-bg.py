#!/usr/bin/env python3
"""Knock a flat black background out of a room render, keeping black line art.

Habbo room art is outlined in black and shades its rocks and water with very
dark pixels, so a naive "make every black pixel transparent" chroma key punches
holes straight through the artwork -- outlines vanish and shadowed areas turn
into confetti.

This keys by CONNECTIVITY instead of colour alone: label every near-black
region, then delete only the regions that touch the image border. The backdrop
is one connected black area running off every edge, so it goes; an outline or a
shadow enclosed by artwork never touches the border, so it stays.

Run:  python tools/cutout-black-bg.py IN.png OUT.png [--threshold 40]
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage


def cutout(src: Image.Image, threshold: int = 40) -> tuple[Image.Image, dict]:
    rgb = src.convert("RGB")
    arr = np.asarray(rgb).astype(int)

    # "near black" rather than pure #000: source renders are often saved with
    # slight compression noise, so the backdrop is 0-2 per channel, not exactly 0
    dark = arr.sum(axis=2) <= threshold

    labels, count = ndimage.label(dark)
    border = (
        set(labels[0, :]) | set(labels[-1, :]) | set(labels[:, 0]) | set(labels[:, -1])
    )
    border.discard(0)
    background = np.isin(labels, list(border))

    alpha = np.where(background, 0, 255).astype(np.uint8)
    out = Image.fromarray(
        np.dstack([np.asarray(rgb).astype(np.uint8), alpha]), "RGBA"
    )

    box = out.getbbox()
    if box:
        out = out.crop(box)

    stats = {
        "components": count,
        "background_pct": round(100 * float(background.mean()), 1),
        "kept_dark_px": int((dark & ~background).sum()),
        "bbox": box,
    }
    return out, stats


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("src", type=Path)
    ap.add_argument("dst", type=Path)
    ap.add_argument("--threshold", type=int, default=40,
                    help="max RGB sum treated as background black (default 40)")
    ap.add_argument("--width", type=int, default=0,
                    help="resize to this width before saving (0 = keep source)")
    ap.add_argument("--colors", type=int, default=256,
                    help="quantize to N colours; 0 disables (default 256)")
    args = ap.parse_args()

    src = Image.open(args.src)
    out, stats = cutout(src, args.threshold)
    print(f"source      {src.size}")
    print(f"background  {stats['background_pct']}% removed "
          f"({stats['components']} dark regions labelled)")
    print(f"kept        {stats['kept_dark_px']} interior black px (outlines, shadows)")
    print(f"cropped     {out.size}  bbox={stats['bbox']}")

    if args.width and args.width != out.width:
        h = round(out.height * args.width / out.width)
        out = out.resize((args.width, h), Image.LANCZOS)
        print(f"resized     {out.size}")

    if args.colors:
        # room art is already palette-limited, so quantizing keeps it sharp and
        # cuts the file to a fraction of a straight RGBA save
        out = out.quantize(colors=args.colors, method=Image.Quantize.FASTOCTREE)

    args.dst.parent.mkdir(parents=True, exist_ok=True)
    out.save(args.dst, optimize=True)
    print(f"wrote       {args.dst} ({args.dst.stat().st_size / 1024:.0f} KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
