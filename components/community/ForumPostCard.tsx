"use client";

import Link from "next/link";
import { ForumPost, CARE_TYPE_CONFIG } from "@/types/forum";

interface ForumPostCardProps {
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
      <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
        <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      </div>
    );
  }
  if (author.avatar) {
    return <img src={author.avatar} alt={author.displayName} className="w-10 h-10 rounded-full object-cover" />;
  }
  const initials = author.displayName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  return (
    <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center">
      <span className="text-primary-700 font-medium text-sm">{initials}</span>
    </div>
  );
}

function RoleBadge({ role }: { role: ForumPost["author"]["role"] }) {
  const roleConfig = {
    family: { label: "Family", className: "bg-blue-100 text-blue-700" },
    caregiver: { label: "Caregiver", className: "bg-green-100 text-green-700" },
    provider: { label: "Provider", className: "bg-purple-100 text-purple-700" },
    expert: { label: "Expert", className: "bg-amber-100 text-amber-700" },
  };
  const config = roleConfig[role];
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${config.className}`}>{config.label}</span>;
}

export default function ForumPostCard({ post }: ForumPostCardProps) {
  const careTypeConfig = CARE_TYPE_CONFIG[post.careType];

  return (
    <Link href={`/community/post/${post.slug}`}>
      <article className="group bg-white rounded-xl border border-gray-100 p-5 hover:shadow-md hover:border-primary-100 transition-all duration-300">
        {post.isPinned && (
          <div className="flex items-center gap-1.5 text-amber-600 text-xs font-medium mb-3">
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M5 5a2 2 0 012-2h6a2 2 0 012 2v1h1a1 1 0 110 2h-1v4.586l.707.707a1 1 0 01-1.414 1.414L13 13.414l-.293.293a1 1 0 01-1.414 0L10 12.414l-1.293 1.293a1 1 0 01-1.414-1.414l.707-.707V8H7a1 1 0 110-2h1V5z" />
            </svg>
            Pinned
          </div>
        )}
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex items-center gap-3">
            <AuthorAvatar author={post.author} />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-900">{post.author.displayName}</span>
                <RoleBadge role={post.author.role} />
              </div>
              <span className="text-sm text-gray-500">{formatTimeAgo(post.createdAt)}</span>
            </div>
          </div>
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${careTypeConfig.bgColor} ${careTypeConfig.color}`}>
            {careTypeConfig.label}
          </span>
        </div>
        <h3 className="text-lg font-semibold text-gray-900 group-hover:text-primary-600 transition-colors mb-2 line-clamp-2">{post.title}</h3>
        <p className="text-gray-600 text-sm leading-relaxed line-clamp-2 mb-4">{post.excerpt}</p>
        {post.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {post.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-md">#{tag}</span>
            ))}
          </div>
        )}
        <div className="flex items-center gap-4 text-sm text-gray-500 pt-3 border-t border-gray-100">
          <div className="flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
            <span>{post.likeCount}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <span>{post.commentCount} comments</span>
          </div>
          <div className="flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            <span>{post.viewCount}</span>
          </div>
        </div>
      </article>
    </Link>
  );
}
