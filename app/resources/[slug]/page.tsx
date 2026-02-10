"use client";

import { use, useMemo } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getResourceBySlug } from "@/data/mock/resources";
import { CareTypeId, CARE_TYPE_CONFIG } from "@/types/forum";

// Care type emojis for the CTA banner
const CARE_TYPE_EMOJI: Record<CareTypeId, string> = {
  "home-health": "🏥",
  "home-care": "🏠",
  "assisted-living": "🤝",
  "memory-care": "🧠",
  "nursing-homes": "🏢",
  "independent-living": "☀️",
};

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default function ResourceArticlePage({ params }: PageProps) {
  const { slug } = use(params);
  const resource = useMemo(() => getResourceBySlug(slug), [slug]);

  if (!resource) {
    notFound();
  }

  // Get the primary care type for breadcrumb
  const primaryCareType = resource.careTypes[0];
  const careTypeLabel = primaryCareType ? CARE_TYPE_CONFIG[primaryCareType].label : null;

  return (
    <main className="min-h-screen bg-white">
      {/* Article Header - aligned with cover image */}
      <header className="max-w-[1000px] mx-auto px-5 pt-6 md:pt-8">
        {/* Breadcrumbs */}
        <nav className="flex items-center gap-2 text-sm mb-4" aria-label="Breadcrumb">
          <Link href="/resources" className="text-gray-500 hover:text-gray-700 transition-colors">
            Resources
          </Link>
          {primaryCareType && careTypeLabel && (
            <>
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
              </svg>
              <Link
                href={`/resources?type=${primaryCareType}`}
                className="text-gray-500 hover:text-gray-700 transition-colors"
              >
                {careTypeLabel}
              </Link>
            </>
          )}
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-gray-900 font-medium truncate max-w-[300px]">
            {resource.title}
          </span>
        </nav>

        {/* Title */}
        <h1 className="text-[28px] md:text-[36px] font-bold text-gray-900 leading-[1.2] tracking-[-0.02em] mb-4">
          {resource.title}
        </h1>

        {/* Author row */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            {resource.author.avatar ? (
              <img
                src={resource.author.avatar}
                alt={resource.author.name}
                className="w-10 h-10 rounded-full object-cover"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center">
                <span className="text-white text-sm font-medium">
                  {resource.author.name.split(" ").map((n) => n[0]).join("")}
                </span>
              </div>
            )}
            <div>
              <span className="font-medium text-gray-900 block">{resource.author.name}</span>
              <div className="flex items-center gap-1.5 text-sm text-gray-500">
                <span>{resource.readingTime}</span>
                <span>·</span>
                <span>{formatDate(resource.publishedAt)}</span>
              </div>
            </div>
          </div>

          {/* Share button */}
          <button className="flex items-center justify-center gap-1.5 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg px-4 py-2 hover:bg-gray-50 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
            Share
          </button>
        </div>
      </header>

      {/* Cover Image */}
      <figure className="max-w-[1000px] mx-auto px-5 mb-8">
        <img
          src={resource.coverImage}
          alt={resource.title}
          className="w-full max-h-[400px] object-cover rounded-lg"
        />
      </figure>

      {/* Article Content */}
      <article className="max-w-[680px] mx-auto px-5">
        {/* Body content - Medium style */}
        <div className="prose-medium">
          <p>
            When it comes to finding the right care for your loved one, there are many factors to consider. Understanding your options is the first step toward making an informed decision that balances quality of care with practical considerations like location and cost.
          </p>

          <p>
            The journey of finding care can feel overwhelming, but breaking it down into manageable steps makes the process much more approachable. This guide will walk you through everything you need to know.
          </p>

          <h2>Understanding Your Options</h2>

          <p>
            The senior care landscape offers various levels of support, from minimal assistance to round-the-clock medical care. Each type of care serves different needs, and choosing the right one depends on your loved one's health condition, preferences, and financial situation.
          </p>

          <blockquote>
            The most important thing is finding care that respects your loved one's dignity and independence while providing the support they need.
          </blockquote>

          <p>
            Many families find that their needs change over time. What starts as occasional help with household tasks may eventually evolve into a need for more comprehensive care. Planning for this progression can help ease transitions.
          </p>

          <h2>Key Considerations</h2>

          <p>
            Before making any decisions, take time to assess the current and anticipated needs. Consider factors like mobility, cognitive function, medical requirements, and social preferences.
          </p>

          <ul>
            <li>Assess current health status and anticipated future needs</li>
            <li>Consider your loved one's preferences and lifestyle</li>
            <li>Evaluate financial resources and insurance coverage</li>
            <li>Research quality ratings and reviews from other families</li>
            <li>Visit facilities and meet with staff when possible</li>
          </ul>

          <p>
            Taking the time to thoroughly evaluate these factors will help ensure you find the right fit for your family's unique situation.
          </p>

          {/* Contextual CTA Banner - Premium Design (using primary brand colors) */}
          {resource.careTypes[0] && (() => {
            const careType = resource.careTypes[0];
            const emoji = CARE_TYPE_EMOJI[careType];
            const label = CARE_TYPE_CONFIG[careType].label;
            return (
              <Link
                href={`/browse?type=${careType}`}
                className="group relative block my-10 rounded-2xl overflow-hidden bg-gradient-to-br from-primary-50 via-primary-50/80 to-white border border-primary-100/60 hover:border-primary-200 hover:shadow-lg hover:shadow-primary-100/40 transition-all duration-300"
              >
                {/* Left accent bar */}
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-primary-400 to-primary-600 rounded-l-2xl" />

                <div className="p-5 pl-6 flex items-center gap-4">
                  {/* Icon circle */}
                  <div className="flex-shrink-0 w-12 h-12 rounded-full bg-primary-100 flex items-center justify-center group-hover:scale-105 transition-transform duration-300">
                    <span className="text-xl">{emoji}</span>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <h4 className="text-base font-bold text-gray-900 leading-snug">
                      Looking for {label.toLowerCase()} providers?
                    </h4>
                    <p className="text-sm text-gray-500 mt-0.5">
                      Browse verified providers in your area and compare options.
                    </p>
                  </div>

                  {/* Arrow circle */}
                  <div className="flex-shrink-0 w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center group-hover:bg-primary-600 transition-colors duration-300">
                    <svg className="w-4 h-4 text-primary-600 group-hover:text-white transition-colors duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </Link>
            );
          })()}

          <h2>Next Steps</h2>

          <p>
            Once you've identified the type of care that best fits your needs, the next step is to research specific providers in your area. Look for reviews, visit facilities when possible, and don't hesitate to ask questions.
          </p>

          <p>
            Remember that finding the right care is a process, and it's okay to take your time. The most important thing is ensuring your loved one receives the support they need while maintaining their quality of life.
          </p>
        </div>

        {/* Author Card - Enhanced */}
        <div className="mt-12 p-6 bg-gray-50 rounded-2xl">
          <div className="flex items-start gap-4">
            {resource.author.avatar ? (
              <img
                src={resource.author.avatar}
                alt={resource.author.name}
                className="w-16 h-16 rounded-full object-cover ring-2 ring-white shadow-sm"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center flex-shrink-0 ring-2 ring-white shadow-sm">
                <span className="text-white text-lg font-semibold">
                  {resource.author.name.split(" ").map((n) => n[0]).join("")}
                </span>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Written by</p>
                  <h3 className="text-lg font-bold text-gray-900">
                    {resource.author.name}
                  </h3>
                  <p className="text-gray-600 text-sm">{resource.author.role}</p>
                </div>
                <a
                  href="https://linkedin.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-[#0A66C2] bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  aria-label="View LinkedIn profile"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                  </svg>
                  Follow
                </a>
              </div>
            </div>
          </div>

          {/* Tags inside author card */}
          <div className="flex flex-wrap gap-2 mt-5 pt-5 border-t border-gray-200">
            {resource.careTypes.map((careType) => (
              <Link
                key={careType}
                href={`/resources?type=${careType}`}
                className="px-3 py-1.5 bg-white text-gray-700 text-sm font-medium rounded-full border border-gray-200 hover:border-primary-300 hover:text-primary-600 transition-colors"
              >
                {CARE_TYPE_CONFIG[careType].label}
              </Link>
            ))}
            {resource.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="px-3 py-1.5 bg-white text-gray-500 text-sm rounded-full border border-gray-200"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </article>

      {/* Contextual Bottom CTA - matches article image width */}
      <section className="max-w-[1000px] mx-auto px-5 mt-16 pb-16">
        <Link
          href={resource.careTypes[0] ? `/browse?type=${resource.careTypes[0]}` : "/browse"}
          className="group block relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary-700 via-primary-600 to-primary-700"
        >
          {/* Background pattern */}
          <div className="absolute inset-0 opacity-10">
            <svg className="absolute right-0 top-0 w-80 h-80 -mr-16 -mt-16" viewBox="0 0 200 200" fill="none">
              <circle cx="100" cy="100" r="80" stroke="white" strokeWidth="40"/>
            </svg>
            <svg className="absolute left-0 bottom-0 w-64 h-64 -ml-16 -mb-16" viewBox="0 0 200 200" fill="none">
              <circle cx="100" cy="100" r="60" stroke="white" strokeWidth="30"/>
            </svg>
          </div>

          <div className="relative px-8 py-10 md:px-12 md:py-14 flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="text-center md:text-left">
              <h2 className="text-2xl md:text-3xl font-bold text-white mb-2">
                {resource.careTypes[0]
                  ? `Ready to find ${CARE_TYPE_CONFIG[resource.careTypes[0]].label.toLowerCase()}?`
                  : "Ready to find the right care?"
                }
              </h2>
              <p className="text-primary-100 text-lg">
                {resource.careTypes[0]
                  ? `Browse verified ${CARE_TYPE_CONFIG[resource.careTypes[0]].label.toLowerCase()} providers in your area.`
                  : "Join thousands of families who have found trusted care through Olera."
                }
              </p>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <span className="inline-flex items-center gap-2 px-6 py-3.5 bg-white text-primary-700 font-semibold rounded-full group-hover:bg-primary-50 transition-colors shadow-lg shadow-primary-900/20">
                Browse Care Options
                <svg className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </span>
            </div>
          </div>
        </Link>
      </section>

      {/* Inline styles for article typography */}
      <style jsx>{`
        .prose-medium {
          font-size: 18px;
          line-height: 1.75;
          color: #344054;
        }
        .prose-medium p {
          margin-bottom: 1.5em;
        }
        .prose-medium h2 {
          font-size: 24px;
          font-weight: 700;
          color: #101828;
          margin-top: 2em;
          margin-bottom: 0.75em;
          letter-spacing: -0.02em;
        }
        .prose-medium blockquote {
          font-size: 20px;
          line-height: 1.6;
          color: #475467;
          border-left: 3px solid #D0D5DD;
          padding-left: 1.25em;
          margin: 2em 0;
        }
        .prose-medium ul {
          margin: 1.5em 0;
          padding-left: 1.5em;
        }
        .prose-medium li {
          margin-bottom: 0.5em;
        }
        .prose-medium li::marker {
          color: #98A2B3;
        }
      `}</style>
    </main>
  );
}
