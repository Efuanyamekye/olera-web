/**
 * Operating discipline, condensed.
 *
 * This was four prose blocks and a boxed aside. Both external reviews said the
 * same thing: the discipline is the product, the essay about the discipline is
 * not the closer. Same five facts, a fifth of the words, and it now sits after
 * the reader has seen the product and the numbers.
 */

const RULES = [
  {
    title: "Every live campaign, every three to four days",
    body: "A two-week flight has about three useful checks in it before the money is gone.",
  },
  {
    title: "Every change carries the result we expect and a date to check it",
    body: "The database refuses to store one without both, so a change that did not work cannot be quietly forgotten.",
  },
  {
    title: "One change at a time, then wait",
    body: "Filters first, forty eight hours, re-read, then keywords. Slower on purpose: change two things and nobody can say which worked.",
  },
  {
    title: "We know the difference between a bad result and no result",
    body: "A small budget produces a zero often enough that a zero is not evidence of anything, so we will not redesign your campaign because of one. Zero impressions is the number that means something is broken.",
  },
  {
    title: "We look at your page before we buy a single click",
    body: "On one batch of four providers, all four passed an automatic has-photos check and all four had a problem worth fixing first: a hero image that was a photograph of a printed brochure, a home care agency showing a facility dining hall, and a care home whose second photo was a crock pot. Reordering is usually the fix, and it costs nothing.",
  },
];

export default function TheLoop() {
  return (
    <section className="bg-white px-4 py-16 sm:px-6 md:py-24 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <h2 className="max-w-3xl font-serif text-display-sm font-bold text-gray-900 md:text-display-md">
          What managed actually means here
        </h2>
        <p className="mt-3 max-w-2xl text-text-md text-gray-600">
          Campaigns do not drift because nobody cares. They drift because the platform changes
          things on its own and nothing tells you.
        </p>

        <div className="mt-8 divide-y divide-gray-200 border-t border-gray-200">
          {RULES.map((r) => (
            <div key={r.title} className="py-4 sm:flex sm:gap-8">
              <div className="text-text-md font-semibold text-gray-900 sm:w-2/5 sm:shrink-0">
                {r.title}
              </div>
              <p className="mt-1 text-text-sm leading-relaxed text-gray-600 sm:mt-0">{r.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
