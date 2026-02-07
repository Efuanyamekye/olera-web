"use client";

import Link from "next/link";
import { ForumPost, CARE_TYPE_CONFIG } from "@/types/forum";

interface ForumPostCardV2Props {
  post: ForumPost;
}

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diffInSeconds < 60) return "just now";
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function AuthorAvatar({ author }: { author: ForumPost["author"] }) {
  if (author.isAnonymous) {
    return (
      <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      </div>
    );
  }
  if (author.avatar) {
    return <img src={author.avatar} alt={author.displayName} className="w-8 h-8 rounded-full object-cover" />;
  }
  const initials = author.displayName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  return (
    <div className="w-8 h-8 rounded-full bg-primary-50 flex items-center justify-center">
      <span className="text-primary-600 font-medium text-xs">{initials}</span>
    </div>
  );
}

export default function ForumPostCardV2({ post }: ForumPostCardV2Props) {
  const careTypeConfig = CARE_TYPE_CONFIG[post.careType];

  return (
    <Link href={`/community/post/${post.slug}`}>
      <article className="group bg-white rounded-xl border border-gray-200/60 shadow-sm p-6 hover:shadow-md transition-all duration-200">
        {/* Header: Author + Care Type */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <AuthorAvatar author={post.author} />
            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-900 font-medium">{post.author.displayName}</span>
              <span className="text-gray-300">·</span>
              <span className="text-gray-500">{formatTimeAgo(post.createdAt)}</span>
            </div>
          </div>
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${careTypeConfig.bgColor} ${careTypeConfig.color}`}>
            {careTypeConfig.label}
          </span>
        </div>

        {/* Pinned indicator */}
        {post.isPinned && (
          <div className="flex items-center gap-1.5 text-amber-600 text-xs font-medium mb-2">
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M5 5a2 2 0 012-2h6a2 2 0 012 2v1h1a1 1 0 110 2h-1v4.586l.707.707a1 1 0 01-1.414 1.414L13 13.414l-.293.293a1 1 0 01-1.414 0L10 12.414l-1.293 1.293a1 1 0 01-1.414-1.414l.707-.707V8H7a1 1 0 110-2h1V5z" />
            </svg>
            Pinned
          </div>
        )}

        {/* Title */}
        <h3 className="text-base font-semibold text-gray-900 group-hover:text-primary-600 transition-colors mb-2 line-clamp-2">
          {post.title}
        </h3>

        {/* Excerpt */}
        <p className="text-sm text-gray-500 leading-relaxed line-clamp-2 mb-4">
          {post.excerpt}
        </p>

        {/* Footer: Engagement metrics */}
        <div className="flex items-center gap-4 text-sm text-gray-400">
          <span className="flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
            {post.likeCount}
          </span>
          <span className="flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            {post.commentCount}
          </span>
          <span className="flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            {post.viewCount}
          </span>
        </div>
      </article>
    </Link>
  );
}
