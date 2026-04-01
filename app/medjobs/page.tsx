import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import CaregiverRedirect from "@/components/medjobs/CaregiverRedirect";

export const metadata: Metadata = {
  title: "MedJobs — Student Caregiver Talent Marketplace | Olera",
  description:
    "Get paid healthcare experience as a student caregiver, or find motivated student talent for your senior care facility. Olera MedJobs connects students with providers.",
  openGraph: {
    title: "MedJobs — Student Caregiver Talent Marketplace | Olera",
    description:
      "Get paid healthcare experience as a student caregiver, or find motivated student talent for your senior care facility.",
  },
};

const HOW_IT_WORKS = [
  {
    title: "Create your profile",
    description: "Add your university, major, certifications, and availability. Upload a resume and record a short video intro.",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
      </svg>
    ),
  },
  {
    title: "Interview with care agencies near your university",
    description: "Senior care providers in your area browse student profiles and reach out with caregiving opportunities.",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
      </svg>
    ),
  },
  {
    title: "Provide care while you're still in school",
    description: "Log patient care hours, get provider confirmations, and build a healthcare experience transcript for professional school.",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
      </svg>
    ),
  },
];

const STUDENT_FEATURES = [
  {
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
      </svg>
    ),
    label: "Verified healthcare hours",
    detail: "Every hour logged and confirmed by your supervising provider — ready for your AMCAS or CASPA application.",
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
      </svg>
    ),
    label: "Real bedside experience",
    detail: "Home care, assisted living, memory care, and hospice — the settings professional schools want to see on your application.",
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    label: "Flexible schedules",
    detail: "Part-time, weekends, summers — work around your classes, not the other way around.",
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5" />
      </svg>
    ),
    label: "Paid + purposeful",
    detail: "Earn competitive hourly rates while gaining experience that actually matters for your career.",
  },
];


