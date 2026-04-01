import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getArticleBySlug, getRelatedArticles } from "@/lib/content";
import { getResourceBySlug } from "@/data/mock/resources";
import { renderContentToHTML } from "@/lib/render-content";
import { CareTypeId, CARE_TYPE_CONFIG } from "@/types/forum";
import { processArticleHtml } from "@/lib/article-html";
import { getAuthorByName } from "@/lib/authors";
import {
  DesktopTableOfContents,
  MobileTableOfContents,
} from "@/components/article/TableOfContents";
import SpendDownWidget from "@/components/article/SpendDownWidget";
import ArticleFAQ from "@/components/article/ArticleFAQ";
import SeniorCareFAQ from "@/components/article/SeniorCareFAQ";
import StarPlusFAQ from "@/components/article/StarPlusFAQ";
import MedicaidEligibilityFAQ from "@/components/article/MedicaidEligibilityFAQ";
import EligibilityChecker from "@/components/article/EligibilityChecker";

// ISR: revalidate every 60 seconds
export const revalidate = 60;

// ============================================================
// SEO Metadata
// ============================================================

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);

  if (!article) {
    // Fall back to mock data for metadata
    const mock = getResourceBySlug(slug);
    if (!mock) return { title: "Article Not Found | Olera" };
    return {
      title: `${mock.title} | Olera Caregiver Support`,
      description: mock.excerpt,
    };
  }

  const title = article.meta_title || article.title;
  // Prefer excerpt (natural opening paragraph) over CMS meta_description
  // to avoid overriding Google's body-pulled snippets for top articles.
  // CMS meta_description is only used when explicitly set AND excerpt is empty.
  const description = article.excerpt || article.meta_description || undefined;
  const ogTitle = article.og_title || title;
  const ogDescription = article.og_description || description;
  const ogImage = article.og_image_url || article.cover_image_url;
  const canonical = article.canonical_url || `https://olera.care/caregiver-support/${slug}`;

  return {
    title: `${title} | Olera Caregiver Support`,
    description,
    alternates: { canonical },
    ...(article.noindex && {
      robots: { index: false, follow: true },
    }),
    openGraph: {
      title: ogTitle,
      description: ogDescription,
      url: canonical,
      siteName: "Olera",
      type: "article",
      ...(ogImage && { images: [ogImage] }),
      ...(article.published_at && {
        publishedTime: article.published_at,
      }),
      ...(article.updated_at && {
        modifiedTime: article.updated_at,
      }),
    },
    twitter: {
      card: (article.twitter_card_type as "summary_large_image" | "summary") || "summary_large_image",
      title: ogTitle,
      description: ogDescription,
      ...(ogImage && { images: [ogImage] }),
    },
  };
}

// ============================================================
// Page Component (Server Component)
// ============================================================

