"use client";

import { useState } from "react";

interface ConnectGoogleBusinessModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export default function ConnectGoogleBusinessModal({
  onClose,
  onSuccess,
}: ConnectGoogleBusinessModalProps) {
  const [input, setInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/provider/google-business", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ place_id_or_url: input.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to connect");
      }

      setSuccess(true);
      // Wait a moment to show success, then trigger refresh and close
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-fade-in">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-50 to-green-50 flex items-center justify-center">
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Connect Google Business Profile
              </h2>
              <p className="text-sm text-gray-500">
                Get reviews directly on Google
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-5">
          {success ? (
            <div className="text-center py-6">
              <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">Connected!</h3>
              <p className="text-sm text-gray-500">
                Your Google Business Profile is now linked.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="mb-4">
                <p className="text-sm text-gray-600 mb-4 leading-relaxed">
                  Enter your Google Place ID to have review requests direct families to leave reviews on Google instead of Olera.
                </p>

                <label htmlFor="placeId" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Google Place ID
                </label>
                <input
                  type="text"
                  id="placeId"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="ChIJ..."
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 bg-white text-gray-900 text-[15px] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-400 transition-all duration-200"
                  autoComplete="off"
                />
                <p className="text-xs text-gray-500 mt-2">
                  Your Place ID starts with &quot;ChIJ&quot;.{" "}
                  <a
                    href="https://developers.google.com/maps/documentation/places/web-service/place-id#find-id"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary-600 hover:text-primary-700 underline"
                  >
                    How to find your Place ID
                  </a>
                </p>
              </div>

              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-700">
                  {error}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-3 rounded-xl border border-gray-300 text-gray-700 text-[15px] font-medium hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!input.trim() || isSubmitting}
                  className="flex-1 py-3 rounded-xl bg-gray-900 text-white text-[15px] font-medium hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-500 disabled:cursor-not-allowed transition-all duration-200"
                >
                  {isSubmitting ? (
                    <span className="inline-flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Connecting...
                    </span>
                  ) : (
                    "Connect"
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      <style jsx>{`
        @keyframes fade-in {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        .animate-fade-in {
          animation: fade-in 0.2s ease-out;
        }
      `}</style>
    </div>
  );
}
