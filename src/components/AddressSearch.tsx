"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X, Loader2 } from "lucide-react";
import {
  AddressSuggestion,
  GeocodedAddress,
  autocompleteAddress,
  geocodeAddress,
} from "@/lib/geo";

interface AddressSearchProps {
  onResult: (result: GeocodedAddress) => void;
  onClear: () => void;
}

export default function AddressSearch({ onResult, onClear }: AddressSearchProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolved, setResolved] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [openSuggestions, setOpenSuggestions] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setSuggestions([]);
      setOpenSuggestions(false);
      setHighlightedIndex(-1);
      return;
    }

    const timer = setTimeout(async () => {
      const results = await autocompleteAddress(q);
      setSuggestions(results);
      setOpenSuggestions(results.length > 0);
      setHighlightedIndex(-1);
    }, 220);

    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpenSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function runGeocode(q: string, placeId?: string) {
    if (!q) return;
    setLoading(true);
    setError(null);
    setResolved(null);
    try {
      const result = await geocodeAddress(q, placeId);
      if (!result) {
        setError("Address not found");
      } else {
        setResolved(result.displayName);
        onResult(result);
      }
    } catch {
      setError("Search failed — check your connection");
    } finally {
      setLoading(false);
    }
  }

  async function handleSearch() {
    const q = query.trim();
    if (!q) return;
    setOpenSuggestions(false);
    await runGeocode(q);
  }

  async function handleSelectSuggestion(suggestion: AddressSuggestion) {
    setQuery(suggestion.description);
    setOpenSuggestions(false);
    setSuggestions([]);
    setHighlightedIndex(-1);
    await runGeocode(suggestion.description, suggestion.placeId);
  }

  function handleClear() {
    setQuery("");
    setResolved(null);
    setError(null);
    setSuggestions([]);
    setOpenSuggestions(false);
    setHighlightedIndex(-1);
    onClear();
  }

  return (
    <div ref={wrapperRef} className="w-full relative">
      <div className="flex items-center gap-1.5">
        <div className="min-w-0 flex-1">
          <div className="min-h-10 flex items-center gap-1 rounded-full border border-gray-200 bg-white pl-3 pr-1 py-1 focus-within:border-gray-400 transition-colors">
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (resolved) setResolved(null);
                if (error) setError(null);
              }}
              onFocus={() => {
                if (suggestions.length > 0) setOpenSuggestions(true);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  if (!openSuggestions && suggestions.length > 0) {
                    setOpenSuggestions(true);
                    setHighlightedIndex(0);
                  } else {
                    setHighlightedIndex((prev) =>
                      Math.min(prev + 1, suggestions.length - 1)
                    );
                  }
                  return;
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setHighlightedIndex((prev) => Math.max(prev - 1, 0));
                  return;
                }
                if (e.key === "Escape") {
                  setOpenSuggestions(false);
                  return;
                }
                if (e.key === "Enter") {
                  e.preventDefault();
                  const highlighted = suggestions[highlightedIndex];
                  if (openSuggestions && highlighted) {
                    void handleSelectSuggestion(highlighted);
                  } else {
                    void handleSearch();
                  }
                }
              }}
              placeholder="Search address…"
              className="text-sm bg-transparent outline-none min-w-0 w-full text-gray-800 placeholder:text-gray-400"
            />
            {(query || resolved) && (
              <button
                onClick={handleClear}
                className="w-9 h-9 inline-flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <button
          onClick={handleSearch}
          disabled={loading || !query.trim()}
          className="w-10 h-10 rounded-full bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors inline-flex items-center justify-center flex-shrink-0"
        >
          {loading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Search className="w-3.5 h-3.5" />
          )}
        </button>
      </div>
      {openSuggestions && suggestions.length > 0 && (
        <div className="absolute z-50 left-0 right-12 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
          {suggestions.map((suggestion, idx) => (
            <button
              key={suggestion.placeId}
              onMouseDown={(e) => {
                e.preventDefault();
                void handleSelectSuggestion(suggestion);
              }}
              className={`w-full text-left px-3 py-2.5 border-b last:border-b-0 border-gray-100 transition-colors ${
                idx === highlightedIndex ? "bg-gray-100" : "hover:bg-gray-50"
              }`}
            >
              <div className="text-sm text-gray-800">{suggestion.primaryText}</div>
              {suggestion.secondaryText && (
                <div className="text-xs text-gray-500 mt-0.5">{suggestion.secondaryText}</div>
              )}
            </button>
          ))}
          <div className="px-3 py-1.5 text-[10px] text-gray-400 border-t border-gray-100">
            Powered by Google
          </div>
        </div>
      )}

      {(error || resolved) && (
        <div className="pt-1.5 px-3">
          {error ? (
            <div className="text-xs text-red-500">{error}</div>
          ) : (
            <div className="text-xs text-gray-400 truncate" title={resolved ?? undefined}>
              {resolved}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
