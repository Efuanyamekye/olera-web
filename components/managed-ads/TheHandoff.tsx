/**
 * The communication and qualification section.
 *
 * ACCURACY GUARDRAILS — read before editing a word of this.
 *  - The city-ads family channel is SMS. There is no family email in that flow.
 *  - Ad Boost provider messages are email. There is no Ad Boost SMS.
 *  - The sequential provider relay (blind offer, 30 minutes, next provider) is
 *    built and wired but DORMANT: both live metros run concierge routing, where
 *    a person calls every family. It is described here as what happens when a
 *    city is switched over, never as what happens today.
 *  - Day-5 and day-14 Slack reads do not exist. Do not list them.
 * Verified against lib/city-ads/*, lib/sms/templates.ts, lib/ad-boost/* on
 * 2026-09-07.
 */

const FAMILY = [
  {
    title: "Four questions, and the phone number last",
    body:
      "Who needs care, what kind of help, how soon, and where to reach them. Nothing a provider would not need on the first call, and contact details come last. A confirmation text goes out within seconds so nobody wonders whether it worked.",
  },
  {
    title: "Written permission, with the proof kept",
    body:
      "The family ticks an unticked box agreeing to be contacted, and we store the timestamp, the address it came from and the exact wording they agreed to. Consent is never a condition of getting help.",
  },
  {
    title: "A family who needs a nurse is told the truth",
    body:
      "If someone picks skilled nursing or medical care, we say plainly that it is not what Olera arranges, point them at a home health referral through their doctor or discharge planner, and note that Medicare usually covers it. That request is never sent to a provider. It would waste your time and it is not what they need.",
  },
];

const PROVIDER = [
  {
    title: "You are asked before you are given anything",
    body:
      "The first message carries the type of care, the area, how urgent it is and how it would be paid for. It does not carry the family's name or number. Those move only when you say yes, and passing costs you one digit.",
  },
  {
    title: "One provider at a time, not a blast",
    body:
      "A request goes to one provider, with thirty minutes to take it, then the next. Nobody is racing three agencies to a phone call, and the family is never handed round.",
  },
  {
    title: "We check whether the call actually happened",
    body:
      "The next day we ask the family whether you reached them. On day seven and again on day twenty one we ask you whether they became a client. One tap. It is the only honest measure of whether any of this worked, and it cannot be asked later.",
  },
];

function Column({ heading, blurb, items }: { heading: string; blurb: string; items: typeof FAMILY }) {
  return (
    <div>
      <h3 className="font-serif text-display-xs font-bold text-gray-900">{heading}</h3>
      <p className="mt-2 text-text-sm leading-relaxed text-gray-600">{blurb}</p>
      <div className="mt-6 divide-y divide-gray-200 border-t border-gray-200">
        {items.map((i) => (
          <div key={i.title} className="py-5">
            <h4 className="text-text-md font-semibold text-gray-900">{i.title}</h4>
            <p className="mt-1.5 text-text-sm leading-relaxed text-gray-600">{i.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TheHandoff() {
  return (
    <section className="bg-gray-50 px-4 py-16 sm:px-6 md:py-24 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <h2 className="max-w-3xl font-serif text-display-sm font-bold text-gray-900 md:text-display-md">
          The click is the easy part
        </h2>
        <p className="mt-3 max-w-2xl text-text-md text-gray-600">
          Most of what decides whether an ad turns into a client happens after it. So we built that
          part too, on both sides.
        </p>

        <div className="mt-10 grid gap-10 md:grid-cols-2 md:gap-14">
          <Column
            heading="What the family gets"
            blurb="Texts, in plain language, at hours a person would actually send them."
            items={FAMILY}
          />
          <Column
            heading="What you get"
            blurb="Enough to decide, and nothing you have to chase."
            items={PROVIDER}
          />
        </div>

        <div className="mt-10 rounded-xl border border-gray-200 bg-white p-6 sm:p-8">
          <h3 className="font-serif text-text-lg font-bold text-gray-900">There is always a person</h3>
          <p className="mt-2 max-w-3xl text-text-sm leading-relaxed text-gray-600">
            In both metros running right now, someone at Olera personally calls every family who
            asks for help, before any of the automatic routing is switched on. Nothing is
            promised to a family that a named human is not on the hook for, and every failure in
            the chain pages a person rather than retrying quietly. The automatic relay described
            above is built and turns on one city at a time, once providers there have agreed in
            writing to take the calls.
          </p>
        </div>
      </div>
    </section>
  );
}
