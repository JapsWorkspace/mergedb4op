import React, { useMemo, useState, useCallback, useContext, useEffect, useRef } from "react";
import { AppState, View, StyleSheet } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useFocusEffect } from "@react-navigation/native";

import AppLayout from "./AppLayout";
import NewBottomNav from "./NewBottomNav";

import MainCenter from "./MainCenter";
import Map from "./Map";
import Profile from "./Profile";
import Guidelines from "./Guidelines";
import Announcement from "./Announcement";
import SafetyMark from "./SafetyMark";
import PersonalDetails from "./PersonalDetails";
import PasswordSecurity from "./PasswordSecurity";
import DonationScreen from "./DonationScreen";
import Settings from "./Settings";
import DigitalTwinScreen from "./DigitalTwinScreen";
import { MapContext } from "./contexts/MapContext";
import { NotificationContext, NotificationProvider } from "./contexts/NotificationContext";
import { UserContext } from "./UserContext";
import { useTheme } from "./contexts/ThemeContext";
import SearchProvider from "./SearchContext";
import api from "../lib/api";
import { getSocket } from "../lib/socket";

const Stack = createNativeStackNavigator();
const MAP_UI_SCREENS = new Set(["Map"]);
const INCIDENT_REFRESH_POLL_INTERVAL_MS = 5000;
const BOTTOM_NAV_GESTURE_LOCK_MAX_MS = 900;

function getIncidentListSignature(items) {
  return (Array.isArray(items) ? items : [])
    .map((incident) => [
      incident?._id || "",
      incident?.status || "",
      incident?.updatedAt || incident?.createdAt || "",
      incident?.latitude ?? incident?.lat ?? incident?.location?.lat ?? "",
      incident?.longitude ?? incident?.lng ?? incident?.location?.lng ?? "",
    ].join(":"))
    .join("|");
}

