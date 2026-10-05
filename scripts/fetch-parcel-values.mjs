#!/usr/bin/env node
// Builds the countywide parcel dataset behind /data/value-per-acre.
//
// Sources (all public, no login):
//   1. Parcels + assessments: the City of Champaign's public "TaxParcels_Assessed" layer, which
//      republishes the Champaign County GIS Consortium (CCGISC) parcel polygons with the county's
//      assessed values for every parcel in Champaign County.
//   2. Tax rates: the Champaign County Clerk's "District Rates by Taxcode" rate book (PDF). Each
//      tax code's rate, and the municipality it belongs to, comes from this file.
//   3. Site addresses: the county's property tax inquiry site (DEVNET wEdge) township search,
//      exported to CSV. Owner names in that export are discarded.
//
// Output: public/data/parcels/champaign-county-parcels.json, a compact columnar file with
// delta-encoded geometry that the page decodes client-side.
//
// Usage: npm run data:parcels [-- --rate-book=<pdf url>] [-- --skip-addresses] [-- --cache=<dir>]
//   --cache saves downloaded parcels and addresses to <dir> and reuses them on later runs (for development).

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { markDatasetUpdated } from "./data-updates.mjs";
import {
  area as turfArea,
  bbox as turfBbox,
  booleanIntersects,
  booleanPointInPolygon,
  buffer,
  convex,
  difference,
  featureCollection,
  multiPolygon,
  point,
  union,
} from "@turf/turf";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const OUT_DIR = path.join(process.cwd(), "public", "data", "parcels");
const OUT_FILE = "champaign-county-parcels.json";

const PARCEL_LAYER =
  "https://gisportal.champaignil.gov/ms/rest/services/OpenGov/Open_Gov_Map_Service/MapServer/0";
const CLERK_RATES_PAGE = "https://www.champaigncountyclerk.com/property-taxes/tax-extension-rates";
const DEVNET = "https://champaignil.devnetwedge.com";
const TIGER_PLACES =
  "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Places_CouSub_ConCity_SubMCD/MapServer/4/query";
const CHAMPAIGN_COUNTY_BBOX = "-88.47,39.87,-87.92,40.41";
const PAGE_SIZE = 2000;
const USER_AGENT = "cu-data-tools/1.0 (+https://github.com/jaredfritz/cu-data-tools)";
// The clerk's CDN rejects requests that don't look like a browser. We only fetch two public files.
const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
};

const PARCEL_FIELDS = [
  "PIN",
  "TaxParcelType",
  "TaxCode",
  "UseCode",
  "Tax_Status",
  "EAV",
  "AssessedLand",
  "AssessedFarmland",
  "AssessedBuilding",
  "AssessedFarmBuilding",
  "Shape.STArea()",
  // Used only to tell whether a vacant lot is held with the built parcel next door; never written out.
  "TaxPayer_Name",
  "TaxPayer_Address1",
];

// TaxParcelType 3 polygons are wind/solar lease areas drawn on top of the farm parcels they sit
// on. Mapping both would double count that land, so the lease polygons are left out.
const LEASE_PARCEL_TYPE = 3;
// TaxParcelType 1 polygons are condominium units; units in one building share the same footprint.
const CONDO_PARCEL_TYPE = 1;
// Condo and townhome units are drawn as building footprints only: the shared land around them (lawns,
// drives, parking) isn't a separate parcel. Units within this distance of each other are grouped into
// one development.
const CONDO_CLUSTER_METERS = 15;
// Margin added around a development's buildings to approximate its drives and yards. The result is
// trimmed so it never overlaps a neighboring parcel.
const CONDO_MARGIN_METERS = 8;
const SQ_FT_PER_SQ_M = 10.7639;

