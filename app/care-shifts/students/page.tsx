import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";

export const metadata: Metadata = {
  title: "Become a Student Caregiver — Earn $15–$25/hr | Olera Care Shifts",
  description:
    "Earn $15–$25/hr providing companion care to seniors. Build real patient-facing experience for med school, residency, and beyond — on a schedule that fits your classes.",
  openGraph: {
    title: "Become a Student Caregiver — Earn $15–$25/hr | Olera Care Shifts",
    description:
      "Real care experience. Real pay. Flexible hours for medical, nursing, and pre-health students.",
  },
};

const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Apply in 5 minutes",
    description:
      "Tell us about your school, your schedule, and what kind of care you're interested in. No resume required.",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15a2.25 2.25 0 0 1 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" />
      </svg>
    ),
  },
  {
    step: "02",
    title: "Get matched with families",
    description:
      "We match you with seniors in your area based on your availability, skills, and care preferences. You choose who you work with.",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
      </svg>
    ),
  },
  {
    step: "03",
    title: "Provide care, get paid weekly",
    description:
      "Visit seniors at home for companion care, light housekeeping, meal prep, and medication reminders. Earn $15–$25/hr with weekly direct deposit.",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" />
      </svg>
    ),
  },
];

const BENEFITS = [
  {
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
      </svg>
    ),
    title: "$15–$25/hr",
    description: "2–3x minimum wage. Weekly direct deposit. No fees, no middlemen.",
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
      </svg>
    ),
    title: "Your schedule, your rules",
    description: "Morning, evening, weekends — pick shifts that fit around your classes and exams.",
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 0v-3.675A55.378 55.378 0 0 1 12 8.443m-7.007 11.55A5.981 5.981 0 0 0 6.75 15.75v-1.5" />
      </svg>
    ),
    title: "Real clinical experience",
    description: "Patient-facing hours that count for AMCAS, CASPA, and nursing school applications.",
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
      </svg>
    ),
    title: "Supported, not alone",
    description: "Training, a care coordinator, and a community of students doing the same work.",
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
      </svg>
    ),
    title: "1-on-1, in-home",
    description: "Meaningful one-on-one time with seniors in a comfortable home setting.",
  },
];

const COMPARE_JOBS = [
  { label: "Hourly pay", olera: "$15–$25", other: "$7.25–$12" },
  { label: "Schedule flexibility", olera: "You choose shifts", other: "Manager sets schedule" },
  { label: "Career relevance", olera: "Patient care hours", other: "None" },
  { label: "Resume value", olera: "Healthcare experience", other: "Food service / retail" },
  { label: "Work environment", olera: "1-on-1, in-home", other: "Busy, impersonal" },
];

