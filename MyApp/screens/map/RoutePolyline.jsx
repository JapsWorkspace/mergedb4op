import { Polyline } from "react-native-maps";

export default function RoutePolyline({ routes, active }) {
  return routes.map((r, i) => (
    <Polyline
      key={i}
      coordinates={r.geometry.coordinates.map(([lng, lat]) => ({
        latitude: lat,
        longitude: lng,
      }))}
      strokeWidth={r === active ? 6 : 3}
      strokeColor={r === active ? "#E11D48" : "rgba(225,29,72,0.4)"}
    />
  ));
}
