export function goToRouting(navigation, place) {
  navigation.navigate("Map", {
    destination: {
      lat: Number(place.latitude),
      lng: Number(place.longitude),
      label: place.label,
    },
  });
}
