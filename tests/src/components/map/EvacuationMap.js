import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import Map from "./Map";
import "./MapIcon";
import { API_BASE_URL } from "../../config/api";


const EvacuationMap = () => {
  const [places, setPlaces] = useState([]);
  const [pickMode, setPickMode] = useState(false);

  const [selectedFacilities, setSelectedFacilities] = useState([]);

  const [selectedBarangays, setSelectedBarangays] = useState([]);
  const [allBarangays, setAllBarangays] = useState([]);
  // Coordinates
  const [currentCoords, setCurrentCoords] = useState({ lat: null, lng: null });
  const [evacCoords, setEvacCoords] = useState({ lat: null, lng: null });

  // Route
  const [routeCoords, setRouteCoords] = useState([]);
  const [routeInfo, setRouteInfo] = useState({ distance: 0, duration: 0 });

  // Transport mode
  const [transportMode, setTransportMode] = useState("driving");

  const BASE_URL = API_BASE_URL;

  /* ---------------- Fetch Evac Centers ---------------- */
  const fetchPlaces = () => {
    axios
      .get(`${BASE_URL}/evacs`)
      .then((res) => {
      setPlaces(res.data);

      // Get unique barangays
      const barangays = [...new Set(res.data.map((p) => p.barangay))];
      setAllBarangays(barangays);
    })
      .catch(console.error);
  };

  useEffect(() => {
    fetchPlaces();
  }, []);


  const facilityOptions = [
    { key: "femaleCR", label: "Female CR" },
    { key: "maleCR", label: "Male CR" },
    { key: "commonCR", label: "Common CR" },
    { key: "potableWater", label: "Potable Water" },
    { key: "nonPotableWater", label: "Non-potable Water" },
  ];

  const handleFacilityChange = (facility) => {
  setSelectedFacilities((prev) =>
    prev.includes(facility)
      ? prev.filter((f) => f !== facility)
      : [...prev, facility]
  );
};


  const handleBarangayChange = (barangay) => {
    setSelectedBarangays((prev) =>
      prev.includes(barangay)
        ? prev.filter((b) => b !== barangay) // remove if already selected
        : [...prev, barangay] // add if not selected
    );
  };

  const filteredPlaces = places.filter((p) => {
    const barangayMatch =
      selectedBarangays.length === 0 ||
      selectedBarangays.includes(p.barangay);

    const facilityMatch =
      selectedFacilities.length === 0 ||
      selectedFacilities.every((f) => p[f] === true);

    return barangayMatch && facilityMatch;
  });

  const groupedPlaces = filteredPlaces.reduce((acc, place) => {
    if (!acc[place.barangay]) {
      acc[place.barangay] = [];
    }
    acc[place.barangay].push(place);
    return acc;
  }, {});

  /* ---------------- Get User Current Location ---------------- */
  const getUserLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;

        setCurrentCoords({
          lat: latitude,
          lng: longitude,
        });

        console.log("User location:", latitude, longitude);
      },
      (error) => {
        console.error(error);
        alert("Unable to retrieve your location");
      }
    );
  };

  /* ---------------- Map Click ---------------- */
  const handleMapSelectLocation = useCallback(
    (label, lat, lng) => {
      if (!pickMode) return;

      setEvacCoords({ lat, lng });
      setPickMode(false);

      console.log("Selected Evac:", { lat, lng });
    },
    [pickMode]
  );

  /* ---------------- Select Evac from List ---------------- */
  const selectEvacPlace = (place) => {
    setEvacCoords({
      lat: place.latitude,
      lng: place.longitude,
    });

    console.log("Selected Evacuation Place:", place);
  };

  /* ---------------- Route Logic ---------------- */
  const fetchRoute = () => {
    if (
      currentCoords.lat === null ||
      currentCoords.lng === null ||
      evacCoords.lat === null ||
      evacCoords.lng === null
    ) {
      alert("Please set both locations first.");
      return;
    }

    const url = `https://router.project-osrm.org/route/v1/driving/${currentCoords.lng},${currentCoords.lat};${evacCoords.lng},${evacCoords.lat}?overview=full&geometries=geojson`;

    axios
      .get(url)
      .then((res) => {
        if (res.data.routes && res.data.routes.length > 0) {
          const route = res.data.routes[0];

          const coords = route.geometry.coordinates.map(([lng, lat]) => [
            lat,
            lng,
          ]);
          setRouteCoords(coords);

          const distanceKm = route.distance / 1000;

          let speed = 35;
          if (transportMode === "walking") speed = 5;
          else if (transportMode === "cycling") speed = 15;
          else if (transportMode === "driving") speed = 35;

          const durationSeconds = (distanceKm / speed) * 3600;

          setRouteInfo({
            distance: route.distance,
            duration: durationSeconds,
          });
        }
      })
      .catch((err) => console.error("OSRM Error:", err));
  };

  return (
    <div>
      {/* Toolbar */}
      <div className="evac-toolbar" >
        <strong>Evacuation Center Management</strong>
        <button className="tbtn" onClick={fetchPlaces}>
          ↻ Refresh
        </button>
      </div>

      {/* Map */}
      <div
        className="evac-map"
        style={{ width: "100%", height: "500px", position: "relative" }}
      >
        <Map
          onSelectLocation={handleMapSelectLocation}
          places={places}
          currentCoords={currentCoords}
          evacCoords={evacCoords}
          routeCoords={routeCoords}
          routeInfo={routeInfo}
        />

        {pickMode && (
          <div
            className="control-wrapper"
          >
            Click map to select evacuation location
            <button onClick={() => setPickMode(false)}>Cancel</button>
          </div>
        )}
      </div>

      {/* Controls */}
      <div style={{
        marginTop: 12,
        maxWidth: 320,
        maxHeight: '500px', // or whatever height fits your layout
        overflowY: 'auto',
        paddingRight: '8px', // optional, prevents content cutoff when scrollbar appears
      }}>
        <button onClick={() => setPickMode(true)}>
          Pick Evac Location on Map
        </button>

        <button onClick={getUserLocation} style={{ marginLeft: 8 }}>
          📍 Use My Current Location
        </button>

        {/* CURRENT LOCATION */}
        <div>
          <p>CURRENT LOCATION</p>
          <input
            type="number"
            placeholder="Latitude"
            value={currentCoords.lat ?? ""}
            onChange={(e) =>
              setCurrentCoords((p) => ({
                ...p,
                lat: parseFloat(e.target.value),
              }))
            }
          />
          <input
            type="number"
            placeholder="Longitude"
            value={currentCoords.lng ?? ""}
            onChange={(e) =>
              setCurrentCoords((p) => ({
                ...p,
                lng: parseFloat(e.target.value),
              }))
            }
          />
        </div>

        <div style={{ marginTop: 12 }}>
          <p><strong>Select Barangay</strong></p>
          {allBarangays.map((b) => (
            <label key={b} style={{ display: "block" }}>
              <input
                type="checkbox"
                value={b}
                checked={selectedBarangays.includes(b)}
                onChange={() => handleBarangayChange(b)}
              />
              {b}
            </label>
          ))}
          <div style={{ marginTop: 12 }}>
            <p><strong>Filter by Facilities</strong></p>
            {facilityOptions.map((f) => (
              <label key={f.key} style={{ display: "block" }}>
                <input
                  type="checkbox"
                  checked={selectedFacilities.includes(f.key)}
                  onChange={() => handleFacilityChange(f.key)}
                />
                {f.label}
              </label>
            ))}
          </div>
        </div>
        {/* EVAC LOCATION */}
        <div>
          <p>EVACUATION LOCATION</p>
          <input
            type="number"
            placeholder="Latitude"
            value={evacCoords.lat ?? ""}
            onChange={(e) =>
              setEvacCoords((p) => ({
                ...p,
                lat: parseFloat(e.target.value),
              }))
            }
          />
          <input
            type="number"
            placeholder="Longitude"
            value={evacCoords.lng ?? ""}
            onChange={(e) =>
              setEvacCoords((p) => ({
                ...p,
                lng: parseFloat(e.target.value),
              }))
            }
          />
        </div>
        {/* MODE */}
        <div>
          <p>Mode of Transport</p>
          <select
            value={transportMode}
            onChange={(e) => setTransportMode(e.target.value)}
          >
            <option value="driving">🚗 Driving</option>
            <option value="walking">🚶 Walking</option>
            <option value="cycling">🚴 Cycling</option>
          </select>
        </div>

        {/* ROUTE BUTTON */}
        <button onClick={fetchRoute}>Show Route</button>

        {/* OUTPUT */}
        {routeCoords.length > 0 && (
          <div>
            <strong>Route Info</strong>
            <div>
              Distance: {(routeInfo.distance / 1000).toFixed(2)} km
            </div>
            <div>
              Duration: {(routeInfo.duration / 60).toFixed(0)} minutes
            </div>
          </div>
        )}

        {/* Evacuation Center List */}
        <div style={{ marginTop: 20 }}>
          <p>
            <strong>Select Evacuation Center</strong>
          </p>

         {filteredPlaces.length === 0 ? (
          <div style={{ padding: "10px", color: "#888" }}>
            No matches found
          </div>
        ) : (
          Object.entries(groupedPlaces.map ? groupedPlaces : groupedPlaces).map(
            ([barangay, places]) => (
              <div key={barangay} style={{ marginBottom: "15px" }}>
                <div
                  style={{
                    fontWeight: "bold",
                    background: "#f0f0f0",
                    padding: "6px",
                    borderRadius: "4px",
                  }}
                >
                  {barangay}
                </div>

                {places.map((place) => (
                  <div
                    key={place._id}
                    onClick={() => selectEvacPlace(place)}
                    style={{
                      cursor: "pointer",
                      padding: "8px",
                      border: "1px solid #ccc",
                      marginTop: "5px",
                      borderRadius: "6px",
                    }}
                  >
                    <strong>{place.name}</strong>
                    <div>{place.location}</div>
                    <small>
                      Lat: {place.latitude}, Lng: {place.longitude}
                    </small>

                    <div>
                      Individual: {place.capacityIndividual} | Family: {place.capacityFamily} | Bed: {place.bedCapacity}
                    </div>

                    <div>
                      Facilities:
                      {place.femaleCR && " Female CR"}
                      {place.maleCR && " Male CR"}
                      {place.commonCR && " Common CR"}
                      {place.potableWater && " Potable Water"}
                      {place.nonPotableWater && " Non-potable Water"}
                    </div>

                    <div>Status: {place.capacityStatus}</div>
                  </div>
                ))}
              </div>
            )
          )
        )}
        </div>

        
      </div>
    </div>
  );
};

export default EvacuationMap;
