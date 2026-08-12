import { useCallback, useContext, useMemo, useRef, useState } from "react";
import api from "../../lib/api";
import { MapContext } from "../contexts/MapContext";
import {
  isValidCoordinate,
  sanitizeSearchText,
  safeDisplayText,
} from "../utils/validation";

export default function useJaenPlaceSearch() {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const mapCtx = useContext(MapContext);
  const setEvacPlaces =
    typeof mapCtx?.setEvacPlaces === "function" ? mapCtx.setEvacPlaces : null;

  const evacCache = useRef([]);
  const loadedRef = useRef(false);
  const loadingRef = useRef(null);

  const loadEvacPlaces = useCallback(async () => {
    if (loadedRef.current) return evacCache.current;
    if (loadingRef.current) return loadingRef.current;

    loadingRef.current = api
      .get("/evacs")
      .then((res) => {
        const evacs = Array.isArray(res.data) ? res.data : [];
        evacCache.current = evacs;
        loadedRef.current = true;

        if (setEvacPlaces) {
          setEvacPlaces(evacs);
        }

        return evacCache.current;
      })
      .catch((err) => {
        loadedRef.current = true;
        console.log("[EvacSearch] Failed to load evac places:", err?.message);
        return evacCache.current;
      })
      .finally(() => {
        loadingRef.current = null;
      });

    return loadingRef.current;
  }, [setEvacPlaces]);

  const searchEvacPlaces = useCallback((value, options = evacCache.current) => {
    const cleanValue = sanitizeSearchText(value);
    const normalizedQuery = cleanValue.toLowerCase();

    if (normalizedQuery.length < 2) {
      setSuggestions([]);
      return;
    }

    const results = options
      .filter((place) => {
        if (place?.isArchived || place?.capacityStatus === "closed") return false;

        return [
          place?.name,
          place?.location,
          place?.barangayName,
          place?.district,
        ].some((field) => String(field || "").toLowerCase().includes(normalizedQuery));
      })
      .map((place, index) => ({
        id: String(place?._id || `evac-${place?.latitude}-${place?.longitude}-${index}`),
        label: safeDisplayText(place?.name, "Evacuation center"),
        subtitle: safeDisplayText(
          place?.barangayName || place?.location,
          "Evacuation place"
        ),
        latitude: Number(place?.latitude),
        longitude: Number(place?.longitude),
        source: "evacuation",
        raw: place,
      }))
      .filter((place) => isValidCoordinate(place.latitude, place.longitude))
      .slice(0, 8);

    setSuggestions(results);
  }, []);

  const search = useCallback(
    (value) => {
      const cleanValue = sanitizeSearchText(value);
      setQuery(cleanValue);
      searchEvacPlaces(cleanValue);

      if (!cleanValue || cleanValue.length < 2) return;

      loadEvacPlaces().then((places) => {
        searchEvacPlaces(cleanValue, places);
      });
    },
    [loadEvacPlaces, searchEvacPlaces]
  );

  const clear = useCallback(() => {
    setQuery("");
    setSuggestions([]);
  }, []);

  return useMemo(
    () => ({
      query,
      suggestions,
      search,
      clear,
    }),
    [clear, query, search, suggestions]
  );
}
