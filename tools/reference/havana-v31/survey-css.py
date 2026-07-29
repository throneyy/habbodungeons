# Survey every stylesheet in the Havana static-web dump and group what each one
# defines into component families.
#
# Read-only: it never edits a stylesheet and never copies anything into hub/css.
# Regenerates the tables in INVENTORY.md.
#
# A "family" is the first hyphen/underscore-delimited token of a class name
# (habblet-header -> habblet, myhabbo_note -> myhabbo). These 2009-era sheets
# have no formal namespace, but that prefix is the de-facto one. Single-token
# classes are reported as their own family, which is honest: they really are
# one-offs rather than a system.
#
# A "selector count" is the number of SELECTORS mentioning the family, not the
# number of distinct class names — `.box, .box-tabs td` is two selectors. That
# is the number worth knowing when judging how much CSS a family actually is.
#
# Usage:
#   python survey-css.py                 # table to stdout
#   python survey-css.py --json OUT.json # machine-readable
#   python survey-css.py --assets        # also report unresolved url() targets
import json
import os
import re
import sys
from collections import Counter

ROOTS = ["web-gallery", "public"]
BASE = os.path.dirname(os.path.abspath(__file__))


def css_files():
    found = []
    for root in ROOTS:
        for dirpath, _dirnames, filenames in os.walk(os.path.join(BASE, root)):
            for name in filenames:
                if name.lower().endswith(".css"):
                    full = os.path.join(dirpath, name)
                    found.append(os.path.relpath(full, BASE).replace(os.sep, "/"))
    return sorted(found)


def selectors_of(path):
    """Every selector in a stylesheet, comments stripped.

    Habbo's sheets carry commented-out rules and ASCII-art banners; counting
    those as live selectors would inflate every family total.
    """
    raw = open(os.path.join(BASE, path), encoding="utf-8", errors="replace").read()
    txt = re.sub(r"/\*.*?\*/", "", raw, flags=re.S)
    out = []
    for match in re.finditer(r"([^{}]+)\{", txt):
        group = " ".join(match.group(1).split())
        if not group or group.startswith("@"):
            continue
        # a comma group is N selectors, and each is counted separately
        out.extend(s.strip() for s in group.split(",") if s.strip())
    return out


def family_of(cls):
    m = re.match(r"^([a-zA-Z][a-zA-Z0-9]*)[-_]", cls)
    return m.group(1).lower() if m else cls.lower()


def survey(path):
    sels = selectors_of(path)
    fam_sel = Counter()   # family -> selectors mentioning it
    fam_cls = {}          # family -> distinct class names
    classes = set()
    ids = set()
    for sel in sels:
        found = re.findall(r"\.(-?[_a-zA-Z][\w-]*)", sel)
        ids.update(re.findall(r"#(-?[_a-zA-Z][\w-]*)", sel))
        classes.update(found)
        for fam in {family_of(c) for c in found}:
            fam_sel[fam] += 1
        for c in found:
            fam_cls.setdefault(family_of(c), set()).add(c)
    return {
        "bytes": os.path.getsize(os.path.join(BASE, path)),
        "selectors": len(sels),
        "classes": len(classes),
        "ids": len(ids),
        "families": [
            {"name": f, "selectors": n, "classes": len(fam_cls.get(f, ()))}
            for f, n in fam_sel.most_common()
        ],
    }


def assets(path):
    """url() targets in one sheet, split into resolvable and missing.

    Site-absolute paths resolve from the www root (this directory); relative
    ones from the sheet. That is exactly how the server serves them.
    """
    here = os.path.dirname(os.path.join(BASE, path))
    raw = open(os.path.join(BASE, path), encoding="utf-8", errors="replace").read()
    txt = re.sub(r"/\*.*?\*/", "", raw, flags=re.S)
    ok, miss = 0, []
    for url in re.findall(r"url\(([^)]*)\)", txt):
        url = url.strip("'\" ")
        if not url or url.startswith(("data:", "http:", "https:", "//")):
            continue
        target = url.split("?")[0].split("#")[0]
        local = (
            os.path.join(BASE, target.lstrip("/"))
            if target.startswith("/")
            else os.path.normpath(os.path.join(here, target))
        )
        if os.path.isfile(local):
            ok += 1
        else:
            miss.append(url)
    return ok, miss


def main():
    out_json = None
    if "--json" in sys.argv:
        out_json = sys.argv[sys.argv.index("--json") + 1]
    want_assets = "--assets" in sys.argv

    report = {}
    for path in css_files():
        info = survey(path)
        if want_assets or out_json:
            ok, miss = assets(path)
            info["assets_ok"] = ok
            info["assets_missing"] = len(miss)
            info["assets_missing_sample"] = miss[:5]
        report[path] = info

    for path, info in report.items():
        top = ", ".join(f"{f['name']}({f['selectors']})" for f in info["families"][:6])
        line = f"{path}\t{info['bytes']}\t{info['selectors']} sel\t{info['classes']} cls"
        if want_assets:
            line += f"\t{info['assets_ok']}ok/{info['assets_missing']}miss"
        print(f"{line}\t{top}")

    if out_json:
        json.dump(report, open(out_json, "w"), indent=1)
        print(f"\nwrote {out_json}", file=sys.stderr)


if __name__ == "__main__":
    main()