function parseArgs() {
  return Object.fromEntries(
    process.argv
      .slice(2)
      .filter((arg) => arg.startsWith("--"))
      .map((arg) => {
        const [key, ...rest] = arg.slice(2).split("=");
        return [key, rest.length ? rest.join("=") : "true"];
      }),
  );
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(url, init = {}, parse = (res) => res.json()) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      const res = await fetch(url, {
        ...init,
        headers: { "User-Agent": USER_AGENT, ...init.headers },
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const body = await parse(res);
      if (body?.error) throw new Error(JSON.stringify(body.error));
      return body;
    } catch (error) {
      if (attempt >= 4) throw new Error(`Request failed for ${url}: ${error.message}`);
      await sleep(1000 * 2 ** attempt);
    }
  }
}

// ---------------------------------------------------------------------------
// 1. Parcels
// ---------------------------------------------------------------------------

async function fetchParcels() {
  const features = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const params = new URLSearchParams({
      where: "1=1",
      outFields: PARCEL_FIELDS.join(","),
      returnGeometry: "true",
      outSR: "4326",
      geometryPrecision: "6",
      orderByFields: "OBJECTID",
      resultOffset: String(offset),
      resultRecordCount: String(PAGE_SIZE),
      f: "geojson",
    });
    const json = await request(`${PARCEL_LAYER}/query`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    });
    const page = json.features ?? [];
    features.push(...page);
    process.stdout.write(`\r  parcels: ${features.length.toLocaleString()}`);
    if (page.length < PAGE_SIZE) break;
    await sleep(250);
  }
  process.stdout.write("\n");
  return features;
}

// ---------------------------------------------------------------------------
// 2. Tax rates by tax code
// ---------------------------------------------------------------------------

async function findRateBookUrl() {
  const html = await request(CLERK_RATES_PAGE, { headers: BROWSER_HEADERS }, (res) => res.text());
  // The page lists the newest year first; rate books are named e.g. rate-book-2025-2026.pdf
  // or district-rates-taxcode-2024.pdf.
  const links = [...html.matchAll(/href="([^"]+\.pdf)"/gi)].map((match) => match[1]);
  const rateBook = links.find((href) => /rate-?book|district-?rates/i.test(href));
  if (!rateBook) throw new Error(`No rate book PDF found on ${CLERK_RATES_PAGE}`);
  return new URL(rateBook, CLERK_RATES_PAGE).toString();
}

async function pdfLines(url) {
  const data = new Uint8Array(await request(url, { headers: BROWSER_HEADERS }, (res) => res.arrayBuffer()));
  const doc = await getDocument({ data, useSystemFonts: true, verbosity: 0 }).promise;
  const lines = [];
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    const page = await doc.getPage(pageNumber);
    const { items } = await page.getTextContent();
    const rows = new Map();
    for (const item of items) {
      if (!("str" in item)) continue;
      const y = Math.round(item.transform[5]);
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y).push(item);
    }
    for (const y of [...rows.keys()].sort((a, b) => b - a)) {
      const text = rows
        .get(y)
        .sort((a, b) => a.transform[4] - b.transform[4])
        .map((item) => item.str)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (text) lines.push(text);
    }
  }
  return lines;
}

// "Champaign City" -> "Champaign", "St. Joseph Village" -> "St. Joseph"
const municipalityName = (district) => district.replace(/\s+(City|Village|Town)$/i, "").trim();

async function fetchTaxRates(url) {
  const lines = await pdfLines(url);
  const taxYear = Number(lines.join(" ").match(/Tax Year:\s*(\d{4})/)?.[1]) || null;
  const codes = new Map();
  let current = null;
  for (const line of lines) {
    const header = line.match(/^Tax Code (\d{4}[A-Z]?) -\s*(.*?)(?:\s*Tax Code Rate\s+([\d.]+))?$/);
    if (header) {
      current = { code: header[1], label: header[2].trim(), rate: header[3] ? Number(header[3]) : null, city: null };
      codes.set(current.code, current);
      continue;
    }
    if (!current) continue;
    const rateOnly = line.match(/^Tax Code Rate\s+([\d.]+)$/);
    if (rateOnly) current.rate = Number(rateOnly[1]);
    const total = line.match(/^Totals for (\d{4}[A-Z]?)\s+([\d.]+)$/);
    if (total && codes.has(total[1])) codes.get(total[1]).rate ??= Number(total[2]);
    // Districts numbered 05xx are the county's cities and villages.
    const municipality = line.match(/^05\d\d - (.+?)\s+[\d.]+$/);
    if (municipality) current.city = municipalityName(municipality[1]);
  }
  for (const entry of codes.values()) {
    // Labels look like "4102 + CHAMPAIGN TIF VII GARDEN HILLS"; keep only the TIF name.
    const tif = entry.label.match(/\+\s*(.*TIF.*)$/i)?.[1];
    entry.tif = tif ? tif.replace(/\s+/g, " ").trim() : null;
  }
  return { taxYear, codes };
}

