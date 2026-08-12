// screens/MainCenter.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import AppLayout from './AppLayout';
import JaenWeatherForecast from './components/JaenWeatherForecast';

import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Platform,
  KeyboardAvoidingView,
  Animated,
  PanResponder,
  StatusBar,
  ScrollView,
} from 'react-native';
import MapView, { Marker, Callout, PROVIDER_GOOGLE } from 'react-native-maps';
import { MarkerImages /* getMarkerImageBySeverity */ } from './MapIcon';
import useJaenPlaceSearch from "./hooks/useJaenPlaceSearch";
import { normalizeCoordinate } from "./utils/validation";



/* ------------------------- JAEN, NUEVA ECIJA LOCK ------------------------- */
const JAEN_CENTER = [15.33830, 120.91410]; // [lat, lng]
const PAD_LAT = 0.020, PAD_LNG = 0.020;
const JAEN_BOUNDS = {
  north: JAEN_CENTER[0] + PAD_LAT,
  south: JAEN_CENTER[0] - PAD_LAT,
  west:  JAEN_CENTER[1] - PAD_LNG,
  east:  JAEN_CENTER[1] + PAD_LNG,
};
function isInsideBounds(lat, lng) {
  return (
    lat <= JAEN_BOUNDS.north &&
    lat >= JAEN_BOUNDS.south &&
    lng >= JAEN_BOUNDS.west &&
    lng <= JAEN_BOUNDS.east
  );
}
function clampToBounds(lat, lng) {
  return {
    latitude: Math.max(JAEN_BOUNDS.south, Math.min(JAEN_BOUNDS.north, lat)),
    longitude: Math.max(JAEN_BOUNDS.west, Math.min(JAEN_BOUNDS.east, lng)),
  };
}

/* ------------------------- Zoom helpers ------------------ */
function zoomToLatDelta(z) {
  return 0.05 * Math.pow(2, 13 - z);
}
function makeCityStreet(addr = {}) {
  const street =
    addr.road ||
    addr.pedestrian ||
    addr.cycleway ||
    addr.footway ||
    addr.path ||
    addr.neighbourhood ||
    addr.suburb ||
    addr.village ||
    addr.hamlet ||
    'Unknown Street';
  const city = addr.city || addr.town || addr.village || addr.county || 'Unknown City';
  return `${street}, ${city}`;
}
function makeShortLabel(data) {
  if (data?.name) return data.name;
  const addr = data?.address ?? {};
  return makeCityStreet(addr);
}
function markerSizeFromDelta(latDelta) {
  const MIN = 20;
  const MAX = 40;
  const ref = 0.05;
  const raw = MAX * (ref / Math.max(latDelta, 1e-6));
  return Math.max(MIN, Math.min(MAX, raw));
}

