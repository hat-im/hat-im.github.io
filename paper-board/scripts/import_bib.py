#!/usr/bin/env python3
"""
Import papers from a Connected Papers / Semantic Scholar .bib export into
paper-board's data files (papers.json, authors.json, journals.json).

Usage:
    python3 import_bib.py FILE.bib                          # dry run, prints a preview
    python3 import_bib.py FILE.bib --keywords scheduling,hpc-integration --apply
    python3 import_bib.py FILE.bib --keywords-file kw.json --apply

By default this only previews what would happen. Pass --apply to actually
write papers.json / authors.json / journals.json.

Keywords are not guessed — bib entries don't carry enough signal to pick
good topical tags automatically. Either pass --keywords (applied to every
new paper in this run) or --keywords-file (a JSON object mapping DOI ->
list of keyword ids, for mixed-topic batches). Without either, new papers
are written with an empty keywordIds list and a warning is printed so they
can be tagged by hand afterward.

Conventions encoded here (see paper-board data conventions in the repo's
memory notes for the long version):
  - Paper id = doi.lower(), non-alphanumeric runs collapsed to '-'.
  - Author display = "Last, F.M." (initials, no spaces); hyphenated given
    names get hyphenated initials; multi-word surname particles (van, der,
    den, de, von, le, la, du, di, al) stay attached to the surname.
  - Papers with >=6 authors: keep the first 5 + the "et al." placeholder
    author id (a827), for a 6-element array. <=5 authors: keep them all.
  - arXiv DOIs (10.48550/arXiv.<id>) use journal id "j98" ("arXiv preprint").
  - New author/journal ids are the next unused integer suffix, no reuse.
"""

import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

OPENALEX_BATCH_SIZE = 40
ARXIV_PREPRINT_JOURNAL_ID = "j98"
ET_AL_AUTHOR_ID = "a827"
ET_AL_THRESHOLD = 6
PARTICLES = {"van", "der", "den", "de", "von", "le", "la", "du", "di", "al"}


# ---------- .bib parsing ----------

def parse_bib(path):
    """Split on blank-line-separated '@article{' boundaries, not naive brace
    matching — an abstract field can itself contain a line that looks like
    a closing brace + newline, which truncates a block-regex parse early."""
    text = open(path, encoding="utf-8").read().strip()
    raw_entries = re.split(r"\n\n@\w+\{", text)
    if text.startswith("@"):
        raw_entries[0] = re.sub(r"^@\w+\{", "", raw_entries[0])

    entries = []
    for e in raw_entries:
        if not e.strip():
            continue
        key = e.split(",", 1)[0].strip()

        def field(name, e=e):
            m = re.search(rf"\n{name}\s*=\s*\{{(.*?)\}},?\n", "\n" + e + "\n", re.DOTALL)
            return m.group(1).strip() if m else None

        title = field("title")
        doi = field("doi")
        arxivid = field("arxivid")
        author = field("author")
        journal = field("journal")
        volume = field("volume")

        if not doi and arxivid:
            doi = f"10.48550/arXiv.{arxivid}"
        if not doi and not arxivid and volume and volume.startswith("abs/"):
            arxivid = volume[len("abs/"):]
            doi = f"10.48550/arXiv.{arxivid}"

        entries.append({
            "key": key, "title": title, "doi": doi, "arxivid": arxivid,
            "author": author, "journal": journal,
        })
    return entries


# ---------- OpenAlex ----------

def fetch_openalex_batch(dois, contact_email):
    """One OpenAlex call per batch, using filter=doi:a|b|c OR-syntax."""
    out = {}
    headers = {"User-Agent": f"paper-board-import ({contact_email})"} if contact_email else {}
    for i in range(0, len(dois), OPENALEX_BATCH_SIZE):
        chunk = dois[i:i + OPENALEX_BATCH_SIZE]
        filt = "|".join(urllib.parse.quote(d, safe="") for d in chunk)
        url = f"https://api.openalex.org/works?filter=doi:{filt}&per-page={OPENALEX_BATCH_SIZE}"
        req = urllib.request.Request(url, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read())
        except urllib.error.URLError as exc:
            print(f"  ! OpenAlex request failed: {exc}", file=sys.stderr)
            continue
        for r in data.get("results", []):
            doi = r["doi"].replace("https://doi.org/", "")
            src = (r.get("primary_location") or {}).get("source") or {}
            out[doi.lower()] = {
                "title": r.get("title"),
                "publication_date": r.get("publication_date"),
                "cited_by_count": r.get("cited_by_count", 0),
                "authors": [a["author"]["display_name"] for a in r.get("authorships", [])],
                "venue": src.get("display_name"),
                "venue_type": src.get("type"),
            }
        time.sleep(0.2)
    return out


# ---------- Name / venue normalization ----------