// ---------------------------------------------------------------------------
// 3. Site addresses (township search export from the county tax inquiry site)
// ---------------------------------------------------------------------------

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (field || row.length) rows.push([...row, field]);
  return rows;
}

async function devnetSession() {
  const res = await fetch(`${DEVNET}/`, { headers: { "User-Agent": USER_AGENT } });
  const cookies = res.headers.getSetCookie().map((cookie) => cookie.split(";")[0]);
  return cookies.join("; ");
}

async function fetchAddresses() {
  const townships = await request(`${DEVNET}/Search/GetTownships`);
  const addresses = new Map();
  for (const township of townships) {
    // Each search lives in the server-side session, so give every township a fresh one.
    const cookie = await devnetSession();
    await fetch(`${DEVNET}/Search/ExecuteParcelSearch`, {
      method: "POST",
      headers: { "User-Agent": USER_AGENT, Cookie: cookie, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ search_tab: "advanced-parcel-search", townships: township.Value }),
      redirect: "manual",
    });
    const csv = await request(
      `${DEVNET}/Search/ExportClientsListToCSV`,
      { headers: { Cookie: cookie } },
      (res) => res.text(),
    );
    const [header, ...rows] = parseCsv(csv);
    const pinColumn = header?.indexOf("Property Account Number") ?? -1;
    const addressColumn = header?.indexOf("Address") ?? -1;
    if (pinColumn < 0 || addressColumn < 0) throw new Error(`Unexpected export columns: ${header}`);
    let count = 0;
    for (const row of rows) {
      const pin = row[pinColumn]?.replace(/\D/g, "");
      const address = row[addressColumn]?.replace(/\s+/g, " ").trim();
      if (pin && address) {
        addresses.set(pin, address);
        count += 1;
      }
    }
    console.log(`  ${township.Text}: ${count.toLocaleString()} addresses`);
    await sleep(1000);
  }
  return addresses;
}

// ---------------------------------------------------------------------------
// 4. Census municipal boundaries, used only for parcels whose tax code is newer than the rate book
// ---------------------------------------------------------------------------

async function fetchPlaces() {
  const params = new URLSearchParams({
    where: "STATE='17'",
    geometry: CHAMPAIGN_COUNTY_BBOX,
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "BASENAME",
    outSR: "4326",
    f: "geojson",
  });
  const json = await request(`${TIGER_PLACES}?${params}`);
  return json.features ?? [];
}

function placeAt(places, polygons) {
  const ring = polygons[0]?.[0] ?? [];
  if (ring.length === 0) return null;
  const point = [
    ring.reduce((sum, [lon]) => sum + lon, 0) / ring.length,
    ring.reduce((sum, [, lat]) => sum + lat, 0) / ring.length,
  ];
  return places.find((place) => booleanPointInPolygon(point, place))?.properties.BASENAME ?? null;
}

// ---------------------------------------------------------------------------
// Cleaning and encoding
// ---------------------------------------------------------------------------

const int = (value) => (Number.isFinite(Number(value)) ? Math.round(Number(value)) : 0);
const numberOrNull = (value) => (value === null || value === undefined || value === "" ? null : int(value));

function polygonsOf(geometry) {
  if (!geometry) return [];
  if (geometry.type === "Polygon") return [geometry.coordinates];
  if (geometry.type === "MultiPolygon") return geometry.coordinates;
  return [];
}

