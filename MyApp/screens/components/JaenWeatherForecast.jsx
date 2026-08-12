import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../contexts/ThemeContext";

const JAEN_WEATHER_COORDINATES = {
  latitude: 15.3383,
  longitude: 120.9141,
};

const WEATHER_API_URL = "https://api.open-meteo.com/v1/forecast";

const WEATHER_CODES = {
  0: { label: "Clear sky", icon: "sunny-outline" },
  1: { label: "Mainly clear", icon: "partly-sunny-outline" },
  2: { label: "Partly cloudy", icon: "partly-sunny-outline" },
  3: { label: "Overcast", icon: "cloud-outline" },
  45: { label: "Fog", icon: "cloud-outline" },
  48: { label: "Depositing fog", icon: "cloud-outline" },
  51: { label: "Light drizzle", icon: "rainy-outline" },
  53: { label: "Drizzle", icon: "rainy-outline" },
  55: { label: "Dense drizzle", icon: "rainy-outline" },
  56: { label: "Freezing drizzle", icon: "snow-outline" },
  57: { label: "Freezing drizzle", icon: "snow-outline" },
  61: { label: "Light rain", icon: "rainy-outline" },
  63: { label: "Rain", icon: "rainy-outline" },
  65: { label: "Heavy rain", icon: "thunderstorm-outline" },
  66: { label: "Freezing rain", icon: "snow-outline" },
  67: { label: "Freezing rain", icon: "snow-outline" },
  71: { label: "Light snow", icon: "snow-outline" },
  73: { label: "Snow", icon: "snow-outline" },
  75: { label: "Heavy snow", icon: "snow-outline" },
  77: { label: "Snow grains", icon: "snow-outline" },
  80: { label: "Rain showers", icon: "rainy-outline" },
  81: { label: "Rain showers", icon: "rainy-outline" },
  82: { label: "Violent showers", icon: "thunderstorm-outline" },
  85: { label: "Snow showers", icon: "snow-outline" },
  86: { label: "Snow showers", icon: "snow-outline" },
  95: { label: "Thunderstorm", icon: "thunderstorm-outline" },
  96: { label: "Thunderstorm hail", icon: "thunderstorm-outline" },
  99: { label: "Thunderstorm hail", icon: "thunderstorm-outline" },
};

function weatherInfo(code) {
  return WEATHER_CODES[code] || { label: "Weather update", icon: "cloud-outline" };
}

function buildWeatherUrl() {
  const params = {
    latitude: String(JAEN_WEATHER_COORDINATES.latitude),
    longitude: String(JAEN_WEATHER_COORDINATES.longitude),
    current: [
      "temperature_2m",
      "relative_humidity_2m",
      "apparent_temperature",
      "weather_code",
      "wind_speed_10m",
    ].join(","),
    daily: [
      "weather_code",
      "temperature_2m_max",
      "temperature_2m_min",
      "precipitation_probability_max",
    ].join(","),
    timezone: "Asia/Manila",
    forecast_days: "5",
  };

  const query = Object.entries(params)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&");

  return `${WEATHER_API_URL}?${query}`;
}

function roundValue(value) {
  if (typeof value !== "number" || Number.isNaN(value)) return "--";
  return Math.round(value);
}

function formatPercent(value) {
  if (typeof value !== "number" || Number.isNaN(value)) return "N/A";
  return `${Math.round(value)}%`;
}

function formatWind(value) {
  if (typeof value !== "number" || Number.isNaN(value)) return "N/A";
  return `${Math.round(value)} km/h`;
}

function formatDay(dateString, index) {
  if (index === 0) return "Today";
  if (index === 1) return "Tomorrow";

  const date = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "Next day";

  return date.toLocaleDateString("en-PH", { weekday: "short" });
}

