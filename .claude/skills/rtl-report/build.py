#!/usr/bin/env python3
"""Turn the RTL query's CSV into the one-page report.

Every number on the page is computed here from the CSV, so none is typed by
hand. Claude supplies only the words: the window label, the quotes, and the
things that look off.

  python3 build.py checks REPORT.csv
      Print the numbers and the checks as JSON. Read this before writing
      anything.

  python3 build.py render REPORT.csv EDITORIAL.json OUT_DIR
      Write OUT_DIR/report.html and OUT_DIR/<name>.pdf.

The CSV carries two blocks in a `block` column. `done` rows are the steps
closed in the window and drive every count. `next` rows are the earliest-due
open step per record; they are ranked here and printed as "What to move next".
A CSV with no `block` column is treated as all-`done`, so older exports work.

EDITORIAL.json:
  {
    "window": "Monday 5 Oct, 8:30am to Wednesday 7 Oct, 8:05am (Eastern)",
    "file_date": "2026-10-07",
    "highlight": {"value": "2", "label": "providers saying \\"definitely interested\\""},
    "quotes": [{"text": "...", "cite": "..."}],          # 2 or 3
    "aside": "one optional line under the quotes",
    "flags": ["<b>Short title.</b> One or two sentences.", ...]   # up to 3
  }
"""
import csv
import html
import json
import re
import subprocess
import sys
from collections import Counter, OrderedDict
from datetime import datetime
from zoneinfo import ZoneInfo
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
HTML2PDF = REPO / "docs/medjobs/matrix-src/html2pdf.mjs"
NOT_RECORDED = "(not recorded)"
CLEANUP = re.compile(r"\b(already done|not needed|already held|already complete)", re.I)
DUPLICATE = re.compile(r"\bduplicate\b", re.I)
EASTERN = ZoneInfo("America/New_York")

# How far up the ladder a record sits, 0-4. student_outreach.status for
# providers/advisors/orgs; business_profiles.medjobs_status for clients.
# Candidates have no stage field of their own, so they sit mid-ladder.
STAGE_RANK = {
    "prospect": 0, "researched": 0, "outreach_sent": 1, "engaged": 2,
    "meeting_scheduled": 3, "agreed": 3, "distributed": 4, "active_partner": 4,
    "none": 0, "pilot_expired": 1, "candidate": 2, "client": 2,
    "in_pilot": 4, "subscribed": 4, "site": 1, "": 0,
}
STAGE_LABEL = {"": "no stage", "none": "no stage", "candidate": "student",
               "client": "client", "site": "campus"}

# The open step, in words. Keys are the task_type values the board writes.
TASK_LABEL = {
    "research_initial": "research them",
    "outreach_day_0": "first outreach",
    "outreach_contact": "make contact",
    "outreach_multichannel_orgs": "outreach across channels",
    "outreach_followup_email": "follow-up email",
    "outreach_followup_call": "follow-up call",
    "meeting_held_logging": "log the meeting",
    "agreement_followup": "chase the agreement",
    "distribution_confirmation": "confirm they shared it",
    "move_to_active_partner": "move to active partner",
    "partner_seasonal_checkin": "seasonal check-in",
    "partner_share_update": "send them an update",
    "partner_event_coordination": "coordinate an event",
    "approval_request_followup": "chase the approval",
    "yearly_leadership_recheck": "recheck leadership",
    "manual_followup": "follow up",
    "advisor_sweep": "sweep the advisors",
    "site": "campus step",
}
PER_CAMPUS = 2   # so one busy campus cannot fill the list
TOP_N = 8


def load(path):
    with open(path, newline="", encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))
    need = {"when_eastern", "person", "board_area", "university", "record",
            "record_type", "what_happened", "note"}
    missing = need - set(rows[0].keys() if rows else need)
    if missing:
        sys.exit(f"CSV is missing columns {sorted(missing)}. Was it the RTL query?")
    done, nxt = [], []
    for r in rows:
        r["noted"] = bool(r["note"].strip())
        r["block"] = (r.get("block") or "done").strip() or "done"
        r["t"] = parse_t(r["when_eastern"])
        r["due"] = parse_t(r.get("due_eastern", ""))
        r["stage"] = (r.get("stage") or "").strip()
        (nxt if r["block"] == "next" else done).append(r)
    for r in done:
        if r["t"] is None:
            sys.exit(f"A closed step has no timestamp: {r['record']}. Was it the RTL query?")
    # Guard the counts: a 'next' row must never reach the window statistics.
    assert all(r["block"] == "done" for r in done), "block split failed"
    return done, nxt


def parse_t(v):
    v = (v or "").strip()
    if not v:
        return None
    return datetime.strptime(v, "%Y-%m-%d %H:%M")


