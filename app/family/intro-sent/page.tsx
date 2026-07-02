import Link from "next/link";
import { getServiceClient } from "@/lib/admin";

/**
 * Confirmation screen after a one-tap "introduce me" (B2). Reached via
 * /api/family-intro → /api/claim-family, so the family arrives signed in.
 *
 * status:
 *   sent    → the introduction was made (the happy path)
 *   already → they'd already reached out to this provider (idempotent tap)
 *   limit   → they hit the hourly intro cap ("no flood of calls" guardrail)
 */
export default async function IntroSentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const slug = typeof sp.p === "string" ? sp.p : undefined;
  const status = typeof sp.status === "string" ? sp.status : "sent";

  let providerName = "the provider";
  if (slug) {
    try {
      const db = getServiceClient();
      const { data } = await db
        .from("business_profiles")
        .select("display_name")
        .eq("slug", slug)
        .maybeSingle();
      if (data?.display_name) providerName = data.display_name;
    } catch {
      /* fall back to the generic label */
    }
  }

  const isLimit = status === "limit";
  const isAlready = status === "already";

  const heading = isLimit
    ? "Let's give it a moment"
    : isAlready
      ? `You've already reached out to ${providerName}`
      : `You're introduced to ${providerName}`;

  const body = isLimit
    ? "You've sent a few introductions in a short window. To keep things calm for you and the providers, we've paused new intros for a little bit. Your earlier requests are on their way."
    : isAlready
      ? "No need to reach out twice. They have your request and can get back to you anytime from your inbox."
      : `We've passed your request along to ${providerName}, with the same details you already shared, so there's nothing to fill out again. They can reply to you right here on Olera, and you'll see it in your inbox.`;

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-10">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
        <div
          className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6 ${
            isLimit ? "bg-amber-50" : "bg-green-50"
          }`}
        >
          {isLimit ? (
            <svg className="w-8 h-8 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ) : (
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>

        <h1 className="text-xl font-semibold text-gray-900 mb-2">{heading}</h1>
        <p className="text-gray-500 mb-6 leading-relaxed">{body}</p>

        <div className="space-y-3">
          <Link
            href="/portal/inbox"
            className="block w-full px-6 py-3 bg-primary-600 text-white font-medium rounded-xl hover:bg-primary-700 transition-colors"
          >
            Go to your inbox
          </Link>
          <Link
            href="/browse"
            className="block text-primary-600 hover:text-primary-700 font-medium text-sm pt-1"
          >
            Keep exploring providers near you
          </Link>
        </div>
      </div>
    </div>
  );
}
