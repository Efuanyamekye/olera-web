import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { allStates } from "@/data/waiver-library";
import { allEpisodes } from "@/lib/aging-in-america-data";
import { USMap } from "@/components/waiver-library/USMap";
import { StateSearchProvider } from "@/components/waiver-library/StateSearchContext";
import { ContentViewTracker } from "@/components/analytics/ContentViewTracker";
import { HubSearchBar } from "@/components/benefits/hub/HubSearchBar";
import { HubStateList } from "@/components/benefits/hub/HubStateList";
import { LocateButton } from "@/components/benefits/hub/LocateButton";
import { FinderLink } from "@/components/benefits/hub/FinderLink";
import type { HubState } from "@/components/benefits/hub/hub-links";

export const metadata: Metadata = {
  title: "Senior Benefit Programs by State | Olera",
  description:
    "Find HCBS and long-term care Medicaid waivers by state. Explore programs, eligibility requirements, and application steps for seniors and adults with disabilities.",
  alternates: { canonical: "/senior-benefits" },
  openGraph: {
    title: "Senior Benefit Programs by State | Olera",
    description:
      "Find HCBS and long-term care Medicaid waivers by state. Explore programs, eligibility, and application steps.",
    url: "/senior-benefits",
    siteName: "Olera",
    type: "website",
  },
};

/**
 * NIH award number for the acknowledgment at the foot of the page. NIH policy
 * asks for the number in any acknowledgment of support; the sentence renders
 * without it until it is filled in.
 */
const NIH_AWARD_NUMBER = "";

/** Month the program data was last reviewed, shown in the hero trust line. */
const DATA_UPDATED = "September 2026";

const STORY_SLUGS = ["carol-dean", "who-takes-care-of-the-caregiver", "stay-at-home-vs-assisted-living"];

const STEPS = [
  { title: "Answer 4 questions", detail: "About 2 minutes, no account" },
  { title: "Get your first call", detail: "Who to call, what to say, what to have nearby" },
  { title: "Text us if you're stuck", detail: "A real person replies" },
];

