"use client";

import { useState } from "react";

interface ProviderMapProps {
  lat: number | null;
  lon: number | null;
  providerName: string;
  address?: string | null;
  placeId?: string | null;
  className?: string;
}

export default function ProviderMap({
  lat,
  lon,
  providerName,
  address,
  placeId,
  className = "",
}: ProviderMapProps) {
  const [mapError, setMapError] = useState(false);

  // Build Google Maps directions URL
  const getDirectionsUrl = () => {
    if (placeId) {
      return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(providerName)}&destination_place_id=${placeId}`;
    }
    if (lat && lon) {
      return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
    }
    if (address) {
      return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
    }
    return null;
  };

  // Build Google Maps view URL
  const getViewMapUrl = () => {
    if (placeId) {
      return `https://www.google.com/maps/place/?q=place_id:${placeId}`;
    }
    if (lat && lon) {
      return `https://www.google.com/maps?q=${lat},${lon}`;
    }
    if (address) {
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
    }
    return null;
  };

  const directionsUrl = getDirectionsUrl();
  const viewMapUrl = getViewMapUrl();

  // If no location data, show placeholder
  if (!lat || !lon) {
    if (!address) {
      return null;
    }

    // Show address-based map link without embed
    return (
      <div className={`bg-gray-50 rounded-xl border border-gray-200 overflow-hidden ${className}`}>
        <div className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <h3 className="font-semibold text-gray-900">Location</h3>
          </div>
          <p className="text-sm text-gray-600 mb-4">{address}</p>
          {viewMapUrl && (
            <a
              href={viewMapUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-medium text-primary-600 hover:text-primary-700"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              View on Google Maps
            </a>
          )}
        </div>
      </div>
    );
  }

  // OpenStreetMap embed URL
  const osmEmbedUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${lon - 0.01}%2C${lat - 0.01}%2C${lon + 0.01}%2C${lat + 0.01}&layer=mapnik&marker=${lat}%2C${lon}`;

  return (
    <div className={`bg-white rounded-xl border border-gray-200 overflow-hidden ${className}`}>
      {/* Map Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <h3 className="font-semibold text-gray-900">Location</h3>
        </div>
        {viewMapUrl && (
          <a
            href={viewMapUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"
          >
            <span>Open in Maps</span>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        )}
      </div>

      {/* Map Embed */}
      <div className="relative aspect-[16/9] bg-gray-100">
        {!mapError ? (
          <iframe
            src={osmEmbedUrl}
            className="absolute inset-0 w-full h-full"
            style={{ border: 0 }}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            title={`Map showing location of ${providerName}`}
            onError={() => setMapError(true)}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-sm text-gray-500">Map unavailable</p>
          </div>
        )}
      </div>

      {/* Address & Directions */}
      <div className="p-4 bg-gray-50 border-t border-gray-100">
        {address && (
          <p className="text-sm text-gray-600 mb-3">{address}</p>
        )}
        {directionsUrl && (
          <a
            href={directionsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white font-medium px-4 py-2.5 rounded-lg transition-colors text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
            Get Directions
          </a>
        )}
      </div>
    </div>
  );
}
