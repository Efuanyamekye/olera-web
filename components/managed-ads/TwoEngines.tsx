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

/**
 * THE TWO DIAGRAMS
 *
 * Hand-drawn SVG, no library and no image asset, so they stay sharp and cost
 * nothing to load. They sit above the bullets because the difference between
 * these two destinations is *structural*, and structure is the one thing prose
 * has to spend three bullets on and a picture lands before you read a word.
 *
 * WHAT THEY DRAW, AND WHY IT IS NOT A DIAGRAM OF NOUNS
 * Both frames are the same size, so the contrast is density: the provider page
 * carries about sixteen elements and the request page carries six. That is not
 * a metaphor for the difference, it IS the difference — one page is a
 * storefront a family browses, the other shows one question at a time and is
 * built to be finished. Every shape corresponds to something really on those
 * pages: the nav bar the request page deliberately does not have, the photo
 * grid, the badges, the review rows, the four questions, the progress dots
 * (one question per screen, per app/care/[city]/CityLandingClient.tsx).
 *
 * The single filled element in each is the conversion action, in primary-600.
 * On the left it is small and sits among fifteen other things; on the right it
 * is wide and it is most of the page. That is the whole argument of this
 * section, encoded as size and position rather than asserted in a caption.
 *
 * If you edit these, keep them honest: do not add an element to the request
 * page that the live page does not have, and do not tidy the provider page
 * into something calmer than it is.
 */

const FILL_FAINT = "#F3F4F6"; // gray-100 — greeked content
const FILL_MID = "#E5E7EB"; // gray-200 — structural blocks
const FILL_EDGE = "#D1D5DB"; // gray-300 — frame
const FILL_ACTION = "#4d8a8a"; // primary-600 — the conversion point

function ProviderPageDiagram() {
  return (
    <svg
      viewBox="0 0 480 150"
      className="h-auto w-full"
      role="img"
      aria-label="A provider profile page: a navigation bar, photo grid, name, badges, review rows and body text, with a small contact button among them."
    >
      <rect x="0.5" y="0.5" width="479" height="149" rx="7" fill="#fff" stroke={FILL_EDGE} />
      {/* nav bar — the request page pointedly does not have one */}
      <rect x="1" y="1" width="478" height="19" rx="6" fill={FILL_FAINT} />
      <rect x="12" y="8" width="34" height="5" rx="2.5" fill={FILL_EDGE} />
      {[300, 340, 380, 420].map((x) => (
        <rect key={x} x={x} y="8" width="26" height="5" rx="2.5" fill={FILL_MID} />
      ))}
      {/* photo grid */}
      <rect x="14" y="32" width="122" height="70" rx="4" fill={FILL_MID} />
      <rect x="14" y="108" width="58" height="28" rx="4" fill={FILL_MID} />
      <rect x="78" y="108" width="58" height="28" rx="4" fill={FILL_MID} />
      {/* name and subtitle */}
      <rect x="152" y="34" width="150" height="9" rx="4.5" fill={FILL_EDGE} />
      <rect x="152" y="49" width="96" height="6" rx="3" fill={FILL_FAINT} />
      {/* badges */}
      {[152, 208, 258].map((x, i) => (
        <rect key={x} x={x} y="65" width={i === 1 ? 44 : 50} height="12" rx="6" fill={FILL_FAINT} />
      ))}
      {/* review rows */}
      {[88, 106, 124].map((y) => (
        <g key={y}>
          <circle cx="159" cy={y + 5} r="7" fill={FILL_MID} />
          <rect x="172" y={y + 2} width="118" height="6" rx="3" fill={FILL_FAINT} />
        </g>
      ))}
      {/* body text */}
      <rect x="310" y="88" width="86" height="6" rx="3" fill={FILL_FAINT} />
      <rect x="310" y="100" width="70" height="6" rx="3" fill={FILL_FAINT} />
      <rect x="310" y="112" width="80" height="6" rx="3" fill={FILL_FAINT} />
      {/* the conversion action: small, and one of sixteen things */}
      <rect x="310" y="126" width="62" height="14" rx="7" fill={FILL_ACTION} />
    </svg>
  );
}

function RequestPageDiagram() {
  return (
    <svg
      viewBox="0 0 480 150"
      className="h-auto w-full"
      role="img"
      aria-label="A request page: no navigation, one question, four answer options, a four-step progress indicator, and one wide button filling most of the page."
    >
      <rect x="0.5" y="0.5" width="479" height="149" rx="7" fill="#fff" stroke={FILL_EDGE} />
      {/* progress: one question per screen, four in total */}
      <g>
        {[0, 1, 2, 3].map((i) => (
          <rect
            key={i}
            x={186 + i * 28}
            y="26"
            width="20"
            height="4"
            rx="2"
            fill={i === 0 ? FILL_ACTION : FILL_MID}
          />
        ))}
      </g>
      {/* the one question on screen */}
      <rect x="150" y="50" width="180" height="10" rx="5" fill={FILL_EDGE} />
      {/* its four options */}
      {[
        [150, 62],
        [216, 50],
        [274, 56],
      ].map(([x, w]) => (
        <rect key={x} x={x} y="74" width={w} height="18" rx="9" fill={FILL_FAINT} />
      ))}
      <rect x="150" y="98" width="72" height="18" rx="9" fill={FILL_FAINT} />
      {/* the conversion action: wide, and most of what is here */}
      <rect x="234" y="98" width="96" height="18" rx="9" fill={FILL_ACTION} />
    </svg>
  );
}

const ENGINES = [
  {
    kicker: "Engine one",
    diagram: ProviderPageDiagram,
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
    diagram: RequestPageDiagram,
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

              {/* Above the prose on purpose: the difference is structural and
                  the picture lands before the first bullet is read. */}
              <div className="mt-5">
                <e.diagram />
              </div>

              <p className="mt-5 text-text-md leading-relaxed text-gray-600">{e.lede}</p>
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
