import React from "react";
import { Marker } from "react-native-maps";
import { normalizeCoordinate } from "../utils/validation";

export default function RouteMarkers({ start, destination }) {
  const startCoordinate = normalizeCoordinate(start);
  const destinationCoordinate = normalizeCoordinate(destination);

  return (
    <>
      {startCoordinate && (
        <Marker
          coordinate={startCoordinate}
          title="Your location"
        />
      )}

      {destinationCoordinate && (
        <Marker
          coordinate={destinationCoordinate}
          title="Destination"
          pinColor="green"
        />
      )}
    </>
  );
}
