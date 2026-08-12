import { useEffect } from "react";

export default function IncidentReportScreen({ navigation }) {
  useEffect(() => {
    navigation.replace("Map", { module: "incident" });
  }, [navigation]);

  return null;
}