def norm_hyphen(s):
    return re.sub(r"[‐‑‒–—]", "-", s)


def hyph_initials(token):
    if "-" in token:
        return "-".join(f"{p[0]}." for p in token.split("-") if p)
    return f"{token[0]}." if token else ""


def to_lastfirst(raw_name):
    """'First Middle Last' -> 'Last, F.M.'. Also copes with a raw name that
    already arrived as 'Last, First' (seen from some OpenAlex arXiv records)."""
    name = norm_hyphen(raw_name.strip())
    if "," in name:
        surname, given = (p.strip() for p in name.split(",", 1))
        initials = "".join(hyph_initials(g) for g in given.split() if g)
        return f"{surname}, {initials}"

    parts = name.split()
    if not parts:
        return name
    surname_tokens = [parts[-1]]
    i = len(parts) - 2
    while i >= 0 and parts[i].lower() in PARTICLES:
        surname_tokens.insert(0, parts[i])
        i -= 1
    surname = " ".join(surname_tokens)
    initials = "".join(hyph_initials(g) for g in parts[:i + 1] if g)
    return f"{surname}, {initials}"


def clean_venue_name(name):
    name = re.sub(r"^\d{4}\s+", "", name)          # drop leading year
    name = re.sub(r"\s*\([A-Z0-9\-]+\)\s*$", "", name)  # drop trailing (ABBR)
    return name.strip()


def guess_venue_type(name):
    if re.search(r"\b(Conference|Symposium|Workshop|Proceedings|Workshops)\b", name, re.I):
        return "conference"
    return "journal"


# ---------- Resolution against existing data ----------

class Resolver:
    def __init__(self, authors_db, journals_db):
        self.authors_db = authors_db
        self.journals_db = journals_db
        self.rev_authors = {}
        for k, v in authors_db.items():
            self.rev_authors.setdefault(v, []).append(k)
        self.journals_by_name = {v["name"]: k for k, v in journals_db.items()}
        self.next_author_id = max((int(k[1:]) for k in authors_db), default=0) + 1
        self.next_journal_id = max((int(k[1:]) for k in journals_db), default=0) + 1
        self.new_authors = {}   # "Last, F." -> "aNNN"
        self.new_journals = {}  # name -> ("jNNN", type)

    def resolve_author(self, raw_name):
        lf = to_lastfirst(raw_name)
        if lf in self.rev_authors:
            return self.rev_authors[lf][0], lf, False
        if lf in self.new_authors:
            return self.new_authors[lf], lf, False
        aid = f"a{self.next_author_id}"
        self.next_author_id += 1
        self.new_authors[lf] = aid
        return aid, lf, True

    def resolve_journal(self, doi, openalex_venue, bib_journal_field):
        if doi.lower().startswith("10.48550/arxiv"):
            return ARXIV_PREPRINT_JOURNAL_ID, False
        raw_name = openalex_venue or bib_journal_field
        if not raw_name:
            return None, False
        name = clean_venue_name(raw_name)
        if name in self.journals_by_name:
            return self.journals_by_name[name], False
        if name in self.new_journals:
            return self.new_journals[name][0], False
        jid = f"j{self.next_journal_id}"
        self.next_journal_id += 1
        vtype = guess_venue_type(name)
        self.new_journals[name] = (jid, vtype)
        return jid, True


def build_paper_id(doi):
    return re.sub(r"[^a-z0-9]+", "-", doi.lower()).strip("-")


# ---------- Main pipeline ----------

