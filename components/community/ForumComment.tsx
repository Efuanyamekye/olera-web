"use client";

import { useState } from "react";
import { ForumComment as ForumCommentType } from "@/types/forum";

interface ForumCommentProps {
  comment: ForumCommentType;
  isReply?: boolean;
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

function AuthorAvatar({ author }: { author: ForumCommentType["author"] }) {
  if (author.isAnonymous) {
    return (
      <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
        <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      </div>
    );
  }
  if (author.avatar) {
    return <img src={author.avatar} alt={author.displayName} className="w-9 h-9 rounded-full object-cover flex-shrink-0" />;
  }
  const initials = author.displayName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  return (
    <div className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
      <span className="text-primary-700 font-medium text-sm">{initials}</span>
    </div>
  );
}

function RoleBadge({ role }: { role: ForumCommentType["author"]["role"] }) {
  const roleConfig = {
    family: { label: "Family", className: "bg-blue-100 text-blue-700" },
    caregiver: { label: "Caregiver", className: "bg-green-100 text-green-700" },
    provider: { label: "Provider", className: "bg-purple-100 text-purple-700" },
    expert: { label: "Expert", className: "bg-amber-100 text-amber-700" },
  };
  const config = roleConfig[role];
  return <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${config.className}`}>{config.label}</span>;
}

export default function ForumComment({ comment, isReply = false }: ForumCommentProps) {
  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(comment.likeCount);
  const [showReplyForm, setShowReplyForm] = useState(false);

  const handleLike = () => {
    setIsLiked(!isLiked);
    setLikeCount(isLiked ? likeCount - 1 : likeCount + 1);
  };

  return (
    <div className={`${isReply ? "ml-12" : ""}`}>
      <div className="flex gap-3">
        <AuthorAvatar author={comment.author} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-gray-900 text-sm">{comment.author.displayName}</span>
            <RoleBadge role={comment.author.role} />
            {comment.isAcceptedAnswer && (
              <span className="flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Accepted Answer
              </span>
            )}
            <span className="text-xs text-gray-500">{formatTimeAgo(comment.createdAt)}</span>
          </div>
          <div className="mt-2 text-gray-700 text-sm leading-relaxed whitespace-pre-wrap">{comment.content}</div>
          <div className="flex items-center gap-4 mt-3">
            <button onClick={handleLike} className={`flex items-center gap-1.5 text-sm transition-colors ${isLiked ? "text-red-500" : "text-gray-500 hover:text-red-500"}`}>
              <svg className="w-4 h-4" fill={isLiked ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
              <span>{likeCount}</span>
            </button>
            {!isReply && (
              <button onClick={() => setShowReplyForm(!showReplyForm)} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-primary-600 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                </svg>
                Reply
              </button>
            )}
          </div>
          {showReplyForm && (
            <div className="mt-4 p-4 bg-gray-50 rounded-lg">
              <textarea placeholder="Write a reply..." className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-500" rows={3} />
              <div className="flex justify-end gap-2 mt-2">
                <button onClick={() => setShowReplyForm(false)} className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 transition-colors">Cancel</button>
                <button className="px-4 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors">Reply</button>
              </div>
            </div>
          )}
          {comment.replies && comment.replies.length > 0 && (
            <div className="mt-4 space-y-4">
              {comment.replies.map((reply) => (
                <ForumComment key={reply.id} comment={reply} isReply />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
