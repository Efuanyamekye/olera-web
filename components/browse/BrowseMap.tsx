"use client";

import { useEffect, useRef, useMemo, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Provider } from "@/components/providers/ProviderCard";

interface BrowseMapProps {
  providers: Provider[];
  hoveredProviderId: string | null;
  onMarkerHover: (id: string | null) => void;
}

// ============================================================
// Helpers
// ============================================================

/** Create a custom Leaflet divIcon — Airbnb-style white pill with price */
function createPriceIcon(price: string, isHovered: boolean): L.DivIcon {
  return L.divIcon({
    className: "olera-price-marker",
    html: `<div style="
      width: max-content;
      transform: translate(-50%, -50%)${isHovered ? " scale(1.1)" : ""};
      padding: 6px 10px;
      border-radius: 20px;
      font-size: 13px;
      font-weight: 600;
      white-space: nowrap;
      cursor: pointer;
      transition: transform 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
      background: ${isHovered ? "#199087" : "#fff"};
      color: ${isHovered ? "#fff" : "#222"};
      box-shadow: 0 1px 4px rgba(0,0,0,0.18);
      border: 1px solid ${isHovered ? "#199087" : "rgba(0,0,0,0.08)"};
    ">${price}</div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

/** Build HTML for the popup preview card */
function buildPopupHTML(provider: Provider): string {
  const stars = Array.from({ length: 5 }, (_, i) =>
    `<span style="color:${i < Math.round(provider.rating) ? "#facc15" : "#d1d5db"}">★</span>`
  ).join("");

  return `
    <a href="/provider/${provider.slug}" target="_blank" rel="noopener" style="display:block;width:260px;text-decoration:none;color:inherit;font-family:system-ui,-apple-system,sans-serif;">
      <img
        src="${provider.image}"
        alt="${provider.name}"
        style="width:100%;height:128px;object-fit:cover;border-radius:10px 10px 0 0;"
        onerror="this.style.display='none'"
      />
      <div style="padding:12px;">
        <div style="font-size:14px;font-weight:600;color:#111;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
          ${provider.name}
        </div>
        <div style="font-size:12px;color:#6b7280;margin-top:2px;">
          ${provider.primaryCategory}
        </div>
        <div style="margin-top:4px;font-size:13px;">
          ${stars}
          <span style="font-size:12px;color:#6b7280;margin-left:4px;">${provider.rating.toFixed(1)}</span>
        </div>
        <div style="margin-top:6px;font-size:14px;font-weight:700;color:#111;">
          ${provider.priceRange}
        </div>
      </div>
    </a>
  `;
}

// ============================================================
// Component
// ============================================================

export default function BrowseMap({
  providers,
  hoveredProviderId,
  onMarkerHover,
}: BrowseMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const prevHoveredRef = useRef<string | null>(null);
  // Stable ref for onMarkerHover to avoid re-creating markers on every render
  const onMarkerHoverRef = useRef(onMarkerHover);
  onMarkerHoverRef.current = onMarkerHover;

  // Filter to providers with valid coordinates
  const mappableProviders = useMemo(
    () => providers.filter((p) => p.lat != null && p.lon != null).slice(0, 50),
    [providers]
  );

  // ── Initialize map ──
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      zoomControl: true,
      attributionControl: false,
    }).setView([30.2672, -97.7431], 12);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
    }).addTo(map);

    // Compact attribution in bottom-right
    L.control
      .attribution({ position: "bottomright", prefix: false })
      .addAttribution('© <a href="https://openstreetmap.org" target="_blank">OSM</a>')
      .addTo(map);

    mapRef.current = map;

    // Resize observer to keep map in sync with container
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(mapContainerRef.current);

    return () => {
      observer.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // ── Update markers when providers change (NOT on hover) ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clear existing markers
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current.clear();

    if (mappableProviders.length === 0) return;

    // Add markers (all start unhovered)
    mappableProviders.forEach((provider) => {
      const icon = createPriceIcon(provider.priceRange, false);

      const marker = L.marker([provider.lat!, provider.lon!], { icon })
        .addTo(map)
        .bindPopup(buildPopupHTML(provider), {
          maxWidth: 280,
          minWidth: 260,
          className: "olera-map-popup",
          closeButton: true,
          offset: [0, -5],
        });

      marker.on("mouseover", () => onMarkerHoverRef.current(provider.id));
      marker.on("mouseout", () => onMarkerHoverRef.current(null));

      markersRef.current.set(provider.id, marker);
    });

    // Fit bounds to show all markers
    const bounds = L.latLngBounds(
      mappableProviders.map((p) => [p.lat!, p.lon!] as L.LatLngTuple)
    );
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
  }, [mappableProviders]);

  // ── Handle hover sync (lightweight icon swap only) ──
  const updateHoveredMarker = useCallback(
    (providerId: string | null, prevId: string | null) => {
      // Reset previous
      if (prevId) {
        const prevMarker = markersRef.current.get(prevId);
        const prevProvider = mappableProviders.find((p) => p.id === prevId);
        if (prevMarker && prevProvider) {
          prevMarker.setIcon(createPriceIcon(prevProvider.priceRange, false));
          prevMarker.setZIndexOffset(0);
        }
      }
      // Highlight new
      if (providerId) {
        const marker = markersRef.current.get(providerId);
        const provider = mappableProviders.find((p) => p.id === providerId);
        if (marker && provider) {
          marker.setIcon(createPriceIcon(provider.priceRange, true));
          marker.setZIndexOffset(1000);
        }
      }
    },
    [mappableProviders]
  );

  useEffect(() => {
    updateHoveredMarker(hoveredProviderId, prevHoveredRef.current);
    prevHoveredRef.current = hoveredProviderId;
  }, [hoveredProviderId, updateHoveredMarker]);

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Empty state */}
      {mappableProviders.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50 rounded-2xl">
          <div className="text-center">
            <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
            <p className="text-sm text-gray-400">No locations to display</p>
          </div>
        </div>
      )}

      {/* Custom marker + popup styles */}
      <style jsx global>{`
        .olera-price-marker {
          background: none !important;
          border: none !important;
          overflow: visible !important;
        }
        .olera-map-popup .leaflet-popup-content-wrapper {
          border-radius: 12px;
          padding: 0;
          overflow: hidden;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12);
        }
        .olera-map-popup .leaflet-popup-content {
          margin: 0;
          line-height: 1.4;
        }
        .olera-map-popup .leaflet-popup-tip {
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }
        .olera-map-popup .leaflet-popup-close-button {
          top: 6px !important;
          right: 6px !important;
          width: 24px;
          height: 24px;
          font-size: 18px;
          color: #fff;
          background: rgba(0,0,0,0.4);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10;
        }
        .olera-map-popup .leaflet-popup-close-button:hover {
          background: rgba(0,0,0,0.6);
          color: #fff;
        }
      `}</style>
    </div>
  );
}
