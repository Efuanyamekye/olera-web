"use client";

import { useState, useEffect, useCallback } from "react";

interface MobileStickyBottomCTAProps {
  providerName: string;
  priceRange: string | null;
}

export default function MobileStickyBottomCTA({
  providerName,
  priceRange,
}: MobileStickyBottomCTAProps) {
  const [visible, setVisible] = useState(false);

  const handleScroll = useCallback(() => {
    setVisible(window.scrollY > 100);
  }, []);

  useEffect(() => {
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  const scrollToConnectionCard = () => {
    const el = document.getElementById("connection-card");
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    el.classList.add("ring-2", "ring-primary-400", "ring-offset-2", "rounded-2xl");
    setTimeout(() => {
      el.classList.remove("ring-2", "ring-primary-400", "ring-offset-2", "rounded-2xl");
    }, 2000);
  };

  return (
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
            onClick={scrollToConnectionCard}
            className="flex-shrink-0 px-7 py-3 bg-primary-600 hover:bg-primary-500 active:bg-primary-700 text-white rounded-xl text-base font-semibold transition-colors"
          >
            Connect
          </button>
        </div>
      </div>
    </div>
  );
}
