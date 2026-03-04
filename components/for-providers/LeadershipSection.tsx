import Image from "next/image";
import Link from "next/link";

const leaders = [
  {
    name: "TJ Falohun, MS",
    role: "CEO",
    bio: "Before Olera, TJ worked at Pfizer as a biomedical engineer, designing auto-injectors.",
    linkedIn: "https://www.linkedin.com/in/tj-falohun/",
    image: "/images/for-providers/team/tj.jpg",
  },
  {
    name: "Logan DuBose, MD, MBA",
    role: "COO",
    bio: "Logan combines his clinical and business expertise to transform senior care, driving Olera\u2019s mission to deliver compassionate, comprehensive solutions.",
    linkedIn: "https://www.linkedin.com/in/logan-dubose/",
    image: "/images/for-providers/team/logan.jpg",
  },
];

export default function LeadershipSection() {
  return (
    <section className="py-16 md:py-24 bg-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="font-serif text-display-md font-bold text-gray-900 text-center mb-12">
          Our Leadership
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {leaders.map((leader) => (
            <div
              key={leader.name}
              className="flex gap-0 rounded-xl border border-gray-200 bg-gray-50 overflow-hidden min-h-[200px]"
            >
              {/* Headshot — fixed aspect ratio on mobile */}
              <div className="shrink-0 w-40 sm:w-52 self-stretch">
                <Image
                  src={leader.image}
                  alt={leader.name}
                  width={176}
                  height={240}
                  className="w-full h-full object-cover"
                />
              </div>

              {/* Info */}
              <div className="flex flex-col justify-between min-w-0 p-4 sm:p-5 flex-1">
                <div>
                  <span className="text-text-xs font-medium text-gray-500 uppercase tracking-wide">
                    {leader.role}
                  </span>
                  <h3 className="text-text-base sm:text-text-lg font-bold text-gray-900 mt-0.5">
                    {leader.name}
                  </h3>
                  <p className="text-text-sm text-gray-600 mt-2 leading-relaxed line-clamp-4 sm:line-clamp-none">
                    {leader.bio}
                  </p>
                </div>

                {/* LinkedIn */}
                <a
                  href={leader.linkedIn}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center text-primary-600 hover:text-primary-700 transition-colors min-h-[44px] w-11 h-11 justify-center -ml-3"
                  aria-label={`${leader.name} on LinkedIn`}
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                  </svg>
                </a>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10 text-center">
          <Link
            href="/team"
            className="inline-flex items-center gap-1.5 text-text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors"
          >
            Learn more about our team
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </div>
    </section>
  );
}
