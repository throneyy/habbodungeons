#!/usr/bin/env python3
"""Extract hand-item (crr=N) sprites from Habbo's own hh_human_item.swf.

WHY THIS EXISTS
---------------
The first attempt at weapon icons diffed two avatar renders (`action=crr=N`
against the empty-hand `action=crr`) and cropped the region that differed. That
cannot work, for a reason that is structural rather than fixable:

  * habbo-imaging draws the avatar's FIST OVER THE GRIP. Those pixels are
    byte-identical in both renders, so they cancel in the diff and the weapon
    comes out with a hole punched through its handle. The information is not
    in the pair of images at all, so no morphological repair recovers it -- any
    "fix" is invented pixels.
  * the arm does NOT move between the two actions, so the leftover
    contamination in the un-masked variant was simply the bounding RECTANGLE
    enclosing torso and sleeve behind the weapon, not a pose shift.

So this pulls the real source art instead. Habbo ships hand items as their own
sprite library, hh_human_item.swf, from the gordon build path advertised in the
client's external variables (`flash.client.url`). Every item is a plain sprite
in there with no avatar over it.

WHAT IT DOES
------------
1. discover the live gordon build URL from the client's external_variables
2. download hh_human_item.swf into tools/reference/
3. parse the SWF tag stream directly (no dependencies beyond Pillow):
     - inflate the CWS body with zlib
     - DefineBitsLossless2 (tag 36) -> zlib-inflate the bitmap, decode the
       colormapped / 32-bit ARGB forms, un-premultiply alpha
     - SymbolClass (tag 76) -> character id to export name, which is how a
       bitmap gets its `hh_human_item_h_std_<item>_<dir>` name
4. write every named bitmap to tools/reference/handitems/<symbol>.png

Run:  python tools/extract-handitems.py
      python tools/extract-handitems.py --swf tools/reference/hh_human_item.swf
"""

from __future__ import annotations

import argparse
import re
import struct
import sys
import urllib.request
import zlib
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
HUB = HERE.parent
REF_DIR = HUB / "tools" / "reference"
SWF_PATH = REF_DIR / "hh_human_item.swf"
OUT_DIR = REF_DIR / "handitems"

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)
EXTERNAL_VARS = "https://www.habbo.com/gamedata/external_variables/1"
# If the gordon host 404s, the same library off a public nitro-assets mirror.
MIRRORS = (
    "https://raw.githubusercontent.com/billsonnn/nitro-assets/main/swf/hh_human_item.swf",
    "https://nitro-assets.habbo.moe/swf/hh_human_item.swf",
)

TAG_DEFINE_BITS_LOSSLESS2 = 36
TAG_SYMBOL_CLASS = 76


def fetch(url: str, timeout: int = 60) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        if resp.status != 200:
            raise OSError(f"HTTP {resp.status}")
        return resp.read()


def gordon_base() -> str | None:
    """`flash.client.url` out of the live external variables file."""
    try:
        text = fetch(EXTERNAL_VARS, timeout=30).decode("utf-8", "replace")
    except OSError as exc:
        print(f"  external_variables failed: {exc}")
        return None
    m = re.search(r"^flash\.client\.url=(\S+)", text, re.M)
    if not m:
        print("  no flash.client.url in external_variables")
        return None
    return m.group(1).strip()


def download_swf(dest: Path) -> Path:
    if dest.exists() and dest.stat().st_size > 0:
        print(f"swf     {dest} (cached, {dest.stat().st_size} bytes)")
        return dest

    dest.parent.mkdir(parents=True, exist_ok=True)
    candidates: list[str] = []
    base = gordon_base()
    if base:
        print(f"gordon  {base}")
        candidates.append(base.rstrip("/") + "/hh_human_item.swf")
    candidates.extend(MIRRORS)

    for url in candidates:
        try:
            data = fetch(url)
        except OSError as exc:
            print(f"  miss {url} ({exc})")
            continue
        if data[:3] not in (b"CWS", b"FWS", b"ZWS"):
            print(f"  miss {url} (not a SWF)")
            continue
        dest.write_bytes(data)
        print(f"swf     {url} -> {dest} ({len(data)} bytes)")
        return dest
    sys.exit("could not download hh_human_item.swf from gordon or any mirror")


def swf_body(raw: bytes) -> bytes:
    """Uncompressed SWF body, starting at the frame-size RECT."""
    sig = raw[:3]
    if sig == b"FWS":
        return raw[8:]
    if sig == b"CWS":
        return zlib.decompress(raw[8:])
    if sig == b"ZWS":
        try:
            import lzma
        except ImportError:
            sys.exit("ZWS (LZMA) SWF needs the lzma module")
        # 4 bytes compressed length, then a raw LZMA1 stream with a 5-byte prop
        props = raw[12:17]
        dec = lzma.LZMADecompressor(lzma.FORMAT_RAW, filters=[
            lzma._decode_filter_properties(lzma.FILTER_LZMA1, props)  # noqa: SLF001
        ])
        return dec.decompress(raw[17:])
    sys.exit(f"not a SWF: {sig!r}")


