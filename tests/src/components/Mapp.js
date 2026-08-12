import { MapContainer, TileLayer, GeoJSON } from "react-leaflet";
import floodZones from "./data/floodZone.json";
import dampulanZones from "./data/dampulan.json";
import langlaZones from "./data/langla.json";
import magsalisiZones from "./data/magsalisi.json";
import "leaflet/dist/leaflet.css";
import { getBasemapTileLayerProps } from "./map/mapBasemap";

function Mapp() {
  const basemapTileProps = getBasemapTileLayerProps();

  // Style for first polygon
  const floodStyle = {
    color: "red",
    fillColor: "red",
    fillOpacity: 0.4
  };

  // Style for second polygon
  const dampulanStyle = {
    color: "yellow",
    fillColor: "yellow",
    fillOpacity: 0.4
  };

  // Style for third polygon
  const langlaStyle = {
    color: "green",
    fillColor: "green",
    fillOpacity: 0.4
  };

  const magsalisiStyle = {
    color: "orange",
    fillColor: "orange",
    fillOpacity: 0.4
  };

  return (
    <MapContainer
      center={[14.672, 121.053]} // you can change center to show both areas
      zoom={13}
      style={{ height: "100vh", width: "100%" }}
    >
      <TileLayer {...basemapTileProps} />

      {/* Plot first JSON */}
      <GeoJSON data={floodZones} style={floodStyle} />

      {/* Plot second JSON */}
      <GeoJSON data={dampulanZones} style={dampulanStyle} />

      {/* Plot third JSON */}
      <GeoJSON data={langlaZones} style={langlaStyle} />

      {/* Plot fourth JSON */}
      <GeoJSON data={magsalisiZones} style={magsalisiStyle} />

    </MapContainer>
  );
}

export default Mapp;
