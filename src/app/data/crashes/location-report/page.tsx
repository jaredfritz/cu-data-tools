import type { Metadata } from "next";
import LocationReport from "@/components/crashes/LocationReport";
import SiteShell from "@/components/site/SiteShell";

export const metadata: Metadata = {
  title: "Location Crash Report — Champaign-Urbana",
  description:
    "Crash report for any city, street, or intersection in Champaign-Urbana: costs, causes, injuries, and trends from IDOT crash data.",
  openGraph: {
    title: "Location Crash Report — Champaign-Urbana",
    description:
      "Crash report for any city, street, or intersection in Champaign-Urbana: costs, causes, injuries, and trends from IDOT crash data.",
  },
};

export default function LocationReportPage() {
  return (
    <SiteShell>
      <LocationReport />
    </SiteShell>
  );
}