/** Mock article HTML for fallback rendering */
const MOCK_ARTICLE_HTML = `
<p>When it comes to finding the right care for your loved one, there are many factors to consider. Understanding your options is the first step toward making an informed decision that balances quality of care with practical considerations like location and cost.</p>
<p>The journey of finding care can feel overwhelming, but breaking it down into manageable steps makes the process much more approachable. This guide will walk you through everything you need to know.</p>
<h2>Understanding Your Options</h2>
<p>The senior care landscape offers various levels of support, from minimal assistance to round-the-clock medical care. Each type of care serves different needs, and choosing the right one depends on your loved one's health condition, preferences, and financial situation.</p>
<blockquote>The most important thing is finding care that respects your loved one's dignity and independence while providing the support they need.</blockquote>
<p>Many families find that their needs change over time. What starts as occasional help with household tasks may eventually evolve into a need for more comprehensive care. Planning for this progression can help ease transitions.</p>
<h2>Key Considerations</h2>
<p>Before making any decisions, take time to assess the current and anticipated needs. Consider factors like mobility, cognitive function, medical requirements, and social preferences.</p>
<ul>
  <li>Assess current health status and anticipated future needs</li>
  <li>Consider your loved one's preferences and lifestyle</li>
  <li>Evaluate financial resources and insurance coverage</li>
  <li>Research quality ratings and reviews from other families</li>
  <li>Visit facilities and meet with staff when possible</li>
</ul>
<p>Taking the time to thoroughly evaluate these factors will help ensure you find the right fit for your family's unique situation.</p>
`;

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function ResourceArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  // Try Supabase first, then fall back to mock data
  const article = await getArticleBySlug(slug);
  const mockResource = !article ? getResourceBySlug(slug) : null;

  if (!article && !mockResource) {
    notFound();
  }

  // Normalize data
  const title = article?.title ?? mockResource!.title;
  const subtitle = article?.subtitle ?? mockResource?.subtitle ?? "";
  const authorName = article?.author_name ?? mockResource!.author.name;
  const authorRole = article?.author_role ?? mockResource!.author.role;
  let authorAvatar = article?.author_avatar ?? mockResource?.author.avatar ?? null;
  const readingTime = article?.reading_time ?? mockResource!.readingTime;
  const publishedAt = article?.published_at ?? mockResource!.publishedAt;
  const coverImage = article?.cover_image_url ?? mockResource!.coverImage;
  const careTypes = (article?.care_types ?? mockResource!.careTypes) as CareTypeId[];
  const tags = article?.tags ?? mockResource!.tags ?? [];
  const primaryCareType = careTypes[0] as CareTypeId | undefined;
  const careTypeLabel = primaryCareType ? CARE_TYPE_CONFIG[primaryCareType]?.label : null;
  const showAuthorCard = authorName !== "Olera Team";
  const knownAuthor = getAuthorByName(authorName);
  const authorSlug = knownAuthor?.slug;
  // Fall back to static author avatar when DB value is missing
  if (!authorAvatar && knownAuthor?.avatar) {
    authorAvatar = knownAuthor.avatar;
  }

  // Render content
  let contentHtml = article?.content_html || "";
  if (!contentHtml && article?.content_json && Object.keys(article.content_json).length > 0) {
    contentHtml = renderContentToHTML(article.content_json);
  }
  const hasRealContent = !!contentHtml;

  // Process HTML for heading IDs + TOC
  const rawHtml = hasRealContent ? contentHtml : MOCK_ARTICLE_HTML;
  const { html: processedHtml, headings } = processArticleHtml(rawHtml);
  const showToc = headings.length >= 2;

  // Related articles
  const related = article
    ? await getRelatedArticles(article.id, careTypes, 3)
    : [];

  // JSON-LD structured data
  const articleJsonLd = article ? {
    "@context": "https://schema.org",
    "@type": article.structured_data_type || "Article",
    headline: title,
    description: article.excerpt || subtitle,
    image: coverImage || undefined,
    datePublished: article.published_at,
    dateModified: article.updated_at,
    author: {
      "@type": "Person",
      name: authorName,
      ...(authorRole && { jobTitle: authorRole }),
    },
    publisher: {
      "@type": "Organization",
      name: "Olera",
      url: "https://olera.care",
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `https://olera.care/caregiver-support/${slug}`,
    },
  } : null;

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://olera.care" },
      { "@type": "ListItem", position: 2, name: "Caregiver Support", item: "https://olera.care/caregiver-support" },
      { "@type": "ListItem", position: 3, name: title },
    ],
  };

  return (
    <main className="min-h-screen bg-white">
      {/* JSON-LD */}
      {articleJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
        />
      )}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      {/* ─── Unified content container ───────────────────── */}
      <div className={`max-w-[1100px] mx-auto px-5 ${showToc ? "lg:flex lg:gap-16" : ""}`}>
        {/* Left column: header + image + body */}
        <div className={`${showToc ? "flex-1 max-w-[680px]" : "max-w-[680px] mx-auto"}`}>

          {/* ─── Header ─────────────────────────────────────── */}
          <header className="pt-8 md:pt-12">
            {/* Back link */}
            <Link
              href="/caregiver-support"
              className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition-colors mb-6"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
              </svg>
              Caregiver Support
            </Link>

            {/* Category */}
            {careTypeLabel && (
              <p className="text-xs font-semibold uppercase tracking-wider text-primary-600 mb-3">
                {careTypeLabel}
              </p>
            )}

            {/* Title */}
            <h1 className="font-display text-display-sm md:text-display-md text-gray-900 tracking-[-0.02em] mb-3">
              {title}
            </h1>

            {/* Subtitle */}
            {subtitle && (
              <p className="text-lg text-gray-500 mb-4">
                {subtitle}
              </p>
            )}

            {/* Metadata row */}
            <div className="flex items-center gap-1.5 text-sm text-gray-400 mb-10">
              {showAuthorCard && (
                <>
                  <div className="flex items-center gap-2">
                    {authorAvatar ? (
                      <img
                        src={authorAvatar}
                        alt={authorName}
                        className="w-8 h-8 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center">
                        <span className="text-white text-xs font-medium">
                          {authorName.split(" ").map((n) => n[0]).join("")}
                        </span>
                      </div>
                    )}
                    {authorSlug ? (
                      <Link href={`/author/${authorSlug}`} className="text-gray-600 font-medium hover:text-primary-600 transition-colors">
                        {authorName}
                      </Link>
                    ) : (
                      <span className="text-gray-600 font-medium">{authorName}</span>
                    )}
                  </div>
                  <span className="text-gray-300 mx-1.5">&middot;</span>
                </>
              )}
              <span>{formatDate(publishedAt)}</span>
              <span className="text-gray-300 mx-1.5">&middot;</span>
              <span>{readingTime}</span>
            </div>
          </header>

          {/* ─── Hero Image ─────────────────────────────────── */}
          {coverImage && (
            <figure className="mb-10">
              <img
                src={coverImage}
                alt={title}
                className="w-full aspect-[2/1] object-cover rounded-2xl"
              />
            </figure>
          )}

          {/* ─── Article body ───────────────────────────────── */}
          <article>
          {/* Mobile TOC */}
          {showToc && <MobileTableOfContents headings={headings} />}

          {/* Content — split at widget placeholders to inject React components */}
          {(() => {
            const MARKERS: Record<string, React.ReactNode> = {
              "<!-- eligibility-checker -->": <EligibilityChecker />,
              "<!-- spend-down-calculator -->": <SpendDownWidget initialStateCode="TX" />,
              "<!-- faq-accordion -->": slug === "how-to-pay-for-senior-care-in-texas" ? <SeniorCareFAQ /> : slug === "star-plus-waiver-texas-complete-guide" ? <StarPlusFAQ /> : slug === "texas-medicaid-eligibility-seniors-2026" ? <MedicaidEligibilityFAQ /> : <ArticleFAQ />,
            };
            let segments: React.ReactNode[] = [processedHtml];
            for (const [marker, component] of Object.entries(MARKERS)) {
              const nextSegments: React.ReactNode[] = [];
              for (const seg of segments) {
                if (typeof seg === "string" && seg.includes(marker)) {
                  const parts = seg.split(marker);
                  parts.forEach((part, idx) => {
                    if (idx > 0) nextSegments.push(component);
                    nextSegments.push(part);
                  });
                } else {
                  nextSegments.push(seg);
                }
              }
              segments = nextSegments;
            }
            return (
              <>
                {segments.map((seg, i) =>
                  typeof seg === "string" ? (
                    seg.trim() ? <div key={i} className="prose-editorial" dangerouslySetInnerHTML={{ __html: seg }} /> : null
                  ) : (
                    <div key={i}>{seg}</div>
                  )
                )}
              </>
            );
          })()}

          {/* Contextual CTA */}
          {primaryCareType && (
            <Link
              href={`/browse?type=${primaryCareType}`}
              className="group block my-12 p-5 rounded-xl border border-gray-200 hover:border-primary-200 hover:bg-primary-50/30 transition-all duration-200"
            >
              <p className="text-base font-semibold text-gray-900 mb-1">
                Looking for {CARE_TYPE_CONFIG[primaryCareType].label.toLowerCase()} providers?
              </p>
              <p className="text-sm text-gray-500 flex items-center gap-1">
                Browse verified options in your area
                <svg className="w-4 h-4 text-gray-400 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </p>
            </Link>
          )}

          {/* Author + Tags */}
          <div className="mt-12 pt-8 border-t border-gray-200">
            {showAuthorCard && (
              <div className="flex items-center gap-3 mb-6">
                {authorAvatar ? (
                  <img
                    src={authorAvatar}
                    alt={authorName}
                    className="w-10 h-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-sm font-medium">
                      {authorName.split(" ").map((n) => n[0]).join("")}
                    </span>
                  </div>
                )}
                <div>
                  {authorSlug ? (
                    <Link href={`/author/${authorSlug}`} className="text-sm font-semibold text-gray-900 hover:text-primary-600 transition-colors">
                      {authorName}
                    </Link>
                  ) : (
                    <p className="text-sm font-semibold text-gray-900">{authorName}</p>
                  )}
                  {authorRole && (
                    <p className="text-sm text-gray-500">{authorRole}</p>
                  )}
                </div>
              </div>
            )}

            {/* Tags */}
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {careTypes.map((careType) => (
                <span
                  key={careType}
                  className="text-sm text-gray-500"
                >
                  {CARE_TYPE_CONFIG[careType]?.label ?? careType}
                </span>
              ))}
              {tags.slice(0, 3).map((tag) => (
                <span key={tag} className="text-sm text-gray-400">
                  {tag}
                </span>
              ))}
            </div>
          </div>

          {/* Related Articles */}
          {related.length > 0 && (
            <section className="mt-14 mb-16">
              <h2 className="text-lg font-semibold text-gray-900 mb-6">Recommended</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                {related.map((r) => {
                  const relatedCareType = r.care_types?.[0] as CareTypeId | undefined;
                  const relatedLabel = relatedCareType ? CARE_TYPE_CONFIG[relatedCareType]?.label : null;
                  return (
                    <Link key={r.id} href={`/caregiver-support/${r.slug}`} className="group block">
                      {r.cover_image_url && (
                        <img
                          src={r.cover_image_url}
                          alt={r.title}
                          className="w-full aspect-[3/2] object-cover rounded-xl mb-3 group-hover:opacity-90 transition-opacity"
                        />
                      )}
                      {relatedLabel && (
                        <p className="text-xs font-semibold uppercase tracking-wider text-primary-600 mb-1">
                          {relatedLabel}
                        </p>
                      )}
                      <h3 className="text-sm font-semibold text-gray-900 group-hover:text-primary-600 transition-colors line-clamp-2 mb-1">
                        {r.title}
                      </h3>
                      {r.reading_time && (
                        <p className="text-xs text-gray-400">{r.reading_time}</p>
                      )}
                    </Link>
                  );
                })}
              </div>
            </section>
          )}
          </article>
        </div>

        {/* Desktop TOC sidebar */}
        {showToc && (
          <aside className="hidden lg:block w-[220px] flex-shrink-0">
            <div className="sticky top-[96px] pt-4">
              <DesktopTableOfContents headings={headings} />
            </div>
          </aside>
        )}
      </div>

      {/* Bottom spacing when no related articles */}
      {related.length === 0 && <div className="pb-16" />}
    </main>
  );
}