export default function BenefitsHubPage() {
  const hubStates: HubState[] = allStates
    .map((s) => ({ id: s.id, name: s.name, abbreviation: s.abbreviation, count: s.programs.length }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const totalPrograms = hubStates.reduce((sum, s) => sum + s.count, 0);
  const stories = STORY_SLUGS.map((slug) => allEpisodes.find((e) => e.slug === slug)).filter(
    (e): e is NonNullable<typeof e> => !!e && e.status === "published",
  );

  return (
    <StateSearchProvider>
      <div className="min-h-[100dvh] bg-vanilla-100 text-gray-900">
        <ContentViewTracker page="/senior-benefits" />

        {/* Hero: what the page does, one way in on phones, the search bar on desktop. */}
        <section className="mx-auto grid max-w-7xl items-center gap-8 px-5 pb-12 pt-8 sm:px-6 md:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] md:gap-12 md:pb-16 md:pt-14 lg:px-8">
          <div className="flex flex-col gap-4">
            <p className="hidden text-xs font-semibold uppercase tracking-[0.08em] text-gray-600 md:block">Free · No account</p>
            <h1 className="font-display text-[34px] leading-[1.08] sm:text-5xl lg:text-[56px]">
              Find help paying for care and bills
            </h1>
            <p className="text-[17px] text-gray-600 md:text-lg">There&apos;s more help out there than most people know.</p>

            <div className="mt-2 hidden md:block">
              <HubSearchBar states={hubStates} />
            </div>
            <p className="hidden text-[15px] text-gray-600 md:block">
              <span className="font-semibold text-gray-900">{totalPrograms} programs</span> · All {hubStates.length} states · Updated {DATA_UPDATED}
            </p>

            <div className="mt-2 flex flex-col gap-2 md:hidden">
              <FinderLink
                id="hero"
                className="flex min-h-[56px] items-center justify-center gap-1.5 rounded-2xl bg-primary-700 text-[17px] font-semibold text-white active:bg-primary-800"
              >
                Get your plan <span className="font-medium text-white/80">· 2 min</span>
              </FinderLink>
              <p className="text-center text-sm text-gray-500">Free · No account</p>
            </div>
          </div>

          <figure className="flex flex-col gap-2">
            <div className="relative aspect-[4/3] overflow-hidden rounded-[20px] md:aspect-[5/4]">
              <Image
                src="/images/benefits-hub/aging-in-america-ch3.jpg"
                alt="An older woman brushing her husband's hair at home"
                fill
                priority
                sizes="(min-width: 768px) 45vw, 100vw"
                className="object-cover"
                style={{ objectPosition: "42% center" }}
              />
            </div>
            <figcaption className="text-[13px] text-gray-500">
              From Olera&apos;s <Link href="/aging-in-america" className="italic underline-offset-2 hover:underline">Aging in America</Link> series
            </figcaption>
          </figure>
        </section>

        {/* States: the map on desktop, a searchable list on phones. */}
        <section id="states" className="mx-auto max-w-7xl px-5 pb-4 sm:px-6 md:pb-16 lg:px-8">
          <div className="hidden flex-col items-center gap-3 text-center md:flex">
            <h2 className="font-display text-4xl">Senior benefit programs by state</h2>
            <p className="text-[17px] text-gray-600">Pick your state to see its programs.</p>
            <div className="mt-2">
              <LocateButton states={hubStates} variant="pill" />
            </div>
          </div>
          <div className="hidden md:block">
            {/* The map's drawing carries empty space under the lower 48; pull the A to Z link up into it. */}
            <div className="-mb-16">
              <USMap states={allStates} />
            </div>
            <details className="relative mx-auto max-w-5xl">
              <summary className="cursor-pointer text-center text-[15px] font-semibold text-primary-800">
                Or pick from all {hubStates.length} states, A to Z
              </summary>
              <div className="mt-6">
                <HubStateList states={hubStates} all />
              </div>
            </details>
          </div>

          <div className="flex flex-col gap-4 border-t border-gray-200 pt-8 md:hidden">
            <h2 className="font-display text-[26px] leading-tight">Or go straight to your state</h2>
            <LocateButton states={hubStates} variant="link" />
            <HubStateList states={hubStates} withSearch />
          </div>
        </section>

        {/* What you'll get: show the plan, not a description of it. */}
        <section className="mx-auto grid max-w-7xl items-center gap-10 px-5 py-14 sm:px-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] md:gap-16 md:py-20 lg:px-8">
          <div>
            <h2 className="font-display text-[34px] leading-[1.08] md:text-[44px]">
              One plan.
              <br />
              One call to make.
            </h2>
            <ol className="mt-7 flex flex-col">
              {STEPS.map((step, i) => (
                <li key={step.title} className="relative grid grid-cols-[36px_minmax(0,1fr)] gap-x-4 pb-5 last:pb-0">
                  {i < STEPS.length - 1 && <span aria-hidden="true" className="absolute bottom-1 left-[17px] top-9 w-[1.5px] bg-primary-100" />}
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-primary-50 text-[15px] font-semibold text-primary-800">{i + 1}</span>
                  <div className="pt-1">
                    <p className="text-lg font-semibold leading-snug">{step.title}</p>
                    <p className="text-base text-gray-600">{step.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-6 max-w-[44ch] text-[15px] text-gray-500">
              Covers care at home, food, power bills, Medicare costs, caregiver help and cash.
            </p>
            <FinderLink
              id="plan_section"
              className="mt-6 inline-flex min-h-[54px] items-center gap-1.5 rounded-2xl bg-primary-700 px-7 text-[17px] font-semibold text-white hover:bg-primary-800"
            >
              Get your plan <span className="font-medium text-white/80">· 2 min</span>
            </FinderLink>
          </div>

          <div>
            <div aria-label="A sample plan" className="flex flex-col gap-4 rounded-3xl bg-white p-6 shadow-[0_30px_60px_-30px_rgba(35,64,64,0.35),0_2px_6px_rgba(0,0,0,0.04)] sm:p-7">
              <p className="text-xs font-semibold uppercase tracking-[0.04em] text-gray-500">Your first step</p>
              <p className="font-display text-[26px] leading-tight sm:text-[28px]">Call the Alamo Area Agency on Aging</p>
              <p className="text-[15px] text-gray-600">
                You care for a parent in Bexar County. They help families get paid help at home, and it&apos;s free to ask.
              </p>
              <div aria-hidden="true" className="flex min-h-[52px] items-center justify-center gap-2.5 rounded-2xl bg-primary-700 font-semibold text-white">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                  <path d="M6.6 10.8a15.2 15.2 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1Z" />
                </svg>
                Call now
              </div>
              <div className="flex items-center gap-3 rounded-2xl bg-vanilla-100 px-4 py-3 text-[15px]">
                <img src="/images/benefits-hub/clipboard.svg" alt="" className="h-7 w-7 shrink-0" />
                Have their Medicare card nearby.
              </div>
              <p className="mt-1 text-[13px] font-semibold text-gray-500">Also likely to qualify</p>
              <div className="flex flex-col">
                {[
                  { icon: "basket", name: "SNAP food benefits", line: "Help buying groceries each month" },
                  { icon: "stethoscope", name: "Medicare Savings Program", line: "Can pay the Part B premium" },
                ].map((row) => (
                  <div key={row.name} className="flex items-center gap-3.5 border-t border-gray-100 py-2.5">
                    <img src={`/images/benefits-hub/${row.icon}.svg`} alt="" className="h-8 w-8 shrink-0" />
                    <div>
                      <p className="text-[15px] font-semibold">{row.name}</p>
                      <p className="text-sm text-gray-500">{row.line}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <p className="mt-3 text-center text-[13px] text-gray-500">A sample plan for a caregiver in San Antonio</p>
          </div>
        </section>

        {/* Stories: a change of scene, the human part of the page. */}
        {stories.length > 0 && (
          <section className="bg-[#EFE6DA]">
            <div className="mx-auto flex max-w-7xl flex-col gap-7 px-5 py-14 sm:px-6 md:py-20 lg:px-8">
              <div>
                <h2 className="font-display text-[28px] leading-tight md:text-4xl">Stories from families who&apos;ve been there</h2>
                <p className="mt-1.5 text-base text-gray-600">
                  From Olera&apos;s <i>Aging in America</i> series.
                </p>
              </div>
              <div className="-mx-5 flex snap-x snap-mandatory scroll-px-5 gap-4 overflow-x-auto px-5 pb-1 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-[1.35fr_1fr_1fr] md:items-start md:gap-5 md:overflow-visible md:px-0">
                {stories.map((ep, i) => (
                  <Link
                    key={ep.slug}
                    href={`/aging-in-america/${ep.slug}`}
                    className="group flex w-[78%] shrink-0 snap-start flex-col gap-2 md:w-auto"
                  >
                    <div className="relative aspect-video overflow-hidden rounded-[18px]">
                      <Image
                        src={ep.thumbnailUrl}
                        alt=""
                        fill
                        sizes="(min-width: 768px) 33vw, 80vw"
                        className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                      />
                    </div>
                    <p className={i === 0 ? "font-display text-[22px] leading-tight" : "text-[17px] font-semibold leading-snug"}>
                      {ep.title.split(" | ")[0]}
                    </p>
                    <p className="text-sm text-gray-500">
                      {ep.subject ? `${ep.subject} · ` : ""}
                      {ep.topics[0]}
                    </p>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Close */}
        <section className="mx-auto flex max-w-7xl flex-col items-center gap-5 px-5 py-16 text-center sm:px-6 md:py-20 lg:px-8">
          <h2 className="font-display text-[32px] leading-tight md:text-[40px]">Ready when you are</h2>
          <FinderLink
            id="close"
            className="inline-flex min-h-[54px] items-center gap-1.5 rounded-2xl bg-primary-700 px-7 text-[17px] font-semibold text-white hover:bg-primary-800"
          >
            Get your plan <span className="font-medium text-white/80">· 2 min</span>
          </FinderLink>
        </section>

        <div className="mx-auto max-w-7xl px-5 pb-12 sm:px-6 lg:px-8">
          <div className="flex max-w-3xl flex-col gap-1 border-t border-gray-200 pt-6 text-[13px] leading-relaxed text-gray-500">
            <p>Olera helps you find and understand programs. Each program decides who qualifies and provides the help.</p>
            <p>
              Olera&apos;s benefits guide is supported in part by the National Institute on Aging of the National Institutes of Health
              {NIH_AWARD_NUMBER ? ` under award number ${NIH_AWARD_NUMBER}` : ""}. The content is solely the responsibility of Olera and
              does not necessarily represent the official views of the National Institutes of Health.
            </p>
          </div>
        </div>
      </div>
    </StateSearchProvider>
  );
}
