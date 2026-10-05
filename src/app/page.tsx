import Image from "next/image";
import Link from "next/link";
import SiteShell from "@/components/site/SiteShell";

const TOOLS = [
  {
    href: "/data/crashes",
    title: "Crash Dashboard",
    image: "/crash-dashboard-thumbnail.png",
    alt: "Map of traffic crashes in Champaign and Urbana, colored by severity",
    text: "Every reported traffic crash in Champaign, Urbana, and Savoy since 2014, with a report builder for any city, street, or intersection.",
  },
  {
    href: "/data/value-per-acre",
    title: "Value Per Acre",
    image: "/value-per-acre-thumbnail.png",
    alt: "3D map of property value per acre in Champaign",
    text: "Property value and property tax per acre for every parcel in Champaign County, with city filters and a 3D view.",
  },
  {
    href: "/data/vacant-land",
    title: "Vacant Land",
    image: "/vacant-land-thumbnail.png",
    alt: "Map of vacant parcels in Champaign and Urbana, colored by type",
    text: "Every vacant parcel in Champaign County by type, including subdivision land still assessed at farmland rates.",
  },
  {
    href: "/data/zoning",
    title: "Zoning & Permits",
    image: null,
    alt: "",
    text: "City of Champaign zoning districts, residential building permits since 2014, and where common housing types are allowed.",
  },
];

export default function HomePage() {
  return (
    <SiteShell>
      <section className="mx-auto w-full max-w-6xl px-5 py-10 md:px-8 md:py-14">
        <h1 className="text-3xl font-extrabold md:text-4xl">Champaign-Urbana Data Tools</h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-700 md:text-base">
          Open-source maps and data pipelines for Champaign-Urbana, Illinois. Fork them, check the methods, or adapt
          them for your own town.
        </p>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {TOOLS.map((tool) => (
            <Link
              key={tool.href}
              href={tool.href}
              className="overflow-hidden rounded-[4px] border border-[var(--color-border)] bg-white transition hover:-translate-y-0.5"
            >
              <div className="relative h-44 border-b border-[var(--color-border)] bg-slate-100">
                {tool.image && (
                  <Image src={tool.image} alt={tool.alt} fill sizes="(min-width: 768px) 50vw, 100vw" className="object-cover" />
                )}
              </div>
              <div className="p-6">
                <h2 className="text-xl font-bold">{tool.title}</h2>
                <p className="mt-2 text-sm text-slate-700">{tool.text}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </SiteShell>
  );
}
