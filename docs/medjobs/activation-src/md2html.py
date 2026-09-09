import sys, os, re, markdown, html as ihtml
import figs

# House style: 11pt Arial on a 7.5in column, teal #14453f for structure, a rule
# under each section head, 9pt tables with a teal header rule and no zebra, and
# captions under the thing they describe rather than above it.
CSS = """
:root { --ink:#000; --muted:#5f6b64; --rule:#b9c4bd; --teal:#14453f; --soft:#f4f7f6; }
* { box-sizing: border-box; }
body { margin:0; color:var(--ink); font-family:Arial,Helvetica,sans-serif;
       font-size:11pt; line-height:1.2; }
.doc-title { font-size:15pt; font-weight:700; margin:0 0 2pt; color:var(--teal);
       letter-spacing:0.2pt; }
.doc-sub { font-size:10pt; color:var(--muted); margin:0 0 9pt; }
h1,h2,h3,h4 { break-after:avoid; page-break-after:avoid; }
h1 { font-size:13pt; font-weight:700; text-transform:uppercase; letter-spacing:0.4pt;
       margin:16pt 0 5pt; color:var(--teal); border-bottom:1.6pt solid var(--teal);
       padding-bottom:3pt; break-before:page; page-break-before:always; }
h2 { font-size:11pt; font-weight:700; text-transform:uppercase; letter-spacing:0.4pt;
       margin:13pt 0 4pt; padding-bottom:2pt; border-bottom:1.2pt solid #000; }
h3 { font-size:10pt; font-weight:700; text-transform:uppercase; letter-spacing:0.4pt;
       margin:9pt 0 3pt; color:var(--teal); }
h4 { font-size:9.5pt; font-weight:700; margin:7pt 0 2pt; color:var(--muted);
       text-transform:uppercase; letter-spacing:0.4pt; }
p { margin:0 0 3pt; text-align:justify; orphans:2; widows:2; }
ul,ol { margin:3pt 0 4pt; padding-left:17pt; }
li { margin:0 0 3pt; text-align:left; }
li::marker { color:var(--teal); }
li > ul, li > ol { margin-top:3pt; }
p.obj { break-after:avoid; page-break-after:avoid; }
ul.facts { break-inside:avoid; page-break-inside:avoid; }
strong { font-weight:700; }
hr { border:0; border-top:0.6pt solid var(--rule); margin:9pt 0; }
a { color:var(--teal); text-decoration:none; }
code { font-family:"DejaVu Sans Mono","Liberation Mono",monospace; font-size:8.6pt;
       background:var(--soft); border:0.5pt solid var(--rule); border-radius:2px;
       padding:0 2px; }
/* The flow diagram is 69 lines of box drawing. The size has to be set on the
   pre itself, not on the code inside it, or the line boxes take the 11pt body
   size and the block runs off the page. Overflow is left visible so that a
   future edit which no longer fits is obvious rather than silently cropped. */
pre { background:var(--soft); border:0.5pt solid var(--rule);
      border-left:2.4pt solid var(--teal); padding:7pt 9pt;
      font-family:"DejaVu Sans Mono","Liberation Mono",monospace;
      font-size:7.2pt; line-height:1.05;
      break-inside:avoid; page-break-inside:avoid; margin:0 0 6pt; }
pre code { background:none; border:0; padding:0; font-size:inherit;
           line-height:inherit; white-space:pre; }
blockquote { margin:0 0 5pt; padding:0 0 0 8pt; border-left:2.4pt solid var(--rule);
      color:var(--muted); font-size:9.5pt; break-inside:avoid; }
blockquote p { margin:0 0 2pt; text-align:left; }
blockquote p:last-child { margin-bottom:0; }
blockquote strong { color:var(--teal); }
table { width:100%; border-collapse:collapse; margin:5pt 0 2pt; font-size:9pt;
      line-height:1.16; break-inside:auto; }
thead { display:table-header-group; }
tr { break-inside:avoid; page-break-inside:avoid; }
th { text-align:left; color:var(--teal); border-bottom:1pt solid var(--teal);
      padding:0 6pt 2.5pt 0; font-weight:700; vertical-align:bottom; }
td { border-bottom:0.4pt solid var(--rule); padding:2.8pt 6pt 2.8pt 0;
      vertical-align:top; }
td strong { color:var(--teal); }
tbody tr:last-child td { border-bottom:1pt solid var(--teal); }
.toc { border-top:1.2pt solid #000; border-bottom:1.2pt solid #000; padding:6pt 0;
      margin:0 0 10pt; font-size:9.5pt; break-inside:avoid; column-count:2;
      column-gap:20pt; }
.toc-h { font-size:9pt; text-transform:uppercase; letter-spacing:0.4pt;
      color:var(--teal); font-weight:700; margin:0 0 4pt; column-span:all; }
.toc ul { list-style:none; margin:0; padding:0; }
.toc ul ul { display:none; }
.toc li { margin:0 0 2pt; }
.toc a { color:var(--ink); }
figure { margin:5pt 0 6pt; break-inside:avoid; page-break-inside:avoid; }
/* Process figures float into the text so a run of tables is broken up rather
   than merely interrupted. Headings clear them so a float cannot escape into
   the next stage. */
figure.fw { float:right; width:2.5in; margin:2pt 0 6pt 14pt; }
figure.fw svg { display:block; width:100%; height:auto; }
figure.fw figcaption { font-size:8.5pt; line-height:1.14; }
h1,h2,h3 { clear:both; }
table { clear:both; }
/* The screenshots are 640px wide. Capping the plate at 6.6in keeps them
   near 97 dpi rather than the 85 dpi a full 7.5in column would give. */
figure img { display:block; max-width:6.6in; max-height:8.2in; margin:0 auto; }
figcaption { font-size:9pt; line-height:1.16; text-align:left; margin:3pt 0 0;
      break-before:avoid; }
figcaption strong:first-child { color:var(--teal); }
.exhibit-missing { border:0.6pt dashed var(--rule); background:var(--soft);
      padding:14pt 10pt; margin:5pt 0 6pt; text-align:center; color:var(--muted);
      font-size:9pt; }
.exhibit-missing b { display:block; color:var(--teal); font-size:9.5pt;
      margin-bottom:3pt; }
@page { size: Letter; }
"""


