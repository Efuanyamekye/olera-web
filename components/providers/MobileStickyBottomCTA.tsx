"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/ui/Modal";
import ConnectionCard from "@/components/providers/connection-card";

interface MobileStickyBottomCTAProps {
  providerName: string;
  priceRange: string | null;
  // ConnectionCard props
  providerId: string;
  providerSlug: string;
  oleraScore: number | null;
  reviewCount: number | undefined;
  phone: string | null;
  acceptedPayments: string[];
  careTypes: string[];
  // Redirect props
  providerCategory?: string | null;
  providerCity?: string | null;
  providerState?: string | null;
}

export default function MobileStickyBottomCTA({
  providerName,
  priceRange,
  providerId,
  providerSlug,
  oleraScore,
  reviewCount,
  phone,
  acceptedPayments,
  careTypes,
  providerCategory,
  providerCity,
  providerState,
}: MobileStickyBottomCTAProps) {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const handleScroll = useCallback(() => {
    setVisible(window.scrollY > 100);
  }, []);

  useEffect(() => {
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  // Allow other components (e.g. ScrollToConnectionCard) to open the sheet
  useEffect(() => {
    const openSheet = () => setSheetOpen(true);
    window.addEventListener("open-connection-sheet", openSheet);
    return () => window.removeEventListener("open-connection-sheet", openSheet);
  }, []);

  const handleConnectionCreated = (connectionId: string) => {
    setSheetOpen(false);
    const params = new URLSearchParams({
      name: providerName,
      slug: providerSlug,
    });
    if (providerCategory) params.set("category", providerCategory);
    if (providerCity) params.set("city", providerCity);
    if (providerState) params.set("state", providerState);
    router.push(`/connected/${connectionId}?${params.toString()}`);
  };

  return (
    <>
      <div
        className={`fixed bottom-0 left-0 right-0 z-50 md:hidden transition-transform duration-300 ${
          visible ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div
          className="bg-white border-t border-gray-200 shadow-[0_-2px_10px_rgba(0,0,0,0.08)]"
          style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        >
          <div className="flex items-center gap-4 px-4 py-3.5">
            <div className="flex-1 min-w-0">
              {priceRange ? (
                <p className="text-base font-bold text-gray-900 truncate">{priceRange}</p>
              ) : (
                <p className="text-sm font-medium text-gray-500 truncate">Contact for pricing</p>
              )}
            </div>

            <button
              onClick={() => setSheetOpen(true)}
              className="flex-shrink-0 px-7 py-3 bg-primary-600 hover:bg-primary-500 active:bg-primary-700 text-white rounded-xl text-base font-semibold transition-colors"
            >
              Connect
            </button>
          </div>
        </div>
      </div>

      {/* Bottom sheet with full ConnectionCard */}
      <Modal isOpen={sheetOpen} onClose={() => setSheetOpen(false)} size="lg">
        {/* Cancel Modal body padding so card fills full width */}
        <div className="-mx-5 sm:-mx-7 -mt-2">
        <ConnectionCard
          providerId={providerId}
          providerName={providerName}
          providerSlug={providerSlug}
          priceRange={priceRange}
          oleraScore={oleraScore}
          reviewCount={reviewCount}
          phone={phone}
          acceptedPayments={acceptedPayments}
          careTypes={careTypes}
          responseTime={null}
          onConnectionCreated={handleConnectionCreated}
        />
        </div>
      </Modal>
    </>
  );
}
