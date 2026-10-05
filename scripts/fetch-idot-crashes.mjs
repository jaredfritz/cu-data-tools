#!/usr/bin/env node
// Downloads Champaign, Urbana, and Savoy crash records from IDOT's statewide crash layers
// (https://gis-idot.opendata.arcgis.com) and writes a compact, columnar JSON
// file the /data/crashes pages load client-side. Also pulls Census municipal
// boundaries so the location report can outline the selected place, and adds CCRPC's
// heavy-vehicle and University District fields from a saved snapshot (see ccrpc-supplement.mjs).
//
// Usage: npm run data:crashes [-- --from=2014 --to=2025] [-- --refresh-ccrpc]
//   --refresh-ccrpc  re-download CCRPC's crash points into data/ccrpc/crash-points.json first

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { markDatasetUpdated, writeIfChanged } from "./data-updates.mjs";
import { applyCcrpcSnapshot, fetchCcrpcSnapshot } from "./ccrpc-supplement.mjs";

const OUT_DIR = path.join(process.cwd(), "public", "data", "crashes");
const CCRPC_SNAPSHOT = path.join(process.cwd(), "data", "ccrpc", "crash-points.json");
const COUNTY = "Champaign";
export const CITIES = ["Champaign", "Urbana", "Savoy"];
const PAGE_SIZE = 2000;

const PORTAL_SEARCH = "https://gis-idot.opendata.arcgis.com/api/search/v1/collections/all/items";
const TIGER_PLACES =
  "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Places_CouSub_ConCity_SubMCD/MapServer/4/query";
const CHAMPAIGN_COUNTY_BBOX = "-88.47,39.87,-87.92,40.41";

const OUT_FIELDS = [
  "CrashID",
  "CrashYear",
  "CrashMonth",
  "CrashDay",
  "CrashDate",
  "CrashHour",
  "TSCrashLatitude",
  "TSCrashLongitude",
  "TotalFatals",
  "AInjuries",
  "BInjuries",
  "CInjuries",
  "TotalInjured",
  "NumberOfVehicles",
  "TypeOfFirstCrash",
  "Cause1",
  "CityName",
  "HighwayorStreetName",
  "AtIntersectionWith",
  "HitAndRun",
  "LightingCond",
  "WeatherCond",
  "RoadSurfaceCond",
];

function parseArgs() {
  const args = Object.fromEntries(
    process.argv
      .slice(2)
      .filter((arg) => arg.startsWith("--"))
      .map((arg) => {
        const [key, value] = arg.slice(2).split("=");
        return [key, value ?? "true"];
      }),
  );
  return {
    from: args.from ? Number(args.from) : 2014,
    to: args.to ? Number(args.to) : Number.POSITIVE_INFINITY,
    refreshCcrpc: args["refresh-ccrpc"] === "true",
  };
}

