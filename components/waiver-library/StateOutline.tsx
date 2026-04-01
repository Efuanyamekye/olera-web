"use client";

import { useMemo } from "react";

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
const topoFeature = require("topojson-client").feature;
const { geoPath, geoAlbersUsa } = require("d3-geo");
const usStatesData = require("us-atlas/states-10m.json");
/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */

const stateIdToFips: Record<string, string> = {
  alabama: "01", alaska: "02", arizona: "04", arkansas: "05",
  california: "06", colorado: "08", connecticut: "09", delaware: "10",
  florida: "12", georgia: "13", hawaii: "15", idaho: "16",
  illinois: "17", indiana: "18", iowa: "19", kansas: "20",
  kentucky: "21", louisiana: "22", maine: "23", maryland: "24",
  massachusetts: "25", michigan: "26", minnesota: "27", mississippi: "28",
  missouri: "29", montana: "30", nebraska: "31", nevada: "32",
  "new-hampshire": "33", "new-jersey": "34", "new-mexico": "35",
  "new-york": "36", "north-carolina": "37", "north-dakota": "38",
  ohio: "39", oklahoma: "40", oregon: "41", pennsylvania: "42",
  "rhode-island": "44", "south-carolina": "45", "south-dakota": "46",
  tennessee: "47", texas: "48", utah: "49", vermont: "50",
  virginia: "51", washington: "53", "west-virginia": "54",
  wisconsin: "55", wyoming: "56",
};

interface StateOutlineProps {
  stateId: string;
}

export function StateOutline({ stateId }: StateOutlineProps) {
  const fips = stateIdToFips[stateId];

  const pathData = useMemo(() => {
    if (!fips) return null;

    const geojson = topoFeature(usStatesData, usStatesData.objects.states);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stateFeature = geojson.features.find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (f: any) => String(f.id).padStart(2, "0") === fips
    );
    if (!stateFeature) return null;

    const projection = geoAlbersUsa().scale(1050).translate([487.5, 305]);
    const pathGen = geoPath(projection);
    const d = pathGen(stateFeature) as string | null;
    if (!d) return null;

    const bounds = pathGen.bounds(stateFeature) as [[number, number], [number, number]];
    const [[x0, y0], [x1, y1]] = bounds;
    const pad = 10;

    return {
      d,
      viewBox: `${x0 - pad} ${y0 - pad} ${x1 - x0 + pad * 2} ${y1 - y0 + pad * 2}`,
    };
  }, [fips]);

  if (!pathData) return null;

  return (
    <div className="absolute left-[55%] sm:left-[50%] top-1/2 -translate-y-1/2 h-[90%] aspect-square pointer-events-none">
      <svg
        viewBox={pathData.viewBox}
        className="w-full h-full"
        preserveAspectRatio="xMidYMid meet"
      >
        <path
          d={pathData.d}
          fill="#a5f3fc"
          opacity={0.18}
          strokeWidth={0}
        />
      </svg>
    </div>
  );
}
