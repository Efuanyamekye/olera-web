"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;

// City coordinates [latitude, longitude] — used as fallback when mapPins aren't provided
const CITY_COORDS: Record<string, [number, number]> = {
  Houston: [29.7604, -95.3698],
  Dallas: [32.7767, -96.797],
  "San Antonio": [29.4241, -98.4936],
  "Fort Worth": [32.7555, -97.3308],
  Austin: [30.2672, -97.7431],
  "El Paso": [31.7619, -106.485],
  "Rio Grande Valley": [26.2034, -98.2300],
  "Corpus Christi": [27.8006, -97.3964],
  Lubbock: [33.5779, -101.8552],
  Amarillo: [35.2220, -101.8313],
  "Dallas / Fort Worth": [32.8998, -97.0403],
  "Lubbock / South Plains": [33.5779, -101.8552],
  "Midland / Odessa": [31.9973, -102.0779],
  Waco: [31.5493, -97.1467],
  Tyler: [32.3513, -95.3011],
  Beaumont: [30.0802, -94.1266],
  "South Texas": [28.7041, -97.8653],
};

interface MapPin {
  label: string;
  lat: number;
  lng: number;
}

interface ServiceAreasMapProps {
  stateId: string;
  areas: { name: string; description: string }[];
  mapPins?: MapPin[];
  programName?: string;
  noWrapper?: boolean;
}

