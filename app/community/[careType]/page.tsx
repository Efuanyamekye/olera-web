"use client";

import { useState, useMemo } from "react";
import { useParams, notFound } from "next/navigation";
import Link from "next/link";
import ForumPostCard from "@/components/community/ForumPostCard";
import ForumCategoryTabs from "@/components/community/ForumCategoryTabs";
import { getPostsByCategory, getPopularPosts } from "@/data/mock/forumPosts";
import { SortOption, CareTypeId, ALL_CARE_TYPES, CARE_TYPE_CONFIG } from "@/types/forum";

export default function CareTypeForumPage() {
  const params = useParams();
  const careType = params.careType as string;

  if (!ALL_CARE_TYPES.includes(careType as CareTypeId)) {
    notFound();
  }

  const validCareType = careType as CareTypeId;
  const careTypeConfig = CARE_TYPE_CONFIG[validCareType];

  const [sortBy, setSortBy] = useState<SortOption>("recent");
  const [searchQuery, setSearchQuery] = useState("");

  const posts = useMemo(() => {
    let filtered = getPostsByCategory(validCareType);
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (post) =>
          post.title.toLowerCase().includes(query) ||
          post.content.toLowerCase().includes(query) ||
          post.tags.some((tag) => tag.toLowerCase().includes(query))
      );
    }
    switch (sortBy) {
      case "popular":
        return [...filtered].sort((a, b) => b.likeCount - a.likeCount);
      case "most-discussed":
        return [...filtered].sort((a, b) => b.commentCount - a.commentCount);
      case "unanswered":
        return filtered.filter((p) => p.commentCount === 0);
      case "recent":
      default:
        return filtered;
    }
  }, [validCareType, sortBy, searchQuery]);

  const popularPosts = getPopularPosts(3);

  return (
    <main className="min-h-screen bg-gray-50">
      <section className="bg-gradient-to-br from-primary-600 to-primary-800 text-white py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <nav className="flex items-center gap-2 text-primary-200 text-sm mb-4">
              <Link href="/community" className="hover:text-white transition-colors">Community</Link>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <span className="text-white">{careTypeConfig.label}</span>
            </nav>
            <h1 className="text-4xl md:text-5xl font-bold mb-4">{careTypeConfig.label} Forum</h1>
            <p className="text-xl text-primary-100 mb-8">
              Connect with families and experts about {careTypeConfig.label.toLowerCase()}. Ask questions, share experiences, and find support.
            </p>
            <Link href={`/community/new?type=${validCareType}`} className="inline-flex items-center gap-2 bg-white text-primary-700 px-6 py-3 rounded-lg font-semibold hover:bg-primary-50 transition-colors shadow-lg">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Ask a Question
            </Link>
          </div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <ForumCategoryTabs activeCategory={validCareType} />
        </div>
        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          <div className="relative flex-1 max-w-md">
            <input
              type="text"
              placeholder={`Search ${careTypeConfig.label.toLowerCase()} discussions...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="px-4 py-2.5 rounded-lg border border-gray-200 bg-white text-gray-700 font-medium focus:outline-none focus:ring-2 focus:ring-primary-500 cursor-pointer"
          >
            <option value="recent">Most Recent</option>
            <option value="popular">Most Popular</option>
            <option value="most-discussed">Most Discussed</option>
            <option value="unanswered">Unanswered</option>
          </select>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-4">
            {posts.length > 0 ? (
              posts.map((post) => <ForumPostCard key={post.id} post={post} />)
            ) : (
              <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No discussions found</h3>
                <p className="text-gray-500 mb-6">
                  {searchQuery ? "Try different keywords." : `Be the first to start a discussion about ${careTypeConfig.label.toLowerCase()}!`}
                </p>
              </div>
            )}
          </div>
          <aside className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <h3 className="font-semibold text-gray-900 mb-4">Popular Discussions</h3>
              <div className="space-y-3">
                {popularPosts.map((post) => (
                  <Link key={post.id} href={`/community/post/${post.slug}`} className="block group">
                    <h4 className="text-sm font-medium text-gray-900 group-hover:text-primary-600 transition-colors line-clamp-2">{post.title}</h4>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                      <span>{post.likeCount} likes</span>
                      <span>{post.commentCount} comments</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <h3 className="font-semibold text-gray-900 mb-2">Find {careTypeConfig.label} Providers</h3>
              <p className="text-sm text-gray-600 mb-4">Browse verified {careTypeConfig.label.toLowerCase()} providers in your area.</p>
              <Link href={`/browse?type=${validCareType}`} className="block text-center bg-primary-600 text-white px-4 py-2.5 rounded-lg font-medium hover:bg-primary-700 transition-colors">
                Browse Providers
              </Link>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
