const MAPBOX_ACCESS_TOKEN = process.env.REACT_APP_MAPBOX_ACCESS_TOKEN;
const MAPBOX_STYLE_ID =
  process.env.REACT_APP_MAPBOX_STYLE_ID || "mapbox/streets-v12";
const MAPBOX_TILE_SIZE = 512;
const MAPBOX_ZOOM_OFFSET = -1;

const MAPBOX_ATTRIBUTION =
  '&copy; <a href="https://www.mapbox.com/about/maps/" target="_blank" rel="noreferrer">Mapbox</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>';
const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors';

export function getBasemapTileLayerProps() {
  if (MAPBOX_ACCESS_TOKEN) {
    return {
      url: `https://api.mapbox.com/styles/v1/${MAPBOX_STYLE_ID}/tiles/${MAPBOX_TILE_SIZE}/{z}/{x}/{y}?access_token=${MAPBOX_ACCESS_TOKEN}`,
      attribution: MAPBOX_ATTRIBUTION,
      tileSize: MAPBOX_TILE_SIZE,
      zoomOffset: MAPBOX_ZOOM_OFFSET,
    };
  }

  return {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: OSM_ATTRIBUTION,
  };
}