def batches(rows, gap_min=10, size=10, max_note_rate=0.2):
    """Runs of quick, mostly note-less steps on one campus and record type:
    a batch send, not calls. Grouped first, because people work in parallel."""
    groups = {}
    for r in rows:
        groups.setdefault((r["university"], r["record_type"]), []).append(r)
    out = []
    for group in groups.values():
        run = []
        for r in sorted(group, key=lambda r: r["t"]):
            if run and (r["t"] - run[-1]["t"]).total_seconds() > gap_min * 60:
                out.append(run); run = []
            run.append(r)
        out.append(run)
    found = []
    for run in out:
        if len(run) >= size and sum(x["noted"] for x in run) / len(run) <= max_note_rate:
            found.append({
                "from": run[0]["when_eastern"], "to": run[-1]["when_eastern"],
                "steps": len(run), "with_note": sum(x["noted"] for x in run),
                "where": f'{run[0]["university"]} / {run[0]["record_type"]}',
            })
    return found


def stats(rows):
    def split(key):
        c, n = Counter(), Counter()
        for r in rows:
            c[r[key]] += 1; n[r[key]] += r["noted"]
        return [{"name": k, "steps": v, "with_note": n[k]} for k, v in c.most_common()]

    days = OrderedDict()
    for r in sorted(rows, key=lambda r: r["t"]):
        d = days.setdefault(r["t"].strftime("%a %-d %b"), {"steps": 0, "with_note": 0})
        d["steps"] += 1; d["with_note"] += r["noted"]
    named = [r for r in rows if r["person"] != NOT_RECORDED]
    unnamed = [r for r in rows if r["person"] == NOT_RECORDED]
    return {
        "rows": len(rows),
        "with_note": sum(r["noted"] for r in rows),
        "first": min(r["when_eastern"] for r in rows),
        "last": max(r["when_eastern"] for r in rows),
        "by_day": [{"name": k, **v} for k, v in days.items()],
        "by_person": split("person"),
        "by_university": split("university"),
        "by_record_type": split("record_type"),
        "not_recorded": len(unnamed),
        "last_unnamed": max((r["when_eastern"] for r in unnamed), default=None),
        "first_named": min((r["when_eastern"] for r in named), default=None),
        "batches": batches(rows),
        "duplicate_notes": [f'{r["when_eastern"]} {r["university"]} / {r["record"]}'
                            for r in rows if DUPLICATE.search(r["note"])],
        "cleanup_notes": sum(bool(CLEANUP.search(r["note"])) for r in rows),
    }


def ago(days):
    if days is None:
        return "never touched"
    if days <= 0:
        return "touched today"
    return f"last touched {days} day{'s' if days != 1 else ''} ago"


def when_due(days):
    if days is None:
        return "no date"
    if days > 0:
        return f"{days} day{'s' if days != 1 else ''} overdue"
    if days == 0:
        return "due today"
    return f"due in {-days} day{'s' if days != -1 else ''}"


def next_up(rows, now=None):
    """Rank the open steps: how far up the ladder, how warm, how late.

    Each part is a small integer from a field the board already stores, so the
    order is the same every run and can be checked by eye against the row."""
    now = now or datetime.now(EASTERN).replace(tzinfo=None)
    scored = []
    for r in rows:
        far = STAGE_RANK.get(r["stage"], 0)
        touched = (now - r["t"]).days if r["t"] else None
        warm = 0 if touched is None else 3 if touched <= 1 else 2 if touched <= 3 else 1 if touched <= 7 else 0
        late_days = (now - r["due"]).days if r["due"] else None
        late = 0 if late_days is None else max(0, min(3, late_days))
        scored.append({**r, "far": far, "warm": warm, "late": late,
                       "touched_days": touched, "late_days": late_days,
                       "score": far + warm + late})
    scored.sort(key=lambda r: (-r["score"], -(r["late_days"] or 0), r["record"]))
    out, per = [], Counter()
    for r in scored:
        campus = r["university"] or "(no campus)"
        if per[campus] >= PER_CAMPUS:
            continue
        per[campus] += 1
        out.append(r)
        if len(out) >= TOP_N:
            break
    return out


def bars(items, label=lambda s: s, cap=7):
    items = [i for i in items if i["steps"]]
    if len(items) > cap:
        rest = items[cap - 1:]
        items = items[:cap - 1] + [{"name": f"{len(rest)} others",
                                    "steps": sum(i["steps"] for i in rest), "muted": True}]
    top = max((i["steps"] for i in items), default=1)
    out = []
    for i in items:
        muted = i.get("muted") or i["name"] in ("", NOT_RECORDED)
        out.append(
            f'<tr><td class="l">{html.escape(label(i["name"]))}</td>'
            f'<td><div class="bar{" g" if muted else ""}" style="width:{max(1, round(100 * i["steps"] / top))}%"></div></td>'
            f'<td class="n">{i["steps"]}</td></tr>')
    return "<table>" + "".join(out) + "</table>"


