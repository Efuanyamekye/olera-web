"use client";

import { useState } from "react";
import { useParams, notFound } from "next/navigation";
import Link from "next/link";
import { getPostBySlug } from "@/data/mock/forumPosts";
import { getCommentsByPostId } from "@/data/mock/forumComments";
import { CARE_TYPE_CONFIG } from "@/types/forum";
import ForumCommentV2 from "@/components/community/ForumCommentV2";

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

function AuthorAvatar({ author }: { author: { displayName: string; avatar?: string; isAnonymous: boolean } }) {
  if (author.isAnonymous) {
    return (
      <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      </div>
    );
  }
  if (author.avatar) {
    return <img src={author.avatar} alt={author.displayName} className="w-10 h-10 rounded-full object-cover" />;
  }
  const initials = author.displayName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  return (
    <div className="w-10 h-10 rounded-full bg-primary-50 flex items-center justify-center">
      <span className="text-primary-600 font-medium text-sm">{initials}</span>
    </div>
  );
}

export default function PostDetailPage() {
  const params = useParams();
  const slug = params.slug as string;
  const post = getPostBySlug(slug);

  if (!post) {
    notFound();
  }

  const comments = getCommentsByPostId(post.id);
  const careTypeConfig = CARE_TYPE_CONFIG[post.careType];

  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(post.likeCount);
  const [commentText, setCommentText] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);

  const handleLike = () => {
    setIsLiked(!isLiked);
    setLikeCount(isLiked ? likeCount - 1 : likeCount + 1);
  };

  return (
    <main className="min-h-screen bg-white">
      {/* Header with breadcrumb */}
      <div className="border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <nav className="flex items-center gap-2 text-sm text-gray-500">
            <Link href="/community" className="hover:text-gray-700 transition-colors">Community</Link>
            <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
            </svg>
            <Link href={`/community/${post.careType}`} className="hover:text-gray-700 transition-colors">
              {careTypeConfig.label}
            </Link>
          </nav>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Post Content */}
        <article>
          {/* Author & Meta */}
          <div className="flex items-center gap-3 mb-6">
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

          {/* Title */}
          <h1 className="text-2xl font-semibold text-gray-900 mb-4">{post.title}</h1>

          {/* Care Type Badge */}
          <div className="mb-6">
            <span className={`inline-flex text-xs font-medium px-2.5 py-1 rounded-full ${careTypeConfig.bgColor} ${careTypeConfig.color}`}>
              {careTypeConfig.label}
            </span>
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
              {post.commentCount} comments
            </span>
          </div>
        </article>

        {/* Comments Section */}
        <section className="mt-8">
          <h2 className="text-base font-semibold text-gray-900 mb-6">
            {comments.length} {comments.length === 1 ? "Comment" : "Comments"}
          </h2>

          {/* Add Comment Form */}
          <div className="bg-gray-50 rounded-xl p-5 mb-8">
            <textarea
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Share your thoughts..."
              className="w-full px-4 py-3 bg-white border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              rows={3}
            />
            <div className="flex items-center justify-between mt-3">
              <label className="flex items-center gap-2 text-sm text-gray-500 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isAnonymous}
                  onChange={(e) => setIsAnonymous(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                />
                Post anonymously
              </label>
              <button
                disabled={!commentText.trim()}
                className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Post Comment
              </button>
            </div>
          </div>

          {/* Comments List */}
          {comments.length > 0 ? (
            <div className="space-y-6">
              {comments.map((comment) => (
                <ForumCommentV2 key={comment.id} comment={comment} />
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-sm text-gray-500">No comments yet. Be the first to share your thoughts!</p>
            </div>
          )}
        </section>

        {/* Back Link */}
        <div className="mt-12 pt-6 border-t border-gray-100">
          <Link
            href={`/community/${post.careType}`}
            className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
            </svg>
            Back to {careTypeConfig.label}
          </Link>
        </div>
      </div>
    </main>
  );
}
