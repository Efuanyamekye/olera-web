/**
 * The dual-ad-system section.
 *
 * Providers hear "we run ads" and picture one thing. We run two, they do
 * different jobs, and the difference is the most useful thing on this page:
 * one builds recognition for a name, the other is engineered only to capture a
 * request. Saying which is better at what is more persuasive than claiming
 * either is best at everything.
 *
 * Accuracy note: both live city campaigns are concierge-routed today, meaning a
 * person at Olera calls every family. The automatic relay is built and switches
 * on per city. This section must not describe the relay as what happens now.
 */

const ENGINES = [
  {
    kicker: "Engine one",
    title: "Ads pointed at your page",
    lede: "A family searching for care in your town lands on your Olera profile: your name, your photos, your reviews, your service area.",
    points: [
      "They see your business before they see a form. This is the engine that builds recognition for your name.",
      "Some of them inquire on the spot. What that has actually cost us per inquiry is a few screens down, in full.",
      "The inquiry lands in your Olera inbox and we email you the moment it does.",
    ],
  },
  {
    kicker: "Engine two",
    title: "Ads pointed at a page built to convert",
    lede: "Olera buys the ad for a whole metro and lands the family on a page with one job: capture a care request and get it to a provider who calls back.",
    points: [
      "Everything that could distract from the request was removed, down to the phone number and the navigation.",
      "Olera funds this one. We are spending our own money to find out what a page built purely to convert is worth.",
      "It is running in two metros now. A person at Olera calls every family personally while we prove the routing.",
    ],
  },
];

export default function TwoEngines() {
  return (
    <section className="bg-white px-4 py-16 sm:px-6 md:py-24 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <h2 className="max-w-3xl font-serif text-display-sm font-bold text-gray-900 md:text-display-md">
          Two different ads, doing two different jobs
        </h2>
        <p className="mt-3 max-w-2xl text-text-md text-gray-600">
          Most providers only ever get offered the first one. Running both is how we tell a
          traffic problem apart from a page problem.
        </p>

        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {ENGINES.map((e) => (
            <div
              key={e.title}
              className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-all duration-200 hover:border-gray-300 hover:shadow-md sm:p-8"
            >
              <div className="text-text-xs font-semibold uppercase tracking-wider text-primary-700">
                {e.kicker}
              </div>
              <h3 className="mt-2 font-serif text-display-xs font-bold text-gray-900">{e.title}</h3>
              <p className="mt-3 text-text-md leading-relaxed text-gray-600">{e.lede}</p>
              <ul className="mt-5 space-y-3">
                {e.points.map((p) => (
                  <li key={p} className="flex gap-3 text-text-sm leading-relaxed text-gray-600">
                    <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-primary-400" />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