def person(p):
    return p if p == NOT_RECORDED else p.split("@")[0] + "@"


def kind(k):
    return k.replace("_", " ").capitalize()


def uni(u):
    return u or "(no campus: client/candidate)"


def render(s, ed, nxt=()):
    pct = round(100 * s["with_note"] / s["rows"]) if s["rows"] else 0
    unis = len([u for u in s["by_university"] if u["name"]])
    hl = ed.get("highlight") or {"value": s["by_record_type"][0]["steps"],
                                 "label": f'{s["by_record_type"][0]["name"]} steps'}
    unnamed = s["not_recorded"]
    names_line = (f'<b>{unnamed} of {s["rows"]} steps have no name attached.</b> '
                  '<i>(not recorded)</i> is missing data, not missing work.') if unnamed else ""
    type_notes = " · ".join(f'{kind(t["name"])} {t["with_note"]} of {t["steps"]}' for t in s["by_record_type"])
    day_notes = " · ".join(f'{d["name"]} {d["with_note"]}' for d in s["by_day"])
    quotes = "".join(
        f'<blockquote>“{html.escape(q["text"])}”<cite>{html.escape(q["cite"])}</cite></blockquote>'
        for q in ed.get("quotes", [])[:3])
    aside = f'<div class="muted aside">{html.escape(ed["aside"])}</div>' if ed.get("aside") else ""
    flags = "".join(f"<li>{f}</li>" for f in ed.get("flags", [])[:3]) or "<li>Nothing. All four checks passed.</li>"
    whys = {w["record"]: w["why"] for w in ed.get("why", [])}
    moves = []
    for i, r in enumerate(nxt, 1):
        facts = " · ".join([
            f'Stage: {STAGE_LABEL.get(r["stage"], r["stage"].replace("_", " "))}',
            ago(r["touched_days"]), when_due(r["late_days"])])
        why = whys.get(r["record"]) or r["note"].strip()
        why = (why[:155].rsplit(" ", 1)[0] + "…") if len(why) > 160 else why
        where = " · ".join(x for x in (r["university"], kind(r["record_type"])) if x)
        moves.append(
            f'<li><div class="mv"><b>{html.escape(r["record"])}</b>'
            f'<span class="w">{html.escape(where)}</span></div>'
            f'<div class="f">{html.escape(facts)}</div>'
            f'<div class="nx">Next: <b>{html.escape(TASK_LABEL.get(r["what_happened"], r["what_happened"].replace("_", " ")))}</b>'
            + (f' — {html.escape(why)}' if why else '') + '</div></li>')
    next_block = (
        '<h2>What to move next</h2><ol class="moves">' + "".join(moves) + "</ol>"
        + '<div class="muted aside">Ranked by how far up the ladder the record sits, how '
          'recently it was touched, and how overdue the next step is. Closed and '
          f'not-interested records are left out; at most {PER_CAMPUS} per campus.</div>'
    ) if moves else ""
    return TEMPLATE.format(
        window=html.escape(ed["window"]), names_line=names_line,
        rows=s["rows"], with_note=s["with_note"], pct=pct, unis=unis,
        hl_value=html.escape(str(hl["value"])), hl_label=html.escape(hl["label"]),
        by_day=bars(s["by_day"]), day_notes=day_notes,
        by_person=bars(s["by_person"], person),
        by_university=bars(s["by_university"], uni),
        by_record_type=bars(s["by_record_type"], kind), type_notes=type_notes,
        quotes=quotes, aside=aside, flags=flags, next_block=next_block)


