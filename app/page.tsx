import { headers } from "next/headers";
import HeroSection from "@/components/home/HeroSection";
import TopProvidersSection from "@/components/home/TopProvidersSection";
import ExploreCareSection from "@/components/home/ExploreCareSection";
import CommunitySection from "@/components/home/CommunitySection";
import CTASection from "@/components/home/CTASection";
import HomeRedirect from "@/components/home/HomeRedirect";
import { US_STATES } from "@/lib/power-pages";

export default async function HomePage() {
  const hdrs = await headers();
  const region = hdrs.get("x-vercel-ip-country-region"); // 2-letter state code e.g. "TX"
  const city = hdrs.get("x-vercel-ip-city"); // city name e.g. "Irvine"
  const geoState = region && US_STATES[region] ? region : null;
  const geoCity = geoState && city ? decodeURIComponent(city) : null;

  return (
    <div className="bg-gray-50">
      {/* Redirect providers/caregivers to their dashboards */}
      <HomeRedirect />
      <HeroSection />
      <TopProvidersSection geoState={geoState} geoCity={geoCity} />
      <ExploreCareSection />
      <CommunitySection />
      <CTASection />
    </div>
  );
}
