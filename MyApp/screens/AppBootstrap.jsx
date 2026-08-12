import { useContext, useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  SafeAreaView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { StatusBar } from "expo-status-bar";
import { UserContext } from "./UserContext";

const BrandMark = require("../stores/assets/slogowhite.png");

const SPLASH_MIN_MS = 4200;
const BRAND_EASE = Easing.bezier(0.16, 1, 0.3, 1);

export default function AppBootstrap({ navigation }) {
  const { user } = useContext(UserContext) || {};
  const { width, height } = useWindowDimensions();
  const screenScale = Math.min(Math.max(Math.min(width / 390, height / 844), 0.88), 1.14);
  const stageWidth = Math.min(width - 24, 390);
  const fade = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.96)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const brandProgress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, {
        toValue: 1,
        duration: 760,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        friction: 8,
        tension: 58,
        useNativeDriver: true,
      }),
    ]).start();

    Animated.sequence([
      Animated.delay(2000),
      Animated.timing(brandProgress, {
        toValue: 1,
        duration: 1100,
        easing: BRAND_EASE,
        useNativeDriver: true,
      }),
    ]).start();

    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1350,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1350,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );

    pulseLoop.start();
    return () => pulseLoop.stop();
  }, [brandProgress, fade, pulse, scale]);

  useEffect(() => {
    let active = true;

    const boot = async () => {
      const startedAt = Date.now();

      if (user?._id || user?.id) {
        return;
      }

      const getStartedSeen =
        (await AsyncStorage.getItem("hasSeenGetStarted")) ||
        (await AsyncStorage.getItem("getStartedSeen"));
      const privacyAccepted =
        (await AsyncStorage.getItem("hasAcceptedPrivacy")) ||
        (await AsyncStorage.getItem("hasAcceptedDataPrivacy")) ||
        (await AsyncStorage.getItem("privacyAccepted"));
      const termsAccepted =
        (await AsyncStorage.getItem("hasAcceptedTerms")) ||
        (await AsyncStorage.getItem("termsAccepted"));
      const hasCreatedAccount =
        (await AsyncStorage.getItem("hasAccount")) ||
        (await AsyncStorage.getItem("hasCreatedAccount"));
      const onboardingComplete = await AsyncStorage.getItem("onboardingComplete");

      let nextRoute = "LogIn";

      if (hasCreatedAccount === "true" || onboardingComplete === "true") {
        nextRoute = "LogIn";
      } else if (getStartedSeen !== "true") {
        nextRoute = "GetStarted";
      } else if (privacyAccepted !== "true" || termsAccepted !== "true") {
        nextRoute = "PrivacyGate";
      }

      const remaining = Math.max(0, SPLASH_MIN_MS - (Date.now() - startedAt));

      setTimeout(() => {
        if (active) navigation.replace(nextRoute);
      }, remaining);
    };

    boot();

    return () => {
      active = false;
    };
  }, [navigation, user?._id, user?.id]);

  const finalScale = Math.min(screenScale, Math.max((width - 44) / 380, 0.78));
  const logoSize = 190 * finalScale;
  const logoWrapSize = 224 * finalScale;
  const glowSize = 216 * finalScale;
  const wordFontSize = Math.min(48 * finalScale, (stageWidth - 158 * finalScale) / 5.25);
  const wordLineHeight = wordFontSize * 1.16;
  const taglineFontSize = Math.min(12.5 * finalScale, wordFontSize * 0.28);
  const taglineLineHeight = taglineFontSize * 1.42;
  const lockupVisualBiasX = -6 * finalScale;
  const finalLogoCenterX = stageWidth / 2 - 104 * finalScale + lockupVisualBiasX;
  const wordLeft = finalLogoCenterX + 54 * finalScale;
  const wordWidth = Math.max(stageWidth - wordLeft, 170 * finalScale);
  const stageHeight = 218 * finalScale;
  const logoShift = finalLogoCenterX - stageWidth / 2;
  const loaderSize = 64 * finalScale;

  const pulseScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.055],
  });
  const pulseOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.24, 0.09],
  });
  const logoTranslateX = brandProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, logoShift],
  });
  const logoScale = brandProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [1.04, 0.98],
  });
  const textTranslateX = brandProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [62 * finalScale, 0],
  });
  const textOpacity = brandProgress.interpolate({
    inputRange: [0, 0.34, 1],
    outputRange: [0, 0, 1],
  });
  const textScale = brandProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.985, 1],
  });
  const textGlowScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.025],
  });
  const taglineTranslateY = brandProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [8 * finalScale, 0],
  });
  const loadingOpacity = fade.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.92],
  });

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />

      <Animated.View style={[styles.content, { opacity: fade, transform: [{ scale }] }]}>
        <View style={[styles.brandStage, { width: stageWidth, height: stageHeight }]}>
          <Animated.View
            style={[
              styles.logoWrap,
              {
                width: logoWrapSize,
                height: logoWrapSize,
                transform: [
                  { translateX: logoTranslateX },
                  { scale: logoScale },
                ],
              },
            ]}
          >
            <Animated.Image
              source={BrandMark}
              resizeMode="contain"
              style={[
                styles.logoGlow,
                {
                  width: glowSize,
                  height: glowSize,
                  opacity: pulseOpacity,
                  transform: [{ scale: pulseScale }],
                },
              ]}
            />
            <Image
              source={BrandMark}
              style={[styles.logoImage, { width: logoSize, height: logoSize }]}
              resizeMode="contain"
            />
          </Animated.View>

          <Animated.View
            style={[
              styles.wordClip,
              {
                left: wordLeft,
                width: wordWidth,
                height: 146 * finalScale,
                opacity: textOpacity,
                transform: [{ translateX: textTranslateX }, { scale: textScale }],
              },
            ]}
          >
            <Animated.View style={[styles.wordInner, { height: 146 * finalScale }]}>
              <Animated.Text
                style={[
                  styles.wordGlow,
                  {
                    fontSize: wordFontSize,
                    lineHeight: wordLineHeight,
                    textShadowRadius: 24 * finalScale,
                    opacity: pulseOpacity,
                    transform: [{ scale: textGlowScale }],
                  },
                ]}
              >
                agipBayan
              </Animated.Text>
              <Text
                style={[
                  styles.wordText,
                  { fontSize: wordFontSize, lineHeight: wordLineHeight },
                ]}
              >
                agipBayan
              </Text>
            </Animated.View>
          </Animated.View>
        </View>

        <Animated.View
          style={[
            styles.loadingWrap,
            {
              width: loaderSize,
              height: loaderSize,
              marginTop: 26 * finalScale,
              opacity: loadingOpacity,
            },
          ]}
        >
          <View style={[styles.loadingShell, { width: loaderSize, height: loaderSize }]}>
            <ActivityIndicator size="large" color="#F0C94A" />
          </View>
        </Animated.View>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#047857",
    overflow: "hidden",
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  brandStage: {
    alignItems: "center",
    justifyContent: "center",
  },
  logoWrap: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  logoGlow: {
    position: "absolute",
    tintColor: "#F0C94A",
  },
  logoImage: {},
  wordClip: {
    position: "absolute",
    overflow: "hidden",
    justifyContent: "center",
  },
  wordInner: {
    justifyContent: "center",
  },
  wordGlow: {
    position: "absolute",
    left: 0,
    color: "#F0C94A",
    fontWeight: "900",
    textShadowColor: "#F0C94A",
    textShadowOffset: { width: 0, height: 0 },
  },
  wordText: {
    color: "#FFFFFF",
    fontWeight: "900",
    textShadowColor: "rgba(0,0,0,0.12)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  tagline: {
    marginTop: 5,
    color: "rgba(240,201,74,0.9)",
    fontWeight: "800",
  },
  loadingWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  loadingShell: {
    alignItems: "center",
    justifyContent: "center",
  },
});