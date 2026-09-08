# University Activation guide, source

`ACTIVATION.md` is the source. `sh build.sh` produces
`../MedJobs_University_Activation_Guide.pdf`, which
`/api/admin/medjobs/sop?doc=activation` serves behind the admin guard.

Same pipeline as `matrix-src` and `roles-src`, so the four documents look
like one set: `dedash.py` applies the no-em-dash house rule, `md2html.py`
renders it, `html2pdf.mjs` prints it through Chromium.

Two things to know before editing:

- **Keep it to four pages.** Check with
  `python3 -c "import re;print(len(re.findall(rb'/Type\s*/Page[^s]', open('activation.pdf','rb').read())))"`.
- **The workflow it describes lives in `lib/medjobs/activation.ts`.** If a
  Live Win criterion, a cadence or a task changes there, change it here in
  the same pass. This guide is the only place a Consumer Relations Manager
  reads what the system expects of her.

A new or renamed PDF also needs an entry in `outputFileTracingIncludes` in
`next.config.ts`, or the route works locally and 404s in production.
