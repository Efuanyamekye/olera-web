"use client";

import { useState } from "react";
import { useParams, notFound } from "next/navigation";
import Link from "next/link";
import { getPostBySlug } from "@/data/mock/forumPosts";
import { getCommentsByPostId } from "@/data/mock/forumComments";
import { CARE_TYPE_CONFIG } from "@/types/forum";
import ForumComment from "@/components/community/ForumComment";

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diffInSeconds < 60) return "just now";
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)} days ago`;
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function AuthorAvatar({ author }: { author: { displayName: string; avatar?: string; isAnonymous: boolean } }) {
  if (author.isAnonymous) {
    return (
      <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center">
        <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      </div>
    );
  }
  if (author.avatar) {
    return <img src={author.avatar} alt={author.displayName} className="w-12 h-12 rounded-full object-cover" />;
  }
  const initials = author.displayName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  return (
    <div className="w-12 h-12 rounded-full bg-primary-100 flex items-center justify-center">
      <span className="text-primary-700 font-semibold">{initials}</span>
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

  const roleConfig = {
    family: { label: "Family Member", className: "bg-blue-100 text-blue-700" },
    caregiver: { label: "Professional Caregiver", className: "bg-green-100 text-green-700" },
    provider: { label: "Care Provider", className: "bg-purple-100 text-purple-700" },
    expert: { label: "Healthcare Expert", className: "bg-amber-100 text-amber-700" },
  };

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <nav className="flex items-center gap-2 text-sm text-gray-500">
            <Link href="/community" className="hover:text-primary-600 transition-colors">Community</Link>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <Link href={`/community/${post.careType}`} className="hover:text-primary-600 transition-colors">{careTypeConfig.label}</Link>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <span className="text-gray-700 truncate max-w-[200px]">{post.title}</span>
          </nav>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <article className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="p-6 border-b border-gray-100">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="flex items-center gap-4">
                <AuthorAvatar author={post.author} />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900">{post.author.displayName}</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${roleConfig[post.author.role].className}`}>
                      {roleConfig[post.author.role].label}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-500 mt-0.5">
                    <span>Posted {formatTimeAgo(post.createdAt)}</span>
                    <span>•</span>
                    <span>{post.viewCount} views</span>
                  </div>
                </div>
              </div>
              <span className={`text-xs font-medium px-3 py-1.5 rounded-full ${careTypeConfig.bgColor} ${careTypeConfig.color}`}>
                {careTypeConfig.label}
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">{post.title}</h1>
            <div className="flex flex-wrap gap-2">
              {post.tags.map((tag) => (
                <span key={tag} className="text-sm text-gray-600 bg-gray-100 px-3 py-1 rounded-full">#{tag}</span>
              ))}
            </div>
          </div>

          <div className="p-6">
            <div className="prose prose-gray max-w-none">
              {post.content.split("\n").map((paragraph, idx) => (
                <p key={idx} className="text-gray-700 leading-relaxed mb-4 last:mb-0">{paragraph}</p>
              ))}
            </div>
          </div>

          <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={handleLike}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                  isLiked ? "bg-red-50 text-red-600" : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
                }`}
              >
                <svg className="w-5 h-5" fill={isLiked ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
                {likeCount} {likeCount === 1 ? "Like" : "Likes"}
              </button>
              <span className="flex items-center gap-2 text-gray-500">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                {post.commentCount} Comments
              </span>
            </div>
          </div>
        </article>

        <section className="mt-8">
          <h2 className="text-xl font-bold text-gray-900 mb-6">{comments.length} {comments.length === 1 ? "Comment" : "Comments"}</h2>
          <div className="bg-white rounded-xl border border-gray-100 p-5 mb-6">
            <h3 className="font-semibold text-gray-900 mb-3">Add a Comment</h3>
            <textarea
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Share your thoughts or experience..."
              className="w-full px-4 py-3 border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              rows={4}
            />
            <div className="flex items-center justify-between mt-3">
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isAnonymous}
                  onChange={(e) => setIsAnonymous(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                Post anonymously
              </label>
              <button disabled={!commentText.trim()} className="px-5 py-2 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                Post Comment
              </button>
            </div>
          </div>

          {comments.length > 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-100">
              {comments.map((comment) => (
                <div key={comment.id} className="p-5">
                  <ForumComment comment={comment} />
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 p-8 text-center">
              <p className="text-gray-600">No comments yet. Be the first to share your thoughts!</p>
            </div>
          )}
        </section>

        <div className="mt-8">
          <Link href={`/community/${post.careType}`} className="inline-flex items-center gap-2 text-primary-600 font-medium hover:text-primary-700 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to {careTypeConfig.label} Forum
          </Link>
        </div>
      </div>
    </main>
  );
}