function normalizeIncidentStatus(status) {
  return String(status || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function isPublicIncident(status) {
  const normalizedStatus =
    typeof status === "object"
      ? normalizeIncidentStatus(status?.status)
      : normalizeIncidentStatus(status);

  if (typeof status === "object") {
    return (
      status?.isPublic === true ||
      status?.forceApproved === true ||
      status?.approvedByMDRRMO === true ||
      normalizedStatus === "approved"
    );
  }

  return normalizedStatus === "approved";
}

function getIncidentCoordinate(incident, keys) {
  for (const key of keys) {
    const value = key
      .split(".")
      .reduce((current, pathKey) => current?.[pathKey], incident);
    const numberValue = Number(value);
    if (Number.isFinite(numberValue)) return numberValue;
  }

  return NaN;
}

function hasValidIncidentCoordinates(incident) {
  const latitude = getIncidentCoordinate(incident, ["latitude", "lat", "location.lat"]);
  const longitude = getIncidentCoordinate(incident, ["longitude", "lng", "location.lng"]);

  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180 &&
    !(latitude === 0 && longitude === 0)
  );
}

export default function AppShell() {
  const { theme } = useTheme();
  const [activeMapModule, setActiveMapModule] = useState(null);
  const [panelState, setPanelState] = useState("HIDDEN");
  const [panelY, setPanelY] = useState(null);
  const [isMapPanelOpen, setIsMapPanelOpen] = useState(false);
  const [routeRequested, setRouteRequested] = useState(false);

  const [evac, setEvac] = useState(null);
  const [evacPlaces, setEvacPlaces] = useState([]);

  const [routes, setRoutes] = useState([]);
  const [activeRoute, setActiveRoute] = useState(null);
  const [travelMode, setTravelMode] = useState("walking");

  const [incidents, setIncidents] = useState([]);
  const incidentRefreshInFlightRef = useRef(null);
  const incidentListSignatureRef = useRef("");

  const refreshIncidents = useCallback(async () => {
    if (incidentRefreshInFlightRef.current) {
      return incidentRefreshInFlightRef.current;
    }

    const request = api
      .get("/incident/getIncidents")
      .then((res) => {
        const fetchedIncidents = Array.isArray(res.data) ? res.data : [];
        const publicIncidents = fetchedIncidents.filter((incident) =>
          isPublicIncident(incident)
        );
        const nextSignature = getIncidentListSignature(publicIncidents);

        setIncidents((current) => {
          if (incidentListSignatureRef.current === nextSignature) {
            return current;
          }

          incidentListSignatureRef.current = nextSignature;
          return publicIncidents;
        });

        return publicIncidents;
      })
      .finally(() => {
        incidentRefreshInFlightRef.current = null;
      });

    incidentRefreshInFlightRef.current = request;
    return request;
  }, []);

  const [showFloodMap, setShowFloodMap] = useState(false);
  const [showEarthquakeHazard, setShowEarthquakeHazard] = useState(false);

  const [isBottomNavInteracting, setIsBottomNavInteracting] = useState(false);
  const bottomNavGestureReleaseTimerRef = useRef(null);

  const setBottomNavInteracting = useCallback((value) => {
    if (bottomNavGestureReleaseTimerRef.current) {
      clearTimeout(bottomNavGestureReleaseTimerRef.current);
      bottomNavGestureReleaseTimerRef.current = null;
    }

    setIsBottomNavInteracting(Boolean(value));

    if (value) {
      bottomNavGestureReleaseTimerRef.current = setTimeout(() => {
        bottomNavGestureReleaseTimerRef.current = null;
        setIsBottomNavInteracting(false);
      }, BOTTOM_NAV_GESTURE_LOCK_MAX_MS);
    }
  }, []);

  const [currentScreen, setCurrentScreen] = useState("Map");

  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    setBottomNavInteracting(false);
  }, [activeMapModule, currentScreen, setBottomNavInteracting]);

  useEffect(() => {
    if (!MAP_UI_SCREENS.has(currentScreen)) {
      setIsMapPanelOpen(false);
      return;
    }

    // Selecting a module starts opening its panel. The panel itself clears this
    // only after it reaches its fully collapsed snap point.
    if (activeMapModule) setIsMapPanelOpen(true);
    else setIsMapPanelOpen(false);
  }, [activeMapModule, currentScreen]);

  useEffect(
    () => () => {
      if (bottomNavGestureReleaseTimerRef.current) {
        clearTimeout(bottomNavGestureReleaseTimerRef.current);
        bottomNavGestureReleaseTimerRef.current = null;
      }
    },
    []
  );

  useFocusEffect(
    useCallback(() => {
      let mounted = true;

      refreshIncidents().catch((err) => {
        if (mounted) console.log("[incidents] fetch failed:", err?.message || err);
      });

      api
        .get("/evacs")
        .then((res) => {
          if (mounted && Array.isArray(res.data)) {
            setEvacPlaces(res.data);
          }
        })
        .catch((err) => console.log("[evacs] fetch failed:", err?.message || err));

      return () => {
        mounted = false;
      };
    }, [refreshIncidents])
  );

  const mapContextValue = useMemo(
    () => ({
      activeMapModule,
      setActiveMapModule,

      panelState,
      setPanelState,
      panelY,
      setPanelY,
      isMapPanelOpen,
      setIsMapPanelOpen,

      routeRequested,
      setRouteRequested,

      evac,
      setEvac,

      evacPlaces,
      setEvacPlaces,

      routes,
      setRoutes,
      activeRoute,
      setActiveRoute,

      travelMode,
      setTravelMode,

      incidents,
      setIncidents,
      refreshIncidents,

      showFloodMap,
      setShowFloodMap,
      showEarthquakeHazard,
      setShowEarthquakeHazard,

      isBottomNavInteracting,
      setIsBottomNavInteracting: setBottomNavInteracting,
    }),
    [
      activeMapModule,
      panelState,
      panelY,
      isMapPanelOpen,
      routeRequested,
      evac,
      evacPlaces,
      routes,
      activeRoute,
      travelMode,
      incidents,
      refreshIncidents,
      showFloodMap,
      showEarthquakeHazard,
      isBottomNavInteracting,
      setBottomNavInteracting,
    ]
  );

  const showBottomNav = MAP_UI_SCREENS.has(currentScreen) && !drawerOpen;

  return (
    <View style={styles.root}>
      <MapContext.Provider value={mapContextValue}>
        <NotificationProvider>
          <RealtimeIncidentBridge />
          <SearchProvider>
            <AppLayout
              currentScreen={currentScreen}
              drawerOpen={drawerOpen}
              onDrawerOpenChange={setDrawerOpen}
            >
              <Stack.Navigator screenOptions={{ headerShown: false }}>
                <Stack.Screen
                  name="Map"
                  component={Map}
                  listeners={{
                    focus: () => setCurrentScreen("Map"),
                  }}
                />
                <Stack.Screen
                  name="MainCenter"
                  component={MainCenter}
                  listeners={{
                    focus: () => setCurrentScreen("MainCenter"),
                  }}
                />
                <Stack.Screen
  name="DigitalTwin"
  component={DigitalTwinScreen}
  listeners={{
    focus: () => setCurrentScreen("DigitalTwin"),
  }}
/>
                <Stack.Screen
                  name="Profile"
                  component={Profile}
                  listeners={{
                    focus: () => setCurrentScreen("Profile"),
                  }}
                />
                <Stack.Screen
                  name="Guidelines"
                  component={Guidelines}
                  listeners={{
                    focus: () => setCurrentScreen("Guidelines"),
                  }}
                />
                <Stack.Screen
                  name="Announcement"
                  component={Announcement}
                  listeners={{
                    focus: () => setCurrentScreen("Announcement"),
                  }}
                />
                <Stack.Screen
                  name="Connection"
                  component={SafetyMark}
                  listeners={{
                    focus: () => setCurrentScreen("Connection"),
                  }}
                />
                <Stack.Screen
                  name="PersonalDetails"
                  component={PersonalDetails}
                  listeners={{
                    focus: () => setCurrentScreen("PersonalDetails"),
                  }}
                />
                <Stack.Screen
                  name="PasswordSecurity"
                  component={PasswordSecurity}
                  listeners={{
                    focus: () => setCurrentScreen("PasswordSecurity"),
                  }}
                />
                <Stack.Screen
                  name="DonationScreen"
                  component={DonationScreen}
                  listeners={{
                    focus: () => setCurrentScreen("DonationScreen"),
                  }}
                />
                <Stack.Screen
                  name="Settings"
                  component={Settings}
                  listeners={{
                    focus: () => setCurrentScreen("Settings"),
                  }}
                />
              </Stack.Navigator>
            </AppLayout>
          </SearchProvider>
        </NotificationProvider>

        {showBottomNav && (
          <View
            style={[
              styles.bottomSystemArea,
              { backgroundColor: "transparent", borderTopColor: "transparent" },
            ]}
            pointerEvents="none"
          />
        )}

        {showBottomNav && (
          <View style={styles.navWrapper} pointerEvents="auto">
            <NewBottomNav />
          </View>
        )}
      </MapContext.Provider>
    </View>
  );
}

