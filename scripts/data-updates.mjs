// Records what each dataset behind the /data pages covers and when it was last refreshed, in
// src/data/data-updates.json. Each map and dashboard shows both.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const UPDATES_FILE = path.join(process.cwd(), "src", "data", "data-updates.json");

/**
 * Record `dataset`'s coverage (e.g. `{ through: "2025-12-31" }`) and set its refreshed date to
 * today (UTC, YYYY-MM-DD).
 */
export async function markDatasetUpdated(dataset, coverage) {
  const updates = JSON.parse(await readFile(UPDATES_FILE, "utf8"));
  updates[dataset] = { ...coverage, refreshed: new Date().toISOString().slice(0, 10) };
  await writeFile(UPDATES_FILE, `${JSON.stringify(updates, null, 2)}\n`);
}

/** Write `contents` to `file` only if it differs from what's there. Returns whether it changed. */
export async function writeIfChanged(file, contents) {
  const existing = await readFile(file, "utf8").catch(() => null);
  if (existing === contents) return false;
  await writeFile(file, contents);
  return true;
}
