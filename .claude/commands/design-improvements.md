# Design Improvements — Master Design Pass

Run a complete design pass on a screen: **diagnose, then execute the right fixes in the right order.** This is the orchestrator that strings together the four single-purpose design commands so you don't have to invoke them one at a time.

Input: `$ARGUMENTS` — a screenshot (mobile viewport preferred) plus a short note on what page this is and what feels off. If only a screenshot is pasted, ask which page/route it is before doing anything.

---

## The crew (read these at runtime — don't reproduce them from memory)

This command is a conductor, not a rewrite. Each sub-command owns its own logic, inspiration set, and gotchas, and they get edited over time. **Open and follow the actual file** for whichever lane you run — never paraphrase a stale copy:

| Lane | Command file | What it does | Builds? |
|---|---|---|---|
| **Diagnose** | `.claude/commands/ui-critique.md` | Prioritized visual/UX critique — the map for everything below | No |
| **Boldness / copy** | `.claude/commands/punch.md` | Make it bolder, simpler, punchier; kill template smell | Yes (≤8 edits) |
| **Mobile** | `.claude/commands/mobilize.md` | Mobile-specific refinement — thumb economics, container discipline, 7 lenses | Yes (waits for confirmation) |
| **Motion** | `.claude/commands/dejank.md` | Eliminate jank — layout shifts, flickers, transition smoothing | Yes |

The three **aesthetic** lanes — `ui-critique`, `punch`, `mobilize` — ground in the same inspiration folder (`~/Desktop/olera-hq/docs/Design Inspirations/`); `ui-critique` and `punch` also carry the explicit anti-anchor rule, and `mobilize` adds a second reference set (`~/Desktop/olera-web/docs/Mobile Optimized Pages/`). Ground once, reuse across these lanes. `dejank` is the odd one out: it's a **behavioral/motion** tool (console + state tracing), not an aesthetic one — it reads no inspiration folder, so don't expect a folder study when you run it.

---

## Pipeline (order is deliberate)

The lanes run in this sequence because each builds on the last: structure before mobile-fit before motion. Don't reorder without a reason.

```
ui-critique  →  punch  →  mobilize  →  dejank  →  verify
(diagnose)     (shape)    (mobile)     (motion)
```

