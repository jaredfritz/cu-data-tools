# Champaign-Urbana Data Tools

Open-source maps and data pipelines for Champaign-Urbana, Illinois, originally built for
[Abundant CU](https://www.abundantcu.com). Fork them, check the methods, or adapt them for your own town.

| Page | What it shows |
|---|---|
| `/data/crashes` | Every reported traffic crash in Champaign, Urbana, and Savoy since 2014, with trends, a map, and costs |
| `/data/crashes/location-report` | A crash report for any city, street, or intersection |
| `/data/value-per-acre` | Property value and property tax per acre for every parcel in Champaign County, in 2D or 3D |
| `/data/vacant-land` | Vacant parcels by type, including subdivision land still assessed at farmland rates and lots held with the house next door |
| `/data/zoning` | City of Champaign zoning districts, residential permits since 2014, and where common housing types are allowed |

Each page has an "About this data" section with its sources, methods, and caveats.

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:3000. No accounts or API keys are needed. Crash, zoning, and permit data ship with the repo;
basemaps are CARTO's Positron style with OpenStreetMap data, and address search uses OpenStreetMap's Nominatim. Set
`NOMINATIM_USER_AGENT` to your own app name and contact before deploying (see `.env.example`).

The Value Per Acre and Vacant Land pages need parcel data, which isn't included (see
[Data licenses and credits](#data-licenses-and-credits)). Build it once, in about 3 minutes:

```bash
npm run data:parcels
```

Built with Next.js, React, Tailwind CSS, MapLibre GL, Turf, and Recharts.

## Refreshing the data

Each pipeline writes static files that the pages load. In a proxied environment, run with `NODE_USE_ENV_PROXY=1` so
Node's `fetch` uses the proxy.

### Crashes

```bash
npm run data:crashes                       # all years IDOT has published, 2014 on
npm run data:crashes -- --from=2020 --to=2025
```

Downloads IDOT's yearly statewide crash layers, keeps crashes in Champaign, Urbana, and Savoy (using Census municipal
boundaries), and writes `public/data/crashes/`.

The file also has heavy-vehicle and University District fields for 2020-2024 from the Champaign County Regional
Planning Commission's [crash dashboard](https://crashdashboard.ccrpc.org/), matched to IDOT records by year, city,
injuries, crash type, cause, and location (`scripts/ccrpc-supplement.mjs`). CCRPC's crash points are saved in
`data/ccrpc/crash-points.json`, so normal rebuilds don't contact CCRPC; add `--refresh-ccrpc` to download a new copy.

### Parcels: Value Per Acre and Vacant Land

```bash
npm run data:parcels
npm run data:parcels -- --rate-book=<pdf url>       # pin a specific rate book
npm run data:parcels -- --skip-addresses
npm run data:parcels -- --cache=/tmp/parcel-cache   # reuse downloads while developing
```

Takes about 3 minutes. Builds `public/data/parcels/champaign-county-parcels.json`, which `.gitignore` keeps out of
git, from:

- parcel boundaries and assessments: the Champaign County GIS Consortium's tax parcels, from the City of Champaign's
  public `TaxParcels_Assessed` map service
- tax rates by tax code, and each code's municipality: the Champaign County Clerk's rate book PDF
- site addresses: the county property tax inquiry's township search. Taxpayer names and mailing addresses are used
  only to flag vacant lots held with the property next door, and are discarded before anything is written.

Condo and townhome units, which the county maps as building footprints, are combined into approximate development
areas. Methods and planned improvements are in `docs/value-per-acre-next-steps.md`.

### Residential permits

```bash
npm run data:permits
```

New-construction permits provided by the City of Champaign are in `data/permits/champaign-residential-permits.csv`,
without coordinates. The script places each one at its address in the city's public Address Points layer, falling back
to the matching county parcel, then to a point between the neighboring addresses on the same side of the street. It
writes `src/data/residential-permits.json` and lists any permits it can't place.

### Dates shown on the pages

Each page shows what its data covers and when it was refreshed, from `src/data/data-updates.json`. The crash and
parcel scripts update their entries; update zoning's `asOf` by hand when you replace `public/data/zoning.geojson`.

## Adapting this for another place

- **Crashes:** change the county and cities in `scripts/fetch-idot-crashes.mjs` for anywhere in Illinois. Outside
  Illinois, replace the download with your state's crash data and keep the same output columns.
- **Parcels:** the parcel script is the most local part. You need parcels with assessed values, tax rates by tax
  district, and land use codes; map your county's use codes in `src/lib/parcels.ts` and `src/lib/vacant.ts`.
- **Zoning:** replace `public/data/zoning.geojson` and the district rules in `src/lib/zoning.ts` and
  `src/lib/buildTypes.ts`.
- **Basemap:** swap `CRASH_BASEMAP` and `PARCEL_BASEMAP` in `src/lib/*MapStyles.ts` for any MapLibre style.

## Data licenses and credits

The code is MIT-licensed (see `LICENSE`). Data files follow their sources' terms:

| Data | Source | License and terms |
|---|---|---|
| Crashes (`public/data/crashes/`) | [Illinois Department of Transportation](https://gis-idot.opendata.arcgis.com/) | IDOT publishes 2014-2019 under CC BY-SA 2.0, so our crash file is [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/): credit IDOT and Abundant CU, and share changes under the same license. See the notes below. |
| Heavy-vehicle and University District crash fields, 2020-2024 (`data/ccrpc/`) | [CCRPC Champaign County Traffic Crash Dashboard](https://crashdashboard.ccrpc.org/), built from IDOT data | No terms posted. Included as CCRPC published it, for rebuilding the crash file; credit CCRPC. |
| Municipal boundaries | U.S. Census Bureau, TIGERweb | Public domain |
| Parcels and assessments | Champaign County GIS Consortium (CCGISC), through the [City of Champaign's map service](https://gisportal.champaignil.gov/ms/rest/services/OpenGov/Open_Gov_Map_Service/MapServer/0) | **Not included.** CCGISC's [data policy](https://www.ccgisc.org/admindocs/ccgiscdatapolicy_complete.pdf) doesn't allow redistributing data derived from its parcels without its written permission. `npm run data:parcels` builds a copy for your own use; check CCGISC's terms before publishing it. |
| Tax rates | [Champaign County Clerk](https://www.champaigncountyclerk.com/property-taxes/tax-extension-rates) rate books | Public records |
| Site addresses | [Champaign County property tax inquiry](https://champaignil.devnetwedge.com) | Used only inside the parcel build. The script uses the township search, which the site's robots.txt allows; don't point it at the disallowed `/parcel/` pages. |
| Zoning districts (`public/data/zoning.geojson`) | City of Champaign [Zoning Classifications](https://gis-cityofchampaign.opendata.arcgis.com/datasets/a24e403a9fa245dbaaaf46f766860c40_15/explore) | City of Champaign Open Data, provided "as is" without warranty; no license stated |
| Address points | City of Champaign [Address Points](https://gisportal.champaignil.gov/ms/rest/services/Open_Data/Open_Data/MapServer/7) | Same as zoning |
| Residential permits (`data/permits/`, `src/data/residential-permits.json`) | Provided by the City of Champaign; placed on the map by `npm run data:permits` | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/): credit the City of Champaign and Abundant CU |
| Basemap | [CARTO](https://carto.com/attributions) Positron style, [OpenMapTiles](https://openmaptiles.org/), [OpenStreetMap](https://www.openstreetmap.org/copyright) | Keep the "© CARTO, © OpenMapTiles, © OpenStreetMap contributors" credit. CARTO now asks for an API key for its hosted basemaps (free for non-commercial use up to 5 million tile requests a month), so get one or switch styles before you deploy widely. |

**About the crash data.** It comes from the Illinois Department of Transportation; conclusions drawn from it are the
user's own. It includes only crashes reported to police that meet Illinois's reporting threshold (more than $1,500 in
damage to any one person's property when every driver is insured, $500 if any driver is uninsured), so minor crashes
are missing. Crash reports and data may be protected from discovery or use as evidence in lawsuits under federal law
(23 U.S.C. 407).

**Estimates, not official records.** Property values are three times equalized assessed value, tax is before
exemptions, condo development areas are approximate, and a few permit locations are interpolated. Check official
sources before relying on a number.

**Other notices.** The crash pages are adapted from the MIT-licensed
[Chicago Crash Dashboard](https://github.com/MisterClean/chicago-crashes-pipeline) by Michael McLean
(`src/components/crashes/LICENSE-chicago-crash-dashboard.txt`), and the parcel maps from the MIT-licensed
[Strong Towns Chicago Value Per Acre map](https://github.com/StrongTownsChicago/chicago-value-per-acre)
(`src/components/parcels/LICENSE-chicago-value-per-acre.txt`). The Abundant CU name and logo aren't covered by any
of these licenses; if you publish a fork, use your own name.

This isn't legal advice. Check each source's current terms before republishing its data.

## Contributing

This repository is published from Abundant CU's site, so changes made here directly may be overwritten by the next
export. Issues and suggestions are welcome; we'll carry accepted changes over.
