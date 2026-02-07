"use client";

import { useState } from "react";
import { ForumPost, CARE_TYPE_CONFIG } from "@/types/forum";

interface PostContentProps {
  post: ForumPost;
  showBackLink?: boolean;
  onClose?: () => void; // For modal close
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
      <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      </div>
    );
  }
  if (author.avatar) {
    return <img src={author.avatar} alt={author.displayName} className="w-10 h-10 rounded-full object-cover flex-shrink-0" />;
  }
  const initials = author.displayName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  return (
    <div className="w-10 h-10 rounded-full bg-primary-50 flex items-center justify-center flex-shrink-0">
      <span className="text-primary-600 font-medium text-sm">{initials}</span>
    </div>
  );
}

export default function PostContent({ post, onClose }: PostContentProps) {
  const careTypeConfig = CARE_TYPE_CONFIG[post.careType];
  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(post.likeCount);

  const handleLike = () => {
    setIsLiked(!isLiked);
    setLikeCount(isLiked ? likeCount - 1 : likeCount + 1);
  };

  return (
    <article>
      {/* Author & Meta */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <AuthorAvatar author={post.author} />
          <div>
            <span className="font-medium text-gray-900">{post.author.displayName}</span>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <span>{formatTimeAgo(post.createdAt)}</span>
              <span className="text-gray-300">·</span>
              <span>{post.viewCount} views</span>
            </div>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Title */}
      <h1 className="text-2xl font-semibold text-gray-900 mb-4">{post.title}</h1>

      {/* Care Type Badge + Tags */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <span className={`inline-flex text-xs font-medium px-2.5 py-1 rounded-full ${careTypeConfig.bgColor} ${careTypeConfig.color}`}>
          {careTypeConfig.label}
        </span>
        {post.tags.map((tag) => (
          <span key={tag} className="text-xs px-2.5 py-1 bg-gray-100 text-gray-600 rounded-full">
            {tag}
          </span>
        ))}
      </div>

      {/* Content */}
      <div className="prose prose-gray max-w-none mb-8">
        {post.content.split("\n").map((paragraph, idx) => (
          <p key={idx} className="text-gray-600 leading-relaxed mb-4 last:mb-0">{paragraph}</p>
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-4 py-4 border-t border-gray-100">
        <button
          onClick={handleLike}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            isLiked
              ? "bg-red-50 text-red-600"
              : "bg-gray-50 text-gray-600 hover:bg-gray-100"
          }`}
        >
          <svg className="w-4 h-4" fill={isLiked ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
          {likeCount}
        </button>
        <span className="flex items-center gap-2 text-sm text-gray-500">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          {post.commentCount} {post.commentCount === 1 ? "comment" : "comments"}
        </span>
        <button className="flex items-center gap-2 px-3 py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-lg transition-colors ml-auto">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
          </svg>
          Share
        </button>
      </div>
    </article>
  );
}
