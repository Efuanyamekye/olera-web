"use client";

import { useEffect } from "react";

interface WorkflowGuideModalProps {
  onClose: () => void;
}

export function WorkflowGuideModal({ onClose }: WorkflowGuideModalProps) {
  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Workflow Guide</h3>
              <p className="text-sm text-gray-500 mt-0.5">Provider Growth process — claim to conversion</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors rounded-lg hover:bg-gray-100"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-5 overflow-y-auto">
          {/* General Rules */}
          <section className="mb-8">
            <h4 className="text-base font-semibold text-gray-900 mb-4">
              General Rules
            </h4>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-2">
              <p className="text-sm text-amber-900">
                <strong>Work Queue first.</strong> Clear your backlog before starting new claims. Work Queue shows providers already in progress — handle these first, then move to new providers in the Claimed tab.
              </p>
              <p className="text-sm text-amber-900">
                <strong>Log every activity.</strong> Every call, outcome, and note must be logged. Anyone should be able to pick up exactly where you left off.
              </p>
              <p className="text-sm text-amber-900">
                <strong>Your job is scheduling.</strong> Get providers booked for a meeting with Logan. You&apos;re not pitching — just get them on the calendar.
              </p>
            </div>
          </section>

          {/* Claimed */}
          <section className="mb-8">
            <h4 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-3">
              <span className="w-6 h-6 rounded-full bg-gray-200 text-gray-600 flex items-center justify-center text-sm">1</span>
              Claimed
            </h4>
            <div className="bg-gray-50 rounded-lg p-4 space-y-3">
              <p className="text-sm text-gray-700">
                <strong>Purpose:</strong> Initial outreach to providers who just claimed their profile. Get them scheduled for a pitch meeting.
              </p>
              <div className="text-sm text-gray-700">
                <strong>Subtabs:</strong>
                <ul className="list-disc list-inside mt-1 space-y-1 ml-2">
                  <li><strong>Not Contacted</strong> — No call attempts yet. These need first contact.</li>
                  <li><strong>In Progress</strong> — Has call attempts but not yet converted to a meeting or free trial.</li>
                </ul>
              </div>
              <div className="text-sm text-gray-700">
                <strong>Process:</strong>
                <ol className="list-decimal list-inside mt-1 space-y-1 ml-2">
                  <li>Call to thank them for claiming and introduce Olera&apos;s services.</li>
                  <li>If interested, schedule a meeting.</li>
                  <li>Always log the call outcome — voicemail, hangup, or note. Logging automatically moves them to In Progress.</li>
                </ol>
              </div>
              <p className="text-sm text-gray-500 italic">
                Providers who start a free trial move to the Converted tab automatically.
              </p>
            </div>
          </section>

          {/* Work Queue */}
          <section className="mb-8">
            <h4 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-3">
              <span className="w-6 h-6 rounded-full bg-gray-200 text-gray-600 flex items-center justify-center text-sm">2</span>
              Work Queue
            </h4>
            <div className="bg-gray-50 rounded-lg p-4 space-y-3">
              <p className="text-sm text-gray-700">
                <strong>Purpose:</strong> Your backlog — providers already in progress who need follow-up. Clear this before working on new claims.
              </p>
              <p className="text-sm text-gray-700">
                <strong>How it works:</strong> Providers appear here automatically based on your logged activity. You don&apos;t move them manually — logging a call outcome determines where they go.
              </p>
              <div className="text-sm text-gray-700">
                <strong>Subtabs (in priority order):</strong>
                <ul className="list-disc list-inside mt-1 space-y-1 ml-2">
                  <li><strong>Returned Calls</strong> — Provider called us back and left a voicemail. They&apos;re warm — call them first.</li>
                  <li><strong>Overdue</strong> — You logged &quot;callback requested&quot; with a date, and that date has passed. You&apos;re late on this callback.</li>
                  <li><strong>Due Today</strong> — Same as above, but the callback date is today.</li>
                  <li><strong>Needs Retry</strong> — Last call was voicemail, hung up, or left message. No callback date was set, and it&apos;s been 2+ days. Time to try again.</li>
                  <li><strong>Stale</strong> — No activity logged in 7+ days. Re-engage or resolve.</li>
                </ul>
              </div>
              <p className="text-sm text-gray-500 italic">
                Paying providers don&apos;t appear here — they&apos;re in the Paying tab.
              </p>
            </div>
          </section>

          {/* Meetings */}
          <section className="mb-8">
            <h4 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-3">
              <span className="w-6 h-6 rounded-full bg-gray-200 text-gray-600 flex items-center justify-center text-sm">3</span>
              Meetings
            </h4>
            <div className="bg-gray-50 rounded-lg p-4 space-y-3">
              <p className="text-sm text-gray-700">
                <strong>Purpose:</strong> Providers with meetings scheduled with Logan. Your job is to track them and log the outcome after.
              </p>
              <div className="text-sm text-gray-700">
                <strong>Meeting types:</strong>
                <ul className="list-disc list-inside mt-1 space-y-1 ml-2">
                  <li><strong>New</strong> — First meeting to introduce Olera services.</li>
                  <li><strong>Upgrade</strong> — Meeting with a free trial provider to discuss paid subscription.</li>
                </ul>
              </div>
              <div className="text-sm text-gray-700">
                <strong>After the meeting:</strong>
                <ol className="list-decimal list-inside mt-1 space-y-1 ml-2">
                  <li>Get the outcome from Logan and log it (Interested, No-show, Not Interested).</li>
                  <li>Pitched → moves to Follow-up &gt; Active.</li>
                  <li>No-show → moves to Follow-up &gt; No-show.</li>
                  <li>If they start a free trial, they move to Converted automatically.</li>
                </ol>
              </div>
              <p className="text-sm text-gray-500 italic">
                Past meetings without logged outcomes appear in &quot;Pending Outcomes&quot; in the stats header.
              </p>
            </div>
          </section>

          {/* Follow-up */}
          <section className="mb-8">
            <h4 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-3">
              <span className="w-6 h-6 rounded-full bg-gray-200 text-gray-600 flex items-center justify-center text-sm">4</span>
              Follow-up
            </h4>
            <div className="bg-gray-50 rounded-lg p-4 space-y-3">
              <p className="text-sm text-gray-700">
                <strong>Purpose:</strong> Post-meeting follow-up. These providers have had their meeting with Logan — now you follow up to get them to convert.
              </p>
              <div className="text-sm text-gray-700">
                <strong>Subtabs:</strong>
                <ul className="list-disc list-inside mt-1 space-y-1 ml-2">
                  <li><strong>Active</strong> — Meeting happened, pitch delivered. Follow up to remind them to sign up for the free trial.</li>
                  <li><strong>No-show</strong> — Missed their scheduled meeting. Reschedule another meeting with Logan.</li>
                  <li><strong>Not Interested</strong> — Declined after being pitched. No action needed unless they re-engage.</li>
                </ul>
              </div>
              <div className="text-sm text-gray-700">
                <strong>How providers move out:</strong>
                <ul className="list-disc list-inside mt-1 space-y-1 ml-2">
                  <li>If they sign up for ads or MedJobs, they automatically move to Converted.</li>
                  <li>Active and No-show providers may also appear in Work Queue if they have overdue callbacks or go stale.</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Converted */}
          <section className="mb-8">
            <h4 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-3">
              <span className="w-6 h-6 rounded-full bg-gray-200 text-gray-600 flex items-center justify-center text-sm">5</span>
              Converted (Free Trial)
            </h4>
            <div className="bg-gray-50 rounded-lg p-4 space-y-3">
              <p className="text-sm text-gray-700">
                <strong>Purpose:</strong> Providers on free trial (Ads Free Intro or MedJobs Pilot).
              </p>
              <div className="text-sm text-gray-700">
                <strong>Subtabs:</strong>
                <ul className="list-disc list-inside mt-1 space-y-1 ml-2">
                  <li><strong>Not Contacted</strong> — Free trial started but profile may not be ready (e.g., missing photos, incomplete). Call if needed to get their profile to 70%+.</li>
                  <li><strong>In Progress</strong> — Has call attempts, waiting for profile completion or campaign setup.</li>
                  <li><strong>Live</strong> — Campaign is running. No action needed.</li>
                  <li><strong>Ended</strong> — Campaign finished. Check with TJ on next steps.</li>
                </ul>
              </div>
              <p className="text-sm text-gray-500 italic">
                When they subscribe, they automatically move to the Paying tab.
              </p>
            </div>
          </section>

          {/* Paying */}
          <section>
            <h4 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-3">
              <span className="w-6 h-6 rounded-full bg-gray-200 text-gray-600 flex items-center justify-center text-sm">6</span>
              Paying
            </h4>
            <div className="bg-gray-50 rounded-lg p-4 space-y-3">
              <p className="text-sm text-gray-700">
                <strong>Purpose:</strong> Track paying subscribers.
              </p>
              <div className="text-sm text-gray-700">
                <strong>Subtabs:</strong>
                <ul className="list-disc list-inside mt-1 space-y-1 ml-2">
                  <li><strong>Ads Only</strong> — Subscribed to Ads, not MedJobs.</li>
                  <li><strong>MedJobs Only</strong> — Subscribed to MedJobs, not Ads.</li>
                  <li><strong>Both</strong> — Subscribed to both products.</li>
                  <li><strong>Churned</strong> — Former paying customers.</li>
                </ul>
              </div>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 shrink-0 bg-gray-50">
          <button
            type="button"
            onClick={onClose}
            className="w-full px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