// Quantize to 1e-5 degrees (about 1 m) and delta-encode each ring: [x0, y0, dx1, dy1, ...].
function encodePolygons(polygons) {
  return polygons.map((rings) =>
    rings.map((ring) => {
      const flat = [];
      let px = 0;
      let py = 0;
      for (const [lon, lat] of ring) {
        const x = Math.round(lon * 1e5);
        const y = Math.round(lat * 1e5);
        if (flat.length && x === px && y === py) continue;
        flat.push(flat.length ? x - px : x, flat.length ? y - py : y);
        px = x;
        py = y;
      }
      return flat;
    }),
  );
}

const geometryKey = (polygons) => JSON.stringify(encodePolygons(polygons));

class Dictionary {
  constructor() {
    this.values = [];
    this.index = new Map();
  }

  id(raw) {
    const value = raw ?? "";
    if (!this.index.has(value)) {
      this.index.set(value, this.values.length);
      this.values.push(value);
    }
    return this.index.get(value);
  }
}

const mostCommon = (values) => {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
};

// turf's union needs at least two shapes.
const unionAll = (shapes) => (shapes.length === 1 ? shapes[0] : union(featureCollection(shapes)));

const bboxesOverlap = (a, b) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];

function polygonsOfFeature(feature) {
  const geometry = feature?.geometry;
  if (!geometry) return [];
  return geometry.type === "Polygon" ? [geometry.coordinates] : geometry.type === "MultiPolygon" ? geometry.coordinates : [];
}

// Vacant land classes (see src/lib/vacant.ts) and the built classes a vacant lot can be held with.
const VACANT_USE_CODES = new Set(["0030", "0050", "0081", "0032", "0052", "0062", "0072", "0082"]);
const BUILT_USE_CODES = new Set(["0040", "0060", "0080"]);
// "Touching" tolerance: shared lot lines in the GIS don't always line up exactly.
const NEIGHBOR_TOUCH_METERS = 2;

const normalizeTaxpayer = (value) => String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/**
 * Flag vacant lots held with the built parcel next door: a side yard, an extra lot, or a business's
 * parking. A non-exempt vacant parcel is flagged when it touches a built parcel with the same taxpayer
 * name or mailing address. Taxpayer fields are dropped afterwards and never published.
 */
function flagHeldWithNeighbor(parcels) {
  const built = parcels
    .filter((parcel) => BUILT_USE_CODES.has(parcel.useCode) && parcel.building > 0 && (parcel.taxpayer || parcel.mailing))
    .map((parcel) => {
      const shape = multiPolygon(parcel.polygons);
      return { parcel, shape, box: turfBbox(shape) };
    });
  let flagged = 0;
  for (const parcel of parcels) {
    if (!VACANT_USE_CODES.has(parcel.useCode) || parcel.exempt || !(parcel.taxpayer || parcel.mailing)) continue;
    let reach;
    try {
      reach = buffer(multiPolygon(parcel.polygons), NEIGHBOR_TOUCH_METERS, { units: "meters" });
    } catch {
      continue;
    }
    const box = turfBbox(reach);
    parcel.heldWithNeighbor = built.some(
      (neighbor) =>
        ((parcel.taxpayer && neighbor.parcel.taxpayer === parcel.taxpayer) ||
          (parcel.mailing && neighbor.parcel.mailing === parcel.mailing)) &&
        bboxesOverlap(box, neighbor.box) &&
        booleanIntersects(reach, neighbor.shape),
    );
    if (parcel.heldWithNeighbor) flagged += 1;
  }
  for (const parcel of parcels) {
    delete parcel.taxpayer;
    delete parcel.mailing;
  }
  return flagged;
}

/**
 * A development's approximate site: the outline around its buildings plus a margin, trimmed against
 * neighboring parcels and against developments already built. Polygon clipping occasionally fails on
 * degenerate shapes, so each step is guarded: a neighbor that can't be subtracted is skipped, and null
 * means the whole site failed.
 */
