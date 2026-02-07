"use client";

import { Suspense, useState, useMemo, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ForumPostCardV3 from "@/components/community/ForumPostCardV3";
import PostModal from "@/components/community/PostModal";
import GuidelinesDrawer from "@/components/community/GuidelinesDrawer";
import { getPostsByCategory, getPostBySlug } from "@/data/mock/forumPosts";
import { ForumPost, CareTypeId, CARE_TYPE_CONFIG, ALL_CARE_TYPES } from "@/types/forum";

// Category styling with colorful icons
const CATEGORY_STYLES: Record<CareTypeId | "all", { emoji: string; bg: string; activeBg: string; hoverBg: string }> = {
  all: { emoji: "💬", bg: "bg-slate-100", activeBg: "bg-slate-200", hoverBg: "hover:bg-slate-50" },
  "home-health": { emoji: "🏥", bg: "bg-rose-100", activeBg: "bg-rose-200", hoverBg: "hover:bg-rose-50" },
  "home-care": { emoji: "🏠", bg: "bg-amber-100", activeBg: "bg-amber-200", hoverBg: "hover:bg-amber-50" },
  "assisted-living": { emoji: "🤝", bg: "bg-blue-100", activeBg: "bg-blue-200", hoverBg: "hover:bg-blue-50" },
  "memory-care": { emoji: "🧠", bg: "bg-purple-100", activeBg: "bg-purple-200", hoverBg: "hover:bg-purple-50" },
  "nursing-homes": { emoji: "🏢", bg: "bg-emerald-100", activeBg: "bg-emerald-200", hoverBg: "hover:bg-emerald-50" },
  "independent-living": { emoji: "☀️", bg: "bg-orange-100", activeBg: "bg-orange-200", hoverBg: "hover:bg-orange-50" },
};

function CommunityPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Prevent hydration flash by waiting for mount
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Get category from URL param (for context-aware navigation)
  const categoryParam = searchParams.get("category");
  const urlCategory: CareTypeId | "all" =
    categoryParam && ALL_CARE_TYPES.includes(categoryParam as CareTypeId)
      ? (categoryParam as CareTypeId)
      : "all";

  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<CareTypeId | "all">(urlCategory);

  // Sync state with URL when navigating (e.g., from Find Care menu or back button)
  useEffect(() => {
    setActiveCategory(urlCategory);
  }, [urlCategory]);
  const [showComposer, setShowComposer] = useState(false);
  const [composerTitle, setComposerTitle] = useState("");
  const [composerText, setComposerText] = useState("");
  const [composerCategory, setComposerCategory] = useState("");
  const [showGuidelines, setShowGuidelines] = useState(false);

  // Validation error state
  const [composerErrors, setComposerErrors] = useState({
    title: "",
    content: "",
    category: "",
  });

  // Handle post submission with validation
  const handlePostSubmit = () => {
    const errors = {
      title: composerTitle.trim() === "" ? "Please add a discussion title" : "",
      content: composerText.trim() === "" ? "Please add content to your post" : "",
      category: composerCategory === "" ? "Please select a category" : "",
    };

    setComposerErrors(errors);

    // Check if any errors exist
    const hasErrors = Object.values(errors).some(error => error !== "");
    if (hasErrors) {
      return;
    }

    // TODO: Submit the post
    console.log("Submitting post:", { title: composerTitle, content: composerText, category: composerCategory });

    // Reset form on success
    setShowComposer(false);
    setComposerTitle("");
    setComposerText("");
    setComposerCategory("");
    setComposerErrors({ title: "", content: "", category: "" });
  };

  // Clear errors when user starts typing
  const handleTitleChange = (value: string) => {
    setComposerTitle(value);
    if (composerErrors.title && value.trim() !== "") {
      setComposerErrors(prev => ({ ...prev, title: "" }));
    }
  };

  const handleContentChange = (value: string) => {
    setComposerText(value);
    if (composerErrors.content && value.trim() !== "") {
      setComposerErrors(prev => ({ ...prev, content: "" }));
    }
  };

  const handleCategorySelect = (value: string) => {
    setComposerCategory(value);
    if (composerErrors.category && value !== "") {
      setComposerErrors(prev => ({ ...prev, category: "" }));
    }
  };

  // Get selected post from URL param
  const selectedPostSlug = searchParams.get("post");
  const selectedPost = selectedPostSlug ? getPostBySlug(selectedPostSlug) ?? null : null;

  // All hooks must be called before any early returns (React rules of hooks)
  const posts = useMemo(() => {
    let filtered = getPostsByCategory(activeCategory);
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (post) =>
          post.title.toLowerCase().includes(query) ||
          post.content.toLowerCase().includes(query) ||
          post.tags.some((tag) => tag.toLowerCase().includes(query))
      );
    }
    return filtered;
  }, [searchQuery, activeCategory]);

  // Calculate category counts
  const categoryCounts = useMemo(() => {
    const counts: Record<CareTypeId | "all", number> = {
      all: getPostsByCategory("all").length,
      "home-health": getPostsByCategory("home-health").length,
      "home-care": getPostsByCategory("home-care").length,
      "assisted-living": getPostsByCategory("assisted-living").length,
      "memory-care": getPostsByCategory("memory-care").length,
      "nursing-homes": getPostsByCategory("nursing-homes").length,
      "independent-living": getPostsByCategory("independent-living").length,
    };
    return counts;
  }, []);

  // Show skeleton until mounted to prevent layout flash
  // (Must be after all hooks to comply with React rules of hooks)
  if (!isMounted) {
    return <MountingSkeleton />;
  }

  const handlePostClick = (post: ForumPost) => {
    // Preserve category when opening post modal
    if (activeCategory === "all") {
      router.push(`/community?post=${post.slug}`, { scroll: false });
    } else {
      router.push(`/community?category=${activeCategory}&post=${post.slug}`, { scroll: false });
    }
  };

  const handleCloseModal = () => {
    // Preserve category when closing modal
    if (activeCategory === "all") {
      router.push("/community", { scroll: false });
    } else {
      router.push(`/community?category=${activeCategory}`, { scroll: false });
    }
  };

  const handleCategoryChange = (category: CareTypeId | "all") => {
    setActiveCategory(category);
    // Update URL to reflect category (for shareable links and back button)
    if (category === "all") {
      router.push("/community", { scroll: false });
    } else {
      router.push(`/community?category=${category}`, { scroll: false });
    }
  };

  return (
    <main className="min-h-screen lg:h-screen lg:overflow-hidden bg-gray-50/50 animate-page-in">
      {/* Two-Column Layout */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:h-full">
        <div className="flex gap-6 lg:h-full">
          {/* Left Sidebar - Fixed position */}
          <aside className="hidden lg:block w-[400px] flex-shrink-0">
            <div className="fixed top-[88px] w-[400px] h-[calc(100vh-112px)] left-[max(1rem,calc((100vw-1280px)/2+2rem))] bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
              {/* Search */}
              <div className="p-3 border-b border-gray-100">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search discussions..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent focus:bg-white transition-all"
                  />
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
              </div>

              {/* Categories */}
              <div className="p-3">
                <p className="px-1 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">Categories</p>
                <nav className="space-y-1.5">
                  <button
                    onClick={() => handleCategoryChange("all")}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[15px] transition-all duration-200 ${
                      activeCategory === "all"
                        ? "bg-gray-100 text-gray-900 font-semibold shadow-sm"
                        : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                    }`}
                  >
                    <span className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0 transition-colors ${
                      activeCategory === "all" ? CATEGORY_STYLES["all"].activeBg : CATEGORY_STYLES["all"].bg
                    }`}>
                      {CATEGORY_STYLES["all"].emoji}
                    </span>
                    <span className="flex-1 text-left">All Discussions</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      activeCategory === "all"
                        ? "bg-gray-200 text-gray-700"
                        : "bg-gray-100 text-gray-500"
                    }`}>
                      {categoryCounts.all}
                    </span>
                  </button>
                  {ALL_CARE_TYPES.map((careType) => {
                    const config = CARE_TYPE_CONFIG[careType];
                    const style = CATEGORY_STYLES[careType];
                    const count = categoryCounts[careType];
                    return (
                      <button
                        key={careType}
                        onClick={() => handleCategoryChange(careType)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[15px] transition-all duration-200 ${
                          activeCategory === careType
                            ? "bg-gray-100 text-gray-900 font-semibold shadow-sm"
                            : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                        }`}
                      >
                        <span className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0 transition-colors ${
                          activeCategory === careType ? style.activeBg : style.bg
                        }`}>
                          {style.emoji}
                        </span>
                        <span className="flex-1 text-left">{config.label}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          activeCategory === careType
                            ? "bg-gray-200 text-gray-700"
                            : "bg-gray-100 text-gray-500"
                        }`}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </nav>
              </div>

              {/* Divider + Community Guidelines Link - Bottom aligned */}
              <div className="mt-auto">
                <div className="mx-3 border-t border-gray-100" />

                {/* Community Guidelines Link */}
                <div className="p-3">
                <button
                  onClick={() => setShowGuidelines(true)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors group"
                >
                  <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 group-hover:bg-primary-100 transition-colors">
                    <svg className="w-5 h-5 text-gray-500 group-hover:text-primary-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                  <div className="flex-1 text-left">
                    <span className="text-sm font-medium">Community Guidelines</span>
                  </div>
                  <svg className="w-4 h-4 text-gray-400 group-hover:text-gray-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
                </div>
              </div>
            </div>
          </aside>

          {/* Main Content - Fixed position on desktop */}
          <div className="flex-1 min-w-0 lg:ml-[424px]">
            {/* Desktop: Fixed Right Panel */}
            <div className="hidden lg:flex lg:flex-col fixed top-[88px] right-[max(1rem,calc((100vw-1280px)/2+2rem))] left-[calc(max(1rem,calc((100vw-1280px)/2+2rem))+424px)] h-[calc(100vh-112px)] bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              {/* Sticky Post Composer */}
              <div className="flex-shrink-0 p-4 border-b border-gray-100 bg-white">
                {!showComposer ? (
                  <div
                    onClick={() => setShowComposer(true)}
                    className="w-full flex items-center gap-3 cursor-pointer"
                  >
                    <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-primary-600 font-medium text-sm">JD</span>
                    </div>
                    <div className="flex-1 text-left px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-500 text-sm font-medium hover:border-gray-400 hover:bg-gray-50 transition-colors">
                      Start a discussion...
                    </div>
                    <button className="px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors">
                      Post
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                        <span className="text-primary-600 font-medium text-sm">JD</span>
                      </div>
                      <div className="flex-1 space-y-3">
                        <div>
                          <input
                            type="text"
                            value={composerTitle}
                            onChange={(e) => handleTitleChange(e.target.value)}
                            placeholder="Discussion title..."
                            className={`w-full px-0 py-2 text-lg font-medium text-gray-900 placeholder-gray-400 border-0 border-b focus:outline-none bg-transparent ${
                              composerErrors.title ? "border-red-400 focus:border-red-500" : "border-gray-200 focus:border-primary-500"
                            }`}
                          />
                          {composerErrors.title && (
                            <p className="mt-1 text-sm text-red-500">{composerErrors.title}</p>
                          )}
                        </div>
                        <div>
                          <textarea
                            value={composerText}
                            onChange={(e) => handleContentChange(e.target.value)}
                            placeholder="Share your thoughts, questions, or experiences..."
                            className={`w-full px-0 py-2 text-gray-700 placeholder-gray-400 resize-none focus:outline-none bg-transparent ${
                              composerErrors.content ? "border-b border-red-400" : ""
                            }`}
                            rows={4}
                          />
                          {composerErrors.content && (
                            <p className="mt-1 text-sm text-red-500">{composerErrors.content}</p>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                      <div>
                        <select
                          value={composerCategory}
                          onChange={(e) => handleCategorySelect(e.target.value)}
                          className={`text-sm bg-gray-50 border rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                            composerErrors.category ? "border-red-400" : "border-gray-200"
                          } ${composerCategory ? 'text-gray-900' : 'text-gray-500'}`}
                        >
                          <option value="">Select category</option>
                          <option value="home-health">Home Health</option>
                          <option value="home-care">Home Care</option>
                          <option value="assisted-living">Assisted Living</option>
                          <option value="memory-care">Memory Care</option>
                          <option value="nursing-homes">Nursing Homes</option>
                          <option value="independent-living">Independent Living</option>
                        </select>
                        {composerErrors.category && (
                          <p className="mt-1 text-sm text-red-500">{composerErrors.category}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setShowComposer(false);
                            setComposerTitle("");
                            setComposerText("");
                            setComposerCategory("");
                            setComposerErrors({ title: "", content: "", category: "" });
                          }}
                          className="px-4 py-2 text-gray-600 text-sm font-medium hover:text-gray-800 transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handlePostSubmit}
                          className="px-5 py-2 text-sm font-medium rounded-lg transition-colors bg-primary-600 text-white hover:bg-primary-700"
                        >
                          Post Discussion
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Posts Feed Header + Scrollable Content */}
              <div className="flex-1 overflow-y-auto">
                {/* Feed Header with count */}
                <div className="sticky top-0 bg-white/95 backdrop-blur-sm border-b border-gray-100 px-4 py-3 z-10">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-gray-900">
                      {activeCategory === "all" ? "All Discussions" : CARE_TYPE_CONFIG[activeCategory].label}
                    </h2>
                    <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                      {posts.length}
                    </span>
                  </div>
                </div>

                {/* Posts List */}
                <div className="p-4 space-y-4">
                  {posts.length > 0 ? (
                    posts.map((post) => (
                      <ForumPostCardV3
                        key={post.id}
                        post={post}
                        onClick={() => handlePostClick(post)}
                      />
                    ))
                  ) : (
                    <div className="py-12 text-center">
                      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">No discussions found</h3>
                      <p className="text-gray-500">
                        {searchQuery ? "Try different keywords or browse all topics." : "Be the first to start a discussion!"}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Mobile: Search + Categories */}
            <div className="lg:hidden space-y-4 mb-4">
              {/* Search */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search discussions..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>

              {/* Category Pills */}
              <div className="overflow-x-auto scrollbar-hide -mx-4 px-4">
                <div className="flex gap-2 min-w-max pb-1">
                  <button
                    onClick={() => handleCategoryChange("all")}
                    className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                      activeCategory === "all"
                        ? "bg-gray-900 text-white"
                        : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    All
                  </button>
                  {ALL_CARE_TYPES.map((careType) => (
                    <button
                      key={careType}
                      onClick={() => handleCategoryChange(careType)}
                      className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                        activeCategory === careType
                          ? "bg-gray-900 text-white"
                          : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      {CARE_TYPE_CONFIG[careType].label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Mobile: Unified Content Panel (non-fixed height) */}
            <div className="lg:hidden bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              {/* Post Composer */}
              <div className="p-4 border-b border-gray-100">
                {!showComposer ? (
                  <div
                    onClick={() => setShowComposer(true)}
                    className="w-full flex items-center gap-3 cursor-pointer"
                  >
                    <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-primary-600 font-medium text-sm">JD</span>
                    </div>
                    <div className="flex-1 text-left px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-500 text-sm font-medium hover:border-gray-400 hover:bg-gray-50 transition-colors">
                      Start a discussion...
                    </div>
                    <button className="px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors">
                      Post
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                        <span className="text-primary-600 font-medium text-sm">JD</span>
                      </div>
                      <div className="flex-1 space-y-3">
                        <div>
                          <input
                            type="text"
                            value={composerTitle}
                            onChange={(e) => handleTitleChange(e.target.value)}
                            placeholder="Discussion title..."
                            className={`w-full px-0 py-2 text-lg font-medium text-gray-900 placeholder-gray-400 border-0 border-b focus:outline-none bg-transparent ${
                              composerErrors.title ? "border-red-400 focus:border-red-500" : "border-gray-200 focus:border-primary-500"
                            }`}
                          />
                          {composerErrors.title && (
                            <p className="mt-1 text-sm text-red-500">{composerErrors.title}</p>
                          )}
                        </div>
                        <div>
                          <textarea
                            value={composerText}
                            onChange={(e) => handleContentChange(e.target.value)}
                            placeholder="Share your thoughts, questions, or experiences..."
                            className={`w-full px-0 py-2 text-gray-700 placeholder-gray-400 resize-none focus:outline-none bg-transparent ${
                              composerErrors.content ? "border-b border-red-400" : ""
                            }`}
                            rows={4}
                          />
                          {composerErrors.content && (
                            <p className="mt-1 text-sm text-red-500">{composerErrors.content}</p>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                      <div>
                        <select
                          value={composerCategory}
                          onChange={(e) => handleCategorySelect(e.target.value)}
                          className={`text-sm bg-gray-50 border rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                            composerErrors.category ? "border-red-400" : "border-gray-200"
                          } ${composerCategory ? 'text-gray-900' : 'text-gray-500'}`}
                        >
                          <option value="">Select category</option>
                          <option value="home-health">Home Health</option>
                          <option value="home-care">Home Care</option>
                          <option value="assisted-living">Assisted Living</option>
                          <option value="memory-care">Memory Care</option>
                          <option value="nursing-homes">Nursing Homes</option>
                          <option value="independent-living">Independent Living</option>
                        </select>
                        {composerErrors.category && (
                          <p className="mt-1 text-sm text-red-500">{composerErrors.category}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setShowComposer(false);
                            setComposerTitle("");
                            setComposerText("");
                            setComposerCategory("");
                            setComposerErrors({ title: "", content: "", category: "" });
                          }}
                          className="px-4 py-2 text-gray-600 text-sm font-medium hover:text-gray-800 transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handlePostSubmit}
                          className="px-5 py-2 text-sm font-medium rounded-lg transition-colors bg-primary-600 text-white hover:bg-primary-700"
                        >
                          Post Discussion
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Posts Feed */}
              <div className="p-4 space-y-4">
                {posts.length > 0 ? (
                  posts.map((post) => (
                    <ForumPostCardV3
                      key={post.id}
                      post={post}
                      onClick={() => handlePostClick(post)}
                    />
                  ))
                ) : (
                  <div className="py-12 text-center">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">No discussions found</h3>
                    <p className="text-gray-500">
                      {searchQuery ? "Try different keywords or browse all topics." : "Be the first to start a discussion!"}
                    </p>
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>
      </div>

      {/* Post Modal */}
      <PostModal
        post={selectedPost}
        isOpen={!!selectedPost}
        onClose={handleCloseModal}
      />

      {/* Guidelines Drawer */}
      <GuidelinesDrawer
        isOpen={showGuidelines}
        onClose={() => setShowGuidelines(false)}
      />
    </main>
  );
}

// Minimal skeleton shown during mount to prevent layout flash
function MountingSkeleton() {
  return (
    <main className="min-h-screen lg:h-screen lg:overflow-hidden bg-gray-50/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:h-full">
        <div className="flex gap-6 lg:h-full">
          {/* Left Sidebar skeleton */}
          <aside className="hidden lg:block w-[400px] flex-shrink-0">
            <div className="fixed top-[88px] w-[400px] h-[calc(100vh-112px)] left-[max(1rem,calc((100vw-1280px)/2+2rem))] bg-white rounded-xl border border-gray-200 shadow-sm" />
          </aside>
          {/* Main Content skeleton */}
          <div className="flex-1 min-w-0 lg:ml-[424px]">
            <div className="hidden lg:block fixed top-[88px] right-[max(1rem,calc((100vw-1280px)/2+2rem))] left-[calc(max(1rem,calc((100vw-1280px)/2+2rem))+424px)] h-[calc(100vh-112px)] bg-white rounded-xl border border-gray-200 shadow-sm" />
          </div>
        </div>
      </div>
    </main>
  );
}

function LoadingSkeleton() {
  return (
    <main className="min-h-screen bg-gray-50/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex gap-6">
          <aside className="hidden lg:block w-[400px] flex-shrink-0">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="p-3 border-b border-gray-100">
                <div className="flex gap-2">
                  <div className="flex-1 h-9 bg-gray-100 rounded-lg animate-pulse" />
                  <div className="w-9 h-9 bg-gray-100 rounded-lg animate-pulse" />
                </div>
              </div>
              <div className="p-2 space-y-1">
                {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                  <div key={i} className="h-9 bg-gray-50 rounded-lg animate-pulse" />
                ))}
              </div>
              <div className="mx-3 border-t border-gray-100" />
              <div className="p-3">
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <div className="w-9 h-9 bg-gray-100 rounded-lg animate-pulse" />
                  <div className="h-4 w-32 bg-gray-100 rounded animate-pulse" />
                </div>
              </div>
            </div>
          </aside>
          <div className="flex-1 space-y-4">
            <div className="h-20 bg-white rounded-xl border border-gray-200 animate-pulse" />
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-48 bg-white rounded-xl border border-gray-200 animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}

export default function CommunityPage() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <CommunityPageContent />
    </Suspense>
  );
}
