import React, { useRef, useState } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Platform,
} from "react-native";
import { WebView } from "react-native-webview";
import { DrawerActions } from "@react-navigation/native";

const UNITY_WEBGL_URL = "https://sagipbayan.com/digital-twin-mobile";

export default function DigitalTwinScreen({ navigation }) {
  const webViewRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);

  const openAppDrawer = () => {
    try {
      let currentNavigation = navigation;

      while (currentNavigation) {
        const state = currentNavigation.getState?.();

        if (state?.type === "drawer") {
          currentNavigation.dispatch(DrawerActions.openDrawer());
          return;
        }

        currentNavigation = currentNavigation.getParent?.();
      }

      // Fallback if this screen is not inside Drawer.Navigator
      if (navigation?.goBack) {
        navigation.goBack();
      } else {
        console.log("Drawer navigator not found.");
      }
    } catch (error) {
      console.log("Open drawer error:", error);
    }
  };

  const reloadSimulation = () => {
    setHasError(false);
    setLoading(true);
    webViewRef.current?.reload();
  };

  const toggleControls = () => {
    setControlsVisible((prev) => !prev);
  };

  const injectedUnityOnlyView = `
    (function() {
      function cleanUnityPage() {
        document.documentElement.style.margin = "0";
        document.documentElement.style.padding = "0";
        document.documentElement.style.width = "100%";
        document.documentElement.style.height = "100%";
        document.documentElement.style.overflow = "hidden";
        document.documentElement.style.background = "#000";

        document.body.style.margin = "0";
        document.body.style.padding = "0";
        document.body.style.width = "100vw";
        document.body.style.height = "100vh";
        document.body.style.overflow = "hidden";
        document.body.style.background = "#000";

        var canvas = document.querySelector("canvas");
        var unityContainer =
          document.querySelector("#unity-container") ||
          document.querySelector(".unity-container") ||
          document.querySelector("#unityContainer") ||
          document.querySelector(".unityContainer");

        if (unityContainer) {
          unityContainer.style.position = "fixed";
          unityContainer.style.top = "0";
          unityContainer.style.left = "0";
          unityContainer.style.width = "100vw";
          unityContainer.style.height = "100vh";
          unityContainer.style.margin = "0";
          unityContainer.style.padding = "0";
          unityContainer.style.border = "none";
          unityContainer.style.borderRadius = "0";
          unityContainer.style.background = "#000";
          unityContainer.style.overflow = "hidden";
          unityContainer.style.zIndex = "1";
        }

        if (canvas) {
          canvas.style.position = "fixed";
          canvas.style.top = "0";
          canvas.style.left = "0";
          canvas.style.width = "100vw";
          canvas.style.height = "100vh";
          canvas.style.margin = "0";
          canvas.style.padding = "0";
          canvas.style.display = "block";
          canvas.style.background = "#000";
          canvas.style.zIndex = "2";
        }
      }

      cleanUnityPage();
      setInterval(cleanUnityPage, 1000);
    })();
    true;
  `;

  return (
    <View style={styles.container}>
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle="light-content"
        hidden={!controlsVisible}
      />

      {!hasError && (
        <WebView
          ref={webViewRef}
          source={{ uri: UNITY_WEBGL_URL }}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          originWhitelist={["*"]}
          allowsFullscreenVideo={true}
          mixedContentMode="always"
          startInLoadingState={false}
          scalesPageToFit={false}
          scrollEnabled={false}
          bounces={false}
          overScrollMode="never"
          injectedJavaScript={injectedUnityOnlyView}
          onLoadStart={() => {
            setLoading(true);
            setHasError(false);
          }}
          onLoadEnd={() => {
            setLoading(false);
            webViewRef.current?.injectJavaScript(injectedUnityOnlyView);
          }}
          onError={(event) => {
            console.log("WebView error:", event.nativeEvent);
            setHasError(true);
            setLoading(false);
          }}
          onHttpError={(event) => {
            console.log("WebView HTTP error:", event.nativeEvent);

            const statusCode = event.nativeEvent.statusCode;

            if (statusCode >= 400) {
              setHasError(true);
              setLoading(false);
            }
          }}
          style={styles.webview}
        />
      )}

      {!hasError && controlsVisible && (
        <>
          <View style={styles.topFade} />
          <View style={styles.bottomFade} />

          <View style={styles.header}>
            <TouchableOpacity
              style={styles.roundButton}
              onPress={openAppDrawer}
              activeOpacity={0.85}
            >
              <Text style={styles.menuIcon}>☰</Text>
            </TouchableOpacity>

            <View style={styles.headerTitleBox}>
              <Text style={styles.headerEyebrow}>SagipBayan</Text>
              <Text style={styles.headerTitle}>Digital Twin</Text>
            </View>

            <TouchableOpacity
              style={styles.roundButton}
              onPress={reloadSimulation}
              activeOpacity={0.85}
            >
              <Text style={styles.reloadIcon}>↻</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.statusPill}>
            <View style={styles.pulseDot} />
            <Text style={styles.statusText}>Live flood simulation</Text>
          </View>

          <View style={styles.bottomControl}>
            <View>
              <Text style={styles.bottomLabel}>Current View</Text>
              <Text style={styles.bottomTitle}>Real-time Water Level Model</Text>
            </View>

            <TouchableOpacity
              style={styles.focusButton}
              onPress={toggleControls}
              activeOpacity={0.85}
            >
              <Text style={styles.focusButtonText}>Focus</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {!hasError && !controlsVisible && (
        <TouchableOpacity
          style={styles.showControlsButton}
          onPress={toggleControls}
          activeOpacity={0.85}
        >
          <Text style={styles.showControlsText}>Show Controls</Text>
        </TouchableOpacity>
      )}

      {loading && !hasError && (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color="#f97316" />

            <Text style={styles.loadingTitle}>Loading Digital Twin</Text>

            <Text style={styles.loadingSubtitle}>
              Preparing the Unity flood simulation...
            </Text>
          </View>
        </View>
      )}

      {hasError && (
        <View style={styles.errorScreen}>
          <TouchableOpacity
            style={styles.errorMenuButton}
            onPress={openAppDrawer}
            activeOpacity={0.85}
          >
            <Text style={styles.menuIcon}>☰</Text>
          </TouchableOpacity>

          <View style={styles.errorContent}>
            <View style={styles.errorIconCircle}>
              <Text style={styles.errorIcon}>!</Text>
            </View>

            <Text style={styles.errorTitle}>Digital Twin unavailable</Text>

            <Text style={styles.errorMessage}>
              The Unity WebGL simulation could not be loaded. Please check your
              internet connection or verify the Digital Twin link.
            </Text>

            <TouchableOpacity
              style={styles.retryButton}
              onPress={reloadSimulation}
              activeOpacity={0.85}
            >
              <Text style={styles.retryButtonText}>Reload Simulation</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.drawerButton}
              onPress={openAppDrawer}
              activeOpacity={0.85}
            >
              <Text style={styles.drawerButtonText}>Open Menu</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const ORANGE = "#f97316";
const GREEN = "#84cc16";
const GLASS = "rgba(9, 12, 10, 0.72)";
const GLASS_BORDER = "rgba(255, 255, 255, 0.16)";

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
  },

  webview: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000000",
  },

  topFade: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 170,
    backgroundColor: "rgba(0, 0, 0, 0.42)",
    zIndex: 2,
  },

  bottomFade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 170,
    backgroundColor: "rgba(0, 0, 0, 0.38)",
    zIndex: 2,
  },

  header: {
    position: "absolute",
    top: Platform.OS === "android" ? 38 : 50,
    left: 14,
    right: 14,
    zIndex: 10,
    flexDirection: "row",
    alignItems: "center",
  },

  roundButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: GLASS,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    justifyContent: "center",
    alignItems: "center",
  },

  menuIcon: {
    color: "#ffffff",
    fontSize: 22,
    fontWeight: "900",
  },

  reloadIcon: {
    color: "#ffffff",
    fontSize: 23,
    fontWeight: "900",
  },

  headerTitleBox: {
    flex: 1,
    alignItems: "center",
    marginHorizontal: 10,
  },

  headerEyebrow: {
    color: "rgba(255,255,255,0.62)",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.4,
  },

  headerTitle: {
    color: "#ffffff",
    fontSize: 19,
    fontWeight: "900",
    marginTop: 2,
  },

  statusPill: {
    position: "absolute",
    top: Platform.OS === "android" ? 98 : 110,
    alignSelf: "center",
    zIndex: 10,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: GLASS,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
  },

  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: GREEN,
    marginRight: 8,
  },

  statusText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900",
  },

  bottomControl: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: Platform.OS === "android" ? 22 : 34,
    zIndex: 10,
    backgroundColor: GLASS,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  bottomLabel: {
    color: "rgba(255,255,255,0.58)",
    fontSize: 11,
    fontWeight: "800",
    marginBottom: 3,
  },

  bottomTitle: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
  },

  focusButton: {
    backgroundColor: ORANGE,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 999,
  },

  focusButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
  },

  showControlsButton: {
    position: "absolute",
    right: 14,
    bottom: Platform.OS === "android" ? 22 : 34,
    zIndex: 20,
    backgroundColor: ORANGE,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 999,
  },

  showControlsText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
  },

  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 30,
    backgroundColor: "rgba(0, 0, 0, 0.76)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 26,
  },

  loadingCard: {
    width: "100%",
    maxWidth: 320,
    backgroundColor: "rgba(12, 15, 13, 0.94)",
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    borderRadius: 28,
    paddingVertical: 32,
    paddingHorizontal: 22,
    alignItems: "center",
  },

  loadingTitle: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "900",
    marginTop: 16,
  },

  loadingSubtitle: {
    color: "rgba(255,255,255,0.62)",
    fontSize: 13,
    textAlign: "center",
    marginTop: 6,
  },

  errorScreen: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 40,
    backgroundColor: "#050806",
  },

  errorMenuButton: {
    position: "absolute",
    top: Platform.OS === "android" ? 38 : 50,
    left: 14,
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: GLASS,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 45,
  },

  errorContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 28,
  },

  errorIconCircle: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: "rgba(239,68,68,0.16)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.32)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 18,
  },

  errorIcon: {
    color: "#fca5a5",
    fontSize: 36,
    fontWeight: "900",
  },

  errorTitle: {
    color: "#ffffff",
    fontSize: 22,
    fontWeight: "900",
    textAlign: "center",
    marginBottom: 8,
  },

  errorMessage: {
    color: "rgba(255,255,255,0.62)",
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
    marginBottom: 24,
  },

  retryButton: {
    width: "100%",
    backgroundColor: ORANGE,
    paddingVertical: 15,
    borderRadius: 18,
    alignItems: "center",
    marginBottom: 11,
  },

  retryButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
  },

  drawerButton: {
    width: "100%",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    paddingVertical: 15,
    borderRadius: 18,
    alignItems: "center",
  },

  drawerButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
  },
});