export default function CareShiftStudentsPage() {
  return (
    <main className="bg-white">
      {/* ─── Hero ─── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-primary-50" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 sm:pt-16 lg:pt-20 pb-12 lg:pb-20">
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            {/* Left — copy */}
            <div>
              <span className="inline-block px-4 py-2 rounded-full bg-warning-100 text-warning-800 text-xs font-semibold uppercase tracking-widest">
                Hiring in Houston
              </span>
              <h1 className="mt-5 font-serif text-4xl sm:text-5xl lg:text-[3.5rem] font-bold tracking-tight text-gray-900 leading-[1.08]">
                Earn more while
                <br />
                <span className="text-primary-600">building your career.</span>
              </h1>
              <p className="mt-5 text-lg text-gray-500 leading-relaxed max-w-lg">
                Earn $15&ndash;$25/hr providing companion care to seniors. Real experience
                for your medical career, on your schedule.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row items-start gap-3">
                <Link
                  href="/medjobs/families?screener=1"
                  className="inline-flex items-center px-7 py-3.5 bg-primary-600 text-white text-[15px] font-semibold rounded-full hover:bg-primary-700 transition-colors shadow-sm shadow-primary-600/20"
                >
                  Apply to become a caregiver
                  <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </Link>
                <a
                  href="#how-it-works"
                  className="inline-flex items-center px-5 py-3.5 text-gray-500 text-[15px] font-medium hover:text-gray-900 transition-colors"
                >
                  See how it works
                  <svg className="w-4 h-4 ml-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </a>
              </div>
              {/* University trust logos */}
              <div className="mt-10">
                <p className="text-xs text-gray-400 uppercase tracking-widest font-medium mb-4">
                  Students from top Texas universities
                </p>
                <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
                  {[
                    { name: "University of Houston", logo: "/images/medjobs/universities/houston.png" },
                    { name: "Texas A&M University", logo: "/images/medjobs/universities/texas-am.png" },
                    { name: "Prairie View A&M", logo: "/images/medjobs/universities/prairie-view.webp" },
                    { name: "University of Michigan", logo: "/images/medjobs/universities/michigan.png" },
                    { name: "University of Maryland", logo: "/images/medjobs/universities/maryland.png" },
                  ].map((uni) => (
                    <Image
                      key={uni.name}
                      src={uni.logo}
                      alt={uni.name}
                      width={120}
                      height={60}
                      className="h-9 w-auto object-contain opacity-80"
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Right — hero image */}
            <div className="relative">
              <div className="aspect-[4/3] rounded-3xl overflow-hidden bg-gray-100 shadow-xl shadow-gray-900/10">
                <Image
                  src="/images/young-caregiver-hero.webp"
                  alt="Student caregiver sharing a warm moment with an elderly client at home"
                  width={800}
                  height={1000}
                  className="w-full h-full object-cover object-top"
                  priority
                />
              </div>
              {/* Floating earnings card */}
              <div className="absolute -bottom-4 -left-4 sm:-left-6 bg-white rounded-xl shadow-lg shadow-gray-900/10 border border-primary-100 px-4 py-3.5">
                <p className="text-[10px] text-primary-600 font-semibold uppercase tracking-wide">Avg. weekly earnings</p>
                <p className="text-2xl font-bold text-gray-900 mt-0.5">$380</p>
                <p className="text-xs text-primary-600 font-medium mt-0.5">12–18 hrs/week</p>
              </div>
            </div>
          </div>
        </div>
      </section>


      {/* ─── How it works ─── */}
      <section id="how-it-works" className="py-8 sm:py-12 scroll-mt-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <p className="text-sm tracking-widest uppercase text-primary-600 font-medium mb-3">
              How it works
            </p>
            <h2 className="font-serif text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight">
              From student to caregiver
              <br className="hidden sm:block" />
              in 3 simple steps
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6 lg:gap-8 max-w-5xl mx-auto">
            {HOW_IT_WORKS.map((item) => (
              <div key={item.step} className="bg-primary-50 rounded-2xl border border-primary-100 shadow-md shadow-primary-200/40 p-6 lg:p-8 text-center hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200">
                <div className="w-16 h-16 rounded-2xl bg-primary-100 text-primary-600 flex items-center justify-center mx-auto mb-5 [&>svg]:w-8 [&>svg]:h-8">
                  {item.icon}
                </div>
                <p className="text-xs text-primary-600 font-bold tracking-widest mb-2">STEP {item.step}</p>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{item.title}</h3>
                <p className="text-[15px] text-gray-500 leading-relaxed">{item.description}</p>
              </div>
            ))}
          </div>
          <div className="mt-12 text-center">
            <Link
              href="/medjobs/families?screener=1"
              className="inline-flex items-center px-7 py-3 bg-primary-600 text-white text-sm font-semibold rounded-full hover:bg-primary-700 transition-colors"
            >
              Start your application
            </Link>
          </div>
        </div>
      </section>

      {/* ─── Why Olera vs. other student jobs ─── */}
      <section className="py-8 sm:py-12 bg-gray-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <p className="text-sm tracking-widest uppercase text-primary-600 font-medium mb-3">
              Why Olera
            </p>
            <h2 className="font-serif text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight">
              Not just another student job
            </h2>
            <p className="mt-3 text-lg text-gray-500 max-w-2xl mx-auto">
              Rideshare doesn&apos;t go on your med school application.
              Neither does food delivery. This does.
            </p>
          </div>

          {/* Combined comparison table with icons */}
          <div className="bg-white rounded-3xl border border-gray-200 shadow-lg shadow-gray-200/50 overflow-hidden">
            {/* Header row */}
            <div className="grid grid-cols-[1fr_1fr_1fr] border-b border-gray-200">
              <div className="p-5 flex items-center">
                <p className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Compare</p>
              </div>
              <div className="p-5 bg-primary-50 border-x border-primary-100 text-center">
                <p className="text-lg font-bold text-primary-800">Olera</p>
                <p className="text-xs text-primary-500 mt-0.5">Care Shifts</p>
              </div>
              <div className="p-5 text-center">
                <p className="text-lg font-bold text-gray-400">Other jobs</p>
                <p className="text-xs text-gray-400 mt-0.5">Rideshare, retail, etc.</p>
              </div>
            </div>
            {/* Data rows */}
            {COMPARE_JOBS.map((row, i) => (
              <div key={row.label} className={`grid grid-cols-[1fr_1fr_1fr] ${i < COMPARE_JOBS.length - 1 ? "border-b border-gray-100" : ""}`}>
                <div className="p-5 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-primary-50 text-primary-600 flex items-center justify-center flex-shrink-0">
                    {BENEFITS[i] ? BENEFITS[i].icon : null}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{row.label}</p>
                    {BENEFITS[i] && <p className="text-xs text-gray-400 mt-0.5 hidden sm:block">{BENEFITS[i].description}</p>}
                  </div>
                </div>
                <div className="p-5 bg-primary-25 border-x border-primary-50 flex items-center justify-center gap-2">
                  <svg className="w-5 h-5 text-success-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                  </svg>
                  <p className="text-[15px] font-bold text-gray-900">{row.olera}</p>
                </div>
                <div className="p-5 flex items-center justify-center gap-2">
                  <svg className="w-5 h-5 text-gray-300 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
                  </svg>
                  <p className="text-[15px] text-gray-400">{row.other}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Mid-page CTA ─── */}
      <section className="relative py-8 sm:py-12 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-white via-primary-50/30 to-primary-50/50" />
        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 tracking-tight leading-tight">
            Your classmates are already
            <br />
            <span className="text-primary-600">getting paid to care</span>
          </h2>
          <p className="mt-5 text-lg text-gray-500 max-w-xl mx-auto">
            5-minute application. No certifications. No experience required.
            Just show up, be kind, and get paid.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/medjobs/families?screener=1"
              className="inline-flex items-center px-8 py-3.5 bg-primary-600 text-white text-[15px] font-semibold rounded-full hover:bg-primary-700 transition-colors shadow-sm shadow-primary-600/20"
            >
              Apply to become a caregiver
              <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
          </div>
          <p className="mt-4 text-sm text-gray-400">
            Free to join &middot; No commitment &middot; Weekly pay
          </p>
        </div>
      </section>

      {/* ─── What you'll actually do ─── */}
      <section className="py-8 sm:py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            {/* Photo grid */}
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-7 aspect-[3/4] rounded-2xl overflow-hidden bg-gray-100">
                <Image
                  src="/images/medjobs/caregiving-support.jpg"
                  alt="Student providing companion care to a senior"
                  width={500}
                  height={667}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="col-span-5 space-y-3">
                <div className="aspect-square rounded-2xl overflow-hidden bg-gray-100">
                  <Image
                    src="/images/medjobs/students-group.jpg"
                    alt="Student caregivers together"
                    width={400}
                    height={400}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="aspect-[4/5] rounded-2xl overflow-hidden bg-gray-100">
                  <Image
                    src="/images/medjobs/college-caregivers.png"
                    alt="College student caregiver"
                    width={400}
                    height={500}
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
            </div>

            <div>
              <p className="text-sm tracking-widest uppercase text-primary-600 font-medium mb-3">
                Day to day
              </p>
              <h2 className="font-serif text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight">
                What you&apos;ll actually do
              </h2>
              <p className="mt-4 text-lg text-gray-500 leading-relaxed">
                This isn&apos;t clinical work and you don&apos;t need a license.
                You&apos;re providing companionship, light support, and genuine human connection.
              </p>
              <div className="mt-8 space-y-3">
                {[
                  "Conversation, games, and companionship",
                  "Light meal prep and medication reminders",
                  "Help with errands, walks, and appointments",
                  "Light housekeeping and organization",
                  "Monitoring wellbeing and reporting changes",
                ].map((task) => (
                  <div key={task} className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full bg-primary-50 flex items-center justify-center flex-shrink-0">
                      <svg className="w-3.5 h-3.5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    </div>
                    <p className="text-[15px] text-gray-700">{task}</p>
                  </div>
                ))}
              </div>
              <div className="mt-8 p-4 rounded-xl bg-vanilla-100 border border-vanilla-200">
                <p className="text-sm text-gray-600 leading-relaxed">
                  <span className="font-semibold text-gray-900">No certifications required.</span>{" "}
                  We provide free training on senior care basics, safety protocols, and communication skills before your first shift.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Student testimonials ─── */}
      <section className="py-8 sm:py-12 bg-vanilla-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <p className="text-sm tracking-widest uppercase text-gray-400 font-medium mb-3">
              From our caregivers
            </p>
            <h2 className="font-serif text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight">
              Students who&apos;ve been where you are
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {[
              {
                quote: "I was driving DoorDash between classes. Now I make more per hour AND I have 200+ patient care hours on my AMCAS app.",
                name: "Joshua S.",
                school: "Texas A&M",
                track: "Pre-Med, 3rd Year",
                image: "/images/medjobs/student-joshua.jpg",
              },
              {
                quote: "My client Mrs. Rodriguez reminds me of my abuela. This doesn't feel like work — it feels like visiting family, except I get paid.",
                name: "Natasha J.",
                school: "University of Houston",
                track: "Pre-Nursing, 2nd Year",
                image: "/images/medjobs/student-natasha.jpg",
              },
              {
                quote: "The flexibility is unreal. During finals I dropped to one shift a week, then picked back up over summer. No guilt, no drama.",
                name: "Emma N.",
                school: "Texas A&M",
                track: "Psychology, Senior",
                image: "/images/medjobs/student-emma.jpg",
              },
            ].map((t) => (
              <div key={t.name} className="bg-white rounded-2xl border border-gray-100 shadow-xs p-6 flex flex-col">
                <svg className="w-8 h-8 text-primary-200 mb-4 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10H14.017zM0 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151C7.546 6.068 5.983 8.789 5.983 11H10v10H0z" />
                </svg>
                <p className="text-[15px] text-gray-700 leading-relaxed flex-1">{t.quote}</p>
                <div className="flex items-center gap-3 mt-5 pt-5 border-t border-gray-100">
                  <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-100 flex-shrink-0">
                    <Image src={t.image} alt={t.name} width={80} height={80} className="w-full h-full object-cover" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{t.name}</p>
                    <p className="text-xs text-gray-400">{t.school} &middot; {t.track}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── FAQ ─── */}
      <section className="py-8 sm:py-12 bg-primary-50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-white rounded-3xl border border-primary-100 shadow-lg shadow-primary-200/30 p-6 sm:p-10">
            {/* Header */}
            <div className="flex items-center gap-3 mb-8">
              <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z" />
                </svg>
              </div>
              <h2 className="font-serif text-2xl sm:text-3xl font-bold text-gray-900">
                Frequently Asked Questions
              </h2>
            </div>
            {/* Questions */}
            <div className="space-y-3">
              {[
                {
                  q: "Do I need any certifications or experience?",
                  a: "No. If you're a current college student with a compassionate attitude, you qualify. We provide free training before your first shift covering senior care basics, safety, and communication.",
                },
                {
                  q: "How many hours per week do I need to commit?",
                  a: "There's no minimum. Most students work 8\u201315 hours per week, but you can do as few as 4 or as many as 25. You set your own availability and can adjust it any time \u2014 like during finals.",
                },
                {
                  q: "When and how do I get paid?",
                  a: "Weekly direct deposit every Friday. Your rate depends on the type of care and your experience level, starting at $15/hr and going up to $25/hr.",
                },
                {
                  q: "What if I've never worked with seniors before?",
                  a: "Most of our caregivers haven't. We match you with clients who are a good fit for your comfort level, and your first few visits are supported by a care coordinator who checks in with you and the family.",
                },
              ].map((item) => (
                <details key={item.q} className="group bg-primary-25 border border-primary-100 rounded-xl overflow-hidden">
                  <summary className="flex items-center justify-between cursor-pointer list-none px-5 py-4 hover:bg-primary-50 transition-colors">
                    <h3 className="text-[15px] font-semibold text-gray-900 pr-4">{item.q}</h3>
                    <svg className="w-5 h-5 text-primary-400 flex-shrink-0 group-open:rotate-180 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                  </summary>
                  <div className="px-5 pb-4">
                    <p className="text-sm text-gray-500 leading-relaxed">{item.a}</p>
                  </div>
                </details>
              ))}
            </div>
          </div>
        </div>
      </section>

    </main>
  );
}