function RealtimeIncidentBridge() {
  const { user } = useContext(UserContext) || {};
  const { refreshIncidents, setIncidents } = useContext(MapContext);
  const { addNotification, refreshNotifications } =
    useContext(NotificationContext) || {};
  const lastSocketRefreshAtRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let activeSocket = null;
    let incidentUpdatedHandler = null;
    let incidentApprovedHandler = null;
    let legacyIncidentApprovedHandler = null;
    let myIncidentApprovedHandler = null;
    let notificationNewHandler = null;
    let joinUserRoomHandler = null;

    const mergePublicIncident = (incident, eventName) => {
      if (!isPublicIncident(incident)) return;

      setIncidents((prev) => {
        const current = Array.isArray(prev) ? prev : [];
        const exists = current.some((item) => item?._id === incident?._id);
        const next = exists
          ? current.map((item) => (item?._id === incident?._id ? incident : item))
          : [incident, ...current];

        return next;
      });
    };

    const refreshFromSocket = (eventName, incident) => {
      mergePublicIncident(incident, eventName);

      const now = Date.now();
      if (now - lastSocketRefreshAtRef.current < 1200) return;
      lastSocketRefreshAtRef.current = now;

      refreshIncidents?.(`socket:${eventName}`).catch((err) => {
        console.log("[incidents] dynamic refresh failed:", err?.message || err);
      });
    };

    async function connectRealtime() {
      try {
        const socket = await getSocket();
        if (cancelled) return;

        activeSocket = socket;

        joinUserRoomHandler = () => {
          if (user?._id) {
            socket.emit("joinRoom", String(user._id));
          }
        };

        joinUserRoomHandler();
        socket.off("connect", joinUserRoomHandler);
        socket.on("connect", joinUserRoomHandler);

        incidentUpdatedHandler = (incident) => {
          refreshFromSocket("incident:updated", incident);
        };

        incidentApprovedHandler = (incident) => {
          refreshFromSocket("incident:approved", incident);
        };

        legacyIncidentApprovedHandler = (incident) => {
          refreshFromSocket("incidentApproved", incident);
        };

        myIncidentApprovedHandler = (incident) => {
          refreshFromSocket("myIncidentApproved", incident);
          refreshNotifications?.();
        };

        notificationNewHandler = (notification) => {
          addNotification?.(notification);
          refreshNotifications?.();
        };

        socket.off("incident:updated", incidentUpdatedHandler);
        socket.off("incident:approved", incidentApprovedHandler);
        socket.off("incidentApproved", legacyIncidentApprovedHandler);
        socket.off("myIncidentApproved", myIncidentApprovedHandler);
        socket.off("notification:new", notificationNewHandler);
        socket.on("incident:updated", incidentUpdatedHandler);
        socket.on("incident:approved", incidentApprovedHandler);
        socket.on("incidentApproved", legacyIncidentApprovedHandler);
        socket.on("myIncidentApproved", myIncidentApprovedHandler);
        socket.on("notification:new", notificationNewHandler);
      } catch (err) {
        console.log("[socket] incident realtime failed:", err?.message || err);
      }
    }

    connectRealtime();

    return () => {
      cancelled = true;
      if (activeSocket) {
        if (incidentUpdatedHandler) {
          activeSocket.off("incident:updated", incidentUpdatedHandler);
        }
        if (incidentApprovedHandler) {
          activeSocket.off("incident:approved", incidentApprovedHandler);
        }
        if (legacyIncidentApprovedHandler) {
          activeSocket.off("incidentApproved", legacyIncidentApprovedHandler);
        }
        if (myIncidentApprovedHandler) {
          activeSocket.off("myIncidentApproved", myIncidentApprovedHandler);
        }
        if (notificationNewHandler) {
          activeSocket.off("notification:new", notificationNewHandler);
        }
        if (joinUserRoomHandler) {
          activeSocket.off("connect", joinUserRoomHandler);
        }
      }
    };
  }, [addNotification, refreshIncidents, refreshNotifications, setIncidents, user?._id]);

  useEffect(() => {
    let intervalId = null;
    let polling = false;

    const refreshDynamicData = async (reason) => {
      if (polling) return;
      polling = true;

      try {
        await refreshIncidents?.(reason);
        await refreshNotifications?.();
      } catch (err) {
        console.log("[incidents] dynamic polling failed:", err?.message || err);
      } finally {
        polling = false;
      }
    };

    const startPolling = () => {
      if (intervalId) return;
      intervalId = setInterval(() => {
        refreshDynamicData("polling");
      }, INCIDENT_REFRESH_POLL_INTERVAL_MS);
    };

    const stopPolling = () => {
      if (!intervalId) return;
      clearInterval(intervalId);
      intervalId = null;
    };

    if (AppState.currentState === "active") {
      startPolling();
    }

    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        refreshDynamicData("app-active");
        startPolling();
        return;
      }

      stopPolling();
    });

    return () => {
      stopPolling();
      subscription.remove();
    };
  }, [refreshIncidents, refreshNotifications]);

  return null;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },

  navWrapper: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 10,
    height: 154,
    zIndex: 99999,
    elevation: 99999,
    justifyContent: "flex-end",
    backgroundColor: "rgba(255,255,255,0.001)",
  },

  bottomSystemArea: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 56,
    zIndex: 99980,
    elevation: 99980,
    backgroundColor: "#f6faf7",
    borderTopWidth: 1,
    borderTopColor: "rgba(209,224,216,0.9)",
  },
});
