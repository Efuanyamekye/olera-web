# -*- coding: utf-8 -*-
"""Small process figures for the implementation matrix.

100 svg units = 1 inch, matching the house figure system, so 13.19 units is
9.5pt on the page. Each figure is drawn 250 units wide and floated into a 2.5in
column, which is why every label is short enough not to need wrapping.
"""
TEAL, GREEN, GREY, RULE, INK = "#14453f", "#1a7f4e", "#5f6b64", "#b9c4bd", "#111"
GFILL, PALE, AMBER = "#e8f1ec", "#f4f7f6", "#b8860b"
S = 13.19          # 9.5pt, the floor
W = 250


def _svg(h, body):
    return (f'<svg viewBox="0 0 {W} {h:.0f}" width="2.5in" '
            f'xmlns="http://www.w3.org/2000/svg" '
            f'font-family="Arial, Helvetica, sans-serif">'
            f'<defs><marker id="a" markerWidth="7" markerHeight="5.4" refX="6.5" '
            f'refY="2.7" orient="auto"><path d="M0,0 L7,2.7 L0,5.4 z" '
            f'fill="{TEAL}"/></marker></defs>{body}</svg>')


def _t(x, y, s, size=S, fill=INK, anchor="middle", weight="normal", style="normal"):
    return (f'<text x="{x}" y="{y}" font-size="{size}" fill="{fill}" '
            f'text-anchor="{anchor}" font-weight="{weight}" '
            f'font-style="{style}">{s}</text>')


def _box(x, y, w, h, fill="#fff", stroke=TEAL, sw=1.1):
    return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="3" fill="{fill}" '
            f'stroke="{stroke}" stroke-width="{sw}"/>')


def _down(x, y0, y1, col=TEAL):
    return (f'<line x1="{x}" y1="{y0}" x2="{x}" y2="{y1}" stroke="{col}" '
            f'stroke-width="1.2" marker-end="url(#a)"/>')


def preflight():
    """PR1: one call, four outcomes, three attempts then archive."""
    b, y = [], 6
    b.append(_box(55, y, 140, 20, GFILL))
    b.append(_t(125, y + 14, "Call the provider", weight="bold", fill=TEAL))
    y += 20
    b.append(_down(125, y + 1, y + 13))
    y += 15
    outs = [("Confirmed", GREEN, "Launch outreach"),
            ("No answer", GREY, "Call again"),
            ("Voicemail", GREY, "Call again"),
            ("Not interested", GREY, "Close the row")]
    for i, (name, col, res) in enumerate(outs):
        b.append(_box(4, y, 112, 18, "#fff", col, 1.0))
        b.append(_t(60, y + 12.6, name, fill=col, weight="bold"))
        b.append(f'<line x1="118" y1="{y+9}" x2="130" y2="{y+9}" stroke="{col}" '
                 f'stroke-width="1.1" marker-end="url(#a)"/>')
        b.append(_t(134, y + 12.6, res, fill=INK, anchor="start"))
        y += 22
    y += 2
    b.append(f'<rect x="4" y="{y}" width="242" height="21" rx="3" fill="{PALE}" '
             f'stroke="{RULE}" stroke-width="1"/>')
    b.append(_t(125, y + 14, "Three failed calls, then archive", fill=GREY,
                weight="bold"))
    return _svg(y + 27, "".join(b))


def cadence():
    """PR-OUT: what goes out on which day, and what stops it."""
    b = []
    y = 6
    b.append(_t(4, y + 10, "OUTREACH, 7 DAYS", S, GREY, anchor="start",
                weight="bold"))
    y += 18
    days = [("Day 0", ["Intro email"]), ("Day 3", ["Follow-up email", "Check-in call"]),
            ("Day 5", ["Call"]), ("Day 7", ["Final email"])]
    for name, items in days:
        h = 15 + (len(items) - 1) * 13
        b.append(f'<line x1="34" y1="{y}" x2="34" y2="{y + h + 5}" '
                 f'stroke="{RULE}" stroke-width="1"/>')
        b.append(f'<circle cx="34" cy="{y+8}" r="3.4" fill="{TEAL}"/>')
        b.append(_t(28, y + 11.5, name, fill=TEAL, anchor="end", weight="bold"))
        for k, it in enumerate(items):
            b.append(_t(44, y + 11.5 + k * 13, it, fill=INK, anchor="start"))
        y += h + 5
    b.append(f'<rect x="4" y="{y+2}" width="242" height="21" rx="3" fill="{GFILL}" '
             f'stroke="{GREEN}" stroke-width="1.1"/>')
    b.append(_t(125, y + 16, "A reply stops the sequence", fill=GREEN, weight="bold"))
    return _svg(y + 29, "".join(b))


