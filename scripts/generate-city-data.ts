/**
 * Generate city data files for US city search autocomplete
 *
 * This script processes uscities.csv and creates:
 * - cities-tier1.json: Top 200 cities by population
 * - cities-tier2.json: All cities with population >= 1000
 * - zip-index.json: ZIP prefix to city mapping
 *
 * Run with: npx tsx scripts/generate-city-data.ts
 */

import * as fs from "fs";
import * as path from "path";

// CSV source path - adjust if needed
const CSV_PATH = "/Users/tfalohun/Desktop/OleraClean/Resources/uscities.csv";
const OUTPUT_DIR = path.join(__dirname, "..", "public", "data");

// Compact city format: [city, state, population, lat, lng]
type CompactCity = [string, string, number, number, number];

// ZIP index format: { "prefix": [["City", "State"], ...] }
type ZipIndex = Record<string, [string, string][]>;

interface CityRow {
  city: string;
  state_id: string;
  population: number;
  lat: number;
  lng: number;
  zips: string;
}

function parseCSV(content: string): CityRow[] {
  const lines = content.split("\n");
  const headers = lines[0].split(",");

  // Find column indices
  const cityIdx = headers.indexOf("city");
  const stateIdx = headers.indexOf("state_id");
  const popIdx = headers.indexOf("population");
  const latIdx = headers.indexOf("lat");
  const lngIdx = headers.indexOf("lng");
  const zipsIdx = headers.indexOf("zips");

  const cities: CityRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Parse CSV with proper quote handling
    const values = parseCSVLine(line);
    if (values.length < headers.length) continue;

    const population = parseInt(values[popIdx], 10) || 0;
    if (population === 0) continue;

    cities.push({
      city: values[cityIdx],
      state_id: values[stateIdx],
      population,
      lat: parseFloat(values[latIdx]) || 0,
      lng: parseFloat(values[lngIdx]) || 0,
      zips: values[zipsIdx] || "",
    });
  }

  return cities;
}

function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current.trim());

  return values;
}

function toCompact(city: CityRow): CompactCity {
  return [
    city.city,
    city.state_id,
    city.population,
    Math.round(city.lat * 100) / 100,
    Math.round(city.lng * 100) / 100,
  ];
}

function main() {
  console.log("Reading CSV from:", CSV_PATH);

  if (!fs.existsSync(CSV_PATH)) {
    console.error("CSV file not found at:", CSV_PATH);
    process.exit(1);
  }

  const csvContent = fs.readFileSync(CSV_PATH, "utf-8");
  const allCities = parseCSV(csvContent);

  console.log(`Parsed ${allCities.length} cities with population data`);

  // Sort by population descending
  allCities.sort((a, b) => b.population - a.population);

  // Tier 1: Top 200 cities
  const tier1Cities = allCities.slice(0, 200).map(toCompact);
  console.log(`Tier 1: ${tier1Cities.length} cities`);

  // Tier 2: Cities with population >= 1000
  const tier2Cities = allCities
    .filter((c) => c.population >= 1000)
    .map(toCompact);
  console.log(`Tier 2: ${tier2Cities.length} cities`);

  // ZIP index: Map 3-digit ZIP prefix to cities
  const zipIndex: ZipIndex = {};
  const processedZips = new Set<string>();

  for (const city of allCities) {
    if (!city.zips) continue;

    const zips = city.zips.split(" ").filter((z) => z.length >= 3);
    for (const zip of zips) {
      const prefix = zip.substring(0, 3);

      // Only add each city once per prefix
      const key = `${prefix}-${city.city}-${city.state_id}`;
      if (processedZips.has(key)) continue;
      processedZips.add(key);

      if (!zipIndex[prefix]) {
        zipIndex[prefix] = [];
      }

      // Limit cities per prefix to top 10 by population
      if (zipIndex[prefix].length < 10) {
        zipIndex[prefix].push([city.city, city.state_id]);
      }
    }
  }

  console.log(`ZIP index: ${Object.keys(zipIndex).length} prefixes`);

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Write files
  const tier1Path = path.join(OUTPUT_DIR, "cities-tier1.json");
  const tier2Path = path.join(OUTPUT_DIR, "cities-tier2.json");
  const zipPath = path.join(OUTPUT_DIR, "zip-index.json");

  fs.writeFileSync(tier1Path, JSON.stringify(tier1Cities));
  fs.writeFileSync(tier2Path, JSON.stringify(tier2Cities));
  fs.writeFileSync(zipPath, JSON.stringify(zipIndex));

  // Report file sizes
  const tier1Size = fs.statSync(tier1Path).size;
  const tier2Size = fs.statSync(tier2Path).size;
  const zipSize = fs.statSync(zipPath).size;

  console.log("\nGenerated files:");
  console.log(`  cities-tier1.json: ${(tier1Size / 1024).toFixed(1)} KB`);
  console.log(`  cities-tier2.json: ${(tier2Size / 1024).toFixed(1)} KB`);
  console.log(`  zip-index.json: ${(zipSize / 1024).toFixed(1)} KB`);
  console.log("\nDone!");
}

main();
