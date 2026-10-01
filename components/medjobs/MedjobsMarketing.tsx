import Image from "next/image";
import PartnerHelpCard from "@/components/medjobs/PartnerHelpCard";
import ApplyButton from "@/components/medjobs/ApplyButton";

/**
 * The static "understand" half of the converged /medjobs/families page.
 * Standardized to the olera.care home page design spec: max-w-7xl container,
 * pt-8 md:pt-12 pb-8 md:pb-12 rhythm, sans-bold section headings, alternating
 * white / gray-50 backgrounds. Sections (alternating gray/white): How it works
 * for students, Day to day, For advisors, FAQ, and the closer.
 */

const HOW_IT_WORKS = [
  {
    title: "Complete your profile",
    description: "Add your university, major, and semester availability. Upload a resume and record a short video intro.",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
      </svg>
    ),
  },
  {
    title: "Apply to caregiver jobs near your university",
    description: "Local home care agencies near your university review profiles and hire for a semester of recurring care or as needed (PRN).",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
      </svg>
    ),
  },
  {
    title: "Provide care while you're still in school",
    description: "Log real encounters, and build a healthcare experience transcript to help with your application to med, nursing, PA, or grad school.",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
      </svg>
    ),
  },
];

export default function MedjobsMarketing() {
  return (
    <>
      {/* How it works for students */}
      <section id="how-it-works" className="pt-8 md:pt-12 pb-8 md:pb-12 bg-gray-50/70 scroll-mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-start">
            <div className="aspect-[4/5] rounded-3xl overflow-hidden bg-gray-100 lg:sticky lg:top-24 shadow-xl shadow-gray-900/5">
              <Image src="/images/medjobs/student-portrait.jpg" alt="Pre-health student caregiver" width={600} height={800} className="w-full h-full object-cover" />
            </div>
            <div className="lg:py-4">
              <p className="text-sm tracking-widest uppercase text-primary-600 font-medium mb-3">How it works for students</p>
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
                From student to caregiver
              </h2>
              <div className="mt-10 space-y-0">
                {HOW_IT_WORKS.map((item, i) => (
                  <div key={item.title} className="py-7 border-t border-gray-200/80 first:border-t-0">
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-white shadow-sm border border-gray-100 text-primary-600 flex items-center justify-center">
                        {item.icon}
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 font-medium mb-1">Step {i + 1}</p>
                        <h3 className="text-base font-semibold text-gray-900">{item.title}</h3>
                        <p className="mt-1 text-[15px] text-gray-500 leading-relaxed">{item.description}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-10 flex flex-wrap items-center gap-4">
                <ApplyButton className="inline-flex items-center px-7 py-3 bg-primary-600 text-white text-sm font-semibold rounded-full hover:bg-primary-700 transition-colors">
                  Apply Now →
                </ApplyButton>
                <a
                  href="/docs/student-caregiver-agreement-sample.pdf"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-semibold text-primary-700 hover:underline"
                >
                  Read student agreement ↗
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Day to day — what the work actually is (image right) */}
      <section className="pt-8 md:pt-12 pb-8 md:pb-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            {/* Text — left */}
            <div>
              <p className="text-sm tracking-widest uppercase text-primary-600 font-medium mb-3">Day to day</p>
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900">What you&apos;ll actually do</h2>
              <p className="mt-4 text-lg text-gray-500 leading-relaxed">
                You&apos;re providing personal care services (PAS) and genuine human connection to help
                keep older adults safe at home.
              </p>
              <div className="mt-8 space-y-3">
                {[
                  { lead: "Personal care", detail: "bathing, dressing, grooming, and toileting" },
                  { lead: "Mobility", detail: "safe transfers, walking, and getting to appointments" },
                  { lead: "Medication reminders", detail: "plus light meal prep" },
                  { lead: "Companionship", detail: "conversation, games, and genuine connection" },
                  { lead: "Light housekeeping", detail: "laundry, tidying, and errands" },
                  { lead: "Monitoring & communication", detail: "watch for changes and update the care team" },
                ].map((task) => (
                  <div key={task.lead} className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                      <svg className="w-3.5 h-3.5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    </div>
                    <p className="text-[15px] text-gray-700">
                      <span className="font-medium text-gray-900">{task.lead}</span> — {task.detail}
                    </p>
                  </div>
                ))}
              </div>
              <div className="mt-8 p-4 rounded-xl bg-primary-50 border border-primary-100">
                <p className="text-sm text-gray-600 leading-relaxed">
                  <span className="font-semibold text-gray-900">No license required (for most positions).</span>{" "}
                  Partnering agencies provide free on-the-job training before your first shift.
                </p>
              </div>
            </div>

            {/* Photo mosaic — right */}
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-7 aspect-[3/4] rounded-2xl overflow-hidden bg-gray-100">
                <Image src="/images/medjobs/caregiving-support.jpg" alt="Student providing companion care to a senior" width={500} height={667} className="w-full h-full object-cover" />
              </div>
              <div className="col-span-5 space-y-3">
                <div className="aspect-square rounded-2xl overflow-hidden bg-gray-100">
                  <Image src="/images/medjobs/students-group.jpg" alt="Student caregivers together" width={400} height={400} className="w-full h-full object-cover" />
                </div>
                <div className="aspect-[4/5] rounded-2xl overflow-hidden bg-gray-100">
                  <Image src="/images/medjobs/college-caregivers.png" alt="College student caregiver" width={400} height={500} className="w-full h-full object-cover" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* For advisors, faculty & student orgs */}
      <section id="help" className="pt-8 md:pt-12 pb-8 md:pb-12 bg-gray-50/70 scroll-mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:grid lg:grid-cols-[1fr_2fr] lg:gap-12 lg:items-stretch">
            <div className="mb-8 lg:mb-0">
              <p className="text-sm tracking-widest uppercase text-primary-600 font-medium mb-3">
                For advisors, faculty &amp; student orgs
              </p>
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
                Help your pre-health students find this
              </h2>
              <p className="mt-4 text-gray-500 leading-relaxed">
                Paid caregiving jobs that earn healthcare experience, recommendation letters, and
                stories for personal statements and interviews.
              </p>
              <a
                href="/docs/student-caregiver-agreement-sample.pdf"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex items-center text-sm font-semibold text-primary-700 hover:underline"
              >
                Read student agreement ↗
              </a>
            </div>
            <PartnerHelpCard />
          </div>
        </div>
      </section>

      {/* FAQ — flat, centered */}
      <section className="pt-8 md:pt-12 pb-8 md:pb-12">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 text-center mb-10">
            Common questions
          </h2>
          <div className="divide-y divide-gray-200 border-t border-gray-200">
            {[
              {
                q: "Do I need any certifications or experience?",
                a: "No, most students don't, but employers train them before their first shift.",
              },
              {
                q: "How many hours per week do I commit to?",
                a: "You and the agency agree on a recurring schedule that fits your classes, or you may be hired as needed or on call. Local home care agencies are vetted on whether they are student-friendly and expect school to come first. In return, it is your responsibility to be upfront about your availability and to update your employer promptly if anything changes once you have committed to a shift.",
              },
              {
                q: "When and how do I get paid?",
                a: "You're paid by the local home care agency that hires you, not by Olera. They pay through their own payroll, and your rate is set with them before you start.",
              },
              {
                q: "What if I've never worked with seniors before?",
                a: "Many students haven't. Many have cared for family members, younger or older, and some have worked directly with seniors. Your local home care agency will train you and give you the resources you need — and it is experience you will draw on for the rest of a healthcare career, where you will certainly work with older adults.",
              },
              {
                q: "Is it really paid?",
                a: "Yes, these are paid caregiving roles, not volunteering or shadowing. You earn real caregiving hours and get paid for them.",
              },
            ].map((item) => (
              <details key={item.q} className="group py-5">
                <summary className="flex items-center justify-between cursor-pointer list-none gap-4">
                  <h3 className="text-base font-semibold text-gray-900">{item.q}</h3>
                  <svg className="w-5 h-5 text-gray-400 flex-shrink-0 group-open:rotate-180 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </summary>
                <p className="mt-3 text-[15px] text-gray-500 leading-relaxed">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Closer */}
      <section className="relative py-16 md:py-20 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-white via-primary-50/30 to-primary-50/50" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 tracking-tight">
            Your healthcare career <span className="text-primary-600">starts here</span>
          </h2>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <ApplyButton className="inline-flex items-center px-8 py-3.5 bg-primary-600 text-white text-sm font-semibold rounded-full hover:bg-primary-700 transition-colors shadow-sm shadow-primary-600/20">
              Apply Now →
            </ApplyButton>
            <a
              href="/docs/student-caregiver-agreement-sample.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold text-primary-700 hover:underline"
            >
              Read student agreement ↗
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