function developmentSite(memberShapes, obstacles) {
  try {
    const footprints = unionAll(memberShapes);
    const corners = memberShapes.flatMap((shape) =>
      shape.geometry.coordinates.flatMap((rings) => rings[0].map((coord) => point(coord))),
    );
    let site = buffer(convex(featureCollection(corners)) ?? footprints, CONDO_MARGIN_METERS, { units: "meters" });
    const siteBox = turfBbox(site);
    for (const obstacle of obstacles) {
      if (!site || !bboxesOverlap(siteBox, obstacle.box)) continue;
      try {
        site = difference(featureCollection([site, obstacle.shape])) ?? site;
      } catch {
        // Skip a neighbor whose shape can't be clipped cleanly.
      }
    }
    // Never lose the buildings themselves, even where a neighbor's mapped edge overlaps them.
    try {
      return unionAll([site, footprints]);
    } catch {
      return site;
    }
  } catch {
    return null;
  }
}

/** Group condo units whose footprints come within CONDO_CLUSTER_METERS of each other (union-find on boxes). */
function clusterUnits(boxes) {
  const padLat = CONDO_CLUSTER_METERS / 111_000;
  const padLon = CONDO_CLUSTER_METERS / 85_000; // ~cos(40°) at Champaign's latitude
  const parent = boxes.map((_, index) => index);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const cell = 0.002;
  const grid = new Map();
  boxes.forEach((box, i) => {
    for (let gx = Math.floor((box[0] - padLon) / cell); gx <= Math.floor((box[2] + padLon) / cell); gx += 1) {
      for (let gy = Math.floor((box[1] - padLat) / cell); gy <= Math.floor((box[3] + padLat) / cell); gy += 1) {
        const key = `${gx},${gy}`;
        for (const j of grid.get(key) ?? []) {
          const other = boxes[j];
          const near =
            box[0] - padLon <= other[2] && other[0] <= box[2] + padLon && box[1] - padLat <= other[3] && other[1] <= box[3] + padLat;
          if (near) parent[find(i)] = find(j);
        }
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(i);
      }
    }
  });
  const clusters = new Map();
  boxes.forEach((_, i) => {
    const root = find(i);
    if (!clusters.has(root)) clusters.set(root, []);
    clusters.get(root).push(i);
  });
  return [...clusters.values()];
}

/**
 * Replace condo and townhome unit footprints with one approximate development parcel each: the
 * outline around the development's buildings plus a margin, trimmed against neighboring parcels,
 * carrying the units' combined value. Without this, each unit's value sits on just its footprint
 * and condos look several times more valuable per acre than they are.
 */
function buildCondoDevelopments(parcels) {
  const condos = parcels.filter((parcel) => parcel.condo);
  const others = parcels.filter((parcel) => !parcel.condo);
  const obstacles = others.map((parcel) => {
    const shape = multiPolygon(parcel.polygons);
    return { shape, box: turfBbox(shape) };
  });

  const shapes = condos.map((parcel) => multiPolygon(parcel.polygons));
  const developments = [];
  const fallback = [];
  for (const members of clusterUnits(shapes.map((shape) => turfBbox(shape)))) {
    const memberParcels = members.map((index) => condos[index]);
    const site = developmentSite(members.map((index) => shapes[index]), obstacles);
    if (!site) {
      // Geometry failed (rare, degenerate shapes): keep these units as plain footprints.
      fallback.push(...memberParcels);
      continue;
    }
    // Later developments are trimmed against this one so no land is counted twice.
    obstacles.push({ shape: site, box: turfBbox(site) });
    const eavs = memberParcels.map((parcel) => parcel.eav);
    developments.push({
      pins: memberParcels.flatMap((parcel) => parcel.pins),
      condo: true,
      development: true,
      taxCode: mostCommon(memberParcels.map((parcel) => parcel.taxCode)),
      useCode: mostCommon(memberParcels.map((parcel) => parcel.useCode)),
      exempt: memberParcels.every((parcel) => parcel.exempt),
      eav: eavs.every((eav) => eav === null) ? null : eavs.reduce((sum, eav) => sum + (eav ?? 0), 0),
      land: memberParcels.reduce((sum, parcel) => sum + parcel.land, 0),
      building: memberParcels.reduce((sum, parcel) => sum + parcel.building, 0),
      area: turfArea(site) * SQ_FT_PER_SQ_M,
      polygons: polygonsOfFeature(site),
    });
  }

  if (fallback.length) console.warn(`  ${fallback.length} condo units kept as footprints (geometry error)`);
  return { parcels: [...others, ...developments, ...fallback], developments: developments.length };
}