def build(src, out, title, subtitle, notoc=''):
    raw = open(src).read()
    raw = re.sub(r'\A#\s+.*?\n', '', raw, count=1)
    md = markdown.Markdown(extensions=['tables', 'fenced_code', 'toc', 'sane_lists',
                                       'attr_list', 'md_in_html'],
                           extension_configs={'toc': {'toc_depth': '2-2'}})
    body = md.convert(raw)
    srcdir = os.path.dirname(os.path.abspath(src))

    def _img_resolve(tag, path, alt):
        if path.startswith(('http://', 'https://', 'data:')):
            return tag
        full = os.path.normpath(os.path.join(srcdir, path))
        if os.path.exists(full):
            return tag.replace(path, 'file://' + full)
        label = ihtml.escape(alt or path)
        return ('<div class="exhibit-missing"><b>' + label + '</b>'
                'Screenshot not yet added. Drop <code>' + ihtml.escape(path) +
                '</code> into the exhibits folder and rebuild.</div>')

    def _img_tag(m):
        tag = m.group(0)
        sm = re.search(r'src="([^"]*)"', tag)
        am = re.search(r'alt="([^"]*)"', tag)
        if not sm:
            return tag
        return _img_resolve(tag, sm.group(1), am.group(1) if am else '')
    body = re.sub(r'<img\b[^>]*>', _img_tag, body)

    # House style puts the caption under the exhibit. The source writes it as the
    # paragraph above, so the pair is swapped into one figure that cannot break.
    def _figure(m):
        cap, img = m.group(1), m.group(2)
        return f'<figure>{img}<figcaption>{cap}</figcaption></figure>'
    body = re.sub(r'<p>(<strong>Exhibit .*?)</p>\s*<p>(<img\b[^>]*>)</p>',
                  _figure, body, flags=re.S)
    # any exhibit image the swap did not catch still gets the figure wrapper
    body = re.sub(r'<p>(<img\b[^>]*>)</p>', r'<figure>\1</figure>', body)

    # <!--FIG name--> becomes the floated process figure of that name
    def _fig(m):
        fn, cap = figs.FIGURES[m.group(1)]
        return (f'<figure class="fw">{fn()}'
                f'<figcaption><strong>{cap.split(".")[0]}.</strong>'
                f'{cap.split(".", 1)[1]}</figcaption></figure>')
    body = re.sub(r'<!--FIG (\w+)-->', _fig, body)

    # A stage opens with an objective and three facts under it. Keep that
    # header together: the list must not split, and it must not part from the
    # paragraph above it. Tagging both here rather than with a positional
    # selector, because two stages put a floated figure between h2 and p.
    body = re.sub(
        r'<p>(<strong>Objective</strong>.*?)</p>\s*<ul>\s*<li><strong>Owner</strong>',
        r'<p class="obj">\1</p>\n<ul class="facts">\n<li><strong>Owner</strong>',
        body, flags=re.S)

    toc = '' if notoc else (md.toc if md.toc.count('<li>') > 2 else '')
    toc = re.sub(r'\A\s*<div class="toc">\s*', '', toc)
    toc = re.sub(r'\s*</div>\s*\Z', '', toc)
    toc_block = (f'<div class="toc"><div class="toc-h">Contents</div>{toc}</div>'
                 if toc else '')
    doc = f"""<!doctype html><html><head><meta charset="utf-8">
<title>{ihtml.escape(title)}</title>
<style>{CSS}</style></head><body>
<div class="doc-title">{ihtml.escape(title)}</div>
<div class="doc-sub">{subtitle}</div>
{toc_block}
{body}
</body></html>"""
    open(out, 'w').write(doc)
    print("wrote", out, len(doc))


if __name__ == "__main__":
    build(*sys.argv[1:6])
