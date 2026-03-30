"use client";

import { useState, useEffect, useRef } from "react";
import { Search, Loader2 } from "lucide-react";
import Image from "next/image";

interface TokenResult {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
}

interface Props {
  onSelect: (mint: string) => void;
  loading?: boolean;
}

export default function TokenSearch({ onSelect, loading }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TokenResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/token?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        setResults(data.tokens ?? []);
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelect = (token: TokenResult) => {
    setQuery(`${token.symbol} — ${token.address.slice(0, 8)}...`);
    setOpen(false);
    onSelect(token.address);
  };

  return (
    <div ref={containerRef} className="relative w-full max-w-xl">
      <div className="flex items-center gap-2 bg-[#1a1f2e] border border-[#2a3142] rounded-lg px-3 py-2.5 focus-within:border-[#f97316] transition-colors">
        {loading || searching ? (
          <Loader2 className="w-4 h-4 text-gray-400 animate-spin shrink-0" />
        ) : (
          <Search className="w-4 h-4 text-gray-400 shrink-0" />
        )}
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search token symbol, name, or paste mint address..."
          className="flex-1 bg-transparent text-sm text-white placeholder:text-gray-500 outline-none"
          onFocus={() => results.length > 0 && setOpen(true)}
        />
      </div>

      {open && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-[#1a1f2e] border border-[#2a3142] rounded-lg shadow-2xl z-50 max-h-72 overflow-y-auto">
          {results.map((token) => (
            <button
              key={token.address}
              onClick={() => handleSelect(token)}
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-[#242b3d] transition-colors text-left"
            >
              {token.logoURI ? (
                <Image
                  src={token.logoURI}
                  alt={token.symbol}
                  width={28}
                  height={28}
                  className="rounded-full shrink-0 bg-[#2a3142]"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-[#2a3142] shrink-0 flex items-center justify-center text-xs text-gray-400">
                  {token.symbol.slice(0, 2)}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-white">{token.symbol}</div>
                <div className="text-xs text-gray-500 truncate">{token.name}</div>
              </div>
              <div className="text-xs text-gray-600 font-mono shrink-0">
                {token.address.slice(0, 4)}…{token.address.slice(-4)}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
