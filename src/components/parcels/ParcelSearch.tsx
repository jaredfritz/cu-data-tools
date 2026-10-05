"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import type { Parcel, ParcelMatch, Parcels } from "@/lib/parcels";
import { formatPin, parcelAt, searchParcels, displayAddress } from "@/lib/parcels";
import { geocodeAddress } from "@/lib/geo";

/**
 * Find a parcel by site address or parcel number. Suggestions come from the county's own site
 * addresses in the loaded data; if nothing matches, Enter falls back to the site's geocoder and
 * picks the parcel at that point.
 */
export function ParcelSearch({ data, onSelect }: { data: Parcels; onSelect: (parcel: Parcel) => void }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), 120);
    return () => clearTimeout(timer);
  }, [query]);

  const suggestions = useMemo(
    () => (debounced.trim().length >= 2 ? searchParcels(data.parcels, debounced) : []),
    [data, debounced],
  );

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const choose = ({ parcel, address }: ParcelMatch) => {
    setQuery(address ? displayAddress(address) : formatPin(parcel.pin));
    setOpen(false);
    setMessage(null);
    onSelect(parcel);
  };

  const submit = async () => {
    const q = query.trim();
    if (!q) return;
    const local = suggestions[highlighted] ?? searchParcels(data.parcels, q, 1)[0];
    if (local) {
      choose(local);
      return;
    }
    setOpen(false);
    setLoading(true);
    setMessage(null);
    try {
      const result = await geocodeAddress(q);
      const parcel = result ? parcelAt(data, result.lng, result.lat) : null;
      if (parcel) choose({ parcel, address: parcel.address });
      else setMessage("No parcel found at that address");
    } catch {
      setMessage("Search failed. Check your connection.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div ref={wrapperRef} className="relative w-full sm:w-80">
      <label htmlFor="parcel-search" className="sr-only">
        Search by address or parcel number
      </label>
      <div className="flex items-center rounded-[4px] border border-[var(--color-border)] bg-white px-2">
        <Search aria-hidden className="h-4 w-4 shrink-0 text-slate-400" />
        <input
          id="parcel-search"
          type="search"
          role="combobox"
          aria-expanded={open && suggestions.length > 0}
          aria-controls="parcel-search-results"
          aria-autocomplete="list"
          autoComplete="off"
          placeholder="Search address or parcel number"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setHighlighted(-1);
            setMessage(null);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setOpen(true);
              setHighlighted((index) => Math.min(index + 1, suggestions.length - 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setHighlighted((index) => Math.max(index - 1, -1));
            } else if (event.key === "Enter") {
              event.preventDefault();
              void submit();
            } else if (event.key === "Escape") {
              setOpen(false);
            }
          }}
          className="min-w-0 flex-1 bg-transparent px-2 py-1.5 text-sm outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        {loading && <Loader2 aria-label="Searching" className="h-4 w-4 shrink-0 animate-spin text-slate-400" />}
        {!loading && query && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setQuery("");
              setMessage(null);
            }}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {open && suggestions.length > 0 && (
        <ul
          id="parcel-search-results"
          role="listbox"
          className="absolute left-0 right-0 top-full z-20 mt-1 max-h-80 overflow-y-auto rounded-[4px] border border-[var(--color-border)] bg-white py-1 shadow-lg"
        >
          {suggestions.map((match, index) => (
            <li
              key={`${match.parcel.pin}-${match.address}`}
              role="option"
              aria-selected={index === highlighted}
              onMouseDown={(event) => {
                event.preventDefault();
                choose(match);
              }}
              onMouseEnter={() => setHighlighted(index)}
              className={`cursor-pointer px-3 py-1.5 text-sm ${index === highlighted ? "bg-slate-100" : ""}`}
            >
              <span className="font-medium">
                {match.address ? displayAddress(match.address) : `Parcel ${formatPin(match.parcel.pin)}`}
              </span>
              <span className="block text-xs text-slate-500">
                {match.parcel.city}
                {match.parcel.condoDevelopment ? ` · Part of a ${match.parcel.units}-unit development` : ` · ${formatPin(match.parcel.pin)}`}
              </span>
            </li>
          ))}
        </ul>
      )}
      {message && <p className="absolute left-0 top-full mt-1 text-xs text-red-700">{message}</p>}
    </div>
  );
}