function normalizeWeatherPayload(payload) {
  const current = payload?.current;
  const daily = payload?.daily;

  if (!current || !daily?.time?.length) {
    throw new Error("Incomplete weather response");
  }

  const forecast = daily.time.map((date, index) => {
    const info = weatherInfo(daily.weather_code?.[index]);

    return {
      key: `${date}-${index}`,
      day: formatDay(date, index),
      condition: info.label,
      icon: info.icon,
      high: roundValue(daily.temperature_2m_max?.[index]),
      low: roundValue(daily.temperature_2m_min?.[index]),
      rainChance: daily.precipitation_probability_max?.[index],
    };
  });

  return {
    current: {
      temperature: roundValue(current.temperature_2m),
      feelsLike: roundValue(current.apparent_temperature),
      humidity: formatPercent(current.relative_humidity_2m),
      wind: formatWind(current.wind_speed_10m),
      condition: weatherInfo(current.weather_code).label,
      icon: weatherInfo(current.weather_code).icon,
      high: forecast[0]?.high ?? "--",
      low: forecast[0]?.low ?? "--",
      rainChance: forecast[0]?.rainChance,
    },
    forecast,
    updatedAt: current.time,
  };
}

function WeatherStat({ label, value, theme }) {
  return (
    <View style={styles.statBlock}>
      <Text style={[styles.statLabel, { color: theme.mode === "dark" ? "#D7E8DC" : "#B7D9C0" }]}>
        {label}
      </Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function ForecastCard({ item, theme, themed }) {
  return (
    <View style={[styles.forecastCard, themed.card]}>
      <Text style={[styles.forecastDay, themed.text]}>{item.day}</Text>
      <Ionicons name={item.icon} size={20} color={theme.primary} />
      <Text style={[styles.forecastTemp, themed.text]}>
        {item.high} / {item.low} C
      </Text>
      <Text style={[styles.forecastRain, themed.subtext]}>Rain {formatPercent(item.rainChance)}</Text>
    </View>
  );
}

export default function JaenWeatherForecast({ variant = "panel", onWeatherChange }) {
  const { theme } = useTheme();
  const themed = useMemo(() => createWeatherThemeStyles(theme), [theme]);
  const [weather, setWeather] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(false);
  const expandAnim = useMemo(() => new Animated.Value(0), []);

  const weatherUrl = useMemo(buildWeatherUrl, []);

  const fetchWeather = useCallback(
    async (isRefresh = false) => {
      try {
        if (isRefresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }
        setError("");

        const response = await fetch(weatherUrl);
        if (!response.ok) {
          throw new Error(`Weather request failed: ${response.status}`);
        }

        const payload = await response.json();
        setWeather(normalizeWeatherPayload(payload));
      } catch (err) {
        setError("Weather data is temporarily unavailable.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [weatherUrl]
  );

  useEffect(() => {
    fetchWeather();
  }, [fetchWeather]);

  const current = weather?.current;
  const isMapOverlay = variant === "map";

  useEffect(() => {
    if (current) {
      onWeatherChange?.(weather);
    }
  }, [current, onWeatherChange, weather]);

  useEffect(() => {
    Animated.timing(expandAnim, {
      toValue: expanded ? 1 : 0,
      duration: 240,
      useNativeDriver: false,
    }).start();
  }, [expandAnim, expanded]);

  const expandedHeight = expandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 112],
  });

  const expandedOpacity = expandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  return (
    <View style={[styles.section, isMapOverlay && styles.mapSection, themed.section]}>
      <View style={styles.headerRow}>
        <View style={styles.headerCopy}>
          {!isMapOverlay && <Text style={[styles.eyebrow, themed.primaryText]}>Weather Overview</Text>}
          <Text style={[styles.title, isMapOverlay && styles.mapTitle, themed.text]}>
            {isMapOverlay ? "Jaen Weather" : "Local Weather Forecast"}
          </Text>
          <Text style={[styles.subtitle, themed.subtext]}>Jaen, Nueva Ecija</Text>
        </View>

        <TouchableOpacity
          style={[styles.refreshButton, themed.iconButton]}
          activeOpacity={0.78}
          onPress={isMapOverlay ? () => setExpanded((value) => !value) : () => fetchWeather(true)}
          disabled={loading || refreshing}
          accessibilityRole="button"
          accessibilityLabel={
            isMapOverlay ? "Show or hide Jaen weather details" : "Refresh Jaen weather forecast"
          }
        >
          {isMapOverlay ? (
            <Ionicons
              name={expanded ? "chevron-up" : "chevron-down"}
              size={18}
              color={theme.primary}
            />
          ) : refreshing ? (
            <ActivityIndicator size="small" color={theme.primary} />
          ) : (
            <Ionicons name="refresh" size={18} color={theme.primary} />
          )}
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={[styles.stateCard, isMapOverlay && styles.mapStateCard, themed.card]}>
          <ActivityIndicator color={theme.primary} size={isMapOverlay ? "small" : "large"} />
          <Text style={[styles.stateTitle, themed.text]}>Loading Jaen weather</Text>
          {!isMapOverlay && (
            <Text style={[styles.stateText, themed.subtext]}>Getting the latest local forecast.</Text>
          )}
        </View>
      ) : error ? (
        <View style={[styles.stateCard, isMapOverlay && styles.mapStateCard, themed.card]}>
          <View style={[styles.stateIcon, themed.softCard]}>
            <Ionicons name="cloud-offline-outline" size={22} color={theme.primary} />
          </View>
          <Text style={[styles.stateTitle, themed.text]}>Forecast unavailable</Text>
          {!isMapOverlay && <Text style={[styles.stateText, themed.subtext]}>{error}</Text>}
          <TouchableOpacity style={[styles.retryButton, themed.softCard]} onPress={() => fetchWeather(true)}>
            <Text style={[styles.retryText, themed.primaryText]}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : isMapOverlay ? (
        <View style={[styles.mapWeatherCard, themed.card]}>
          <TouchableOpacity
            style={styles.mapWeatherMain}
            activeOpacity={0.86}
            onPress={() => setExpanded((value) => !value)}
          >
            <View style={styles.mapWeatherIcon}>
              <Ionicons name={current.icon} size={24} color="#FFFFFF" />
            </View>
            <View style={styles.mapWeatherCopy}>
              <View style={styles.mapTempRow}>
                <Text style={[styles.mapTemp, themed.text]}>{current.temperature}</Text>
                <Text style={[styles.mapDegree, themed.text]}>C</Text>
                <Text style={[styles.mapCondition, themed.primaryText]} numberOfLines={1}>
                  {current.condition}
                </Text>
              </View>
              <Text style={[styles.mapMeta, themed.subtext]} numberOfLines={1}>
                Feels {current.feelsLike} C  |  Rain {formatPercent(current.rainChance)}
              </Text>
            </View>
          </TouchableOpacity>

          <Animated.View
            style={[
              styles.mapExpandable,
              {
                maxHeight: expandedHeight,
                opacity: expandedOpacity,
              },
            ]}
          >
            <View style={styles.mapWeatherStats}>
              <View style={[styles.mapStatPill, themed.softCard]}>
                <Ionicons name="water-outline" size={12} color={theme.primary} />
                <Text style={[styles.mapStatText, themed.primaryText]}>{current.humidity}</Text>
              </View>
              <View style={[styles.mapStatPill, themed.softCard]}>
                <Ionicons name="leaf-outline" size={12} color={theme.primary} />
                <Text style={[styles.mapStatText, themed.primaryText]}>{current.wind}</Text>
              </View>
              <View style={[styles.mapStatPill, themed.softCard]}>
                <Ionicons name="thermometer-outline" size={12} color={theme.primary} />
                <Text style={[styles.mapStatText, themed.primaryText]}>
                  {current.high}/{current.low} C
                </Text>
              </View>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.mapForecastList}
            >
              {weather.forecast.slice(0, 4).map((item) => (
                <View key={item.key} style={[styles.mapForecastChip, themed.card]}>
                  <Text style={[styles.mapForecastDay, themed.text]}>{item.day}</Text>
                  <Ionicons name={item.icon} size={14} color={theme.primary} />
                  <Text style={[styles.mapForecastTemp, themed.subtext]}>
                    {item.high}/{item.low}
                  </Text>
                </View>
              ))}
            </ScrollView>
          </Animated.View>
        </View>
      ) : (
        <>
          <View style={[styles.currentCard, themed.currentCard]}>
            <View style={styles.currentTopRow}>
              <View style={styles.conditionIcon}>
                <Ionicons name={current.icon} size={28} color="#FFFFFF" />
              </View>
              <View style={styles.conditionCopy}>
                <Text style={styles.conditionText}>{current.condition}</Text>
                <Text style={[styles.updatedText, themed.currentSubtext]}>Real-time forecast from coordinates</Text>
              </View>
              <View style={styles.rainChip}>
                <Ionicons name="water-outline" size={13} color="#14532D" />
                <Text style={styles.rainChipText}>
                  Rain {formatPercent(current.rainChance)}
                </Text>
              </View>
            </View>

            <View style={styles.temperatureRow}>
              <Text style={styles.temperature}>{current.temperature}</Text>
              <Text style={styles.degree}>C</Text>
            </View>

            <View style={styles.statsGrid}>
              <WeatherStat label="Feels like" value={`${current.feelsLike} C`} theme={theme} />
              <WeatherStat label="Humidity" value={current.humidity} theme={theme} />
              <WeatherStat label="Wind" value={current.wind} theme={theme} />
              <WeatherStat label="High / Low" value={`${current.high} / ${current.low} C`} theme={theme} />
            </View>
          </View>

          <Text style={[styles.forecastHeading, themed.text]}>Next days</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.forecastList}
          >
            {weather.forecast.map((item) => (
              <ForecastCard key={item.key} item={item} theme={theme} themed={themed} />
            ))}
          </ScrollView>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: 8,
    marginBottom: 12,
  },

  mapSection: {
    marginTop: 0,
    marginBottom: 0,
    borderRadius: 18,
    padding: 9,
    backgroundColor: "rgba(255,255,255,0.94)",
    borderWidth: 1,
    borderColor: "rgba(225,234,228,0.95)",
    shadowColor: "#0F2319",
    shadowOpacity: 0.14,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 7 },
    elevation: 8,
  },

  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 8,
  },

  headerCopy: {
    flex: 1,
  },

  eyebrow: {
    color: "#1D6B41",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },

  title: {
    marginTop: 3,
    color: "#10251B",
    fontSize: 18,
    fontWeight: "900",
  },

  mapTitle: {
    marginTop: 0,
    fontSize: 14,
  },

  subtitle: {
    marginTop: 2,
    color: "#647067",
    fontSize: 11,
    fontWeight: "700",
  },

  refreshButton: {
    width: 34,
    height: 34,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F8F3",
    borderWidth: 1,
    borderColor: "#DCE9D6",
  },

  currentCard: {
    borderRadius: 16,
    backgroundColor: "#123B28",
    padding: 14,
    shadowColor: "#0F2319",
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },

  mapWeatherCard: {
    gap: 0,
  },

  mapWeatherMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  mapWeatherIcon: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#14532D",
  },

  mapWeatherCopy: {
    flex: 1,
    minWidth: 0,
  },

  mapTempRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
  },

  mapTemp: {
    color: "#10251B",
    fontSize: 24,
    lineHeight: 28,
    fontWeight: "900",
  },

  mapDegree: {
    color: "#10251B",
    fontSize: 12,
    fontWeight: "900",
  },

  mapCondition: {
    flex: 1,
    marginLeft: 4,
    color: "#1D6B41",
    fontSize: 12,
    fontWeight: "900",
  },

  mapMeta: {
    marginTop: 1,
    color: "#647067",
    fontSize: 11,
    fontWeight: "800",
  },

  mapExpandable: {
    overflow: "hidden",
    gap: 8,
  },

  mapWeatherStats: {
    marginTop: 8,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },

  mapStatPill: {
    minHeight: 26,
    borderRadius: 999,
    paddingHorizontal: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#EEF8F1",
    borderWidth: 1,
    borderColor: "#DCE9D6",
  },

  mapStatText: {
    color: "#14532D",
    fontSize: 10,
    fontWeight: "900",
  },

  mapForecastList: {
    gap: 6,
    paddingRight: 2,
  },

  mapForecastChip: {
    minWidth: 74,
    minHeight: 36,
    borderRadius: 12,
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#F8FBF7",
    borderWidth: 1,
    borderColor: "#E1EAE4",
  },

  mapForecastDay: {
    color: "#10251B",
    fontSize: 10,
    fontWeight: "900",
  },

  mapForecastTemp: {
    color: "#516353",
    fontSize: 10,
    fontWeight: "900",
  },

  currentTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  conditionIcon: {
    width: 44,
    height: 44,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.16)",
  },

  conditionCopy: {
    flex: 1,
  },

  conditionText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
  },

  updatedText: {
    marginTop: 2,
    color: "#CDE8D3",
    fontSize: 10,
    fontWeight: "700",
  },

  rainChip: {
    minHeight: 30,
    borderRadius: 999,
    paddingHorizontal: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#E8F6DD",
  },

  rainChipText: {
    color: "#14532D",
    fontSize: 10,
    fontWeight: "900",
  },

  temperatureRow: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "flex-start",
  },

  temperature: {
    color: "#FFFFFF",
    fontSize: 52,
    lineHeight: 58,
    fontWeight: "900",
  },

  degree: {
    marginTop: 8,
    marginLeft: 4,
    color: "#DDF3E3",
    fontSize: 18,
    fontWeight: "900",
  },

  statsGrid: {
    marginTop: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },

  statBlock: {
    width: "48%",
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 10,
    backgroundColor: "rgba(255,255,255,0.1)",
  },

  statLabel: {
    color: "#B7D9C0",
    fontSize: 10,
    fontWeight: "800",
  },

  statValue: {
    marginTop: 3,
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
  },

  forecastHeading: {
    marginTop: 12,
    marginBottom: 8,
    color: "#10251B",
    fontSize: 13,
    fontWeight: "900",
  },

  forecastList: {
    gap: 8,
    paddingRight: 6,
  },

  forecastCard: {
    width: 104,
    minHeight: 112,
    borderRadius: 14,
    padding: 10,
    backgroundColor: "#F8FBF7",
    borderWidth: 1,
    borderColor: "#E1EAE4",
    justifyContent: "space-between",
  },

  forecastDay: {
    color: "#10251B",
    fontSize: 12,
    fontWeight: "900",
  },

  forecastTemp: {
    color: "#10251B",
    fontSize: 13,
    fontWeight: "900",
  },

  forecastRain: {
    color: "#647067",
    fontSize: 10,
    fontWeight: "800",
  },

  stateCard: {
    minHeight: 150,
    borderRadius: 16,
    backgroundColor: "#F8FBF7",
    borderWidth: 1,
    borderColor: "#E1EAE4",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },

  mapStateCard: {
    minHeight: 88,
    padding: 12,
  },

  stateIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E8F6DD",
    marginBottom: 8,
  },

  stateTitle: {
    marginTop: 8,
    color: "#10251B",
    fontSize: 14,
    fontWeight: "900",
  },

  stateText: {
    marginTop: 4,
    color: "#647067",
    textAlign: "center",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
  },

  retryButton: {
    marginTop: 12,
    minHeight: 36,
    borderRadius: 12,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EDF8F0",
    borderWidth: 1,
    borderColor: "#CFE5D4",
  },

  retryText: {
    color: "#1D6B41",
    fontSize: 12,
    fontWeight: "900",
  },
});

function createWeatherThemeStyles(theme) {
  return StyleSheet.create({
    section: {
      backgroundColor: theme.card,
      borderColor: theme.border,
    },
    card: {
      backgroundColor: theme.card,
      borderColor: theme.border,
    },
    softCard: {
      backgroundColor: theme.primarySoft,
      borderColor: theme.border,
    },
    iconButton: {
      backgroundColor: theme.primarySoft,
      borderColor: theme.border,
    },
    currentCard: {
      backgroundColor: theme.mode === "dark" ? "#0F2F22" : "#123B28",
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? "rgba(134,239,172,0.28)" : "transparent",
    },
    text: {
      color: theme.text,
    },
    subtext: {
      color: theme.subtext,
    },
    primaryText: {
      color: theme.primary,
    },
    currentSubtext: {
      color: theme.mode === "dark" ? "#D7E8DC" : "#CDE8D3",
    },
  });
}
