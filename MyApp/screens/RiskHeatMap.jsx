import { useEffect } from "react";

export default function RiskHeatMap({ navigation }) {
  useEffect(() => {
    navigation.replace("Map", { module: "earthquake" });
  }, [navigation]);

  return null;
}
