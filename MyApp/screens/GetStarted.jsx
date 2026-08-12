// screens/GetStarted.jsx
import React, { useRef } from "react";
import {
  View,
  Text,
  Image,
  SafeAreaView,
  ScrollView,
  Animated,
  PanResponder,
  Easing,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import styles from "../Designs/GetStarted";

export default function GetStarted({ navigation, route }) {
  const nextRoute = route?.params?.nextRoute || "LogIn";

  const trackWidthRef = useRef(0);
  const KNOB_SIZE = 44;
  const PADDING = 6;
  const knobX = useRef(new Animated.Value(0)).current;

  const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

  const completeSwipe = () => {
    const max = trackWidthRef.current - (KNOB_SIZE + PADDING * 2);
    Animated.timing(knobX, {
      toValue: max,
      duration: 200,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start(async () => {
      await AsyncStorage.multiSet([
        ["hasSeenGetStarted", "true"],
        ["getStartedSeen", "true"],
      ]);
      navigation.navigate(nextRoute);
      knobX.setValue(0);
    });
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderMove: (_, g) => {
        const max = trackWidthRef.current - (KNOB_SIZE + PADDING * 2);
        knobX.setValue(clamp(g.dx, 0, max));
      },
      onPanResponderRelease: (_, g) => {
        const max = trackWidthRef.current - (KNOB_SIZE + PADDING * 2);
        const progress = clamp(g.dx, 0, max) / (max || 1);
        progress >= 0.7
          ? completeSwipe()
          : Animated.spring(knobX, {
              toValue: 0,
              useNativeDriver: false,
              bounciness: 6,
            }).start();
      },
    })
  ).current;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.background}>

        {/* BACKGROUND STRIPES */}
<View style={styles.stripeTop} />
<View style={styles.stripeMid} />
<View style={styles.stripeMid2} />
<View style={styles.stripeBottom} />

        <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
          <View style={styles.content}>

            <Image
              source={require("../stores/assets/slogowhite.png")}
              style={styles.logo}
              resizeMode="contain"
            />

            <Text style={styles.brandText}>Sagip Bayan</Text>

            <View style={styles.bottomDock}>
              <View
                style={styles.sliderTrack}
                onLayout={(e) =>
                  (trackWidthRef.current = e.nativeEvent.layout.width)
                }
              >
                <Animated.View
                  style={[
                    styles.sliderFill,
                    {
                      width: Animated.add(
                        knobX,
                        new Animated.Value(KNOB_SIZE + PADDING * 2)
                      ),
                    },
                  ]}
                />
                <Text style={styles.sliderLabel}>
                  Swipe to get started
                </Text>
                <Animated.View
                  {...pan.panHandlers}
                  style={[
                    styles.knob,
                    { transform: [{ translateX: knobX }] },
                  ]}
                >
                  <Text style={styles.knobArrow}>➔</Text>
                </Animated.View>
              </View>
            </View>

          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
