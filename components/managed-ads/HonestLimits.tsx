/**
 * The caveats, sitting directly under the numbers they qualify.
 *
 * Two changes from the first draft, both from outside review. It is no longer
 * the last thing on the page — as a closer it talked a sophisticated operator
 * into trusting us and everyone else into leaving. And the spend and inquiry
 * figures are now passed in from the same source the results strip reads,
 * because the hardcoded version quoted $535 and 255 clicks two screens under a
 * strip reading $298 and 146. Nothing on this page may state a number that
 * another part of this page contradicts.
 *
 * The Nextdoor figures stay literal: that pilot is closed, its numbers were
 * read at source on 2026-08-26, and they cannot drift.
 *
 * THE META LIMIT IS SCOPED ON PURPOSE — DO NOT SHORTEN IT
 * It used to read "we have never run a Meta campaign", which was true of
 * provider campaigns and false of Olera, and it broke the day TrackRecord
 * started showing $40,703 of our own Meta spend near the top of the page. The
 * claim that matters to a provider is that no Meta campaign has ever run *for a
 * provider*, and that is the sentence. Every channel this page names anywhere
 * must be accounted for here; that is this section's whole job.
 */
export default function HonestLimits({ spend, inquiries }: { spend: string | null; inquiries: number | null }) {
  const sample =
    spend && inquiries
      ? `${spend} of advertising has produced ${inquiries} family inquiries.`
      : "The whole program is a few hundred dollars of advertising and a handful of inquiries.";

  const LIMITS = [
    {
      title: "The sample is small",
      body: `${sample} That is a real rate measured on real money, and it is nowhere near enough to promise anything from. Treat it as evidence that the machine works, not as a forecast for your market.`,
    },
    {
      title: "One client, and our own system never saw it",
      body: "A provider told us on the phone that a family from her campaign became a client. Nothing in our platform recorded it. Of the other inquiries, one was an explicit no, one was not a fit, and four were never followed to a conclusion by anyone. That gap is why we now ask every provider, twice, whether a family became a client.",
    },
    {
      title: "The free campaign is a demonstration, not a market test",
      body: "Fifty dollars buys about 25 clicks, which is under one expected inquiry. It is there so you can watch the machine run on your own page and decide whether you want more of it.",
    },
    {
      title: "Nextdoor delivered cheap clicks and no leads",
      body: "Our one completed Nextdoor flight spent $50 for 8,318 impressions and 134 clicks at 37 cents each, a fifth of what a search click costs, and produced no contactable leads at all. Cheap attention is not demand, and we would rather tell you that than sell you the click price.",
    },
    {
      title: "No provider campaign has ever run on Meta",
      body: "Everything above was learned buying Google Search for providers, with one Nextdoor pilot alongside it. Olera's own advertising is a separate thing and a much longer history. That is where the caregiver figures at the top of this page come from, and not one dollar of it was spent on a provider's behalf. The first Meta campaigns pointed at our own city pages went live this week. We will publish what they do, including if they do nothing.",
    },
  ];

  return (
    <section className="bg-white px-4 pb-16 sm:px-6 md:pb-24 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-6 sm:p-10">
          <h2 className="font-serif text-display-xs font-bold text-gray-900 md:text-display-sm">
            What those numbers do not prove yet
          </h2>
          <p className="mt-2 max-w-2xl text-text-md text-gray-600">
            In the same detail as everything else on this page.
          </p>

          <div className="mt-8 grid gap-x-10 gap-y-6 sm:grid-cols-2">
            {LIMITS.map((l) => (
              <div key={l.title}>
                <h3 className="text-text-md font-semibold text-gray-900">{l.title}</h3>
                <p className="mt-1.5 text-text-sm leading-relaxed text-gray-600">{l.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