def load_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def save_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("bib_file")
    ap.add_argument("--data-dir", default="paper-board/data")
    ap.add_argument("--apply", action="store_true", help="write changes (default is dry-run preview only)")
    ap.add_argument("--keywords", default="", help="comma-separated keyword ids applied to every new paper")
    ap.add_argument("--keywords-file", default="", help="JSON file mapping DOI -> [keyword ids], for mixed-topic batches")
    ap.add_argument("--added", default="", help="value for the 'added' field (YYYY-MM-DD); defaults to today")
    ap.add_argument("--contact-email", default="", help="included in the OpenAlex User-Agent header (polite pool)")
    args = ap.parse_args()

    added_date = args.added or time.strftime("%Y-%m-%d")
    default_keywords = [k.strip() for k in args.keywords.split(",") if k.strip()]
    keyword_overrides = load_json(args.keywords_file) if args.keywords_file else {}

    papers_path = f"{args.data_dir}/papers.json"
    authors_path = f"{args.data_dir}/authors.json"
    journals_path = f"{args.data_dir}/journals.json"
    keywords_path = f"{args.data_dir}/keywords.json"

    papers_doc = load_json(papers_path)
    authors_db = load_json(authors_path)
    journals_db = load_json(journals_path)
    keywords_db = load_json(keywords_path)

    existing_dois = {p["doi"].lower() for p in papers_doc["papers"]}
    existing_ids = {p["id"] for p in papers_doc["papers"]}

    entries = parse_bib(args.bib_file)
    print(f"Parsed {len(entries)} entries from {args.bib_file}")

    no_doi = [e for e in entries if not e["doi"]]
    with_doi = [e for e in entries if e["doi"]]
    dup = [e for e in with_doi if e["doi"].lower() in existing_dois]
    new = [e for e in with_doi if e["doi"].lower() not in existing_dois]

    print(f"  {len(dup)} already in the dataset (skipped)")
    print(f"  {len(no_doi)} have no DOI/arXiv id (skipped — resolve manually):")
    for e in no_doi:
        print(f"      - {e['title']}")
    print(f"  {len(new)} candidates to add")
    if not new:
        return

    openalex = fetch_openalex_batch([e["doi"] for e in new], args.contact_email)

    resolver = Resolver(authors_db, journals_db)
    unresolved_journal = []
    out_papers = []

    for e in new:
        doi = e["doi"]
        info = openalex.get(doi.lower())

        title = (info["title"] if info else None) or e["title"]
        raw_authors = (info["authors"] if info else None) or (
            [a.strip() for a in re.split(r"\s+and\s+", e["author"])] if e["author"] else []
        )
        date = (info["publication_date"][:7] if info and info.get("publication_date") else "")
        citations = info["cited_by_count"] if info else 0
        venue = info["venue"] if info else None

        author_ids = []
        new_author_count = 0
        for raw in raw_authors:
            aid, _lf, is_new = resolver.resolve_author(raw)
            author_ids.append(aid)
            new_author_count += is_new
        if len(author_ids) >= ET_AL_THRESHOLD:
            author_ids = author_ids[:5] + [ET_AL_AUTHOR_ID]

        jid, jid_is_new = resolver.resolve_journal(doi, venue, e["journal"])
        if jid is None:
            unresolved_journal.append(e)
            continue

        kw = keyword_overrides.get(doi, default_keywords)
        unknown_kw = [k for k in kw if k not in keywords_db]
        if unknown_kw:
            print(f"  ! unknown keyword id(s) {unknown_kw} for {doi} — check keywords.json")

        slug = build_paper_id(doi)
        if slug in existing_ids or slug in {p["id"] for p in out_papers}:
            print(f"  ! id collision for {slug}, skipping")
            continue

        out_papers.append({
            "id": slug, "doi": doi, "title": title, "authorIds": author_ids,
            "date": date, "journalId": jid, "keywordIds": kw,
            "citations": citations, "added": added_date,
        })

    print()
    print(f"Resolved {len(out_papers)} papers")
    print(f"  {len(resolver.new_authors)} new authors, {len(resolver.new_journals)} new journals")
    if unresolved_journal:
        print(f"  {len(unresolved_journal)} skipped — no venue could be determined:")
        for e in unresolved_journal:
            print(f"      - {e['title']}")
    if not default_keywords and not keyword_overrides:
        print("  ! no --keywords / --keywords-file given — new papers have empty keywordIds, tag them by hand")

    print()
    print(f"{'DOI':45} {'date':8} {'jid':6} {'cites':6} title")
    for p in out_papers:
        print(f"{p['doi']:45} {p['date'] or '?':8} {p['journalId']:6} {p['citations']:<6} {p['title'][:60]}")

    if not args.apply:
        print()
        print("Dry run only — pass --apply to write papers.json / authors.json / journals.json")
        return

    for lf, aid in resolver.new_authors.items():
        authors_db[aid] = lf
    for name, (jid, vtype) in resolver.new_journals.items():
        journals_db[jid] = {"name": name, "type": vtype}
    papers_doc["papers"].extend(out_papers)

    # Referential integrity check before touching disk.
    ids = [p["id"] for p in papers_doc["papers"]]
    assert len(ids) == len(set(ids)), "duplicate paper id introduced"
    assert len(authors_db) == len(set(authors_db)), "duplicate author id introduced"
    assert len(journals_db) == len(set(journals_db)), "duplicate journal id introduced"
    for p in papers_doc["papers"]:
        for a in p["authorIds"]:
            assert a in authors_db, f"dangling author id {a} in {p['id']}"
        assert p["journalId"] in journals_db, f"dangling journal id {p['journalId']} in {p['id']}"
        if p["authorIds"][-1] == ET_AL_AUTHOR_ID:
            assert len(p["authorIds"]) == 6, f"a827 array not length 6 in {p['id']}"

    save_json(authors_path, authors_db)
    save_json(journals_path, journals_db)
    save_json(papers_path, papers_doc)
    print()
    print(f"Wrote {len(out_papers)} papers, {len(resolver.new_authors)} authors, {len(resolver.new_journals)} journals.")


if __name__ == "__main__":
    main()