export default function MedJobsPage() {
  return (
    <main className="bg-white">
      {/* Redirect logged-in caregivers to their dashboard */}
      <CaregiverRedirect />
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-gray-50 to-white" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 sm:pt-14 lg:pt-16 pb-10">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Copy */}
            <div>
              <h1 className="font-serif text-4xl sm:text-5xl lg:text-[3.5rem] font-bold tracking-tight text-gray-900 leading-[1.1]">
                Get paid healthcare experience{" "}
                <span className="text-primary-600">while you&apos;re still in school</span>
              </h1>
              <p className="mt-5 text-[17px] text-gray-500 leading-relaxed max-w-lg">
                Paid roles with senior care providers. Verified hours for your professional school application.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row items-start gap-3">
                <Link
                  href="/medjobs/apply"
                  className="inline-flex items-center px-7 py-3 bg-primary-600 text-white text-sm font-semibold rounded-full hover:bg-primary-700 transition-colors shadow-sm shadow-primary-600/20"
                >
                  Apply Now
                  <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </Link>
                <Link
                  href="/medjobs/providers"
                  className="inline-flex items-center px-7 py-3 text-gray-500 text-sm font-medium hover:text-gray-900 transition-colors"
                >
                  I&apos;m a provider looking to hire
                </Link>
              </div>
            </div>

            {/* Hero image */}
            <div className="relative">
              <div className="aspect-square rounded-2xl overflow-hidden bg-gray-100 shadow-lg shadow-gray-200/50">
                <Image
                  src="/images/medjobs/hero-caregiving.jpg"
                  alt="Student caregiver helping a senior — Olera MedJobs"
                  width={1080}
                  height={1080}
                  className="w-full h-full object-cover"
                  priority
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trust bar — university logos */}
      <section className="py-6 sm:py-8 border-b border-gray-100 bg-gray-50/50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <p className="text-xs text-center text-gray-400 uppercase tracking-widest font-medium mb-6">
            Students from universities across the country
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
            {[
              { name: "Texas A&M University", logo: "/images/medjobs/universities/texas-am.png" },
              { name: "University of Michigan", logo: "/images/medjobs/universities/michigan.png" },
              { name: "University of Houston", logo: "/images/medjobs/universities/houston.png" },
              { name: "Prairie View A&M University", logo: "/images/medjobs/universities/prairie-view.webp" },
              { name: "University of Maryland", logo: "/images/medjobs/universities/maryland.png" },
            ].map((uni) => (
              <Image
                key={uni.name}
                src={uni.logo}
                alt={uni.name}
                width={120}
                height={60}
                className="h-10 sm:h-12 w-auto object-contain opacity-70 hover:opacity-100 transition-opacity grayscale hover:grayscale-0"
              />
            ))}
          </div>
        </div>
      </section>


      {/* How it works */}
      <section className="py-16 sm:py-20 bg-gray-50/70">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-start">
            {/* Photo — sticky on scroll */}
            <div className="aspect-[3/4] rounded-3xl overflow-hidden bg-gray-100 lg:sticky lg:top-24 shadow-xl shadow-gray-900/5">
              <Image
                src="/images/medjobs/student-portrait.jpg"
                alt="Student caregiver"
                width={600}
                height={800}
                className="w-full h-full object-cover"
              />
            </div>

            {/* Steps */}
            <div className="lg:py-8">
              <p className="text-sm tracking-widest uppercase text-primary-600 font-medium mb-3">
                How it works
              </p>
              <h2 className="font-serif text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight">
                From student to caregiver
                <br />in 3 simple steps
              </h2>
              <div className="mt-12 space-y-0">
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
              <div className="mt-10">
                <Link
                  href="/medjobs/apply"
                  className="inline-flex items-center px-7 py-3 bg-primary-600 text-white text-sm font-semibold rounded-full hover:bg-primary-700 transition-colors"
                >
                  Apply Now
                </Link>
                <p className="mt-3 text-sm text-gray-400">No cost, no commitment.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* For Students */}
      <section className="py-16 sm:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <p className="text-sm tracking-widest uppercase text-primary-600 font-medium mb-3">
                For students
              </p>
              <h2 className="font-serif text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight">
                The healthcare experience your future career needs
              </h2>
              <p className="mt-4 text-lg text-gray-500 leading-relaxed">
                PA programs require 1,000-2,000 patient care hours. Med schools want hundreds.
                MedJobs is how you get them — while getting paid and making a real difference.
              </p>
              <div className="mt-10 space-y-6">
                {STUDENT_FEATURES.map((item) => (
                  <div key={item.label} className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-primary-50 text-primary-600 flex items-center justify-center mt-0.5">
                      {item.icon}
                    </div>
                    <div>
                      <p className="text-[15px] font-semibold text-gray-900">{item.label}</p>
                      <p className="text-sm text-gray-500 mt-0.5 leading-relaxed">{item.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-10">
                <Link
                  href="/medjobs/apply"
                  className="inline-flex items-center px-7 py-3 bg-primary-600 text-white text-sm font-semibold rounded-full hover:bg-primary-700 transition-colors"
                >
                  Create your profile
                </Link>
              </div>
            </div>

            {/* Photo mosaic */}
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-7 aspect-[3/4] rounded-2xl overflow-hidden bg-gray-100">
                <Image
                  src="/images/medjobs/students-group.jpg"
                  alt="Healthcare student group"
                  width={500}
                  height={667}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="col-span-5 space-y-3">
                <div className="aspect-square rounded-2xl overflow-hidden bg-gray-100">
                  <Image
                    src="/images/medjobs/caregiving-support.jpg"
                    alt="Students supporting seniors"
                    width={400}
                    height={400}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="aspect-[4/5] rounded-2xl overflow-hidden bg-gray-100">
                  <Image
                    src="/images/medjobs/college-caregivers.png"
                    alt="College student caregivers"
                    width={400}
                    height={500}
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>


      {/* Meet the students */}
      <section className="py-16 sm:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <p className="text-sm tracking-widest uppercase text-gray-400 font-medium mb-3">
              Meet the students
            </p>
            <h2 className="font-serif text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight">
              Future doctors. Future nurses.
              <br className="hidden sm:block" />
              Current caregivers.
            </h2>
          </div>
          <div className="grid sm:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {[
              { name: "Joshua S.", school: "Texas A&M", track: "Pre-Med", hours: "180 hrs verified", image: "/images/medjobs/student-joshua.jpg" },
              { name: "Natasha J.", school: "University of Michigan", track: "Pre-PA", hours: "312 hrs verified", image: "/images/medjobs/student-natasha.jpg" },
              { name: "Emma N.", school: "Texas A&M", track: "Pre-Nursing", hours: "456 hrs verified", image: "/images/medjobs/student-emma.jpg" },
            ].map((student) => (
              <div key={student.name} className="group">
                <div className="aspect-[4/5] rounded-2xl overflow-hidden bg-gray-100 mb-4">
                  <Image
                    src={student.image}
                    alt={student.name}
                    width={400}
                    height={500}
                    className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                  />
                </div>
                <p className="text-base font-semibold text-gray-900">{student.name}</p>
                <p className="text-sm text-gray-500">{student.school} &middot; {student.track}</p>
                <p className="text-sm text-primary-600 font-medium mt-0.5">{student.hours}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* For Providers */}
      <section className="py-16 sm:py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            {/* Photo */}
            <div className="order-2 lg:order-1">
              <div className="aspect-[4/3] rounded-3xl overflow-hidden bg-gray-100 shadow-xl shadow-gray-900/5">
                <Image
                  src="/images/medjobs/provider-caregiving.jpg"
                  alt="Student caregiver with senior patient"
                  width={800}
                  height={600}
                  className="w-full h-full object-cover"
                />
              </div>
            </div>

            <div className="order-1 lg:order-2">
              <p className="text-sm tracking-widest uppercase text-gray-400 font-medium mb-3">
                For providers
              </p>
              <h2 className="font-serif text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight">
                Staff who show up
                <br />for your clients
              </h2>
              <p className="mt-4 text-lg text-gray-500 leading-relaxed">
                Healthcare students aren&apos;t just filling a shift — they&apos;re building
                a career in healthcare. Browse profiles, review resumes, and connect
                directly.
              </p>
              <div className="mt-8 grid sm:grid-cols-2 gap-6">
                {[
                  { stat: "85%", label: "Student retention after 90 days" },
                  { stat: "15-20", label: "Average weekly hours per student" },
                  { stat: "70%", label: "Available evenings & weekends" },
                  { stat: "4.8/5", label: "Provider satisfaction" },
                ].map((item) => (
                  <div key={item.label} className="bg-white rounded-xl p-4 border border-gray-100">
                    <p className="text-2xl font-bold text-gray-900">{item.stat}</p>
                    <p className="text-sm text-gray-500 mt-0.5">{item.label}</p>
                  </div>
                ))}
              </div>
              <div className="mt-8">
                <Link
                  href="/medjobs/candidates"
                  className="inline-flex items-center px-7 py-3 bg-gray-900 text-white text-sm font-semibold rounded-full hover:bg-gray-800 transition-colors"
                >
                  Browse candidates
                  <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Bottom CTA — warm, confident */}
      <section className="relative py-16 sm:py-20 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-white via-primary-50/30 to-primary-50/50" />
        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 tracking-tight leading-tight">
            Your healthcare experience
            <br />
            <span className="text-primary-600">starts here</span>
          </h2>
          <p className="mt-5 text-lg text-gray-500 max-w-xl mx-auto">
            Create your profile. No cost, no commitment.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/medjobs/apply"
              className="inline-flex items-center px-8 py-3.5 bg-primary-600 text-white text-sm font-semibold rounded-full hover:bg-primary-700 transition-colors shadow-sm shadow-primary-600/20"
            >
              Apply Now
              <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
            <Link
              href="/medjobs/providers"
              className="inline-flex items-center px-8 py-3.5 text-gray-600 text-sm font-medium hover:text-gray-900 transition-colors"
            >
              I&apos;m a provider
              <svg className="w-4 h-4 ml-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
