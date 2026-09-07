/**
 * The section that shows the product instead of describing it.
 *
 * Both external reviews landed on the same gap: the page spent paragraphs on
 * pages nobody had seen, and asked the reader to buy an invisible machine.
 *
 * These are rendered examples, not screenshots, and they are labelled as
 * examples. Everything structural in them is real: the display path is the one
 * the campaigns actually use (Home-Care / {City}), the headline and description
 * limits are Google's, the four questions and their order are the live ones
 * from app/care/[city]/CityLandingClient.tsx, and the inquiry card carries the
 * fields a provider genuinely receives. The agency name is a placeholder on
 * purpose — inventing a plausible one would read as a client we do not have.
 */

function AdMock() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2 text-text-xs text-gray-500">
        <span className="rounded bg-gray-100 px-1.5 py-0.5 font-semibold text-gray-700">Sponsored</span>
        <span className="truncate">olera.care/Home-Care/Concord</span>
      </div>
      <div className="mt-2 text-text-lg font-medium leading-snug text-[#1a0dab]">
        Your Agency Name — Home Care in Concord
      </div>
      <p className="mt-1 text-text-sm leading-relaxed text-gray-600">
        Caregivers for bathing, meals and medication reminders. Hourly or live-in. Serving Concord,
        Harrisburg and Kannapolis. See photos, services and reviews.
      </p>
      <p className="mt-3 border-t border-gray-100 pt-3 text-text-xs leading-relaxed text-gray-500">
        No phone number and no URL in the text: both are refused under Google&apos;s policy for this
        category. Headlines cap at 30 characters and descriptions at 90, and we write thirteen and
        four of them so Google can pick.
      </p>
    </div>
  );
}

function ProfileMock() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex gap-3">
        <div className="h-14 w-14 shrink-0 rounded-lg bg-gradient-to-br from-primary-200 to-primary-400" />
        <div className="min-w-0">
          <div className="font-serif text-text-lg font-bold text-gray-900">Your Agency Name</div>
          <div className="text-text-sm text-gray-500">In-home care · Concord, NC</div>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {["State Licensed", "Est. 2014", "Well Reviewed", "Background-Checked"].map((h) => (
          <span
            key={h}
            className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-text-xs font-medium text-gray-600"
          >
            {h}
          </span>
        ))}
      </div>
      <div className="mt-4 rounded-lg bg-primary-600 px-4 py-2.5 text-center text-text-sm font-semibold text-white">
        Contact this provider
      </div>
      <p className="mt-3 text-text-xs leading-relaxed text-gray-500">
        Your own page, with your photos and services. Those badges are earned from license and
        review data, never typed in.
      </p>
    </div>
  );
}

function RequestPageMock() {
  const steps = [
    { q: "Who needs care?", a: ["My parent", "My spouse", "Me", "Someone else"] },
    { q: "What kind of help?", a: ["Help at home", "Assisted living", "Not sure yet"] },
    { q: "How soon?", a: ["This week", "This month", "Planning ahead"] },
    { q: "Where should they call?", a: ["First name, mobile, ZIP"] },
  ];
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="h-1 w-full overflow-hidden rounded-full bg-gray-100">
        <div className="h-full w-1/4 rounded-full bg-primary-500" />
      </div>
      <div className="mt-4 space-y-3">
        {steps.map((s, i) => (
          <div key={s.q} className={i === 0 ? "" : "opacity-45"}>
            <div className="text-text-sm font-semibold text-gray-900">{s.q}</div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {s.a.map((a) => (
                <span
                  key={a}
                  className="rounded-full border border-gray-300 px-2.5 py-1 text-text-xs text-gray-600"
                >
                  {a}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-4 text-text-xs leading-relaxed text-gray-500">
        One question per screen, contact details last, and a tick box for permission to call that
        starts unticked. A family who picks nursing or medical care is told plainly that it is not
        what we arrange, and pointed at a home health referral instead.
      </p>
    </div>
  );
}

function InquiryMock() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="text-text-xs font-semibold uppercase tracking-wider text-primary-700">
        New family inquiry
      </div>
      <div className="mt-3 space-y-2 text-text-sm">
        {[
          ["Care needed", "Help at home, weekday mornings"],
          ["For", "A parent"],
          ["Starting", "This week"],
          ["Area", "Concord, 28025"],
        ].map(([k, v]) => (
          <div key={k} className="flex gap-3">
            <span className="w-24 shrink-0 text-gray-500">{k}</span>
            <span className="text-gray-900">{v}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-lg border border-gray-900 bg-gray-900 px-4 py-2.5 text-center text-text-sm font-semibold text-white">
        Open and reply
      </div>
      <p className="mt-3 text-text-xs leading-relaxed text-gray-500">
        Lands in your Olera inbox and your email the moment it happens, with enough detail to
        decide whether to call before you open anything.
      </p>
    </div>
  );
}

export default function WhatItLooksLike() {
  return (
    <section className="bg-gray-50 px-4 py-16 sm:px-6 md:py-24 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <h2 className="max-w-3xl font-serif text-display-sm font-bold text-gray-900 md:text-display-md">
          What it actually looks like
        </h2>
        <p className="mt-3 max-w-2xl text-text-md text-gray-600">
          The ad a family sees, the page it opens, and what reaches you. Rendered examples, with a
          placeholder where your name goes.
        </p>

        <div className="mt-10 space-y-10">
          <div>
            <h3 className="text-text-xs font-semibold uppercase tracking-wider text-gray-500">
              Step one · the ad
            </h3>
            <div className="mt-3 max-w-2xl">
              <AdMock />
            </div>
          </div>

          <div>
            <h3 className="text-text-xs font-semibold uppercase tracking-wider text-gray-500">
              Step two · where it takes them
            </h3>
            <div className="mt-3 grid gap-5 md:grid-cols-2">
              <div>
                <div className="mb-2 text-text-sm font-semibold text-gray-900">
                  Engine one · your Olera page
                </div>
                <ProfileMock />
              </div>
              <div>
                <div className="mb-2 text-text-sm font-semibold text-gray-900">
                  Engine two · a page built only to capture the request
                </div>
                <RequestPageMock />
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-text-xs font-semibold uppercase tracking-wider text-gray-500">
              Step three · what reaches you
            </h3>
            <div className="mt-3 max-w-md">
              <InquiryMock />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
