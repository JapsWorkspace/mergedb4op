import { useEffect } from "react";

export default function HazardMap({ navigation }) {
  useEffect(() => {
    navigation.replace("Map", { module: "flood" });
  }, [navigation]);

  return null;
}
