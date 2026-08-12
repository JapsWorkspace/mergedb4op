import { createContext } from "react";

export const MapContext = createContext({
  activeMapModule: null,
  setActiveMapModule: () => {
    throw new Error("setActiveMapModule not provided");
  },

  /* =========================
     PANEL STATE
  ========================= */

  panelState: "PLACE_INFO",
  setPanelState: () => {
    throw new Error("setPanelState not provided");
  },

  /* =========================
     PANEL POSITION (DRAG)
     null = not positioned yet
  ========================= */

  panelY: null,
  setPanelY: () => {
    throw new Error("setPanelY not provided");
  },

  isMapPanelOpen: false,
  setIsMapPanelOpen: () => {
    throw new Error("setIsMapPanelOpen not provided");
  },

  /* =========================
     SELECTED EVAC PLACE
     full MongoDB document
  ========================= */

  evac: null,
  setEvac: () => {
    throw new Error("setEvac not provided");
  },

  /* =========================
     EVACUATION PLACES
  ========================= */

  evacPlaces: [],
  setEvacPlaces: () => {
    throw new Error("setEvacPlaces not provided");
  },

  /* =========================
     ROUTING
  ========================= */

  routes: [],
  setRoutes: () => {
    throw new Error("setRoutes not provided");
  },

  activeRoute: null,
  setActiveRoute: () => {
    throw new Error("setActiveRoute not provided");
  },

  travelMode: "walking",
  setTravelMode: () => {
    throw new Error("setTravelMode not provided");
  },

  routeRequested: false,
  setRouteRequested: () => {
    throw new Error("setRouteRequested not provided");
  },

  /* =========================
     INCIDENT REPORTS
  ========================= */

  incidents: [],
  setIncidents: () => {
    throw new Error("setIncidents not provided");
  },
  refreshIncidents: async () => [],

  /* =========================
     HAZARD TOGGLES
     SINGLE SOURCE OF TRUTH
  ========================= */

  showFloodMap: false,
  setShowFloodMap: () => {
    throw new Error("setShowFloodMap not provided");
  },

  showEarthquakeHazard: false,
  setShowEarthquakeHazard: () => {
    throw new Error("setShowEarthquakeHazard not provided");
  },

  /* =========================
     BOTTOM NAV INTERACTION
     temporarily disables map drag
     while user scrolls NewBottomNav
  ========================= */

  isBottomNavInteracting: false,
  setIsBottomNavInteracting: () => {
    throw new Error("setIsBottomNavInteracting not provided");
  },
});
