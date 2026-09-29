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
                <strong>Work Queue first.</strong> Start each session with the Work Queue tab. Returned calls and overdue callbacks are the highest priority — these are warm leads ready to engage.
              </p>
              <p className="text-sm text-amber-900">
                <strong>Log every activity.</strong> Every call, meeting outcome, and note must be logged. Good documentation means anyone can pick up where you left off.
              </p>
              <p className="text-sm text-amber-900">
                <strong>Schedule, don&apos;t pitch cold.</strong> The goal is to get providers into a scheduled meeting where you can properly pitch. Don&apos;t try to sell over an unscheduled call.
              </p>
              <p className="text-sm text-amber-900">
                <strong>Meeting focus matters.</strong> Know whether you&apos;re pitching Ads, MedJobs, or Both before the meeting. Tailor your conversation accordingly.
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
                  <li>If interested, schedule a meeting using the Calendly link.</li>
                  <li>If not available, set a callback date and move to In Progress.</li>
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
                <strong>Purpose:</strong> Actionable items that need attention today. <span className="font-semibold text-primary-700">Start here every session.</span>
              </p>
              <div className="text-sm text-gray-700">
                <strong>Subtabs (in priority order):</strong>
                <ul className="list-disc list-inside mt-1 space-y-1 ml-2">
                  <li><strong>Returned Calls</strong> — Provider left a voicemail for us. <span className="text-primary-700 font-medium">Highest priority.</span></li>
                  <li><strong>Overdue</strong> — Callback date is in the past. These are slipping.</li>
                  <li><strong>Due Today</strong> — Scheduled callbacks for today.</li>
                  <li><strong>Needs Retry</strong> — Voicemail/hung up/left message, stale for 2+ days. Try again.</li>
                  <li><strong>Stale</strong> — No activity in 7+ days. Re-engage or resolve.</li>
                </ul>
              </div>
              <p className="text-sm text-gray-500 italic">
                Work Queue excludes paying providers — they belong in the Paying tab.
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
                <strong>Purpose:</strong> Providers with scheduled meetings. Shows both new pitch meetings and upgrade meetings.
              </p>
              <div className="text-sm text-gray-700">
                <strong>Meeting types:</strong>
                <ul className="list-disc list-inside mt-1 space-y-1 ml-2">
                  <li><strong>New</strong> — First meeting to pitch Olera services.</li>
                  <li><strong>Upgrade</strong> — Meeting with free trial provider to discuss paid subscription.</li>
                </ul>
              </div>
              <div className="text-sm text-gray-700">
                <strong>After the meeting:</strong>
                <ol className="list-decimal list-inside mt-1 space-y-1 ml-2">
                  <li>Log the meeting outcome (Pitched, No-show, Not Interested).</li>
                  <li>If pitched successfully, they move to Follow-up → Active.</li>
                  <li>If they convert, start their free trial from the drawer.</li>
                </ol>
              </div>
              <p className="text-sm text-amber-700 font-medium">
                ⚠️ Past meetings without logged outcomes appear in the Stats header &quot;Pending Outcomes&quot; count.
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
                <strong>Purpose:</strong> Post-meeting follow-up. Providers who&apos;ve had a meeting but haven&apos;t converted yet.
              </p>
              <div className="text-sm text-gray-700">
                <strong>Subtabs:</strong>
                <ul className="list-disc list-inside mt-1 space-y-1 ml-2">
                  <li><strong>Active</strong> — Meeting completed, pitch delivered. Follow up to close.</li>
                  <li><strong>No-show</strong> — Missed their scheduled meeting. Reschedule or resolve.</li>
                  <li><strong>Not Interested</strong> — Declined after being pitched. Soft terminal state.</li>
                </ul>
              </div>
              <div className="text-sm text-gray-700">
                <strong>For Active providers:</strong>
                <ol className="list-decimal list-inside mt-1 space-y-1 ml-2">
                  <li>Follow up within 2-3 days of the meeting.</li>
                  <li>Address any concerns or questions from the pitch.</li>
                  <li>If ready, start their free trial (moves them to Converted).</li>
                </ol>
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
                <strong>Purpose:</strong> Providers on free trial (Ads Free Intro or MedJobs Pilot). Goal is to convert them to paying customers.
              </p>
              <div className="text-sm text-gray-700">
                <strong>Subtabs (by campaign status):</strong>
                <ul className="list-disc list-inside mt-1 space-y-1 ml-2">
                  <li><strong>Not Contacted</strong> — Free trial started, no calls yet, campaign not live.</li>
                  <li><strong>In Progress</strong> — Has call attempts, campaign not yet live.</li>
                  <li><strong>Live</strong> — Campaign is currently running. Monitor performance.</li>
                  <li><strong>Ended</strong> — Campaign concluded. Time to discuss paid subscription.</li>
                </ul>
              </div>
              <div className="text-sm text-gray-700">
                <strong>Key actions:</strong>
                <ol className="list-decimal list-inside mt-1 space-y-1 ml-2">
                  <li>For Live campaigns: Share performance updates, build excitement.</li>
                  <li>For Ended campaigns: Schedule an upgrade meeting to discuss paid plans.</li>
                  <li>When they subscribe, they move to the Paying tab.</li>
                </ol>
              </div>
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
                <strong>Purpose:</strong> Track paying subscribers. Monitor retention and upsell opportunities.
              </p>
              <div className="text-sm text-gray-700">
                <strong>Subtabs:</strong>
                <ul className="list-disc list-inside mt-1 space-y-1 ml-2">
                  <li><strong>Ads Only</strong> — Subscribed to Ads, not MedJobs. Potential upsell.</li>
                  <li><strong>MedJobs Only</strong> — Subscribed to MedJobs, not Ads. Potential upsell.</li>
                  <li><strong>Both</strong> — Subscribed to both products. Full customers.</li>
                  <li><strong>Churned</strong> — Former paying customers. Understand why, re-engage if possible.</li>
                </ul>
              </div>
              <p className="text-sm text-gray-700">
                <strong>Upsell opportunity:</strong> Providers subscribed to only one product are prime candidates for the other. Schedule an upgrade meeting to discuss.
              </p>
              <p className="text-sm text-gray-500 italic">
                Churned providers may be recoverable — review their history and reach out if appropriate.
              </p>
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