export function ServiceAreasMap({ stateId, areas, mapPins, programName, noWrapper }: ServiceAreasMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const pinsRef = useRef<{ lat: number; lng: number; label: string }[]>([]);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const [zipcode, setZipcode] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const userMarkerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    // Build pin list
    const pins: { lat: number; lng: number; label: string }[] = [];

    if (mapPins && mapPins.length > 0) {
      for (const pin of mapPins) {
        pins.push({ lat: pin.lat, lng: pin.lng, label: pin.label });
      }
    } else {
      for (const area of areas) {
        // Split combined names like "Dallas / Fort Worth" into separate pins
        const parts = area.name.includes(" / ") ? area.name.split(" / ").map(p => p.trim()) : [area.name];
        for (const part of parts) {
          const coords = CITY_COORDS[part];
          if (coords) {
            pins.push({ lat: coords[0], lng: coords[1], label: part });
          }
        }
      }
    }

    if (pins.length === 0) return;

    pinsRef.current = pins;

    const bounds = L.latLngBounds(pins.map((p) => [p.lat, p.lng]));

    const map = L.map(mapRef.current, {
      scrollWheelZoom: false,
      attributionControl: true,
      zoomControl: false,
    }).fitBounds(bounds, { padding: [50, 50], maxZoom: 9 });

    // Zoom controls — top right
    L.control.zoom({ position: "topright" }).addTo(map);

    // MapTiler Positron when key is available, CartoDB fallback otherwise
    const tileUrl = MAPTILER_KEY
      ? `https://api.maptiler.com/maps/positron/256/{z}/{x}/{y}@2x.png?key=${MAPTILER_KEY}`
      : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png";
    const tileAttribution = MAPTILER_KEY
      ? '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>, &copy; <a href="https://www.maptiler.com/">MapTiler</a>'
      : '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>, &copy; <a href="https://carto.com/">CARTO</a>';
    L.tileLayer(tileUrl, {
      attribution: tileAttribution,
      maxZoom: 18,
      ...(MAPTILER_KEY ? {} : { subdomains: "abcd" }),
    }).addTo(map);

    // Highlight the state boundary with Olera teal
    fetch(`https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json`)
      .then((res) => res.json())
      .then((geojson) => {
        const stateNames: Record<string, string> = {
          texas: "Texas", california: "California", florida: "Florida",
          "new-york": "New York", arizona: "Arizona", colorado: "Colorado",
          georgia: "Georgia", illinois: "Illinois", michigan: "Michigan",
          ohio: "Ohio", pennsylvania: "Pennsylvania", virginia: "Virginia",
          "north-carolina": "North Carolina", "south-carolina": "South Carolina",
          alabama: "Alabama", arkansas: "Arkansas", connecticut: "Connecticut",
          delaware: "Delaware", hawaii: "Hawaii", idaho: "Idaho",
          indiana: "Indiana", iowa: "Iowa", kansas: "Kansas",
          kentucky: "Kentucky", louisiana: "Louisiana", maine: "Maine",
          maryland: "Maryland", massachusetts: "Massachusetts", minnesota: "Minnesota",
          mississippi: "Mississippi", missouri: "Missouri", montana: "Montana",
          nebraska: "Nebraska", nevada: "Nevada", "new-hampshire": "New Hampshire",
          "new-jersey": "New Jersey", "new-mexico": "New Mexico",
          "north-dakota": "North Dakota", oklahoma: "Oklahoma", oregon: "Oregon",
          "rhode-island": "Rhode Island", "south-dakota": "South Dakota",
          tennessee: "Tennessee", utah: "Utah", vermont: "Vermont",
          washington: "Washington", "west-virginia": "West Virginia",
          wisconsin: "Wisconsin", wyoming: "Wyoming", alaska: "Alaska",
        };
        const stateName = stateNames[stateId] || stateId;
        const stateFeature = geojson.features?.find(
          (f: { properties: { name: string } }) => f.properties.name === stateName
        );
        if (stateFeature) {
          L.geoJSON(stateFeature, {
            style: {
              fillColor: "#4d9b96",
              fillOpacity: 0.12,
              color: "#4d9b96",
              weight: 2,
              opacity: 0.5,
            },
          }).addTo(map);
        }
      })
      .catch(() => { /* state boundary fetch failed — no big deal */ });

    // Custom pin icon — Olera teal with modern shadow
    const pinIcon = L.divIcon({
      className: "",
      html: `<div style="display:flex;align-items:center;justify-content:center;width:36px;height:36px;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.2));">
        <svg width="28" height="36" viewBox="0 0 28 36" fill="none">
          <path d="M14 0C6.268 0 0 6.268 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.268 21.732 0 14 0z" fill="#0e7490"/>
          <circle cx="14" cy="13" r="6" fill="white"/>
          <circle cx="14" cy="13" r="3" fill="#0e7490"/>
        </svg>
      </div>`,
      iconSize: [36, 36],
      iconAnchor: [18, 36],
      popupAnchor: [0, -36],
    });

    markersRef.current.clear();
    for (const pin of pins) {
      const marker = L.marker([pin.lat, pin.lng], { icon: pinIcon })
        .addTo(map)
        .bindPopup(`<div style="font-family:Inter,-apple-system,system-ui,sans-serif;padding:4px 2px;"><strong style="font-size:14px;color:#111;">${pin.label}</strong></div>`, {
          className: "olera-popup",
          closeButton: false,
        });
      markersRef.current.set(pin.label, marker);
    }

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [areas, mapPins, stateId]);

  // Listen for flyToCity events from clickable city badges
  useEffect(() => {
    const handler = (e: Event) => {
      const cityName = (e as CustomEvent<string>).detail;
      const map = mapInstanceRef.current;
      if (!map) return;

      // Find the matching pin
      const pin = pinsRef.current.find(
        (p) => p.label === cityName || cityName.includes(p.label) || p.label.includes(cityName)
      );
      if (pin) {
        map.flyTo([pin.lat, pin.lng], 10, { animate: true, duration: 1 });
        const marker = markersRef.current.get(pin.label);
        if (marker) {
          setTimeout(() => marker.openPopup(), 600);
        }
      }
    };
    document.addEventListener("flyToCity", handler);
    return () => document.removeEventListener("flyToCity", handler);
  }, []);

  const handleSearch = useCallback(async () => {
    if (!zipcode.match(/^\d{5}$/) || !mapInstanceRef.current) return;
    setSearching(true);
    setSearchError("");

    try {
      let lat: number | null = null;
      let lng: number | null = null;

      const res1 = await fetch(
        `https://nominatim.openstreetmap.org/search?` +
        new URLSearchParams({ postalcode: zipcode, country: "US", format: "json", limit: "1" }),
        { headers: { "Accept": "application/json" } }
      );
      const data1 = await res1.json();
      if (data1.length > 0) {
        lat = parseFloat(data1[0].lat);
        lng = parseFloat(data1[0].lon);
      }

      // Fallback: free-form search
      if (lat === null) {
        const res2 = await fetch(
          `https://nominatim.openstreetmap.org/search?` +
          new URLSearchParams({ q: `${zipcode}, United States`, format: "json", limit: "1" }),
          { headers: { "Accept": "application/json" } }
        );
        const data2 = await res2.json();
        if (data2.length > 0 && data2[0].display_name?.includes(zipcode)) {
          lat = parseFloat(data2[0].lat);
          lng = parseFloat(data2[0].lon);
        }
      }

      // Last fallback: ZIP prefix approximation
      if (lat === null) {
        const prefix = zipcode.slice(0, 3);
        const ZIP3_APPROX: Record<string, [number, number]> = {
          "733": [30.27, -97.74], "750": [32.78, -96.80], "751": [32.78, -96.80],
          "752": [32.76, -97.33], "770": [29.76, -95.37], "782": [29.42, -98.49],
          "787": [30.27, -97.74], "790": [33.58, -101.85], "799": [31.76, -106.49],
        };
        if (ZIP3_APPROX[prefix]) {
          [lat, lng] = ZIP3_APPROX[prefix];
        }
      }

      if (lat !== null && lng !== null) {
        const map = mapInstanceRef.current;

        if (userMarkerRef.current) {
          userMarkerRef.current.remove();
        }

        // Find nearest pin
        const pins = pinsRef.current;
        let nearestDist = Infinity;
        let nearestPin: typeof pins[0] | null = null;
        for (const pin of pins) {
          const d = Math.sqrt((pin.lat - lat) ** 2 + (pin.lng - lng) ** 2);
          if (d < nearestDist) {
            nearestDist = d;
            nearestPin = pin;
          }
        }

        if (nearestPin) {
          const bounds = L.latLngBounds([
            [lat, lng],
            [nearestPin.lat, nearestPin.lng],
          ]);
          map.fitBounds(bounds, { padding: [60, 60], maxZoom: 12, animate: true });
        } else {
          map.setView([lat, lng], 11, { animate: true });
        }

        const userIcon = L.divIcon({
          className: "",
          html: `<div style="display:flex;align-items:center;justify-content:center;width:24px;height:24px;filter:drop-shadow(0 1px 3px rgba(59,130,246,0.4));">
            <div style="width:16px;height:16px;background:#4d9b96;border:3px solid white;border-radius:50%;"></div>
          </div>`,
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        });
        const nearestLabel = nearestPin
          ? `<br/><span style="font-size:12px;color:#4d9b96;font-weight:600;">Nearest: ${nearestPin.label}</span>`
          : "";
        const marker = L.marker([lat, lng], { icon: userIcon })
          .addTo(map)
          .bindPopup(
            `<div style="font-family:Inter,-apple-system,system-ui,sans-serif;padding:4px 2px;">
              <strong style="font-size:14px;color:#111;">Your location</strong>
              <br/><span style="font-size:12px;color:#666;">Zip code ${zipcode}</span>
              ${nearestLabel}
            </div>`,
            { className: "olera-popup", closeButton: false }
          )
          .openPopup();
        userMarkerRef.current = marker;
      } else {
        setSearchError("Couldn't find that zip code. Try a nearby one.");
      }
    } catch {
      setSearchError("Search failed. Please try again.");
    }
    setSearching(false);
  }, [zipcode]);

  const shortName = programName
    ? programName.replace(/\s*Texas\s*/gi, " ").trim()
    : "services";

  const mapStyles = (
    <style>{`
      .olera-popup .leaflet-popup-content-wrapper {
        border-radius: 12px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.06);
        border: none;
        padding: 0;
      }
      .olera-popup .leaflet-popup-content {
        margin: 10px 14px;
      }
      .olera-popup .leaflet-popup-tip {
        box-shadow: none;
      }
      .leaflet-control-zoom {
        border: none !important;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1) !important;
        border-radius: 10px !important;
        overflow: hidden;
      }
      .leaflet-control-zoom a {
        width: 34px !important;
        height: 34px !important;
        line-height: 34px !important;
        font-size: 16px !important;
        color: #374151 !important;
        border: none !important;
        border-bottom: 1px solid #f3f4f6 !important;
      }
      .leaflet-control-zoom a:last-child {
        border-bottom: none !important;
      }
      .leaflet-control-zoom a:hover {
        background: #f9fafb !important;
        color: #0e7490 !important;
      }
      .leaflet-control-attribution {
        background: rgba(255,255,255,0.7) !important;
        font-size: 10px !important;
        color: #9ca3af !important;
        border-radius: 6px 0 0 0 !important;
        padding: 2px 6px !important;
      }
      .leaflet-control-attribution a {
        color: #9ca3af !important;
      }
      .leaflet-container {
        background: #f8fafa !important;
      }
    `}</style>
  );

  const searchBar = (
    <div className={noWrapper ? "px-5 py-4" : "bg-white px-5 py-4 border-b border-gray-100"}>
      <label className="text-sm font-bold text-gray-900 block mb-2.5">
        Find a location near you
      </label>
      <div className="flex gap-2">
        <div className="relative flex-1 max-w-sm">
          <svg
            className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            inputMode="numeric"
            maxLength={5}
            placeholder="Enter your zip code"
            value={zipcode}
            onChange={(e) => setZipcode(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="w-full pl-10 pr-4 py-2.5 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-all"
          />
        </div>
        <button
          onClick={handleSearch}
          disabled={searching}
          className="px-5 py-2.5 bg-primary-600 text-white text-sm font-semibold rounded-xl hover:bg-primary-700 disabled:opacity-70 disabled:cursor-not-allowed transition-colors shadow-sm"
        >
          {searching ? "Searching..." : "Search"}
        </button>
      </div>
      {searchError && (
        <p className="mt-2 text-xs text-error-600">{searchError}</p>
      )}
    </div>
  );

  if (noWrapper) {
    return (
      <div className="flex flex-col bg-gray-50/50 h-full">
        {mapStyles}
        {searchBar}
        <div ref={mapRef} className="flex-1" style={{ minHeight: 400, width: "100%" }} />
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {mapStyles}
      {searchBar}
      <div ref={mapRef} style={{ height: 360, width: "100%" }} />
    </div>
  );
}
