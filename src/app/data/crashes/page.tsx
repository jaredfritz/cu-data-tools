import type { Metadata } from "next";
import { Suspense } from "react";
import CrashDashboard from "@/components/crashes/CrashDashboard";
import SiteShell from "@/components/site/SiteShell";

export const metadata: Metadata = {
  title: "Crash Dashboard — Champaign-Urbana",
  description: "Interactive map and trends for every reported traffic crash in Champaign, Urbana, and Savoy, from IDOT crash data.",
  openGraph: {
    title: "Crash Dashboard — Champaign-Urbana",
    description: "Interactive map and trends for every reported traffic crash in Champaign, Urbana, and Savoy, from IDOT crash data.",
  },
};

export default function CrashDashboardPage() {
  return (
    <SiteShell>
      <Suspense>
        <CrashDashboard />
      </Suspense>
    </SiteShell>
  );
}