TEMPLATE = """<!doctype html><html><head><meta charset="utf-8"><title>MedJobs RTL Report</title>
<style>
:root{{--teal:#4d8a8a;--ink:#1a3030;--cream:#F9F6F2;--mute:#5f6b64}}
*{{box-sizing:border-box}}body{{margin:0;font-family:Helvetica,Arial,"DejaVu Sans",sans-serif;color:var(--ink);font-size:8.6pt;line-height:1.28;background:#fff}}
h1{{font-size:17pt;color:var(--teal);margin:0}}h2{{font-size:10.5pt;color:var(--teal);margin:0 0 5px;text-transform:uppercase;letter-spacing:.04em}}
.sub{{color:var(--mute);font-size:9pt;margin:2px 0 8px}}
.note{{background:var(--cream);border-left:4px solid var(--teal);padding:7px 10px;margin-bottom:7px;font-size:9pt}}
.kpis{{display:flex;gap:8px;margin-bottom:7px}}.kpi{{flex:1;background:var(--cream);padding:7px 10px;border-radius:4px}}
.kpi b{{display:block;font-size:16pt;color:var(--teal);line-height:1.1}}.kpi span{{font-size:8.3pt;color:var(--mute)}}
.grid{{display:grid;grid-template-columns:1fr 1fr;gap:6px 16px;margin-bottom:7px}}
table{{width:100%;border-collapse:collapse;font-size:8.8pt}}td{{padding:1px 0;vertical-align:middle}}
td.n{{text-align:right;width:34px;font-variant-numeric:tabular-nums}}td.l{{width:44%}}
.bar{{height:9px;background:var(--teal);border-radius:2px}}.bar.g{{background:#b9cfcf}}
.muted{{color:var(--mute);font-size:8.2pt;margin-top:3px}}.aside{{margin:-2px 0 8px}}
blockquote{{margin:0 0 4px;padding:5px 9px;background:var(--cream);border-radius:4px;font-size:8.4pt}}
blockquote cite{{display:block;color:var(--mute);font-style:normal;font-size:8pt;margin-top:2px}}
ol{{margin:0;padding-left:16px}}ol li{{margin-bottom:2px;font-size:8.3pt}}
ol.moves{{padding-left:15px}}ol.moves li{{margin-bottom:4px}}
.mv b{{font-size:9pt}}.mv .w{{color:var(--mute);font-size:8pt;margin-left:6px}}
.f{{color:var(--mute);font-size:8pt}}.nx{{font-size:8.3pt}}
</style></head><body>
<h1>MedJobs RTL report</h1>
<div class="sub">{window}</div>
<div class="note"><b>This is not a league table.</b> “This is not meant to be punitive in terms of who did the most tasks.” Provider records carry more follow-up steps than students or advisors, so whoever is on providers will always show a bigger number. {names_line}</div>
<div class="kpis">
<div class="kpi"><b>{rows}</b><span>board steps closed</span></div>
<div class="kpi"><b>{with_note}</b><span>with a written note ({pct}%)</span></div>
<div class="kpi"><b>{unis}</b><span>universities worked</span></div>
<div class="kpi"><b>{hl_value}</b><span>{hl_label}</span></div>
</div>
<div class="grid">
<div><h2>By day</h2>{by_day}<div class="muted">With a note: {day_notes}.</div></div>
<div><h2>By person</h2>{by_person}</div>
<div><h2>By university</h2>{by_university}</div>
<div><h2>By record type</h2>{by_record_type}<div class="muted">With a note: {type_notes}.</div></div>
</div>
{next_block}
<h2>What actually happened</h2>
{quotes}{aside}
<h2>Things that look off</h2>
<ol>{flags}</ol>
</body></html>"""


def page_count(pdf):
    """pdfinfo if poppler is installed, else count the page objects."""
    try:
        out = subprocess.run(["pdfinfo", str(pdf)], capture_output=True, text=True).stdout
        m = re.search(r"Pages:\s+(\d+)", out)
        if m:
            return int(m.group(1))
    except FileNotFoundError:
        pass
    try:
        return len(re.findall(rb"/Type\s*/Page[^s]", Path(pdf).read_bytes())) or None
    except OSError:
        return None


def main():
    if len(sys.argv) < 3 or sys.argv[1] not in ("checks", "render"):
        sys.exit(__doc__)
    rows, nxt_rows = load(sys.argv[2])
    if not rows:
        sys.exit("The CSV has no closed steps. Check the window before anything else.")
    s = stats(rows)
    nxt = next_up(nxt_rows)
    if sys.argv[1] == "checks":
        s["next_up"] = [
            {"record": r["record"], "university": r["university"], "stage": r["stage"],
             "next": r["what_happened"], "touched_days": r["touched_days"],
             "late_days": r["late_days"], "score": r["score"]} for r in nxt]
        s["next_candidates"] = len(nxt_rows)
        print(json.dumps(s, indent=1))
        return
    ed = json.loads(Path(sys.argv[3]).read_text())
    out = Path(sys.argv[4]).resolve(); out.mkdir(parents=True, exist_ok=True)
    page = out / "report.html"
    page.write_text(render(s, ed, nxt))
    pdf = out / f'MedJobs-RTL-report-{ed.get("file_date", s["last"][:10])}.pdf'
    job = [{"html": str(page), "pdf": str(pdf), "footer": "Source: MedJobs board task tables (Supabase)"}]
    subprocess.run(["node", str(HTML2PDF), json.dumps(job)], check=True,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print(pdf)
    n = page_count(pdf)
    if n and n != 1:
        print(f"WARNING: {n} pages. Shorten the quotes or flags and render again.")


if __name__ == "__main__":
    main()
