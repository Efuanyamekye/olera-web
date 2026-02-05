"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import ForumPostCard from "@/components/community/ForumPostCard";
import ForumCategoryTabs from "@/components/community/ForumCategoryTabs";
import { getPostsByCategory, getPopularPosts } from "@/data/mock/forumPosts";
import { SortOption } from "@/types/forum";

export default function CommunityPage() {
  const [sortBy, setSortBy] = useState<SortOption>("recent");
  const [searchQuery, setSearchQuery] = useState("");

  const posts = useMemo(() => {
    let filtered = getPostsByCategory("all");
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
  }, [sortBy, searchQuery]);

  const popularPosts = getPopularPosts(3);

  return (
    <main className="min-h-screen bg-gray-50">
      <section className="bg-gradient-to-br from-primary-600 to-primary-800 text-white py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">Community Forum</h1>
            <p className="text-xl text-primary-100 mb-8">
              Connect with families, caregivers, and experts. Ask questions, share experiences, and find support on your senior care journey.
            </p>
            <Link href="/community/new" className="inline-flex items-center gap-2 bg-white text-primary-700 px-6 py-3 rounded-lg font-semibold hover:bg-primary-50 transition-colors shadow-lg">
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
          <ForumCategoryTabs activeCategory="all" />
        </div>
        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          <div className="relative flex-1 max-w-md">
            <input
              type="text"
              placeholder="Search discussions..."
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
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No discussions found</h3>
                <p className="text-gray-500 mb-6">{searchQuery ? "Try different keywords or browse all topics." : "Be the first to start a discussion!"}</p>
              </div>
            )}
          </div>
          <aside className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z" />
                </svg>
                Popular Discussions
              </h3>
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
            <div className="bg-primary-50 rounded-xl border border-primary-100 p-5">
              <h3 className="font-semibold text-primary-900 mb-3">Community Guidelines</h3>
              <ul className="text-sm text-primary-800 space-y-2">
                <li>• Be respectful and supportive</li>
                <li>• Share from personal experience</li>
                <li>• Protect privacy - no personal info</li>
                <li>• This is not medical advice</li>
              </ul>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <h3 className="font-semibold text-gray-900 mb-2">Need personalized help?</h3>
              <p className="text-sm text-gray-600 mb-4">Our care advisors can help you find the right care options for your family.</p>
              <Link href="/browse" className="block text-center bg-primary-600 text-white px-4 py-2.5 rounded-lg font-medium hover:bg-primary-700 transition-colors">
                Find Care Options
              </Link>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