export default function MainCenter({ navigation }) {
  const mapRef = useRef(null);
  const { width, height } = Dimensions.get('window');
  const aspect = width / height;

  
  const {
    query,
    suggestions,
    search,
    clear,
  } = useJaenPlaceSearch();

  
  const handleSelectSuggestion = (place) => {
  // unified data shape from hook
  const lat = Number(place.latitude);
  const lon = Number(place.longitude);

  const inside = isInsideBounds(lat, lon);
  const target = inside
    ? { latitude: lat, longitude: lon }
    : clampToBounds(lat, lon);

  setPosition([target.latitude, target.longitude]);
  setZoom(17);
  focusTo(target.latitude, target.longitude, 17, 350);

  // use normalized label
  setPlaceName(place.label);

  clear(); // ✅ close the suggestion dropdown
};

  const [position, setPosition] = useState(JAEN_CENTER);
  const [zoom, setZoom] = useState(13);
  const [placeName, setPlaceName] = useState('Jaen, Nueva Ecija');
  const [region, setRegion] = useState(() => {
    const latDelta = zoomToLatDelta(zoom);
    return {
      latitude: position[0],
      longitude: position[1],
      latitudeDelta: latDelta,
      longitudeDelta: latDelta * aspect,
    };
  });

  const pinPx = markerSizeFromDelta(region.latitudeDelta);
  const markerCoordinate = useMemo(
    () => normalizeCoordinate({ latitude: position?.[0], longitude: position?.[1] }),
    [position]
  );

  useEffect(() => {
    mapRef.current?.animateToRegion(region, 250);
  }, [region]);

  const focusTo = (lat, lng, targetZoom = 17, ms = 350) => {
    if (!mapRef.current) return;
    const latDelta = zoomToLatDelta(targetZoom);
    mapRef.current.animateToRegion(
      {
        latitude: lat,
        longitude: lng,
        latitudeDelta: latDelta,
        longitudeDelta: latDelta * aspect,
      },
      ms
    );
  };

  const reverseGeocode = async (lat, lng) => {
    try {
      const res = await axios.get(
        'https://nominatim.openstreetmap.org/reverse',
        {
          params: { lat, lon: lng, format: 'json', addressdetails: 1 },
          headers: { 'User-Agent': 'YourAppName/1.0 (support@example.com)' },
        }
      );
      setPlaceName(makeShortLabel(res.data));
    } catch {
      setPlaceName('Unknown Location');
    }
  };

  /* ----------------------- Slideable bottom panel wiring ----------------------- */
  const ANDROID_SB = StatusBar?.currentHeight || 0;

  // ✅ HEIGHT TRAITS YOU WANT
  const PANEL_VISIBLE_HEIGHT = 320;
  const PANEL_TOP = height - PANEL_VISIBLE_HEIGHT;

  const TOP_MARGIN = Platform.select({ ios: 12, android: 8 });

  const MAX_UP = -(PANEL_TOP - ANDROID_SB - TOP_MARGIN);
  const MAX_DOWN = 0;
  const START_Y = 0;

  const FULL_OPEN_TOP = PANEL_TOP + MAX_UP;

  // ✅ IMPORTANT: never let panel content collapse
  const SHEET_MIN_HEIGHT = Math.max(320, height - FULL_OPEN_TOP);

  const EXTRA_BOTTOM_PAD = Platform.select({ ios: 16, android: 12 });

  const pan = useRef(new Animated.ValueXY({ x: 0, y: START_Y })).current;
  const startY = useRef(START_Y);
  const SNAP_THRESHOLD = 80;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        startY.current = pan.y._value;
      },
      onPanResponderMove: (_, g) => {
        let newY = startY.current + g.dy;
        if (newY < MAX_UP) newY = MAX_UP;
        if (newY > MAX_DOWN) newY = MAX_DOWN;
        pan.setValue({ x: 0, y: newY });
      },
      onPanResponderRelease: (_, g) => {
        const dragUp = -g.dy >= SNAP_THRESHOLD || g.vy <= -0.4;
        Animated.spring(pan, {
          toValue: { x: 0, y: dragUp ? MAX_UP : MAX_DOWN },
          useNativeDriver: false,
          speed: 16,
          bounciness: 6,
        }).start();
      },
    })
  ).current;

  /* ----------------- Animated drop/bounce for the image marker ----------------- */
  const dropScale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    dropScale.setValue(0.01);
    Animated.spring(dropScale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 14,
      bounciness: 6,
    }).start();
  }, [position]);

  return (
    <AppLayout
  onSearch={search}
  suggestions={suggestions}
  onSelectSuggestion={handleSelectSuggestion}
>
    <View style={styles.screen}>
      <View style={styles.mapWrap}>
        <MapView
          ref={mapRef}
          style={{ flex: 1 }}
          provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
          initialRegion={region}
          onPress={(e) => {
            const { latitude, longitude } = e.nativeEvent.coordinate;
            const inside = isInsideBounds(latitude, longitude);
            const target = inside ? { latitude, longitude } : clampToBounds(latitude, longitude);

            setPosition([target.latitude, target.longitude]);
            focusTo(target.latitude, target.longitude, 17, 350);
            reverseGeocode(target.latitude, target.longitude);
          }}
        >
          {markerCoordinate && (
            <Marker coordinate={markerCoordinate}>
              <Animated.Image
                source={MarkerImages.def}
                style={{ width: pinPx, height: pinPx, transform: [{ scale: dropScale }] }}
                resizeMode="contain"
              />
            </Marker>
          )}
        </MapView>
      </View>

      {/* ✅ PANEL – CONTENT PRESERVED */}
      <Animated.View
        style={[
          styles.centerWrapper,
          { top: PANEL_TOP, transform: pan.getTranslateTransform() },
        ]}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}
        >
          <View
            style={[
              styles.card,
              { minHeight: SHEET_MIN_HEIGHT, paddingBottom: EXTRA_BOTTOM_PAD },
            ]}
          >
            <View {...panResponder.panHandlers} style={styles.dragHandle} />

            <ScrollView
              contentContainerStyle={{ paddingBottom: 8 }}
              keyboardShouldPersistTaps="handled"
              bounces
              showsVerticalScrollIndicator={false}
            >

             <View style={styles.gridWrap}>
  <JaenWeatherForecast />

  <View style={styles.row}>
    {/* PROFILE TILE */}
    <TouchableOpacity
      style={styles.tile}
      onPress={() => navigation.navigate("Profile")}
    >
      <Text style={styles.tileText}>Profile</Text>
    </TouchableOpacity>
  </View>
</View>

             <View style={styles.gridWrap}>
  <View style={styles.row}>
    {/* PROFILE TILE */}
    <TouchableOpacity
      style={styles.tile}
      onPress={() => navigation.navigate("Profile")}
    >
      <Text style={styles.tileText}>Profile</Text>
    </TouchableOpacity>
  </View>
</View>

            </ScrollView>

          </View>
        </KeyboardAvoidingView>
      </Animated.View> 
    </View>
     </AppLayout>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff', position: 'relative' },
  mapWrap: { flex: 1 },

  centerWrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
  },

  card: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 8,
    paddingHorizontal: 16,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
  },

  dragHandle: {
    alignSelf: 'center',
    width: 44,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#e5e7eb',
    marginBottom: 8,
  },

  searchInput: {
    width: '94%',
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8,
  },

  suggestionItem: {
    padding: 10,
    borderBottomColor: '#eee',
    borderBottomWidth: 1,
  },

  gridWrap: { paddingHorizontal: 4, paddingTop: 8 },
  row: { flexDirection: 'row', gap: 10, marginTop: 10 },
  tile: {
    flex: 1,
    minHeight: 84,
    borderRadius: 12,
    backgroundColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
