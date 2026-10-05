// Adds two fields from CCRPC's Champaign County Traffic Crash Dashboard (crashdashboard.ccrpc.org)
// to IDOT crash records: whether a heavy vehicle was involved, and whether the crash is in
// the University District. CCRPC builds its dashboard from the same IDOT crashes but publishes
// no crash IDs, so records are matched on year, city, injuries, crash type, cause, and
// location (within 10 m), with weather/lighting/surface breaking ties.
//
// The data comes from the dashboard's own data endpoint, which CCRPC doesn't document, so it is
// downloaded only on request (--refresh-ccrpc) into data/ccrpc/crash-points.json, and normal builds
// read that saved copy. Crashes the snapshot doesn't cover are left unknown.

const DASH = "https://crashdashboard.ccrpc.org";
const MAX_MATCH_METERS = 10;
const METERS_PER_DEG_LAT = 111_000;
const METERS_PER_DEG_LON = 85_000; // at Champaign's latitude

const CLICK_INPUTS = ["total_crash_click", "fatality_click", "injury_click", "bike_click", "ped_click", "heavy_click"].map(
  (id) => ({ id, property: "n_clicks", value: null }),
);

// Compare letters and digits only: the two sources punctuate some causes differently, and
// CCRPC writes a missing cause as "Null" where IDOT writes "(N/A)".
const normalize = (value) => {
  const text = String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return text === "null" || text === "na" ? "" : text;
};

async function dashPost(getJson, output, property, inputs) {
  const json = await getJson(`${DASH}/_dash-update-component`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      output: `${output}.${property}`,
      outputs: { id: output, property },
      inputs,
      changedPropIds: [`${inputs[0].id}.${inputs[0].property}`],
      state: [],
    }),
  });
  return json.response[output][property];
}

/** Years offered by the dashboard's year dropdown, as four-digit years. */
async function dashboardYears(getJson) {
  const layout = await getJson(`${DASH}/_dash-layout`);
  const found = [];
  const walk = (node) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== "object") return;
    if (node.props?.id === "Year") found.push(...node.props.options.map((option) => 2000 + Number(option.value)));
    Object.values(node).forEach(walk);
  };
  walk(layout);
  return found.sort((a, b) => a - b);
}

/** Every crash point CCRPC maps for one geography and year. */
async function dashboardPoints(getJson, geography, year) {
  const figure = await dashPost(getJson, "map-graph", "figure", [
    { id: "Geography", property: "value", value: geography },
    { id: "CrashTypeGraph", property: "clickData", value: null },
    { id: "Year", property: "value", value: year % 100 },
    ...CLICK_INPUTS,
    { id: "session-id", property: "children", value: "abundantcu" },
  ]);
  const points = [];
  for (const trace of figure.data ?? []) {
    trace.lat.forEach((lat, i) => {
      const [, city, fatalities, injuries, crashType, cause, weather, light, surface, heavy] = trace.customdata[i];
      points.push({
        year,
        lat,
        lon: trace.lon[i],
        city,
        fatalities,
        injuries,
        crashType,
        cause,
        weather,
        light,
        surface,
        heavy: Number(heavy) === 1,
      });
    });
  }
  return points;
}

