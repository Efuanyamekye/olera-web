# Olera city-care landing pages — V3 handoff for Claude

## Purpose and decision
TJ requested updated designs informed by both analyses. This package contains interactive REVIEW PROTOTYPES, not production implementation or a PR. Optimize this iteration for successfully submitted requests per qualified paid landing. Clicks and starts are diagnostic; follow-up conversations are separate downstream outcomes.

## Open first
OPEN-FIRST-design-comparison.html is self-contained: three interactive Dallas previews, embedded styles/scripts/images, no server required. Scroll within each phone. This is the simplest file to upload to Claude or fold into the existing comparison artifact. Explicitly label these as prototypes, not deployed screenshots.

For editable source, serve `public` locally (for example `python3 -m http.server 8765 --directory public`) and open `/reviews/city-care/`. The source review supports Dallas/Charlotte and desktop/mobile, plus a link to the preceding V2. Keep the public directory structure so images resolve. The single-file comparison fixes the city to Dallas.

## Three flows
A — Explore everyday help. Replaces the prior browse introduction with care-category examples. Filters and detail dialogs provide information before contact. Choosing an option carries its context into the request.
B — Useful guidance. Two questions (need and timing) return a starting point before contact. Answers carry into the request; do not ask for them again.
C — Request a conversation. Direct callback invitation with first name, care ZIP, phone, and consent. No required care/timing questions in this route.

## Shared design decisions
Warm white #FAF9F6, charcoal #222222, muted text #59595F, raspberry primary action #BE123C. One readable system sans-serif family, stronger hierarchy, 17px mobile body copy, generous tap targets, fewer repeated sections. These are design hypotheses, not proven conversion winners. Mobile sticky bars appear after the introductory section leaves view, hide while the request form is visible, while a dialog is open, and after preview confirmation. Guidance's sticky action points to its quiz; the other two point to the request form. Respect safe-area insets and reduced motion.

## Production integration — review before merging
Use one experiment implementation at the existing city URL; do not add another independent assigner. Proposed allocation is 10% control / 30% each challenger. Reuse existing infrastructure after checking it against current PR HEAD. This package does not verify the current status of PR #1869 or implement any allocation.

Map these flows into real components and the existing API. Keep server assignment stable and attach experiment identity to landing, interaction, form and successful-submission events. Exclude review/override/test traffic. Count server-accepted submissions, not button clicks or client-only success messages. Do not pick a winner from one start.

IMPORTANT: Source form `need` and `timing` are hidden text inputs carrying prototype context, not production enums. C defaults to `Care options` and `To discuss`. Map these intentionally to the real API; do not send raw prototype strings or null into a required enum. Verify all three paths reach a server-accepted request. Preview success merely validates a sample US phone and shows local confirmation; there is NO fetch, storage, analytics, assignment, or lead creation here.

Care cards are illustrative categories, not verified local providers. Do not present the example towns, categories, or icons as evidence of available local providers. If substituting actual providers, verify care types, service areas, identity and any claims. Match the page to the advertised care category; the current examples focus on everyday help at home, not a complete senior-housing directory. The guidance medical-care branch provides general direction, not a clinical assessment.

Existing FAQ callback-hour and free-service copy must be checked against actual operations before production. The primary invitation intentionally makes no response-time promise. Confirm real consent/privacy language when integrating. No ad edits, launch, or merge is requested by this handoff.

## Research corrections to retain
- A Place for Mom's 2016 study measures first contact to move-in: half within 46 days. It does not establish 47 days before willingness to contact. Primary source: https://www.prnewswire.com/news-releases/new-data-reveal-half-of-families-spend-up-to-46-days-finding-a-senior-living-solution-but-seniors-searching-alone-take-nearly-twice-as-long-300298455.html
- Number of questions and number of steps are distinct variables. Multi-step evidence does not disprove simplifying the questions.
- Four engagers' early click times do not reveal what non-engagers did.
- Palette, sticky actions, and typography are hypotheses to evaluate, not guaranteed lifts.

## Verification performed
JavaScript syntax check passed. Browser checked mobile A and C layouts; exercised A details → contextual request → simulated success; exercised B questions → guidance → request context carryover. No production build or server submission was tested. Additional responsive/accessibility/API checks belong to integration review.

## Requested next work
Compare these V3 designs with the existing versions in ONE Claude artifact. Preserve the differences in behavior, not just the headings. Identify worthwhile improvements and integrate agreed designs into one preview implementation for review before merging. The goal is fast, meaningful learning from completed submissions.
