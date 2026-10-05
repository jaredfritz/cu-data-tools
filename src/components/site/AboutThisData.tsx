"use client";

import { useEffect, type MouseEvent, type ReactNode } from "react";

const ABOUT_ID = "about-this-data";

/** The public repository for the /data tools, linked from each tool's notes. */
export const SOURCE_CODE_URL = "https://github.com/jaredfritz/cu-data-tools";

/** "The code behind this map ... open source on GitHub", shared by the notes and the zoning Info panel. */
export function OpenSourceNote({ linkClassName = "underline" }: { linkClassName?: string }) {
  return (
    <>
      The code behind this map, and the scripts that build its data, are{" "}
      <a href={SOURCE_CODE_URL} target="_blank" rel="noopener noreferrer" className={linkClassName}>
        open source on GitHub
      </a>
      .
    </>
  );
}

function openAbout(): boolean {
  const section = document.getElementById(ABOUT_ID);
  const details = section?.querySelector("details");
  if (!section || !details) return false;
  details.open = true;
  section.scrollIntoView({ behavior: "smooth", block: "start" });
  return true;
}

/**
 * A page's sources, methods, and caveats, collapsed at the bottom of the page, ending with `credit` and a link to the
 * open-source code.
 */
export function AboutThisData({ credit, children }: { credit: ReactNode; children: ReactNode }) {
  // Arriving at #about-this-data (e.g. from a shared link) opens the notes.
  useEffect(() => {
    if (window.location.hash === `#${ABOUT_ID}`) openAbout();
  }, []);

  return (
    <section id={ABOUT_ID} className="mt-8 scroll-mt-6 text-xs text-slate-600">
      <details className="group">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-sm font-semibold text-[var(--color-primary)] hover:underline [&::-webkit-details-marker]:hidden">
          <span aria-hidden className="inline-block transition-transform group-open:rotate-90">
            ▸
          </span>
          About this data
          <span className="font-normal text-slate-500">(sources, methods, and caveats)</span>
        </summary>
        <div className="mt-2 space-y-2">
          {children}
          <p>{credit}</p>
          <p>
            <OpenSourceNote />
          </p>
        </div>
      </details>
    </section>
  );
}

/** "About this data" link for the date line under a page title. Opens and scrolls to the notes. */
export function AboutDataLink() {
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (openAbout()) {
      event.preventDefault();
      history.replaceState(null, "", `#${ABOUT_ID}`);
    }
  };
  return (
    <a href={`#${ABOUT_ID}`} onClick={onClick} className="underline hover:text-slate-700">
      About this data
    </a>
  );
}
