import Link from "next/link";

const TOOLS = [
  { href: "/data/crashes", label: "Crashes" },
  { href: "/data/value-per-acre", label: "Value Per Acre" },
  { href: "/data/vacant-land", label: "Vacant Land" },
  { href: "/data/zoning", label: "Zoning & Permits" },
];

/** A plain page frame for the data tools: title, links to each tool, and a credit line. */
export default function SiteShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-bg)] text-[var(--color-primary)]">
      <header className="border-b border-[var(--color-border)] bg-white">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-3 md:px-8">
          <Link href="/" className="text-sm font-bold tracking-wide">
            Champaign-Urbana Data Tools
          </Link>
          <nav aria-label="Tools" className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {TOOLS.map((tool) => (
              <Link key={tool.href} href={tool.href} className="hover:underline">
                {tool.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main id="main-content" className="flex-1">
        {children}
      </main>
      <footer className="border-t border-[var(--color-border)] px-5 py-6 text-center text-xs text-slate-500">
        Originally built by <a href="https://www.abundantcu.com" className="underline">Abundant CU</a>. Open source under
        the MIT license.
      </footer>
    </div>
  );
}