function buildParcels(features, { codes }, addresses, places) {
  // Merge polygons that share a PIN (parcels split by roads or rail are drawn as several pieces).
  const byPin = new Map();
  let leaseDropped = 0;
  for (const feature of features) {
    const p = feature.properties ?? {};
    if (p.TaxParcelType === LEASE_PARCEL_TYPE) {
      leaseDropped += 1;
      continue;
    }
    const pin = String(p.PIN ?? "").trim();
    const polygons = polygonsOf(feature.geometry);
    if (!pin || polygons.length === 0) continue;
    const existing = byPin.get(pin);
    if (existing) {
      existing.polygons.push(...polygons);
      existing.area += Number(p["Shape.STArea()"]) || 0;
      continue;
    }
    byPin.set(pin, {
      pins: [pin],
      condo: p.TaxParcelType === CONDO_PARCEL_TYPE,
      taxCode: p.TaxCode ?? "",
      useCode: p.UseCode ?? "",
      exempt: p.Tax_Status === "E",
      eav: numberOrNull(p.EAV),
      taxpayer: normalizeTaxpayer(p.TaxPayer_Name),
      mailing: normalizeTaxpayer(p.TaxPayer_Address1),
      land: int(p.AssessedLand) + int(p.AssessedFarmland),
      building: int(p.AssessedBuilding) + int(p.AssessedFarmBuilding),
      area: Number(p["Shape.STArea()"]) || 0,
      polygons,
    });
  }

  // Condo units in one building share an identical footprint. Combine each stack into a single
  // parcel so the building's full value sits on its land once.
  const parcels = [];
  const stacks = new Map();
  for (const parcel of byPin.values()) {
    if (!parcel.condo) {
      parcels.push(parcel);
      continue;
    }
    const key = geometryKey(parcel.polygons);
    const stack = stacks.get(key);
    if (!stack) {
      stacks.set(key, parcel);
      parcels.push(parcel);
      continue;
    }
    stack.pins.push(...parcel.pins);
    stack.eav = stack.eav === null && parcel.eav === null ? null : (stack.eav ?? 0) + (parcel.eav ?? 0);
    stack.land += parcel.land;
    stack.building += parcel.building;
    stack.exempt &&= parcel.exempt;
  }

  const heldWithNeighbor = flagHeldWithNeighbor(parcels);

  const { parcels: withDevelopments, developments } = buildCondoDevelopments(parcels);
  parcels.length = 0;
  parcels.push(...withDevelopments);

  const dicts = { useCode: new Dictionary(), city: new Dictionary(), taxCode: new Dictionary() };
  const cols = { pin: [], address: [], otherAddresses: [], units: [], condoDev: [], held: [], useCode: [], city: [], taxCode: [], exempt: [], eav: [], land: [], building: [], area: [], geom: [] };
  const missingTaxCodes = new Set();

  for (const parcel of parcels) {
    parcel.pins.sort();
    const pin = parcel.pins[0];
    const taxCode = codes.get(parcel.taxCode);
    if (parcel.taxCode && !taxCode) missingTaxCodes.add(parcel.taxCode);
    cols.pin.push(pin);
    // Multi-unit parcels (condo stacks and developments) keep every unit's address so each is searchable.
    const unitAddresses = [...new Set(parcel.pins.map((p) => addresses.get(p)).filter(Boolean))];
    cols.address.push(unitAddresses[0] ?? "");
    cols.otherAddresses.push(unitAddresses.slice(1).join("|"));
    cols.units.push(parcel.pins.length);
    cols.condoDev.push(parcel.development ? 1 : 0);
    cols.held.push(parcel.heldWithNeighbor ? 1 : 0);
    cols.useCode.push(dicts.useCode.id(parcel.useCode));
    // Tax codes carry the municipality. A code created after the rate book was published falls back
    // to the Census place boundary the parcel sits in.
    const city = taxCode ? taxCode.city : placeAt(places, parcel.polygons);
    cols.city.push(dicts.city.id(city ?? "Unincorporated"));
    cols.taxCode.push(dicts.taxCode.id(parcel.taxCode));
    cols.exempt.push(parcel.exempt ? 1 : 0);
    cols.eav.push(parcel.eav);
    cols.land.push(parcel.land);
    cols.building.push(parcel.building);
    cols.area.push(Math.round(parcel.area));
    cols.geom.push(encodePolygons(parcel.polygons));
  }

  if (missingTaxCodes.size) {
    console.warn(`  ${missingTaxCodes.size} tax codes missing from the rate book: ${[...missingTaxCodes].join(", ")}`);
  }

  return {
    dicts,
    cols,
    stats: {
      sourceFeatures: features.length,
      leaseDropped,
      mergedPins: byPin.size,
      condoStacks: [...stacks.values()].filter((stack) => stack.pins.length > 1).length,
      condoDevelopments: developments,
      heldWithNeighbor,
      parcels: parcels.length,
    },
  };
}

