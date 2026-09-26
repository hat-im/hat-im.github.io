#!/usr/bin/env python3
# Requires: pip install jsonschema Pillow

import json
import re
import sys
from pathlib import Path

try:
    import jsonschema
except ImportError:
    print("Missing dependency: pip install jsonschema")
    sys.exit(1)

try:
    from PIL import ImageFont
except ImportError:
    print("Missing dependency: pip install Pillow")
    sys.exit(1)

ROOT = Path(__file__).resolve().parent.parent
ok = True


def fail(msg):
    global ok
    print(f"\033[31m✗\033[0m {msg}")
    ok = False


def passed(msg):
    print(f"\033[32m✓\033[0m {msg}")


SCHEMA_PAIRS = [
    ("paper-board/models/papers.schema.json", "paper-board/data/papers.json"),
    ("paper-board/models/authors.schema.json", "paper-board/data/authors.json"),
    ("paper-board/models/journals.schema.json", "paper-board/data/journals.json"),
    ("paper-board/models/keywords.schema.json", "paper-board/data/keywords.json"),
    ("post-cards/models/postcards.schema.json", "post-cards/data/postcards.json"),
    ("post-cards/models/strings.schema.json", "post-cards/strings.json"),
    ("post-cards/models/palette.schema.json", "post-cards/data/theme/palette.json"),
    ("post-cards/models/angles.schema.json", "post-cards/data/theme/angles.json"),
    ("post-cards/models/ink-colors.schema.json", "post-cards/data/theme/ink-colors.json"),
    ("post-cards/models/positions.schema.json", "post-cards/data/layout/positions.json"),
    ("post-cards/models/placement-tolerances.schema.json", "post-cards/data/layout/placement-tolerances.json"),
    ("post-cards/models/glyphs.schema.json", "post-cards/data/icons/glyphs.json"),
    ("post-cards/models/sticker-icons.schema.json", "post-cards/data/icons/sticker-icons.json"),
    ("post-cards/models/fancy-pictorial-shapes.schema.json", "post-cards/data/icons/fancy-pictorial-shapes.json"),
    ("post-cards/models/seal-types.schema.json", "post-cards/data/seals/seal-types.json"),
    ("post-cards/models/seal-strings.schema.json", "post-cards/data/seals/seal-strings.json"),
    ("post-cards/models/stamps.schema.json", "post-cards/data/stamps/stamps.json"),
    ("post-cards/models/boids.schema.json", "post-cards/data/background/boids.json"),
    ("post-cards/models/boids-shapes.schema.json", "post-cards/data/background/boids-shapes.json"),
]


def run_schema_checks():
    for schema_rel, data_rel in SCHEMA_PAIRS:
        schema_path, data_path = ROOT / schema_rel, ROOT / data_rel
        if not schema_path.exists() or not data_path.exists():
            fail(f"{data_rel}: schema or data file missing")
            continue
        schema = json.loads(schema_path.read_text())
        data = json.loads(data_path.read_text())
        validator = jsonschema.Draft202012Validator(schema)
        errors = sorted(validator.iter_errors(data), key=lambda e: list(e.path))
        if errors:
            fail(f"{data_rel} failed schema validation:")
            for e in errors:
                path = "/".join(str(p) for p in e.path) or "(root)"
                print(f"    {path} {e.message}")
        else:
            passed(f"{data_rel} matches schema")

    papers = json.loads((ROOT / "paper-board/data/papers.json").read_text())["papers"]
    authors = json.loads((ROOT / "paper-board/data/authors.json").read_text())
    journals = json.loads((ROOT / "paper-board/data/journals.json").read_text())
    keywords = json.loads((ROOT / "paper-board/data/keywords.json").read_text())

    ids = [p["id"] for p in papers]
    dup_ids = {i for i in ids if ids.count(i) > 1}
    if dup_ids:
        fail(f"paper-board: duplicate paper id(s): {', '.join(dup_ids)}")
    else:
        passed("paper-board: no duplicate paper ids")

    dois = [p["doi"].lower() for p in papers if p.get("doi")]
    dup_dois = {d for d in dois if dois.count(d) > 1}
    if dup_dois:
        fail(f"paper-board: duplicate DOI(s): {', '.join(dup_dois)}")
    else:
        passed("paper-board: no duplicate DOIs")

    dangling = []
    for p in papers:
        for a in p.get("authorIds", []):
            if a not in authors:
                dangling.append(f"{p['id']} -> authorId {a}")
        if p.get("journalId") and p["journalId"] not in journals:
            dangling.append(f"{p['id']} -> journalId {p['journalId']}")
        for k in p.get("keywordIds", []):
            if k not in keywords:
                dangling.append(f"{p['id']} -> keywordId {k}")
    if dangling:
        for d in dangling:
            fail(f"paper-board: dangling reference {d}")
    else:
        passed("paper-board: no dangling authorId/journalId/keywordId references")

    boids = json.loads((ROOT / "post-cards/data/background/boids.json").read_text())
    boids_shapes = json.loads((ROOT / "post-cards/data/background/boids-shapes.json").read_text())["shapes"]
    dangling_shapes = []
    for cat in boids["categories"]:
        for shape_id in cat["shapeIds"]:
            if shape_id not in boids_shapes:
                dangling_shapes.append(f"{cat['id']} -> shapeId {shape_id}")
    if dangling_shapes:
        for d in dangling_shapes:
            fail(f"boids: dangling reference {d}")
    else:
        passed("boids: no dangling shapeId references")