/** One-to-one nearest match of CCRPC points to IDOT records with the same signature. */
function matchPoints(points, records, { year, lat, lon, int }) {
  const signature = (y, city, k, injured, type, cause) =>
    [y, normalize(city), k, injured, normalize(type), normalize(cause)].join("|");
  const buckets = new Map();
  for (const record of records) {
    const key = signature(
      year(record),
      record.CityName,
      int(record.TotalFatals),
      int(record.TotalInjured),
      record.TypeOfFirstCrash,
      record.Cause1,
    );
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(record);
  }

  const pairs = [];
  points.forEach((point, pointIndex) => {
    const key = signature(point.year, point.city, point.fatalities, point.injuries, point.crashType, point.cause);
    for (const record of buckets.get(key) ?? []) {
      const meters = Math.hypot(
        (lat(record) - point.lat) * METERS_PER_DEG_LAT,
        (lon(record) - point.lon) * METERS_PER_DEG_LON,
      );
      if (meters > MAX_MATCH_METERS) continue;
      const mismatches =
        Number(normalize(record.WeatherCond) !== normalize(point.weather)) +
        Number(normalize(record.LightingCond) !== normalize(point.light)) +
        Number(normalize(record.RoadSurfaceCond) !== normalize(point.surface));
      pairs.push({ score: mismatches * MAX_MATCH_METERS + meters, pointIndex, record });
    }
  });

  pairs.sort((a, b) => a.score - b.score);
  const matched = new Map();
  const usedRecords = new Set();
  for (const { pointIndex, record } of pairs) {
    if (matched.has(pointIndex) || usedRecords.has(record)) continue;
    matched.set(pointIndex, record);
    usedRecords.add(record);
  }
  return matched;
}

// Snapshot rows are compact arrays in this column order.
const ROW = ["lat", "lon", "city", "fatalities", "injuries", "crashType", "cause", "weather", "light", "surface", "heavy"];
const toRow = (point) => ROW.map((key) => (key === "heavy" ? Number(point.heavy) : point[key]));
const fromRow = (row, year) => ({ year, ...Object.fromEntries(ROW.map((key, i) => [key, row[i]])), heavy: row[10] === 1 });

/**
 * Downloads every crash point CCRPC's dashboard maps for the given cities and the University District,
 * for every year it offers. The result is saved in the repo so builds don't depend on CCRPC's site.
 */
export async function fetchCcrpcSnapshot({ cities, getJson }) {
  const years = await dashboardYears(getJson);
  const geographies = {};
  for (const geography of [...cities, "University"]) {
    geographies[geography] = {};
    for (const y of years) {
      geographies[geography][y] = (await dashboardPoints(getJson, geography, y)).map(toRow);
    }
    console.log(`CCRPC ${geography}: ${years.map((y) => geographies[geography][y].length).join(", ")} crashes (${years.join(", ")})`);
  }
  return { source: `${DASH}/`, columns: ROW, years, geographies };
}

/**
 * Sets record.heavyVehicle and record.universityDistrict (true/false) on IDOT records the CCRPC snapshot
 * covers; records it doesn't cover are left without them. Returns a summary for the dataset's metadata.
 */
export function applyCcrpcSnapshot(records, snapshot, { cities, year, lat, lon, int }) {
  const summary = {
    source: snapshot.source,
    years: snapshot.years,
    ccrpcCrashes: 0,
    matched: 0,
    heavyVehicle: 0,
    universityDistrict: 0,
  };
  const helpers = { year, lat, lon, int };

  for (const y of snapshot.years) {
    const yearRecords = records.filter((record) => year(record) === y && lat(record) !== null);

    const cityPoints = cities.flatMap((city) => (snapshot.geographies[city]?.[y] ?? []).map((row) => fromRow(row, y)));
    const cityMatches = matchPoints(cityPoints, yearRecords, helpers);
    summary.ccrpcCrashes += cityPoints.length;
    summary.matched += cityMatches.size;
    for (const [pointIndex, record] of cityMatches) {
      record.heavyVehicle = cityPoints[pointIndex].heavy;
      record.universityDistrict = false;
      if (record.heavyVehicle) summary.heavyVehicle += 1;
    }

    const universityPoints = (snapshot.geographies.University?.[y] ?? []).map((row) => fromRow(row, y));
    for (const record of matchPoints(universityPoints, yearRecords, helpers).values()) {
      record.universityDistrict = true;
      summary.universityDistrict += 1;
    }
    console.log(
      `CCRPC ${y}: matched ${cityMatches.size.toLocaleString()} of ${cityPoints.length.toLocaleString()} crashes, ` +
        `${universityPoints.length.toLocaleString()} in the University District`,
    );
  }
  return summary;
}
