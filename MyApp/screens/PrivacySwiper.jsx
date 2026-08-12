import { useRef, useState } from "react";
import {
  View,
  FlatList,
  Text,
  TouchableOpacity,
  Dimensions,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import DataPrivacy from "./DataPrivacy";
import TermsCondition from "./TermsCondition";

const { width } = Dimensions.get("window");

export default function PrivacySwiper({ navigation }) {
  const ref = useRef(null);
  const [index, setIndex] = useState(0);
  const [accepted, setAccepted] = useState(false);

  const handleNext = async () => {
    if (index === 0) {
      ref.current?.scrollToIndex({ index: 1, animated: true });
    } else if (accepted) {
      await AsyncStorage.multiSet([
        ["hasSeenGetStarted", "true"],
        ["getStartedSeen", "true"],
        ["hasAcceptedPrivacy", "true"],
        ["hasAcceptedDataPrivacy", "true"],
        ["privacyAccepted", "true"],
        ["hasAcceptedTerms", "true"],
        ["termsAccepted", "true"],
        ["onboardingComplete", "true"],
      ]);
      navigation.replace("RegisterFlow");
    }
  };

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.screen}>
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()} activeOpacity={0.78}>
          <Ionicons name="chevron-back" size={22} color="#1F5F3B" />
        </TouchableOpacity>

        <Text style={styles.title}>
          {index === 0 ? "Data Privacy Policy" : "Terms and Conditions"}
        </Text>

        <View style={{ width: 40 }} />
      </View>

      <View style={styles.dots}>
        {[0, 1].map((item) => (
          <View key={item} style={[styles.dot, index === item && styles.activeDot]} />
        ))}
      </View>

      <FlatList
        ref={ref}
        data={["privacy", "terms"]}
        keyExtractor={(item) => item}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(event) => {
          setIndex(Math.round(event.nativeEvent.contentOffset.x / width));
        }}
        renderItem={({ item }) => (
          <View style={{ width, flex: 1 }}>
            {item === "privacy" && <DataPrivacy />}
            {item === "terms" && (
              <TermsCondition accepted={accepted} setAccepted={setAccepted} />
            )}
          </View>
        )}
      />

      <TouchableOpacity
        style={[styles.cta, index === 1 && !accepted && styles.disabled]}
        disabled={index === 1 && !accepted}
        onPress={handleNext}
      >
        <Text style={styles.ctaText}>{index === 1 ? "I Agree" : "Next"}</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F4F8F5",
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DCE9D6",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#123524",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  title: {
    flex: 1,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "900",
    color: "#10251B",
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 8,
    marginBottom: 10,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#C9D8CE",
    marginHorizontal: 4,
  },
  activeDot: {
    backgroundColor: "#1F5F3B",
    width: 20,
  },
  cta: {
    marginHorizontal: 20,
    marginBottom: 18,
    minHeight: 52,
    backgroundColor: "#1F5F3B",
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaText: {
    color: "#FFFFFF",
    fontWeight: "900",
    fontSize: 15,
  },
  disabled: {
    opacity: 0.5,
  },
});
