"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const careCategories = [
  { label: "Assisted Living", slug: "assisted-living" },
  { label: "Home Care", slug: "home-care" },
  { label: "Memory Care", slug: "memory-care" },
  { label: "Home Health Care", slug: "home-health-care" },
  { label: "Nursing Homes", slug: "nursing-home" },
  { label: "Independent Living", slug: "independent-living" },
];

interface CityEntry {
  label: string;
  city: string;
  state: string;
}

const popularCities: CityEntry[] = [
  { label: "Houston, TX", city: "houston", state: "texas" },
  { label: "Dallas, TX", city: "dallas", state: "texas" },
  { label: "Los Angeles, CA", city: "los-angeles", state: "california" },
  { label: "Phoenix, AZ", city: "phoenix", state: "arizona" },
  { label: "Chicago, IL", city: "chicago", state: "illinois" },
  { label: "New York, NY", city: "new-york", state: "new-york" },
  { label: "San Antonio, TX", city: "san-antonio", state: "texas" },
  { label: "Miami, FL", city: "miami", state: "florida" },
  { label: "Atlanta, GA", city: "atlanta", state: "georgia" },
  { label: "Philadelphia, PA", city: "philadelphia", state: "pennsylvania" },
  { label: "Denver, CO", city: "denver", state: "colorado" },
  { label: "Seattle, WA", city: "seattle", state: "washington" },
];

const popularStates = [
  { label: "Texas", href: "/assisted-living/texas" },
  { label: "California", href: "/assisted-living/california" },
  { label: "Florida", href: "/assisted-living/florida" },
  { label: "New York", href: "/assisted-living/new-york" },
  { label: "Pennsylvania", href: "/assisted-living/pennsylvania" },
  { label: "Illinois", href: "/assisted-living/illinois" },
  { label: "Ohio", href: "/assisted-living/ohio" },
  { label: "Georgia", href: "/assisted-living/georgia" },
  { label: "North Carolina", href: "/assisted-living/north-carolina" },
  { label: "Arizona", href: "/assisted-living/arizona" },
  { label: "Michigan", href: "/assisted-living/michigan" },
  { label: "Virginia", href: "/assisted-living/virginia" },
];

// ---------------------------------------------------------------------------
// Expandable City Row
// ---------------------------------------------------------------------------

