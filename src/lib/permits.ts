export interface PermitFeatureProperties {
  permit_no: string;
  year: number;
  address: string;
  permit_type: string;
  building_type: "SF" | "MF" | string;
  units: number;
}

export interface SelectedPermit {
  permitNo: string;
  year: number | null;
  address: string;
  buildingType: string;
  units: number | null;
  zoneCode: string | null;
  zoneCodeLabel: string;
  zoneDescription: string;
}
