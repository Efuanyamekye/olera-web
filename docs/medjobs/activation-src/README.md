# University Activation guide, source

`ACTIVATION.md` is the source. `python3 build.py` produces `activation.pdf`
here.

**The served copy is hand-polished and is not overwritten by the build.**
`../MedJobs_University_Activation_Guide.pdf` is what
`/api/admin/medjobs/sop?doc=activation` serves, and what the CRM tab links
to. It started as this build and was then edited by hand, so `build.py`
deliberately does not copy over it. When the source moves genuinely ahead,
compare the two and copy on purpose:

    cp activation.pdf ../MedJobs_University_Activation_Guide.pdf

Keeping both means the markdown can drift from what the Consumer Relations
Manager actually reads. Check them against each other whenever the workflow
changes.

Same renderer and house style as `matrix-src` and `roles-src`, so the five
documents read as one set. `build.py` adds only figure sizing, because this
guide is mostly screenshots and at the matrix's exhibit width each one
would take a page to itself.

## The exhibits

`exhibits/*.png` are real renders of the shipped components, not mockups.
They come from a harness that bundles the actual TSX with esbuild, styles
it with the project's own `tailwind.config.ts`, mounts it in Chromium with
fixture data, and screenshots each surface at 2x.

**Regenerate them whenever the components change.** A guide showing an
older UI is worse than one showing none. The harness lives outside the
repo; rebuild it by bundling
`components/admin/medjobs/activation/*` against fixture props, generating
CSS with the project's Tailwind config, and screenshotting each surface.
Two things that are easy to get wrong:

- The Tailwind content globs must include every component the page renders,
  `DrawerShell` among them, or classes silently go missing and the layout
  renders wrong.
- Cards start collapsed, so the harness page has to click them open before
  the screenshot.

## Editing

- **Keep the walkthrough honest.** The workflow it describes lives in
  `lib/medjobs/activation.ts` and `lib/medjobs/activation-tasks.ts`. If a
  Live Win criterion, a cadence or a task changes there, change it here in
  the same pass. This guide is the only place a Consumer Relations Manager
  reads what the system expects of her.
- A new or renamed PDF needs an entry in `outputFileTracingIncludes` in
  `next.config.ts`, or the route works locally and 404s in production.
