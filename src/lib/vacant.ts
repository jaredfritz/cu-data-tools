// Vacant land categories for /data/vacant-land, from Champaign County property class codes.

import type { Parcel } from "./parcels";

export type VacantType = "residential" | "commercial" | "industrial" | "subdivision";

/** Champaign County property classes the assessor uses for vacant land. */
export const VACANT_CLASS_TYPES: Record<string, VacantType> = {
  "0030": "residential",
  "0050": "commercial",
  "0081": "industrial",
  // "10-30" classes: platted subdivision land assessed at its pre-subdivision (usually farmland) value
  // until it's built on or sold, under 35 ILCS 200/10-30.
  "0032": "subdivision",
  "0052": "subdivision",
  "0062": "subdivision",
  "0072": "subdivision",
  "0082": "subdivision",
};

export function vacantTypeFor(useCode: string): VacantType | null {
  return VACANT_CLASS_TYPES[useCode] ?? null;
}

export const VACANT_TYPES: { id: VacantType; label: string; color: string; description: string }[] = [
  {
    id: "residential",
    label: "Vacant residential lot",
    color: "#2a78d6",
    description: "Empty lots zoned or classed for homes.",
  },
  {
    id: "commercial",
    label: "Vacant commercial lot",
    color: "#eb6834",
    description: "Empty lots classed for commercial use.",
  },
  {
    id: "industrial",
    label: "Vacant industrial land",
    color: "#1baf7a",
    description: "Empty land classed for industrial use.",
  },
  {
    id: "subdivision",
    label: "Vacant, subdivision rate (10-30)",
    color: "#9c3e94",
    description:
      "Platted subdivision land assessed at its pre-subdivision value, usually farmland rates, until it's built on " +
      "or sold (35 ILCS 200/10-30).",
  },
];

export const OTHER_PARCEL_COLOR = "#dcdcdc";

export function vacantTypeConfig(type: VacantType) {
  return VACANT_TYPES.find((entry) => entry.id === type) ?? VACANT_TYPES[0];
}

export interface VacantTypeSummary {
  type: VacantType;
  parcels: number;
  acres: number;
  value: number;
  heldParcels: number;
  heldAcres: number;
}

export interface VacantSummary {
  /** Standalone vacant parcels (not held with a built neighbor) */
  parcels: number;
  acres: number;
  value: number;
  heldParcels: number;
  heldAcres: number;
  heldValue: number;
  /** All parcel acres in the area, for "share of land" */
  areaAcres: number;
  byType: VacantTypeSummary[];
  /** Largest vacant parcels, standalone only unless `includeHeld` */
  largest: Parcel[];
}

export function summarizeVacant(parcels: Parcel[], { includeHeld = true, largestCount = 20 } = {}): VacantSummary {
  const byType = new Map<VacantType, VacantTypeSummary>();
  const listed: Parcel[] = [];
  const summary = { parcels: 0, acres: 0, value: 0, heldParcels: 0, heldAcres: 0, heldValue: 0, areaAcres: 0 };
  for (const parcel of parcels) {
    summary.areaAcres += parcel.acres;
    if (!parcel.vacantType) continue;
    const group =
      byType.get(parcel.vacantType) ??
      { type: parcel.vacantType, parcels: 0, acres: 0, value: 0, heldParcels: 0, heldAcres: 0 };
    if (parcel.heldWithNeighbor) {
      group.heldParcels += 1;
      group.heldAcres += parcel.acres;
      summary.heldParcels += 1;
      summary.heldAcres += parcel.acres;
      summary.heldValue += parcel.marketValue ?? 0;
      if (includeHeld) listed.push(parcel);
    } else {
      group.parcels += 1;
      group.acres += parcel.acres;
      group.value += parcel.marketValue ?? 0;
      summary.parcels += 1;
      summary.acres += parcel.acres;
      summary.value += parcel.marketValue ?? 0;
      listed.push(parcel);
    }
    byType.set(parcel.vacantType, group);
  }
  return {
    ...summary,
    byType: VACANT_TYPES.map((entry) => byType.get(entry.id)).filter((group): group is VacantTypeSummary => Boolean(group)),
    largest: listed.sort((a, b) => b.acres - a.acres).slice(0, largestCount),
  };
}

/** Hatch fill for vacant lots held with a neighbor: diagonal stripes in the type's color. */
export function heldPatternId(type: VacantType) {
  return `vacant-held-${type}`;
}

export function heldPatternImage(hex: string): { width: number; height: number; data: Uint8Array } {
  const size = 8;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const stripe = (x + y) % size < 3;
      data.set(stripe ? [r, g, b, 255] : [255, 255, 255, 170], (y * size + x) * 4);
    }
  }
  return { width: size, height: size, data };
}

/** CSS swatch matching the held-lot hatch. */
export function heldSwatch(hex: string) {
  return `repeating-linear-gradient(135deg, ${hex} 0 2px, #ffffff 2px 5px)`;
}
