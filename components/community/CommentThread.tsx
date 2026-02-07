"use client";

import { useState } from "react";
import { ForumComment } from "@/types/forum";
import ForumCommentV2 from "./ForumCommentV2";

interface CommentThreadProps {
  comments: ForumComment[];
  postId: string;
}

type SortType = "relevant" | "recent";

export default function CommentThread({ comments }: CommentThreadProps) {
  const [commentText, setCommentText] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [sortBy, setSortBy] = useState<SortType>("relevant");

  const handleSubmit = async () => {
    if (!commentText.trim()) return;
    setIsSubmitting(true);
    setTimeout(() => {
      setCommentText("");
      setIsSubmitting(false);
      setIsFocused(false);
    }, 500);
  };

  const sortedComments = [...comments].sort((a, b) => {
    if (sortBy === "relevant") {
      return b.likeCount - a.likeCount;
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return (
    <section>
      {/* Comment Input - Medium Style */}
      <div className="mb-6">
        <div className="flex items-start gap-3">
          {/* User Avatar */}
          <div className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
            <span className="text-primary-600 font-medium text-sm">Y</span>
          </div>

          {/* Input Area */}
          <div className="flex-1">
            <div
              className={`border rounded-lg transition-all ${
                isFocused
                  ? "border-gray-300 shadow-sm"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onFocus={() => setIsFocused(true)}
                placeholder="What are your thoughts?"
                className="w-full px-4 py-3 text-sm text-gray-700 placeholder-gray-400 bg-transparent resize-none focus:outline-none"
                rows={isFocused ? 4 : 2}
              />

              {/* Expanded state with formatting + actions */}
              {isFocused && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                  <div className="flex items-center gap-1">
                    <button className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors">
                      <span className="font-bold text-sm">B</span>
                    </button>
                    <button className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors">
                      <span className="italic text-sm">i</span>
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer select-none mr-2">
                      <input
                        type="checkbox"
                        checked={isAnonymous}
                        onChange={(e) => setIsAnonymous(e.target.checked)}
                        className="w-3.5 h-3.5 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                      />
                      Anonymous
                    </label>
                    <button
                      onClick={() => {
                        setIsFocused(false);
                        setCommentText("");
                      }}
                      className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSubmit}
                      disabled={!commentText.trim() || isSubmitting}
                      className="px-4 py-1.5 bg-primary-600 text-white text-sm font-medium rounded-full hover:bg-primary-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {isSubmitting ? "..." : "Respond"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Sort Dropdown */}
      {comments.length > 0 && (
        <div className="flex items-center gap-2 mb-6 pb-4 border-b border-gray-100">
          <button
            onClick={() => setSortBy(sortBy === "relevant" ? "recent" : "relevant")}
            className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide hover:text-gray-700 transition-colors"
          >
            {sortBy === "relevant" ? "Most Relevant" : "Most Recent"}
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      )}

      {/* Comments List */}
      {comments.length > 0 ? (
        <div className="space-y-0 divide-y divide-gray-100">
          {sortedComments.map((comment) => (
            <ForumCommentV2 key={comment.id} comment={comment} />
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-900 mb-1">No responses yet</p>
          <p className="text-sm text-gray-500">Be the first to share what you think!</p>
        </div>
      )}
    </section>
  );
}
