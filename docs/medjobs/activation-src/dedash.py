# -*- coding: utf-8 -*-
"""Replace every em dash in ACTIVATION.md with punctuation house style allows.

House rule: no em dashes anywhere, and en dashes only in numeric ranges. The
source soft-wraps its paragraphs, so a parenthetical pair often straddles a
newline; paragraphs are joined before the rules run and re-wrapped afterwards.
Each occurrence is classified by what surrounds it, and FIXES overrides the
automatic choice wherever it reads badly.
"""
import re, textwrap, json, os

# hand corrections, applied to the finished text wherever the rule above
# picked punctuation that reads badly
FIXES = json.load(open('fixes.json', encoding='utf-8')) if os.path.exists('fixes.json') else []
WRAP = 110


def is_flow(ln):
    """A line that is part of a soft-wrapped prose paragraph."""
    s = ln.strip()
    if not s or ln.startswith('#') or s.startswith('|') or s.startswith('!['):
        return False
    if s.startswith(('```', '---', '> ')) or re.match(r'^[-*+]\s|^\d+\.\s', s):
        return False
    return True


def paragraphs(text):
    """Yield (kind, payload). kind 'flow' payload is a joined paragraph.

    A fenced code block holds the flow diagram, whose every line and column is
    load-bearing, so nothing inside a fence is joined or re-wrapped."""
    out, buf, indent, fence = [], [], '', False
    for ln in text.split('\n'):
        if ln.lstrip().startswith('```'):
            if buf:
                out.append(('flow', (indent, ' '.join(buf)))); buf = []
            fence = not fence
            out.append(('raw', ln))
            continue
        if fence:
            out.append(('raw', ln))
            continue
        if is_flow(ln) and (buf or True):
            if not buf:
                indent = ln[:len(ln) - len(ln.lstrip())]
            buf.append(ln.strip())
        else:
            if buf:
                out.append(('flow', (indent, ' '.join(buf)))); buf = []
            out.append(('raw', ln))
    if buf:
        out.append(('flow', (indent, ' '.join(buf))))
    return out


def dedash(s, table=False):
    if '—' not in s:
        return s
    # a cell holding nothing but a dash means there is nothing to record
    s = re.sub(r'\|\s*—\s*(?=\|)', '| None ', s)
    s = re.sub(r'\|\s*—\s*$', '| None', s)
    # exhibit captions take the house caption form
    s = re.sub(r'(\*\*Exhibit [A-Z]+) — ', r'\1. ', s)
    s = re.sub(r'(!\[Exhibit [A-Z]+) — ', r'\1. ', s)
    # a matched pair inside one sentence is parenthetical
    prev = None
    while prev != s:
        prev = s
        s = re.sub(
            r' — ([^—.!?]{2,120}?) — ',
            lambda m: (f' ({m.group(1)}) ' if ',' in m.group(1)
                       else f', {m.group(1)}, '), s, count=1)
    # what is left introduces or expands the clause that follows it
    s = re.sub(r'\s+—\s+', ': ', s)
    return s.replace('—', '')


out = []
for kind, payload in paragraphs(open('ACTIVATION.md', encoding='utf-8').read()):
    if kind == 'raw':
        ln = payload
        out.append(dedash(ln, table=ln.strip().startswith('|')))
        continue
    indent, para = payload
    new = dedash(para)
    if new == para and '—' not in para:
        # unchanged prose keeps the author's original wrapping
        out.append(indent + para)
    else:
        out += [indent + l for l in textwrap.wrap(new, WRAP - len(indent),
                                                  break_long_words=False,
                                                  break_on_hyphens=False)]
res = '\n'.join(out)
for wrong, right in FIXES:
    assert wrong in res, 'stale fix: ' + wrong[:60]
    res = res.replace(wrong, right)
open('ACTIVATION.house.md', 'w', encoding='utf-8').write(res)
print('em dashes left:', res.count('—'))
