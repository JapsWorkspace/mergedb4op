import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import styles from "../../Designs/SignUpHeader";

const STEP_TITLES = [
  "Let's set up your profile",
  "Let's set up your address",
  "Let's set up your security",
  "Mobile registration",
];

export default function SignUpHeader({ step, onBack }) {
  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <TouchableOpacity style={styles.backButton} onPress={onBack} activeOpacity={0.78}>
          <Ionicons name="chevron-back" size={22} color="#1F5F3B" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Register Account</Text>

        <View style={styles.headerSpacer} />
      </View>

      <Text style={styles.stepTitle}>
        {STEP_TITLES[step] || STEP_TITLES[0]}
      </Text>
    </View>
  );
}