function CityRow({ city }: { city: CityEntry }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full min-h-[48px] py-3 border-b border-vanilla-200/80 text-left group"
      >
        <span className="text-sm text-gray-800 font-medium group-hover:text-primary-700 group-active:text-primary-700 transition-colors">
          {city.label}
        </span>
        <svg
          className={`w-5 h-5 text-gray-400 group-hover:text-primary-600 group-active:text-primary-600 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="py-3 pl-2 space-y-0 animate-fade-in">
          {careCategories.map((cat) => (
            <Link
              key={cat.slug}
              href={`/${cat.slug}/${city.state}/${city.city}`}
              className="flex items-center min-h-[44px] text-sm text-gray-600 hover:text-primary-700 active:text-primary-700 transition-colors"
            >
              {city.label.split(",")[0]} {cat.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------

export default function Footer({ hideDiscoveryZone = false }: { hideDiscoveryZone?: boolean }) {
  return (
    <footer className="relative">
      {/* ── Discovery Zone — warm vanilla background ── */}
      {!hideDiscoveryZone && <div className="bg-vanilla-100">
        <div className="max-w-7xl mx-auto px-5 sm:px-6 lg:px-8 py-12 md:py-14">
          {/* Section header */}
          <h3 className="font-display text-display-xs md:text-xl font-semibold text-gray-900 mb-1.5">
            Find senior care by city
          </h3>
          <p className="text-sm text-gray-500 mb-8">
            Explore top-rated providers in your area
          </p>

          {/* Expandable city grid — single column on mobile so long city
              labels get full-width rows, 2/4-col from sm up */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 sm:gap-x-8 gap-y-0">
            {popularCities.map((city) => (
              <CityRow key={`${city.state}-${city.city}`} city={city} />
            ))}
          </div>

          {/* States + Care Types — compact row below */}
          <div className="mt-10 pt-8 border-t border-vanilla-200/80 grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-10">
            {/* Browse by State */}
            <div>
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Browse by State
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-0">
                {popularStates.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex items-center min-h-[44px] text-sm text-gray-600 hover:text-primary-700 active:text-primary-700 transition-colors"
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>

            {/* By Care Type */}
            <div>
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                By Care Type
              </h4>
              <div className="grid grid-cols-2 gap-x-4 gap-y-0">
                {careCategories.map((item) => (
                  <Link
                    key={item.slug}
                    href={`/${item.slug}`}
                    className="flex items-center min-h-[44px] text-sm text-gray-600 hover:text-primary-700 active:text-primary-700 transition-colors"
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>}

      {/* ── Main Footer ── */}
      <div className="bg-gray-50 border-t border-gray-200/60">
        <div className="max-w-7xl mx-auto px-5 sm:px-6 lg:px-8 py-10 md:py-12">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-8 md:gap-6">
            {/* Brand */}
            <div className="col-span-2 md:col-span-2 mb-4 md:mb-0">
              <Link href="/" className="inline-flex items-center space-x-2.5 mb-4 min-h-[44px]">
                <Image src="/images/olera-logo.png" alt="Olera" width={32} height={32} className="object-contain" />
                <span className="text-lg font-bold text-gray-900">Olera</span>
              </Link>
              <p className="text-gray-400 max-w-xs leading-relaxed text-sm">
                Helping families find senior care.
              </p>
            </div>

            {/* Company */}
            <div>
              <h3 className="text-gray-900 font-semibold text-xs uppercase tracking-wider mb-3">
                Company
              </h3>
              <ul className="space-y-0">
                <li>
                  <Link href="/about" className="flex items-center min-h-[44px] text-gray-500 hover:text-primary-600 transition-colors text-sm">
                    About Us
                  </Link>
                </li>
                <li>
                  <Link href="/team" className="flex items-center min-h-[44px] text-gray-500 hover:text-primary-600 transition-colors text-sm">
                    Our Team
                  </Link>
                </li>
                <li>
                  <Link href="/contact" className="flex items-center min-h-[44px] text-gray-500 hover:text-primary-600 transition-colors text-sm">
                    Contact
                  </Link>
                </li>
                <li>
                  <Link href="/research-and-press" className="flex items-center min-h-[44px] text-gray-500 hover:text-primary-600 transition-colors text-sm">
                    Research &amp; Press
                  </Link>
                </li>
                <li>
                  <Link href="/aging-in-america" className="flex items-center min-h-[44px] text-gray-500 hover:text-primary-600 transition-colors text-sm">
                    Aging in America
                  </Link>
                </li>
                <li>
                  <Link href="/caregiver-support" className="flex items-center min-h-[44px] text-gray-500 hover:text-primary-600 transition-colors text-sm">
                    Caregiver Support
                  </Link>
                </li>
                <li>
                  <Link href="/caregiver-support/young-caregivers" className="flex items-center min-h-[44px] text-gray-500 hover:text-primary-600 transition-colors text-sm">
                    Young Caregivers
                  </Link>
                </li>
              </ul>
            </div>

            {/* For Families */}
            <div>
              <h3 className="text-gray-900 font-semibold text-xs uppercase tracking-wider mb-3">
                For Families
              </h3>
              <ul className="space-y-0">
                <li>
                  <Link href="/browse" className="flex items-center min-h-[44px] text-gray-500 hover:text-primary-600 transition-colors text-sm">
                    Browse Care Options
                  </Link>
                </li>
                <li>
                  <Link href="/home-care" className="flex items-center min-h-[44px] text-gray-500 hover:text-primary-600 transition-colors text-sm">
                    Home Care
                  </Link>
                </li>
                <li>
                  <Link href="/home-health-care" className="flex items-center min-h-[44px] text-gray-500 hover:text-primary-600 transition-colors text-sm">
                    Home Health
                  </Link>
                </li>
                <li>
                  <Link href="/assisted-living" className="flex items-center min-h-[44px] text-gray-500 hover:text-primary-600 transition-colors text-sm">
                    Assisted Living
                  </Link>
                </li>
                <li>
                  <Link href="/independent-living" className="flex items-center min-h-[44px] text-gray-500 hover:text-primary-600 transition-colors text-sm">
                    Independent Living
                  </Link>
                </li>
                <li>
                  <Link href="/memory-care" className="flex items-center min-h-[44px] text-gray-500 hover:text-primary-600 transition-colors text-sm">
                    Memory Care
                  </Link>
                </li>
                <li>
                  <Link href="/benefits/finder" className="flex items-center min-h-[44px] text-gray-500 hover:text-primary-600 transition-colors text-sm">
                    Benefits Finder
                  </Link>
                </li>
              </ul>
            </div>

            {/* For Providers */}
            <div>
              <h3 className="text-gray-900 font-semibold text-xs uppercase tracking-wider mb-3">
                For Providers
              </h3>
              <ul className="space-y-0">
                <li>
                  <Link href="/for-providers" className="flex items-center min-h-[44px] text-gray-500 hover:text-primary-600 transition-colors text-sm">
                    Why Olera?
                  </Link>
                </li>
                <li>
                  <Link href="/provider/onboarding" className="flex items-center min-h-[44px] text-gray-500 hover:text-primary-600 transition-colors text-sm">
                    Find Your Organization
                  </Link>
                </li>
                <li>
                  <Link href="/for-providers" className="flex items-center min-h-[44px] text-gray-500 hover:text-primary-600 transition-colors text-sm">
                    Find Families
                  </Link>
                </li>
                <li>
                  <Link href="/medjobs/candidates" className="flex items-center min-h-[44px] text-gray-500 hover:text-primary-600 transition-colors text-sm">
                    Find Caregivers
                  </Link>
                </li>
              </ul>
            </div>

            {/* For Caregivers */}
            <div>
              <h3 className="text-gray-900 font-semibold text-xs uppercase tracking-wider mb-3">
                For Caregivers
              </h3>
              <ul className="space-y-0">
                <li>
                  <Link href="/medjobs/families" className="flex items-center min-h-[44px] text-gray-500 hover:text-primary-600 transition-colors text-sm">
                    Become a Caregiver
                  </Link>
                </li>
                <li>
                  <Link href="/medjobs/families?jobs=all" className="flex items-center min-h-[44px] text-gray-500 hover:text-primary-600 transition-colors text-sm">
                    Find Jobs
                  </Link>
                </li>
                <li>
                  <Link href="/medjobs/families#how-it-works" className="flex items-center min-h-[44px] text-gray-500 hover:text-primary-600 transition-colors text-sm">
                    How It Works
                  </Link>
                </li>
                <li>
                  <Link href="/medjobs/apply" className="flex items-center min-h-[44px] text-gray-500 hover:text-primary-600 transition-colors text-sm">
                    Apply Now
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="border-t border-gray-200 mt-8 pt-6 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-gray-400 text-sm">
              &copy; {new Date().getFullYear()} Olera. All rights reserved.
            </p>
            <div className="flex items-center gap-1">
              <Link href="/privacy" className="flex items-center min-h-[44px] px-3 text-gray-400 hover:text-gray-600 text-sm transition-colors">
                Privacy
              </Link>
              <Link href="/terms" className="flex items-center min-h-[44px] px-3 text-gray-400 hover:text-gray-600 text-sm transition-colors">
                Terms
              </Link>
              <Link href="/messaging-terms" className="flex items-center min-h-[44px] px-3 text-gray-400 hover:text-gray-600 text-sm transition-colors">
                SMS Terms
              </Link>
              <Link href="/contact" className="flex items-center min-h-[44px] px-3 text-gray-400 hover:text-gray-600 text-sm transition-colors">
                Support
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
