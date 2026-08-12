import React, { createContext, useContext, useMemo } from "react";
import useJaenPlaceSearch from "./hooks/useJaenPlaceSearch";

/* =========================
   SEARCH CONTEXT
========================= */

const SearchContext = createContext(null);

/* =========================
   PROVIDER (DEFAULT EXPORT)
========================= */

export default function SearchProvider({ children }) {
  const { query, suggestions, search, clear } = useJaenPlaceSearch();

  const value = useMemo(
    () => ({
      query,
      suggestions,
      search,
      clear,
    }),
    [query, suggestions, search, clear]
  );

  return (
    <SearchContext.Provider value={value}>
      {children}
    </SearchContext.Provider>
  );
}

/* =========================
   HOOK (NAMED EXPORT)
========================= */

export function useSearch() {
  const context = useContext(SearchContext);

  if (!context) {
    throw new Error("useSearch must be used within SearchProvider");
  }

  return context;
}