def nudges():
    """ST8: the completeness ladder, eight emails then silence."""
    b = []
    y = 6
    b.append(_t(4, y + 10, "PROFILE NUDGES", S, GREY, anchor="start", weight="bold"))
    # the day numbers sit above the axis, so the header needs the whole of that
    # band to itself or the first four collide with it
    y += 32
    days = [1, 3, 5, 7, 21, 35, 49, 63]
    x0, x1 = 12, 238
    b.append(f'<line x1="{x0}" y1="{y}" x2="{x1}" y2="{y}" stroke="{RULE}" '
             f'stroke-width="1.2"/>')
    for i, d in enumerate(days):
        x = x0 + (x1 - x0) * i / (len(days) - 1)
        near = i < 4
        b.append(f'<circle cx="{x:.1f}" cy="{y}" r="3.2" fill="'
                 f'{TEAL if near else "#fff"}" stroke="{TEAL}" stroke-width="1.2"/>')
        b.append(_t(x, y - 7, str(d), S * 0.92, TEAL if near else GREY))
    b.append(_t(x0, y + 15, "first week", S, TEAL, anchor="start"))
    b.append(_t(x1, y + 15, "then fortnightly", S, GREY, anchor="end"))
    y += 24
    b.append(f'<rect x="4" y="{y}" width="242" height="21" rx="3" fill="{PALE}" '
             f'stroke="{RULE}" stroke-width="1"/>')
    b.append(_t(125, y + 14, "Eight nudges, then it stops", fill=GREY, weight="bold"))
    return _svg(y + 27, "".join(b))


def interview():
    """MA2: the interview state machine, and the two ways out of it."""
    b, y = [], 6
    for name, col in [("proposed", GREY), ("confirmed", TEAL), ("completed", GREEN)]:
        b.append(_box(62, y, 126, 19, GFILL if col is GREEN else "#fff", col, 1.2))
        b.append(_t(125, y + 13, name, fill=col, weight="bold"))
        if name != "completed":
            b.append(_down(125, y + 20, y + 30, col))
        y += 33
    y -= 5
    b.append(_t(4, y + 12, "Also from confirmed:", S, GREY, anchor="start"))
    y += 18
    for name in ["cancelled", "no-show", "rescheduled"]:
        b.append(_box(4, y, 78, 17, "#fff", RULE, 1.0))
        b.append(_t(43, y + 11.6, name, S * 0.94, GREY))
        y += 20
    return _svg(y + 4, "".join(b))


def billing():
    """The fulfilment chain, and the gate the invoice waits behind."""
    b, y = [], 6
    steps = [("MA1", "Candidate intro", TEAL), ("MA2", "Interview held", TEAL),
             ("MA3", "Hire confirmed", TEAL),
             ("MA4", "Six shifts worked", AMBER), ("MA5", "Bill issued", GREEN)]
    for i, (code, label, col) in enumerate(steps):
        fill = GFILL if i >= 3 else "#fff"
        b.append(_box(4, y, 242, 20, fill, col, 1.4 if i >= 3 else 1.0))
        b.append(_t(14, y + 13.6, code, S, col, anchor="start", weight="bold"))
        b.append(_t(50, y + 13.6, label, S, INK, anchor="start"))
        if i < len(steps) - 1:
            b.append(_down(125, y + 21, y + 29, col))
        y += 32
    y -= 8
    b.append(f'<rect x="4" y="{y}" width="242" height="22" rx="3" fill="{PALE}" '
             f'stroke="{AMBER}" stroke-width="1.2" stroke-dasharray="4 3"/>')
    b.append(_t(125, y + 15, "No invoice before six shifts", fill=AMBER,
                weight="bold"))
    return _svg(y + 28, "".join(b))


# name -> (drawing function, caption). md2html.py expands a <!--FIG name-->
# comment in the markdown into the floated figure.
FIGURES = {
    'preflight': (preflight,
                  'Pre-flight. One call, four outcomes, and the three-strike rule '
                  'that closes a row nobody answers.'),
    'cadence':   (cadence,
                  'The outreach cadence. Three emails and two calls over seven '
                  'days, and any reply ends it.'),
    'nudges':    (nudges,
                  'The completeness ladder. Four nudges in the first week, four '
                  'more over the following six, then silence.'),
    'interview': (interview,
                  'Interview states. Two of the three ways out of confirmed are '
                  'failures worth recording.'),
    'billing':   (billing,
                  'The fulfilment chain. Every stage before MA4 is unpaid work; '
                  'the six-shift confirmation is what releases the invoice.'),
}
