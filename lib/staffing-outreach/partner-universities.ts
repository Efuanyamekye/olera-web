/**
 * Partner Universities — Staffing Outreach
 *
 * Each entry has the university's name, slug (used as the campaign key),
 * home location, and a curated list of catchment cities within ~60-min
 * drive. The seed script reads from this file to determine which providers
 * in olera-providers to queue for outreach.
 *
 * To start outreach for a new university:
 *   npx tsx scripts/seed-staffing-outreach.ts --university <slug>
 *
 * NYC universities deliberately excluded from MVP — students typically
 * don't have cars. NYU + Columbia can be added once we have a transit-
 * friendly variant of the program.
 *
 * City spellings are best-guess. The seed script validates each city
 * against olera-providers before queueing and flags zero-result cities.
 */

export interface CatchmentCity {
  city: string;
  state: string; // 2-letter code
}

export interface PartnerUniversity {
  slug: string;     // stable key, used in seed CLI
  name: string;     // display name in emails + admin UI
  city: string;     // university's own city
  state: string;
  /**
   * IANA timezone for this university (e.g., "America/Chicago").
   * Used to interpret student availability times and format times in emails.
   */
  timezone: string;
  /**
   * Campus coordinates. When present, the catchment is measured as a
   * radius from here and `catchment` becomes a safety net rather than the
   * definition — see `matchesCatchment` in lib/medjobs/catchment.ts.
   *
   * Measuring beats listing. The eleven cities hand-listed for Utah
   * returned 14 non-medical providers; 40 miles from these coordinates
   * returns 73. Millcreek and South Salt Lake both border Salt Lake City
   * and neither was ever on the list.
   */
  lat?: number;
  lon?: number;
  /** Defaults to DEFAULT_RADIUS_MILES when lat/lon are set. */
  radiusMiles?: number;
  catchment: CatchmentCity[];
  /**
   * A teaching campus, not a real one.
   *
   * It is in this list because the board reaches students through it: the
   * campus-university bridge resolves a campus to a university here, and a
   * campus the bridge cannot resolve has no students. Everything that
   * reports on universities filters it out instead.
   *
   * Its catchment is empty on purpose. With no cities and no coordinates,
   * nothing in the real provider directory can be pulled into it, so the
   * demo cannot quietly acquire real agencies to work.
   */
  isDemo?: boolean;
}

