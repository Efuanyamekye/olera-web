import Link from "next/link";
import Button from "@/components/ui/Button";

export default function ForProvidersPage() {
  return (
    <div>
      {/* Hero */}
      <section className="bg-gradient-to-br from-primary-700 via-primary-800 to-secondary-900 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-28">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight">
              Grow Your Senior Care Business
            </h1>
            <p className="mt-6 text-lg md:text-xl text-primary-100">
              Connect with families actively searching for care. Claim your
              profile, showcase your services, and receive direct inquiries —
              free for 30 days.
            </p>
            <div className="mt-10">
              <Link
                href="/for-providers/claim"
                className="inline-flex items-center justify-center font-semibold rounded-lg px-10 py-4 text-lg bg-white text-primary-700 hover:bg-primary-50 transition-colors min-h-[44px] shadow-lg"
              >
                Get Started Free
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Value props */}
      <section className="py-16 md:py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
              Why Providers Choose Olera
            </h2>
            <p className="mt-4 text-lg text-gray-600 max-w-2xl mx-auto">
              A simple, fair marketplace that puts you in front of the families
              who need you most.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                title: "Direct Family Connections",
                description:
                  "Families contact you directly through your profile. No middleman, no referral fees per lead.",
                icon: (
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                ),
              },
              {
                title: "30-Day Free Trial",
                description:
                  "Full access to respond to inquiries and connect with families. No credit card required to start.",
                icon: (
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                ),
              },
              {
                title: "Claim Your Listing",
                description:
                  "We may already have a profile for your organization. Claim it to take control and keep it up to date.",
                icon: (
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                ),
              },
            ].map((item) => (
              <div key={item.title} className="text-center p-8 rounded-2xl bg-gray-50">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary-100 text-primary-600 mb-4">
                  {item.icon}
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  {item.title}
                </h3>
                <p className="text-gray-600">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
              Get Started in Minutes
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                step: "1",
                title: "Claim or Create",
                description:
                  "Search for your organization in our directory, or create a new profile from scratch.",
              },
              {
                step: "2",
                title: "Complete Your Profile",
                description:
                  "Add your services, photos, and contact details to help families find the right fit.",
              },
              {
                step: "3",
                title: "Receive Inquiries",
                description:
                  "Families reach out directly through your profile. Respond and connect on your terms.",
              },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="w-12 h-12 bg-primary-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-white font-bold text-lg">{item.step}</span>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  {item.title}
                </h3>
                <p className="text-gray-600">{item.description}</p>
              </div>
            ))}
          </div>

          <div className="mt-12 text-center">
            <Link href="/for-providers/claim">
              <Button size="lg">Get Started Free</Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Pricing preview */}
      <section className="py-16 md:py-24 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Simple, Transparent Pricing
          </h2>
          <p className="text-lg text-gray-600 mb-12">
            Start with a 30-day free trial. No credit card required.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl mx-auto">
            {/* Free tier */}
            <div className="rounded-2xl border-2 border-gray-200 p-8">
              <h3 className="text-xl font-semibold text-gray-900">Free</h3>
              <p className="mt-2 text-gray-500">After trial expires</p>
              <p className="mt-4 text-4xl font-bold text-gray-900">$0</p>
              <ul className="mt-8 space-y-3 text-left">
                {[
                  "Public profile visible",
                  "Receive inbound inquiries",
                  "See inquiry metadata",
                ].map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-gray-600">
                    <svg className="w-5 h-5 text-primary-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {feature}
                  </li>
                ))}
              </ul>
            </div>

            {/* Pro tier */}
            <div className="rounded-2xl border-2 border-primary-600 p-8 relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary-600 text-white text-sm font-medium px-4 py-1 rounded-full">
                30 days free
              </div>
              <h3 className="text-xl font-semibold text-gray-900">Pro</h3>
              <p className="mt-2 text-gray-500">Full engagement access</p>
              <p className="mt-4 text-4xl font-bold text-gray-900">
                $25<span className="text-lg font-normal text-gray-500">/mo</span>
              </p>
              <ul className="mt-8 space-y-3 text-left">
                {[
                  "Everything in Free",
                  "View full inquiry details",
                  "Respond to inquiries",
                  "Initiate outbound contact",
                ].map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-gray-600">
                    <svg className="w-5 h-5 text-primary-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