### Phase 1 — Diagnose (always)
Follow `ui-critique.md` in full: study the inspiration folder, read the component code if a path is available, run its analysis framework. Produce the prioritized critique (What's Working / Suggested / Quick Wins / Optional). **This is the map** — every edit downstream traces back to a finding here.

### Phase 1b — Hold the screen against the hard-won lessons (always)
Before triage, walk the screen through **Hard-won lessons** at the bottom of this file. Every lesson the screen breaks becomes a finding in the critique, named by its number ("breaks L2: every row is tinted"). These are the mistakes TJ has already paid for; they outrank anything generic the inspiration folder suggests.

### Phase 2 — Triage into lanes, then get TJ's call
Sort the critique's findings into the three execution lanes:

- **Boldness/copy/hierarchy/clarity** → `punch`
- **Mobile layout, thumb reach, container discipline, viewport** → `mobilize`
- **Jank, flicker, layout shift, transition timing** → `dejank`

Present a short routing plan: *"Findings split as — punch: 4 (headline, CTA, value-prop compression, dead air); mobilize: 2 (sticky CTA, de-box sections); dejank: 1 (card flicker on load). Propose running punch → mobilize → dejank."*

Then ask TJ to confirm **scope** — run all lanes, or only some. Don't assume all three; a screen may only need one.

### Phase 2b — Show it before you build (anything bigger than a few edits)
TJ judges design by seeing it, and a mock is cheaper to change than code. Before editing a screen's layout, publish an artifact (`/visualize`) that shows:
- the proposed screen **drawn with the real data** (real queue names, counts, rows; mask personal emails or phone numbers),
- **laptop and phone side by side**,
- **today's screenshot beside it**, and a numbered "what changed" list wired to markers on the mock.

Iterate on the mock until TJ says go. Settling the tabs question (pills or underline tabs, L5) took one mock revision; in code it would have been a rebuild.

### Phase 3 — Execute the confirmed lanes, in pipeline order
For each lane TJ greenlights, **open that command file and follow its process exactly** — including its own confirmation gates. Notably:

- `mobilize` restates the problem, asks 2–4 clarifying questions, and **waits before editing**. Honor that — don't bulldoze its gate just because this is a master run.
- `punch` decides one direction and makes ≤8 surgical edits with before/after rationale.
- `dejank` traces each jank source to its cause before patching.

Run them sequentially, not in parallel — `mobilize` adapts the layout `punch` produced; `dejank` smooths transitions of the final layout. Summarize after each lane before starting the next, so partial state is easy to roll back.

### Phase 4 — Verify once, at the end
Don't build after every lane — build once after the last executed lane. Then follow `mobilize`'s Vercel handoff (Phase 7): the PR's auto-updating preview link on a real phone is the source of truth, not local dev or a pinned deployment hash. Call out specifically what to check per lane that ran.

Before handing over, check it yourself the way the phone will render it (L10):
- **Safari's engine, not Chrome's.** Screenshot the preview in Playwright WebKit at 402px and 1440px, signed in, with real data. Chrome's device emulation missed an iPhone-only bug twice (L9).
- **No sideways scroll:** `document.documentElement.scrollWidth === innerWidth` at both widths.
- **iPhone-only reports:** render the same DOM in the iPhone 17 Pro simulator (`xcrun simctl openurl`) before touching code.

---

## Scope control

- **`$ARGUMENTS` may name a lane** — e.g. `/design-improvements <screenshot> mobile only` runs Phase 1 then jumps straight to `mobilize`. Respect an explicit lane request; skip the triage menu.
- **Default is diagnose + propose**, not diagnose + auto-execute-everything. TJ confirms scope at Phase 2.
- **One screen per run.** This orchestrates depth on a single screen, not a sweep across pages.

## Anti-patterns

- **Don't duplicate the sub-commands' content here.** Read their files. This command goes stale the moment it copies their logic.
- **Don't skip Phase 1.** Executing without the critique map produces unanchored edits — the exact thing each sub-command warns against.
- **Don't run lanes out of order or in parallel.** Shape → mobile → motion. Later lanes depend on earlier output.
- **Don't override a sub-command's confirmation gate.** If `mobilize` says wait, wait.
- **Don't run lanes TJ didn't greenlight.** A clean lens needs no pass.
- **Don't add features or copy.** Every lane here sharpens what exists; none of them build new sections.

---

## Hard-won lessons

Learned on the family case page, the provider inbox and the relationship pages, September 2026. Each one cost a rebuild or a round of TJ finding it on his phone. Check every screen against them (Phase 1b). The examples are PRs anyone on the team can open; the mocks are TJ's artifacts.

**L1. Say what is waiting in one sentence, before any number.** Four stat tiles at equal weight, two of them red, made TJ ask "where do I look?". Replace them with one line in the open queue's words ("**8 families** wrote to us and are waiting on a reply"), and put the other counts underneath as quiet links. *Example: Care Seeker Relationships, #2254.*

**L2. When everything is loud, nothing is.** Tinted rows, coloured side rails and three orange labels on every row meant no row stood out. Mark only the rows that need someone now, with a small dot on the avatar and one amber word. Everything else stays plain. *Example: #2254 (rows) and the quieter case timeline, #2232.*

**L3. Rows read like people, not like tables.** Use an avatar, the name in bold, one grey line of context, and one line of what they said or what to do next, with the time on the right. Not four table columns, and not five stacked lines per person. *Examples: #2254, and the ad-family rows in the provider inbox, #2236.*

**L4. The "Claude Code look" is rejected.** No typewriter (monospace) type for dates and details, no coloured tag pills stacked under names, no uppercase column headers, no serif display type on working screens. TJ: "looks like something Claude Code designed, not Airbnb." Use plain sans type at sensible sizes, white space, and hairlines. At most one flag per row, written as words.

**L5. Tabs: underline, calm, and only what has work.** Pill chips wrap and are space-hungry; the old tabs were compact but "angry and intimidating". What worked was underline tabs with small grey counts, only the open tab dark, empty queues hidden, at most five showing and the rest under More. Filters that are for finding someone (search, date window, source) go behind one search icon. *Example: #2254.*

**L6. No persistent bar on a phone.** A sticky message bar left a gap and felt janky. Use floating controls in the Jupiter style: a round pill bottom right that opens a sheet, and a back button in the sticky tab row. *Example: family case page on a phone, #2232.*

**L7. Quiet the timeline into three levels.** Short system notes between message bubbles "look weird and off". Messages are bubbles; moments (offered, took it, moved on) are one centred line with an icon; background (automatic emails) folds into one line like "4 automatic emails · 1 opened". *Example: #2232; mock "Quieter Case Timeline".*

**L8. Empty states are a drawn picture, one bold line, one sentence and one quiet button.** A grey icon in a circle is "trash". When a page refuses to show something, say who is signed in; that alone would have saved a confused test. *Example: inbox empty states, #2243.*

**L9. iPhone Safari zooms into any text field under 16px, and stays zoomed.** Chrome's emulation does not reproduce it. Every input, select and textarea on a screen used from a phone is 16px on small screens. After a fix, the tester's old tab stays zoomed until they pinch out, so say that before shipping a second fix. *Example: #2233.*

**L10. Verify on the real engine with real data, and open the right thing first.** WebKit at 402 and 1440 wide, signed in, on the live preview (Phase 4). On a laptop, open the most urgent item (a waiting offer before the newest message), not a "Pick a conversation" screen when something is waiting. Every link to a record opens that record, not the list. *Example: provider inbox auto-open and deep links, #2249.*

**L11. Iterate on the picture, not the code.** Every screen above went through a published mock first (Phase 2b), and every change TJ asked for at that stage cost minutes. The ones that skipped it (the first mobile case page) were rebuilt.

