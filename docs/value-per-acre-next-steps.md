# Value Per Acre: Next Steps

Status of `/data/value-per-acre` and the work we've identified to build on it. See the README's
"Value Per Acre Data" section for how the dataset is built and refreshed.

## Where things stand

- Every parcel in Champaign County (78,305 after cleanup) is mapped with estimated market value,
  estimated tax, and land share of value per acre, filterable by municipality.
- Data comes from public sources without a FOIA request:
  - parcel polygons and assessments from the City of Champaign's public `TaxParcels_Assessed` layer
    (Champaign County GIS Consortium data)
  - tax rates and municipality by tax code from the County Clerk's rate book PDF
  - site addresses from the county tax inquiry's township CSV export
- Known gaps:
  - Taxes are **before exemptions** (homestead, senior, etc.), so owner-occupied homes are overstated.
  - Farmland is assessed on productivity, not market value.
  - Values are the current-year snapshot only, with no history.
  - Five tax codes (about 420 parcels on Urbana's edge) are newer than the 2025 rate book and show
    "rate not yet published."

## Before promoting the page

1. **Confirm data licensing with CCGISC.** CCGISC sells parcel data under a license and offers a
   separate "derived data" license on request. The data we use is publicly served by the City, but
   we publish a derived product. Email ccgisc@co.champaign.il.us, describe the map, and ask whether
   a derived-data license or attribution language is needed.
2. **Spot-check values against county records.** Pick 20–30 parcels across land uses and cities,
   compare EAV and estimated tax to the county tax inquiry by hand, and note any systematic gaps.
3. **Keep owner names out.** The county removed name search on purpose, and the pipeline already
   discards owner names. Keep it that way in any future export or download.

## Data improvements

- **Bring back a tax-per-acre map view once we have net tax.** It was removed because, with one tax rate per
  city, estimated tax per acre just mirrored value per acre. With exemptions and TIF diversions from the FOIA data,
  net tax per acre will differ meaningfully from value per acre and is worth its own view.
- **FOIA the assessment roll** (Supervisor of Assessments). Ask for, as a CSV: PIN, property class,
  land / building / total assessed value, every exemption amount, tax code, and tax billed, for the
  current year and as many prior years as available. That fills the main gaps:
  - Exemptions, for accurate net tax and a fair vacant-land-tax simulation.
  - Final certified values instead of the Board of Review stage.
  - History, for change-over-time views (see below).
- **Get the real condo and townhome land boundaries.** The county maps condo units as building
  footprints only, without the shared land around them. The map currently approximates each
  development's area from the outline around its buildings plus an 8 m margin, trimmed against
  neighboring parcels (`buildCondoDevelopments` in `scripts/fetch-parcel-values.mjs`). The condominium
  declaration parcels or plats (Champaign County Recorder, or CCGISC's parcel data) would give exact
  boundaries. Add them to the FOIA or CCGISC licensing request, then replace the approximation.
- **Ask CU-CitizenAccess** for the property data they obtained by FOIA for tax years 2020–2023.
  That gives us history now.
- **Newer tax codes:** rerun `npm run data:parcels` when the Clerk posts the next rate book.
  Consider a fallback that borrows the rate of a parcel's neighbors in the same taxing districts.
- **Scheduled refresh:** run the pipeline after the Board of Review finalizes values and after the
  rate book posts each year. It could become a GitHub Action that opens a PR with the updated file.

## Feature ideas

### Vacant land tax simulation (highest priority)

This would live on the `/data/vacant-land` page, which already maps vacant parcels by type (including "10-30"
subdivision-rate land) with summary tables.


The Strong Towns Chicago map's second page models a revenue-neutral vacant land tax:

- Raise vacant land's assessment.
- Hold each taxing body's levy fixed, so every district's rate falls.
- Show who pays more and who pays less.

We can do the same with the rate book's per-district rates and each district's EAV base (from the
Clerk's tax computation report). Before building, decide:

- **Vacant classes:** `0030`, `0032`, `0050`, `0052`, `0062`, `0072`, `0081`, `0082`, and possibly
  surface parking classified as commercial.
- **Uplift:** illustrative only, since Illinois outside Cook assesses uniformly at 33⅓%. A real
  policy would take state legislation or a different tool, such as a split-rate tax or
  land-value-based incentives.
- **Exemptions:** needed for credible "your bill changes by $X" numbers, so this likely waits for
  the FOIA data.

### Land value tax (split-rate) scenario

Model shifting the levy from buildings to land, as the Center for Land Economics and Progress and
Poverty Institute college-town reports did for South Bend and Princeton. The land and building
split is already in the data, so a first version could show:

- the percent change in tax by parcel
- the percent change by land use
- the percent change by neighborhood

### Surface parking (deferred)

Add surface parking lots to the Vacant Land page and as an optional overlay on the value map. The
assessor has no parking class: lots are classed as improved commercial, the same as the business they
serve. So the data has to come from elsewhere. Options checked so far, best first:

1. **OpenStreetMap:** parking lots traced as polygons tagged `amenity=parking` + `parking=surface`.
   Free, with attribution. The ODbL share-alike terms only matter if we offer the data as a download.
   C-U coverage hasn't been checked yet. That needs `overpass-api.de` on the cloud environment's
   allowlist.
2. **City of Champaign stormwater impervious-area data:** the stormwater utility fee is billed by
   impervious area, so the City likely has detailed pavement polygons. They're behind a login on the
   City's GIS server, so ask for them alongside the CCGISC licensing email.
3. **The site's community parking map:** accurate but limited to downtown Champaign. Merge it where it
   overlaps with another source.

Not recommended: inferring parking from assessments (for example, commercial parcels whose land is
most of their value). That also catches car lots, gas stations and big lawns, so calling it "parking"
wouldn't be factual.

Planned presentation once there's data:
- a "Surface parking" category on the Vacant Land page, with a show/hide toggle, an acreage card, and
  a parking-only view with its own largest-lots table
- an optional parking outline on the value map in 2D, off by default
- a source note saying the data is from OpenStreetMap (or the City), may miss lots, and isn't from the
  assessor

### Other ideas

- **"Who pays for what" comparisons:** curated callouts, for example a downtown block vs. a big-box
  store and its parking lot, sized to fit social media. The print/export tooling used for zoning maps
  could produce these.
- **Neighborhood and corridor summaries:** aggregate value per acre by neighborhood, census tract,
  or a drawn area, like the crash location report.
- **Change over time:** once we have history, map assessment growth per acre. Where is value
  growing, and is it where the city allows growth?
- **Infrastructure cost side:** pair revenue per acre with the cost to serve (lane-miles of street,
  pipe per parcel) for the full Strong Towns "productivity" picture. The City's street and utility
  layers may make a rough version possible.
- **Downloads:** offer CSV or GeoJSON downloads of the processed data, minus owner names, if the
  CCGISC license allows.
- **Performance:** if the 12 MB data file feels slow on phones, switch to PMTiles vector tiles via
  tippecanoe, as Chicago does. Hosting should be tested first, since PMTiles needs HTTP range
  requests.