async function getJson(url, init) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      const res = await fetch(url, init);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const json = await res.json();
      if (json.error) throw new Error(JSON.stringify(json.error));
      return json;
    } catch (error) {
      if (attempt >= 4) throw new Error(`Request failed for ${url}: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
    }
  }
}

// IDOT publishes one "Crashes - YYYY" feature layer per year.
async function findYearLayers() {
  const url = `${PORTAL_SEARCH}?q=${encodeURIComponent("Crashes")}&limit=100`;
  const json = await getJson(url);
  const layers = new Map();
  for (const feature of json.features ?? []) {
    const title = feature.properties?.title ?? "";
    const match = title.match(/^crashes\s*-\s*(\d{4})$/i);
    const serviceUrl = feature.properties?.url;
    if (match && serviceUrl?.includes("FeatureServer")) {
      layers.set(Number(match[1]), `${serviceUrl.replace(/\/$/, "")}/0`);
    }
  }
  return layers;
}

// Older yearly layers name some fields differently, and only 2025+ includes street names.
const FIELD_ALIASES = { CrashYear: ["CrashYear", "CrashYr"] };

async function resolveFields(layerUrl) {
  const layer = await getJson(`${layerUrl}?f=json`);
  const byLowerName = new Map(layer.fields.map((field) => [field.name.toLowerCase(), field.name]));
  const resolved = {};
  for (const wanted of OUT_FIELDS) {
    const actual = (FIELD_ALIASES[wanted] ?? [wanted])
      .map((name) => byLowerName.get(name.toLowerCase()))
      .find(Boolean);
    if (actual) resolved[wanted] = actual;
  }
  return resolved;
}

async function fetchYear(layerUrl) {
  const fields = await resolveFields(layerUrl);
  const records = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const params = new URLSearchParams({
      where: `CrashReportCounty='${COUNTY}' AND CityName IN (${CITIES.map((city) => `'${city}'`).join(",")})`,
      outFields: Object.values(fields).join(","),
      returnGeometry: "false",
      orderByFields: "OBJECTID",
      resultOffset: String(offset),
      resultRecordCount: String(PAGE_SIZE),
      f: "json",
    });
    const json = await getJson(`${layerUrl}/query`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    });
    const features = json.features ?? [];
    records.push(
      ...features.map((feature) =>
        Object.fromEntries(Object.entries(fields).map(([wanted, actual]) => [wanted, feature.attributes[actual]])),
      ),
    );
    if (!json.exceededTransferLimit && features.length < PAGE_SIZE) break;
  }
  return records;
}

// Some years carry UTF-8 punctuation that was decoded as Windows-1252 ("â€“" for "–").
const MOJIBAKE = { "â€“": "–", "â€”": "—", "â€™": "’", "â€˜": "‘", "â€œ": "“", "â€\u009d": "”" };

function cleanText(raw) {
  if (typeof raw !== "string") return "";
  let text = raw;
  for (const [bad, good] of Object.entries(MOJIBAKE)) text = text.replaceAll(bad, good);
  return text.trim().replace(/\s+/g, " ");
}

class Dictionary {
  // keyOf merges spellings that differ only in punctuation (e.g. a cause written with and
  // without a dash in different years) into the first spelling seen.
  constructor(keyOf = (value) => value) {
    this.values = [];
    this.index = new Map();
    this.keyOf = keyOf;
  }

  id(raw) {
    const value = cleanText(raw);
    const key = this.keyOf(value);
    if (!this.index.has(key)) {
      this.index.set(key, this.values.length);
      this.values.push(value);
    }
    return this.index.get(key);
  }
}

const int = (value) => (Number.isFinite(Number(value)) ? Math.max(0, Math.round(Number(value))) : 0);

function crashDay(record) {
  // Layers before 2025 store a two-digit year (e.g. 24).
  const rawYear = int(record.CrashYear);
  const year = rawYear > 0 && rawYear < 100 ? 2000 + rawYear : rawYear;
  const month = int(record.CrashMonth);
  const day = int(record.CrashDay);
  if (year && month && day >= 1 && day <= 31) return year * 10000 + month * 100 + day;
  // Fall back to the timestamp, read in Central time to match the local crash date.
  const date = new Date(record.CrashDate);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  return Number(parts.replaceAll("-", ""));
}

// Crash location in degrees, or null when IDOT has none.
function crashPoint(record) {
  const lat = Number(record.TSCrashLatitude);
  // 2014-2017 layers store longitude without its sign; everything in Illinois is west of Greenwich.
  const lon = -Math.abs(Number(record.TSCrashLongitude));
  const valid = Number.isFinite(lat) && Number.isFinite(lon) && lat > 39 && lat < 41 && lon > -89 && lon < -87;
  return valid ? { lat, lon } : null;
}

// CCRPC fields are stored as 1 (yes), 0 (no), or -1 (CCRPC doesn't cover this crash).
const flag = (value) => (value === undefined ? -1 : value ? 1 : 0);

function encode(records) {
  const dicts = {
    type: new Dictionary(),
    cause: new Dictionary((value) => value.toLowerCase().replace(/[^a-z0-9]/g, "")),
    city: new Dictionary(),
    street: new Dictionary(),
    light: new Dictionary(),
    weather: new Dictionary(),
    surface: new Dictionary(),
  };
  const cols = {
    id: [], date: [], hour: [], lon: [], lat: [], k: [], a: [], b: [], c: [], injured: [], vehicles: [],
    type: [], cause: [], city: [], street: [], cross: [], hitRun: [], light: [], weather: [], surface: [],
    heavy: [], university: [],
  };

  records.sort((x, y) => crashDay(x) - crashDay(y) || int(x.CrashHour) - int(y.CrashHour));

  for (const r of records) {
    const point = crashPoint(r);
    cols.id.push(int(r.CrashID));
    cols.date.push(crashDay(r));
    cols.hour.push(int(r.CrashHour));
    cols.lon.push(point ? Math.round(point.lon * 1e5) : 0);
    cols.lat.push(point ? Math.round(point.lat * 1e5) : 0);
    cols.k.push(int(r.TotalFatals));
    cols.a.push(int(r.AInjuries));
    cols.b.push(int(r.BInjuries));
    cols.c.push(int(r.CInjuries));
    cols.injured.push(int(r.TotalInjured));
    cols.vehicles.push(int(r.NumberOfVehicles));
    cols.type.push(dicts.type.id(r.TypeOfFirstCrash));
    cols.cause.push(dicts.cause.id(r.Cause1));
    cols.city.push(dicts.city.id(r.CityName));
    cols.street.push(dicts.street.id(r.HighwayorStreetName));
    cols.cross.push(dicts.street.id(r.AtIntersectionWith));
    cols.hitRun.push(/^y/i.test(String(r.HitAndRun ?? "")) ? 1 : 0);
    cols.light.push(dicts.light.id(r.LightingCond));
    cols.weather.push(dicts.weather.id(r.WeatherCond));
    cols.surface.push(dicts.surface.id(r.RoadSurfaceCond));
    cols.heavy.push(flag(r.heavyVehicle));
    cols.university.push(flag(r.universityDistrict));
  }

  return {
    dict: Object.fromEntries(Object.entries(dicts).map(([key, dict]) => [key, dict.values])),
    cols,
  };
}

async function fetchPlaces() {
  const params = new URLSearchParams({
    where: "STATE='17'",
    geometry: CHAMPAIGN_COUNTY_BBOX,
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "NAME,BASENAME,GEOID",
    outSR: "4326",
    geometryPrecision: "5",
    maxAllowableOffset: "0.0002",
    f: "geojson",
  });
  return getJson(`${TIGER_PLACES}?${params}`);
}

// One crash per line, so a refreshed snapshot shows a readable diff in review.
function serializeSnapshot(snapshot) {
  const geographies = Object.entries(snapshot.geographies).map(([geography, byYear]) => {
    const years = Object.entries(byYear).map(
      ([y, rows]) => `    ${JSON.stringify(y)}: [\n${rows.map((row) => `      ${JSON.stringify(row)}`).join(",\n")}\n    ]`,
    );
    return `  ${JSON.stringify(geography)}: {\n${years.join(",\n")}\n  }`;
  });
  const header = { source: snapshot.source, columns: snapshot.columns, years: snapshot.years };
  return `${JSON.stringify(header).slice(0, -1)},\n"geographies": {\n${geographies.join(",\n")}\n}}\n`;
}

// Reads the saved CCRPC snapshot, or downloads a fresh one with --refresh-ccrpc.
// A failed refresh keeps the saved copy; a missing snapshot leaves the CCRPC fields unavailable.
async function loadCcrpcSnapshot(refresh) {
  if (refresh) {
    try {
      const snapshot = await fetchCcrpcSnapshot({ cities: CITIES, getJson });
      await mkdir(path.dirname(CCRPC_SNAPSHOT), { recursive: true });
      await writeFile(CCRPC_SNAPSHOT, serializeSnapshot(snapshot));
      console.log(`Saved CCRPC snapshot (${snapshot.years.join(", ")}) to ${path.relative(process.cwd(), CCRPC_SNAPSHOT)}.`);
      return snapshot;
    } catch (error) {
      console.warn(`CCRPC refresh failed, using the saved snapshot: ${error.message}`);
    }
  }
  try {
    return JSON.parse(await readFile(CCRPC_SNAPSHOT, "utf8"));
  } catch {
    console.warn("No CCRPC snapshot found; heavy-vehicle and University District fields will be unavailable.");
    return null;
  }
}

async function main() {
  const { from, to, refreshCcrpc } = parseArgs();
  await mkdir(OUT_DIR, { recursive: true });

  const layers = await findYearLayers();
  const years = [...layers.keys()].filter((year) => year >= from && year <= to).sort((a, b) => a - b);
  if (years.length === 0) throw new Error("No IDOT crash layers found for the requested years.");

  // A few crashes appear in two yearly layers; keep the first copy of each CrashID.
  const seen = new Set();
  const all = [];
  const perYear = {};
  for (const year of years) {
    const records = (await fetchYear(layers.get(year))).filter((record) => {
      if (seen.has(record.CrashID)) return false;
      seen.add(record.CrashID);
      return true;
    });
    perYear[year] = records.length;
    all.push(...records);
    console.log(`${year}: ${records.length.toLocaleString()} crashes`);
  }

  let ccrpc = null;
  const snapshot = await loadCcrpcSnapshot(refreshCcrpc);
  if (snapshot) {
    ccrpc = applyCcrpcSnapshot(all, snapshot, {
      cities: CITIES,
      int,
      year: (record) => Math.floor(crashDay(record) / 10000),
      lat: (record) => crashPoint(record)?.lat ?? null,
      lon: (record) => crashPoint(record)?.lon ?? null,
    });
  }

  const { dict, cols } = encode(all);
  const dataset = {
    meta: {
      source: "Illinois Department of Transportation, Crashes (statewide crash layers)",
      sourceUrl: "https://gis-idot.opendata.arcgis.com/",
      county: COUNTY,
      cities: CITIES,
      years,
      perYear,
      ccrpc,
    },
    dict,
    cols,
  };
  // Only a real data change bumps the "refreshed" date, so the monthly refresh doesn't open a PR for a date alone.
  if (await writeIfChanged(path.join(OUT_DIR, "champaign-urbana-savoy-idot.json"), JSON.stringify(dataset))) {
    const latest = String(all.reduce((max, record) => Math.max(max, crashDay(record) ?? 0), 0));
    await markDatasetUpdated("crashes", { through: `${latest.slice(0, 4)}-${latest.slice(4, 6)}-${latest.slice(6, 8)}` });
  }
  console.log(`Wrote ${all.length.toLocaleString()} crashes for ${years[0]}-${years.at(-1)}.`);

  try {
    const places = await fetchPlaces();
    // IDOT writes "St Joseph" where Census writes "St. Joseph"; match on a normalized name
    // and keep IDOT's spelling so the boundary lines up with the crash records.
    const normalize = (name) => String(name ?? "").toLowerCase().replace(/[^a-z]/g, "");
    const cityByKey = new Map(dict.city.map((name) => [normalize(name), name]));
    places.features = (places.features ?? [])
      .map((feature) => ({
        type: "Feature",
        properties: {
          name: cityByKey.get(normalize(feature.properties.BASENAME ?? feature.properties.NAME)),
          geoid: feature.properties.GEOID,
        },
        geometry: feature.geometry,
      }))
      .filter((feature) => feature.properties.name);
    await writeFile(path.join(OUT_DIR, "places.geojson"), JSON.stringify(places));
    console.log(`Wrote ${places.features.length} municipal boundaries.`);
  } catch (error) {
    console.warn(`Skipped municipal boundaries: ${error.message}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