def skip_rect(body: bytes) -> int:
    """Byte length of the leading RECT (frame size)."""
    nbits = body[0] >> 3
    total_bits = 5 + nbits * 4
    return (total_bits + 7) // 8


def iter_tags(body: bytes):
    """(tag_code, payload) for every tag in the stream."""
    pos = skip_rect(body) + 4  # + frame rate (2) + frame count (2)
    end = len(body)
    while pos + 2 <= end:
        (code_len,) = struct.unpack_from("<H", body, pos)
        pos += 2
        code = code_len >> 6
        length = code_len & 0x3F
        if length == 0x3F:
            (length,) = struct.unpack_from("<I", body, pos)
            pos += 4
        if code == 0:  # End
            return
        yield code, body[pos : pos + length]
        pos += length


def parse_symbol_class(payload: bytes) -> dict[int, str]:
    """character id -> export name."""
    out: dict[int, str] = {}
    (count,) = struct.unpack_from("<H", payload, 0)
    pos = 2
    for _ in range(count):
        (char_id,) = struct.unpack_from("<H", payload, pos)
        pos += 2
        end = payload.index(b"\0", pos)
        out[char_id] = payload[pos:end].decode("utf-8", "replace")
        pos = end + 1
    return out


def parse_lossless2(payload: bytes) -> tuple[int, Image.Image] | None:
    """DefineBitsLossless2 -> (character id, RGBA image).

    Format 3 is an 8-bit colormap of RGBA entries; format 5 is 32-bit ARGB.
    Both store colour PREMULTIPLIED by alpha, so it is divided back out --
    otherwise every semi-transparent edge pixel comes out too dark.
    """
    char_id, fmt, width, height = struct.unpack_from("<HBHH", payload, 0)
    pos = 7
    color_count = 0
    if fmt == 3:
        color_count = payload[pos] + 1
        pos += 1
    if width == 0 or height == 0:
        return None

    try:
        data = zlib.decompress(payload[pos:])
    except zlib.error:
        return None

    img = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    px = img.load()

    def unpremultiply(r: int, g: int, b: int, a: int) -> tuple[int, int, int, int]:
        if a == 0:
            return (0, 0, 0, 0)
        if a == 255:
            return (r, g, b, a)
        return (
            min(255, (r * 255 + a // 2) // a),
            min(255, (g * 255 + a // 2) // a),
            min(255, (b * 255 + a // 2) // a),
            a,
        )

    if fmt == 3:
        table_len = color_count * 4
        table_raw = data[:table_len]
        table = []
        for i in range(color_count):
            r, g, b, a = table_raw[i * 4 : i * 4 + 4]
            table.append(unpremultiply(r, g, b, a))
        # each row is padded out to a 32-bit boundary
        stride = (width + 3) & ~3
        body = data[table_len:]
        for y in range(height):
            row = y * stride
            for x in range(width):
                idx = body[row + x]
                if idx < len(table):
                    px[x, y] = table[idx]
    elif fmt == 5:
        for y in range(height):
            row = y * width * 4
            for x in range(width):
                o = row + x * 4
                a, r, g, b = data[o], data[o + 1], data[o + 2], data[o + 3]
                px[x, y] = unpremultiply(r, g, b, a)
    else:
        return None

    return char_id, img


def extract(swf: Path, out_dir: Path) -> dict[str, Path]:
    body = swf_body(swf.read_bytes())
    bitmaps: dict[int, Image.Image] = {}
    symbols: dict[int, str] = {}

    for code, payload in iter_tags(body):
        if code == TAG_DEFINE_BITS_LOSSLESS2:
            got = parse_lossless2(payload)
            if got:
                bitmaps[got[0]] = got[1]
        elif code == TAG_SYMBOL_CLASS:
            symbols.update(parse_symbol_class(payload))

    print(f"bitmaps {len(bitmaps)} DefineBitsLossless2")
    print(f"symbols {len(symbols)} SymbolClass entries")

    out_dir.mkdir(parents=True, exist_ok=True)
    written: dict[str, Path] = {}
    for char_id, img in bitmaps.items():
        name = symbols.get(char_id)
        if not name:
            continue
        # symbols are like hh_human_item_h_std_riotbomb_0 -> strip the library
        # prefix for a readable filename, keep the full name as the key
        short = name.split(".")[-1]
        path = out_dir / f"{short}.png"
        img.save(path)
        written[short] = path
    print(f"written {len(written)} named sprites -> {out_dir}")
    return written


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--swf", type=Path, default=SWF_PATH)
    ap.add_argument("--out", type=Path, default=OUT_DIR)
    args = ap.parse_args()

    swf = download_swf(args.swf)
    written = extract(swf, args.out)
    if not written:
        print("no named sprites extracted", file=sys.stderr)
        return 1

    sample = sorted(written)[:12]
    print("\nsample:")
    for name in sample:
        im = Image.open(written[name])
        print(f"  {name:<48} {im.width}x{im.height}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
