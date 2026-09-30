#!/bin/sh
# Build the house-style PDF of the weekly board report runbook.
#
# Source is docs/medjobs/operating/10-RTL-REPORT-RUNBOOK.md, which is the
# version to edit. This only renders it. The markdown's own title block is
# dropped because md2html.py draws the title and byline from its arguments.
#
# Run from this directory.
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
SRC="$HERE/../operating/10-RTL-REPORT-RUNBOOK.md"
TOOLS="$HERE/../matrix-src"
OUT=$(mktemp -d)

python3 - "$SRC" "$OUT/body.md" <<'PY'
import io, sys
s = io.open(sys.argv[1], encoding="utf-8").read()
# Drop the H1 and the two byline lines only. The intro paragraphs after them
# are body text and belong in the PDF. An earlier version of this cut at the
# first horizontal rule and silently lost them.
HEAD = ("# How to make the weekly board report\n\n"
        "**For: Chantel, leading the RTL while Logan is out.**\n"
        "Written 30 September 2026.\n\n")
assert s.startswith(HEAD), "title block changed; update build.sh"
io.open(sys.argv[2], "w", encoding="utf-8").write(s[len(HEAD):])
PY

cd "$TOOLS"
python3 md2html.py "$OUT/body.md" "$OUT/runbook.html" \
  "How to make the weekly board report" \
  "For Chantel, leading the RTL while Logan is out &#183; 30 September 2026"
node html2pdf.mjs "$(python3 -c "import json,sys;print(json.dumps([{
  'html': sys.argv[1] + '/runbook.html',
  'pdf':  sys.argv[1] + '/runbook.pdf',
  'footer':'How to make the weekly board report'}]))" "$OUT")"
cp "$OUT/runbook.pdf" "$HERE/../RTL_Report_Runbook.pdf"
echo "wrote docs/medjobs/RTL_Report_Runbook.pdf"
