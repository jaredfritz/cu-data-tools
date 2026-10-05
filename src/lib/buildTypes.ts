export interface BuildType {
  id: string;
  label: string;
  /** Zones where this use is permitted by right. */
  allowedCodes: string[];
  /** Zones where this use is provisional and subject to additional standards. */
  provisionalCodes?: string[];
  /** Codes that should render with hachure while this build type is active. */
  hatchedCodes?: string[];
  /** Zones where this use is explicitly not permitted. */
  notAllowedCodes: string[];
}

export const BUILD_TYPES: BuildType[] = [
  {
    id: "sfh",
    label: "Single Family Home",
    allowedCodes: [
      "SF1", "SF2",
      "IT-SF1", "IT-SF2",
      "IT-MR1", "IT-MR2", "IT-MX",
      "MF1", "MF2", "MF3", "MFUniv",
      "MHC",
    ],
    notAllowedCodes: [
      "CO", "CN",
      "CB1", "CB2", "CB3",
      "CG", "CI",
      "I1", "I2", "IBP",
    ],
  },
  {
    id: "duplex",
    label: "Duplex",
    allowedCodes: [
      "SF2", "IT-SF2",
      "MF1", "MF2", "MF3", "MFUniv",
      "IT-MR1", "IT-MR2", "IT-MX",
    ],
    notAllowedCodes: [
      "SF1", "IT-SF1",
      "CO", "CN",
      "CB1", "CB2", "CB3",
      "CG", "CI",
      "I1", "I2", "IBP",
      "MHC",
    ],
  },
  {
    id: "fourplex",
    label: "Fourplex",
    allowedCodes: [
      "MF1", "MF2", "MF3", "MFUniv",
      "IT-MR1", "IT-MR2", "IT-MX",
      "CO",
    ],
    provisionalCodes: [
      "CN",
      "CG",
      "CB1", "CB2", "CB3",
      "IBP",
    ],
    notAllowedCodes: [
      "SF1", "SF2",
      "IT-SF1", "IT-SF2",
      "CI",
      "I1", "I2",
      "MHC",
    ],
  },
  {
    id: "adu",
    label: "ADU",
    allowedCodes: [
      "SF1", "SF2",
      "MF1", "MF2", "MF3", "MFUniv",
      "MHC",
      "IT-SF1", "IT-SF2",
      "IT-MR1", "IT-MR2", "IT-MX",
    ],
    notAllowedCodes: [
      "CO", "CN",
      "CG", "CI",
      "CB1", "CB2", "CB3",
      "I1", "I2",
      "IBP",
    ],
  },
  {
    id: "cafe",
    label: "Café",
    allowedCodes: ["CN", "CG", "CB1", "CB2", "CB3"],
    provisionalCodes: ["MF3", "CO", "CI", "IBP", "I1", "I2"],
    hatchedCodes: ["I1", "I2"],
    notAllowedCodes: [
      "SF1", "SF2",
      "IT-SF1", "IT-SF2",
      "IT-MR1", "IT-MR2", "IT-MX",
      "MF1", "MF2", "MFUniv",
      "MHC",
    ],
  },
];

export const BUILD_COLORS = {
  allowed: "#1F6CB0",
  provisional: "#D28A00",
  notAllowed: "#B2415C",
} as const;