export const PARTNER_UNIVERSITIES: PartnerUniversity[] = [
  // ── Texas ────────────────────────────────────────────────────────────
  {
    slug: "ut-austin",
    name: "University of Texas at Austin",
    city: "Austin",
    state: "TX",
    timezone: "America/Chicago",
    catchment: [
      { city: "Austin", state: "TX" },
      { city: "Round Rock", state: "TX" },
      { city: "Cedar Park", state: "TX" },
      { city: "Pflugerville", state: "TX" },
      { city: "Leander", state: "TX" },
      { city: "Georgetown", state: "TX" },
      { city: "Buda", state: "TX" },
      { city: "Kyle", state: "TX" },
      { city: "San Marcos", state: "TX" },
      { city: "Lakeway", state: "TX" },
    ],
  },
  {
    slug: "texas-am",
    name: "Texas A&M University",
    city: "College Station",
    state: "TX",
    timezone: "America/Chicago",
    catchment: [
      { city: "College Station", state: "TX" },
      { city: "Bryan", state: "TX" },
      { city: "Navasota", state: "TX" },
      { city: "Hearne", state: "TX" },
      { city: "Caldwell", state: "TX" },
      { city: "Madisonville", state: "TX" },
      { city: "Brenham", state: "TX" },
      { city: "Huntsville", state: "TX" },
    ],
  },
  {
    slug: "u-houston",
    name: "University of Houston / Rice",
    city: "Houston",
    state: "TX",
    timezone: "America/Chicago",
    catchment: [
      { city: "Houston", state: "TX" },
      { city: "Sugar Land", state: "TX" },
      { city: "Pearland", state: "TX" },
      { city: "Pasadena", state: "TX" },
      { city: "Spring", state: "TX" },
      { city: "Katy", state: "TX" },
      { city: "Conroe", state: "TX" },
      { city: "Friendswood", state: "TX" },
      { city: "League City", state: "TX" },
      { city: "Missouri City", state: "TX" },
      { city: "Webster", state: "TX" },
    ],
  },

  // ── Florida ──────────────────────────────────────────────────────────
  {
    slug: "u-florida",
    name: "University of Florida",
    city: "Gainesville",
    state: "FL",
    timezone: "America/New_York",
    lat: 29.6483,
    lon: -82.3494,
    catchment: [
      { city: "Gainesville", state: "FL" },
      { city: "Alachua", state: "FL" },
      { city: "Newberry", state: "FL" },
      { city: "High Springs", state: "FL" },
      { city: "Archer", state: "FL" },
      { city: "Hawthorne", state: "FL" },
      { city: "Williston", state: "FL" },
      { city: "Ocala", state: "FL" },
      { city: "Starke", state: "FL" },
      { city: "Lake City", state: "FL" },
    ],
  },
  {
    slug: "florida-state",
    name: "Florida State University",
    city: "Tallahassee",
    state: "FL",
    timezone: "America/New_York",
    lat: 30.4419,
    lon: -84.2985,
    catchment: [
      { city: "Tallahassee", state: "FL" },
      { city: "Crawfordville", state: "FL" },
      { city: "Quincy", state: "FL" },
      { city: "Monticello", state: "FL" },
      { city: "Havana", state: "FL" },
    ],
  },

  // ── Georgia ──────────────────────────────────────────────────────────
  {
    slug: "u-georgia",
    name: "University of Georgia",
    city: "Athens",
    state: "GA",
    timezone: "America/New_York",
    catchment: [
      { city: "Athens", state: "GA" },
      { city: "Watkinsville", state: "GA" },
      { city: "Winder", state: "GA" },
      { city: "Jefferson", state: "GA" },
      { city: "Commerce", state: "GA" },
      { city: "Madison", state: "GA" },
      { city: "Monroe", state: "GA" },
      { city: "Bogart", state: "GA" },
    ],
  },
  {
    slug: "emory",
    name: "Emory University",
    city: "Atlanta",
    state: "GA",
    timezone: "America/New_York",
    catchment: [
      { city: "Atlanta", state: "GA" },
      { city: "Decatur", state: "GA" },
      { city: "Sandy Springs", state: "GA" },
      { city: "Brookhaven", state: "GA" },
      { city: "Marietta", state: "GA" },
      { city: "Smyrna", state: "GA" },
      { city: "Roswell", state: "GA" },
      { city: "Tucker", state: "GA" },
      { city: "Stone Mountain", state: "GA" },
      { city: "Lawrenceville", state: "GA" },
      { city: "East Point", state: "GA" },
      { city: "Dunwoody", state: "GA" },
      { city: "Alpharetta", state: "GA" },
    ],
  },

  // ── North Carolina ───────────────────────────────────────────────────
  {
    slug: "unc-chapel-hill",
    name: "University of North Carolina at Chapel Hill",
    city: "Chapel Hill",
    state: "NC",
    timezone: "America/New_York",
    catchment: [
      { city: "Chapel Hill", state: "NC" },
      { city: "Carrboro", state: "NC" },
      { city: "Durham", state: "NC" },
      { city: "Hillsborough", state: "NC" },
      { city: "Mebane", state: "NC" },
      { city: "Pittsboro", state: "NC" },
      { city: "Apex", state: "NC" },
      { city: "Cary", state: "NC" },
      { city: "Morrisville", state: "NC" },
    ],
  },
  {
    slug: "duke",
    name: "Duke University",
    city: "Durham",
    state: "NC",
    timezone: "America/New_York",
    catchment: [
      { city: "Durham", state: "NC" },
      { city: "Chapel Hill", state: "NC" },
      { city: "Raleigh", state: "NC" },
      { city: "Cary", state: "NC" },
      { city: "Hillsborough", state: "NC" },
      { city: "Morrisville", state: "NC" },
      { city: "Apex", state: "NC" },
      { city: "Wake Forest", state: "NC" },
      { city: "Carrboro", state: "NC" },
      { city: "Knightdale", state: "NC" },
    ],
  },

  // ── Virginia ─────────────────────────────────────────────────────────
  {
    slug: "uva",
    name: "University of Virginia",
    city: "Charlottesville",
    state: "VA",
    timezone: "America/New_York",
    catchment: [
      { city: "Charlottesville", state: "VA" },
      { city: "Crozet", state: "VA" },
      { city: "Earlysville", state: "VA" },
      { city: "Ruckersville", state: "VA" },
      { city: "Stanardsville", state: "VA" },
      { city: "Gordonsville", state: "VA" },
      { city: "Louisa", state: "VA" },
      { city: "Palmyra", state: "VA" },
      { city: "Scottsville", state: "VA" },
    ],
  },
  {
    slug: "virginia-tech",
    name: "Virginia Tech",
    city: "Blacksburg",
    state: "VA",
    timezone: "America/New_York",
    catchment: [
      { city: "Blacksburg", state: "VA" },
      { city: "Christiansburg", state: "VA" },
      { city: "Radford", state: "VA" },
      { city: "Pulaski", state: "VA" },
      { city: "Salem", state: "VA" },
      { city: "Roanoke", state: "VA" },
      { city: "Floyd", state: "VA" },
      { city: "Pearisburg", state: "VA" },
    ],
  },

  // ── Tennessee ────────────────────────────────────────────────────────
  {
    slug: "vanderbilt",
    name: "Vanderbilt University",
    city: "Nashville",
    state: "TN",
    timezone: "America/Chicago",
    catchment: [
      { city: "Nashville", state: "TN" },
      { city: "Brentwood", state: "TN" },
      { city: "Franklin", state: "TN" },
      { city: "Murfreesboro", state: "TN" },
      { city: "Hendersonville", state: "TN" },
      { city: "Mount Juliet", state: "TN" },
      { city: "Smyrna", state: "TN" },
      { city: "La Vergne", state: "TN" },
      { city: "Goodlettsville", state: "TN" },
      { city: "Antioch", state: "TN" },
      { city: "Madison", state: "TN" },
    ],
  },
  {
    slug: "u-tennessee-knoxville",
    name: "University of Tennessee Knoxville",
    city: "Knoxville",
    state: "TN",
    timezone: "America/New_York",
    catchment: [
      { city: "Knoxville", state: "TN" },
      { city: "Maryville", state: "TN" },
      { city: "Alcoa", state: "TN" },
      { city: "Oak Ridge", state: "TN" },
      { city: "Farragut", state: "TN" },
      { city: "Sevierville", state: "TN" },
      { city: "Pigeon Forge", state: "TN" },
      { city: "Lenoir City", state: "TN" },
      { city: "Clinton", state: "TN" },
      { city: "Powell", state: "TN" },
    ],
  },

  // ── Kentucky ─────────────────────────────────────────────────────────
  {
    slug: "u-kentucky",
    name: "University of Kentucky",
    city: "Lexington",
    state: "KY",
    timezone: "America/New_York",
    catchment: [
      { city: "Lexington", state: "KY" },
      { city: "Nicholasville", state: "KY" },
      { city: "Versailles", state: "KY" },
      { city: "Georgetown", state: "KY" },
      { city: "Winchester", state: "KY" },
      { city: "Richmond", state: "KY" },
      { city: "Frankfort", state: "KY" },
      { city: "Berea", state: "KY" },
      { city: "Paris", state: "KY" },
      { city: "Mount Sterling", state: "KY" },
    ],
  },

  // ── Ohio ─────────────────────────────────────────────────────────────
  {
    slug: "ohio-state",
    name: "Ohio State University",
    city: "Columbus",
    state: "OH",
    timezone: "America/New_York",
    catchment: [
      { city: "Columbus", state: "OH" },
      { city: "Dublin", state: "OH" },
      { city: "Westerville", state: "OH" },
      { city: "Worthington", state: "OH" },
      { city: "Hilliard", state: "OH" },
      { city: "Upper Arlington", state: "OH" },
      { city: "Grove City", state: "OH" },
      { city: "Reynoldsburg", state: "OH" },
      { city: "Gahanna", state: "OH" },
      { city: "Pickerington", state: "OH" },
      { city: "Delaware", state: "OH" },
      { city: "Powell", state: "OH" },
    ],
  },

  // ── Michigan ─────────────────────────────────────────────────────────
  {
    slug: "u-michigan",
    name: "University of Michigan",
    city: "Ann Arbor",
    state: "MI",
    timezone: "America/Detroit",
    catchment: [
      { city: "Ann Arbor", state: "MI" },
      { city: "Ypsilanti", state: "MI" },
      { city: "Saline", state: "MI" },
      { city: "Dexter", state: "MI" },
      { city: "Plymouth", state: "MI" },
      { city: "Canton", state: "MI" },
      { city: "Novi", state: "MI" },
      { city: "Northville", state: "MI" },
      { city: "Brighton", state: "MI" },
      { city: "Howell", state: "MI" },
      { city: "Chelsea", state: "MI" },
      { city: "Belleville", state: "MI" },
    ],
  },
  {
    slug: "michigan-state",
    name: "Michigan State University",
    city: "East Lansing",
    state: "MI",
    timezone: "America/Detroit",
    catchment: [
      { city: "East Lansing", state: "MI" },
      { city: "Lansing", state: "MI" },
      { city: "Okemos", state: "MI" },
      { city: "Haslett", state: "MI" },
      { city: "Williamston", state: "MI" },
      { city: "Mason", state: "MI" },
      { city: "Holt", state: "MI" },
      { city: "Dewitt", state: "MI" },
      { city: "Grand Ledge", state: "MI" },
      { city: "Charlotte", state: "MI" },
    ],
  },

  // ── Pennsylvania ─────────────────────────────────────────────────────
  {
    slug: "penn-state",
    name: "Penn State University",
    city: "State College",
    state: "PA",
    timezone: "America/New_York",
    catchment: [
      { city: "State College", state: "PA" },
      { city: "Bellefonte", state: "PA" },
      { city: "Boalsburg", state: "PA" },
      { city: "Lemont", state: "PA" },
      { city: "Pleasant Gap", state: "PA" },
      { city: "Centre Hall", state: "PA" },
      { city: "Tyrone", state: "PA" },
      { city: "Altoona", state: "PA" },
      { city: "Philipsburg", state: "PA" },
      { city: "Port Matilda", state: "PA" },
    ],
  },

  // ── Wisconsin ────────────────────────────────────────────────────────
  {
    slug: "uw-madison",
    name: "University of Wisconsin-Madison",
    city: "Madison",
    state: "WI",
    timezone: "America/Chicago",
    lat: 43.0753,
    lon: -89.4034,
    catchment: [
      { city: "Madison", state: "WI" },
      { city: "Middleton", state: "WI" },
      { city: "Sun Prairie", state: "WI" },
      { city: "Verona", state: "WI" },
      { city: "Fitchburg", state: "WI" },
      { city: "Waunakee", state: "WI" },
      { city: "McFarland", state: "WI" },
      { city: "Stoughton", state: "WI" },
      { city: "Janesville", state: "WI" },
      { city: "Mount Horeb", state: "WI" },
    ],
  },

  // ── Minnesota ────────────────────────────────────────────────────────
  {
    slug: "u-minnesota",
    name: "University of Minnesota",
    city: "Minneapolis",
    state: "MN",
    timezone: "America/Chicago",
    catchment: [
      { city: "Minneapolis", state: "MN" },
      { city: "St. Paul", state: "MN" },
      { city: "Bloomington", state: "MN" },
      { city: "Edina", state: "MN" },
      { city: "Minnetonka", state: "MN" },
      { city: "Plymouth", state: "MN" },
      { city: "Maple Grove", state: "MN" },
      { city: "Roseville", state: "MN" },
      { city: "Eagan", state: "MN" },
      { city: "Burnsville", state: "MN" },
      { city: "Eden Prairie", state: "MN" },
      { city: "Woodbury", state: "MN" },
      { city: "Apple Valley", state: "MN" },
    ],
  },

  // ── Illinois ─────────────────────────────────────────────────────────
  {
    slug: "uiuc",
    name: "University of Illinois Urbana-Champaign",
    city: "Champaign",
    state: "IL",
    timezone: "America/Chicago",
    catchment: [
      { city: "Champaign", state: "IL" },
      { city: "Urbana", state: "IL" },
      { city: "Savoy", state: "IL" },
      { city: "Mahomet", state: "IL" },
      { city: "Rantoul", state: "IL" },
      { city: "Tolono", state: "IL" },
      { city: "Monticello", state: "IL" },
      { city: "Danville", state: "IL" },
      { city: "St. Joseph", state: "IL" },
    ],
  },

  // ── Indiana ──────────────────────────────────────────────────────────
  {
    slug: "indiana-bloomington",
    name: "Indiana University Bloomington",
    city: "Bloomington",
    state: "IN",
    timezone: "America/Indiana/Indianapolis",
    lat: 39.1653,
    lon: -86.5264,
    catchment: [
      { city: "Bloomington", state: "IN" },
      { city: "Ellettsville", state: "IN" },
      { city: "Spencer", state: "IN" },
      { city: "Bedford", state: "IN" },
      { city: "Bloomfield", state: "IN" },
      { city: "Mitchell", state: "IN" },
      { city: "Nashville", state: "IN" },
      { city: "Martinsville", state: "IN" },
    ],
  },

  // ── Colorado ─────────────────────────────────────────────────────────
  {
    slug: "cu-boulder",
    name: "University of Colorado Boulder",
    city: "Boulder",
    state: "CO",
    timezone: "America/Denver",
    catchment: [
      { city: "Boulder", state: "CO" },
      { city: "Lafayette", state: "CO" },
      { city: "Louisville", state: "CO" },
      { city: "Longmont", state: "CO" },
      { city: "Broomfield", state: "CO" },
      { city: "Westminster", state: "CO" },
      { city: "Erie", state: "CO" },
      { city: "Superior", state: "CO" },
      { city: "Niwot", state: "CO" },
    ],
  },

  // ── Arizona ──────────────────────────────────────────────────────────
  {
    slug: "arizona-state",
    name: "Arizona State University",
    city: "Tempe",
    state: "AZ",
    timezone: "America/Phoenix",
    lat: 33.4242,
    lon: -111.9281,
    catchment: [
      { city: "Tempe", state: "AZ" },
      { city: "Phoenix", state: "AZ" },
      { city: "Mesa", state: "AZ" },
      { city: "Chandler", state: "AZ" },
      { city: "Scottsdale", state: "AZ" },
      { city: "Gilbert", state: "AZ" },
      { city: "Glendale", state: "AZ" },
      { city: "Peoria", state: "AZ" },
      { city: "Surprise", state: "AZ" },
      { city: "Avondale", state: "AZ" },
      { city: "Goodyear", state: "AZ" },
      { city: "Queen Creek", state: "AZ" },
    ],
  },

  // ── Utah ─────────────────────────────────────────────────────────────
  {
    slug: "u-utah",
    name: "University of Utah",
    city: "Salt Lake City",
    state: "UT",
    timezone: "America/Denver",
    lat: 40.7649,
    lon: -111.8421,
    catchment: [
      { city: "Salt Lake City", state: "UT" },
      { city: "West Valley City", state: "UT" },
      { city: "West Jordan", state: "UT" },
      { city: "Sandy", state: "UT" },
      { city: "South Jordan", state: "UT" },
      { city: "Murray", state: "UT" },
      { city: "Draper", state: "UT" },
      { city: "Holladay", state: "UT" },
      { city: "Cottonwood Heights", state: "UT" },
      { city: "Midvale", state: "UT" },
      { city: "Taylorsville", state: "UT" },
    ],
  },
];

/** The universities that are real, which is every report's default. */
export const LIVE_UNIVERSITIES: PartnerUniversity[] = PARTNER_UNIVERSITIES.filter(
  (u) => !u.isDemo,
);

export function getUniversityBySlug(slug: string): PartnerUniversity | undefined {
  return PARTNER_UNIVERSITIES.find((u) => u.slug === slug);
}

/**
 * Derive a human-readable service area string for a university.
 * Used in email templates to describe the geographic region.
 *
 * Special cases handle known colloquial names (e.g., "Bryan-College Station area").
 * Default: "{university city} area"
 */
export function getServiceArea(universitySlug: string): string {
  // Special cases with colloquial names
  if (universitySlug === "texas-am") return "Bryan-College Station area";

  const uni = getUniversityBySlug(universitySlug);
  return uni ? `${uni.city} area` : "the area";
}