def load_config():
    src = (ROOT / "post-cards/scripts/render/postcard-config.js").read_text()
    config = {}
    for name, value in re.findall(r"var ([A-Z_]+) = ([0-9.]+);", src):
        config[name] = float(value) if "." in value else int(value)
    return config


def wrap_text(text, max_width, font):
    out = []
    for para in re.split(r"\n+", text or ""):
        words = [w for w in re.split(r"\s+", para) if w]
        line = ""
        for word in words:
            test = f"{line} {word}" if line else word
            if font.getlength(test) > max_width and line:
                out.append(line)
                line = word
            else:
                line = test
        out.append(line)
    return out


def layout_text_zones(data, config, font_normal, font_postscript):
    card_w, card_h, pad = config["CARD_W"], config["CARD_H"], config["PAD"]
    side = card_h - pad * 2
    col_x = pad + side + pad + pad
    col_w = card_w - col_x - pad

    msg_top = pad + config["STAMP_H"] + config["STAMP_TO_MESSAGE_GAP"]
    if data.get("subject"):
        msg_top += config["SUBJECT_GAP"]

    msg_bottom = card_h - pad - config["MESSAGE_BOTTOM_MARGIN"]
    line_height = config["MESSAGE_LINE_HEIGHT"]
    reserve_for_signature = 1 if data.get("from") else 0

    postscript_lines = []
    if data.get("postscript"):
        postscript_lines = wrap_text("P.S. " + data["postscript"], col_w, font_postscript)
    signature_px = reserve_for_signature * line_height
    postscript_px = len(postscript_lines) * config["POSTSCRIPT_LINE_HEIGHT"]

    max_lines = max(1, int((msg_bottom - msg_top - signature_px - postscript_px) // line_height))
    full_lines = wrap_text(data.get("message", ""), col_w, font_normal)
    lines = full_lines
    truncated = False
    if len(lines) > max_lines:
        truncated = True
        lines = lines[:max_lines]
        last = lines[-1]
        while font_normal.getlength(last + "…") > col_w and len(last) > 1:
            last = last[:-1]
        lines[-1] = last + "…"

    postscript_y = msg_top + len(lines) * line_height + signature_px
    footer_y = card_h - pad - config["FOOTER_HEIGHT"]

    postscript_overflow = False
    if postscript_lines:
        ps_bottom = postscript_y + (len(postscript_lines) - 1) * config["POSTSCRIPT_LINE_HEIGHT"]
        postscript_overflow = ps_bottom > footer_y

    return truncated, len(postscript_lines), postscript_overflow, full_lines, max_lines


def run_postcard_length_check():
    config = load_config()
    font_path = ROOT / "tools/fonts/Kalam-Regular.ttf"
    font_normal = ImageFont.truetype(str(font_path), config["MESSAGE_FONT_SIZE"])
    font_postscript = ImageFont.truetype(str(font_path), config["POSTSCRIPT_FONT_SIZE"])

    postcards = json.loads((ROOT / "post-cards/data/postcards.json").read_text())["postcards"]
    for pc in postcards:
        data = {"subject": pc.get("subject"), "message": pc.get("message", ""),
                "postscript": pc.get("postscript"), "from": pc.get("from")}
        truncated, ps_line_count, ps_overflow, full_lines, max_lines = layout_text_zones(
            data, config, font_normal, font_postscript
        )

        if truncated:
            fail(f"{pc['id']}: message is truncated (needs {len(full_lines)} lines, fits {max_lines})")
            for i, line in enumerate(full_lines):
                marker = "  " if i < max_lines else "->"
                print(f"    {marker} {i + 1:2d} {line}")
        else:
            passed(f"{pc['id']}: message fits")

        if ps_overflow:
            fail(f"{pc['id']}: postscript overflows past the footer")


print("Schema validation:")
run_schema_checks()
print("\nPostcard length check:")
run_postcard_length_check()

print()
if not ok:
    print("Validation failed.")
    sys.exit(1)
print("All checks passed.")