async function main() {
  const args = parseArgs();
  await mkdir(OUT_DIR, { recursive: true });

  const cached = async (name, load) => {
    if (!args.cache) return load();
    const file = path.join(args.cache, name);
    try {
      const value = JSON.parse(await readFile(file, "utf8"));
      console.log(`  using cached ${file}`);
      return value;
    } catch {
      const value = await load();
      await mkdir(args.cache, { recursive: true });
      await writeFile(file, JSON.stringify(value));
      return value;
    }
  };

  console.log("Fetching assessed parcels...");
  const features = await cached("parcels.json", fetchParcels);

  const rateBookUrl = args["rate-book"] ?? (await findRateBookUrl());
  console.log(`Reading tax rates from ${rateBookUrl}`);
  const rates = await fetchTaxRates(rateBookUrl);
  console.log(`  ${rates.codes.size} tax codes, tax year ${rates.taxYear}`);

  let addresses = new Map();
  if (args["skip-addresses"] !== "true") {
    console.log("Fetching site addresses...");
    try {
      addresses = new Map(await cached("addresses.json", async () => [...(await fetchAddresses()).entries()]));
    } catch (error) {
      console.warn(`  Skipped addresses: ${error.message}`);
    }
  }

  let places = [];
  try {
    places = await fetchPlaces();
  } catch (error) {
    console.warn(`  Skipped municipal boundaries: ${error.message}`);
  }

  const { dicts, cols, stats } = buildParcels(features, rates, addresses, places);
  const taxCodes = dicts.taxCode.values.map((code) => rates.codes.get(code));
  const dataset = {
    meta: {
      parcelSource: "Champaign County GIS Consortium tax parcels with assessments, via City of Champaign GIS",
      parcelSourceUrl: PARCEL_LAYER,
      rateSource: "Champaign County Clerk, District Rates by Taxcode",
      rateSourceUrl: rateBookUrl,
      addressSource: "Champaign County Property Tax Inquiry",
      addressSourceUrl: DEVNET,
      taxYear: rates.taxYear,
      generatedAt: new Date().toISOString(),
      ...stats,
    },
    dict: {
      useCode: dicts.useCode.values,
      city: dicts.city.values,
      taxCode: dicts.taxCode.values,
      taxRate: taxCodes.map((code) => code?.rate ?? null),
      tif: taxCodes.map((code) => code?.tif ?? null),
    },
    cols,
  };

  await writeFile(path.join(OUT_DIR, OUT_FILE), JSON.stringify(dataset));
  await markDatasetUpdated("parcels", { assessmentYear: rates.taxYear });
  console.log(
    `Wrote ${stats.parcels.toLocaleString()} parcels (${stats.condoStacks.toLocaleString()} condo buildings, ` +
      `${stats.leaseDropped} lease polygons dropped, ${addresses.size.toLocaleString()} addresses).`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
