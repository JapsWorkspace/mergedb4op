import React, { useState, useRef, useContext, useEffect, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import api from "../lib/api";
import { UserContext } from "./UserContext";
import { isValidEmail, normalizeEmail } from "./utils/validation";

const OTP_LENGTH = 6;

export default function VerifyOtp({ route, navigation }) {
  const safeEmail = normalizeEmail(route?.params?.email);
  const purpose = route?.params?.purpose;
  const userId = route?.params?.userId;
  const [otp, setOtp] = useState(new Array(OTP_LENGTH).fill(""));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { setUser } = useContext(UserContext);
  const inputsRef = useRef([]);
  const [timeLeft, setTimeLeft] = useState(5 * 60);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!isValidEmail(safeEmail)) {
      Alert.alert("Invalid Request", "A valid email is required to verify OTP.", [
        { text: "OK", onPress: () => navigation.replace("LogIn") },
      ]);
    }
  }, [navigation, safeEmail]);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          Alert.alert(
            "OTP Expired",
            "Your OTP has expired. Please request a new one."
          );
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, []);

  const formatTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs < 10 ? "0" : ""}${secs}`;
  };

  const enteredOtp = useMemo(() => otp.join(""), [otp]);
  const canSubmit =
    enteredOtp.length === OTP_LENGTH &&
    /^\d{6}$/.test(enteredOtp) &&
    timeLeft > 0 &&
    !isSubmitting &&
    isValidEmail(safeEmail);

  const handleChange = (text, index) => {
    const digit = String(text || "").replace(/\D/g, "").slice(-1);
    const nextOtp = [...otp];
    nextOtp[index] = digit;
    setOtp(nextOtp);

    if (digit && index < OTP_LENGTH - 1) {
      inputsRef.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (key, index) => {
    if (key === "Backspace" && !otp[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  };

  const handleSubmit = async () => {
    if (!canSubmit) {
      Alert.alert("Error", "Please enter the full 6-digit OTP.");
      return;
    }

    try {
      setIsSubmitting(true);
      const verifyResponse = await api.post("/user/verify-otp", {
        email: safeEmail,
        userId,
        otp: enteredOtp,
        purpose,
      });

      if (purpose === "passwordReset") {
        let resetUserId = userId;

        if (!resetUserId) {
          const res = await api.get("/user/users");
          const users = Array.isArray(res.data) ? res.data : [];
          const user = users.find(
            (item) => normalizeEmail(item?.email) === safeEmail
          );
          resetUserId = user?._id || user?.id;
        }

        if (!resetUserId) {
          Alert.alert("Error", "Account not found after OTP verification.");
          return;
        }

        Alert.alert("Success", "OTP verified.");
        navigation.replace("PasswordReset", {
          email: safeEmail,
          userId: resetUserId,
          resetToken: verifyResponse?.data?.resetToken,
        });
        return;
      }

      Alert.alert("Success", "OTP verified.");

      const res = await api.get("/user/users");
      const users = Array.isArray(res.data) ? res.data : [];
      const user = users.find(
        (item) => normalizeEmail(item?.email) === safeEmail
      );

      if (!user) {
        Alert.alert("Error", "User not found after OTP verification.");
        return;
      }

      setUser(user);
    } catch (err) {
      Alert.alert("Error", err?.response?.data?.message || "Invalid OTP.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 18 : 0}
    >
      <View style={styles.blobTop} />
      <View style={styles.blobBottom} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.container}
      >
        <View style={styles.card}>
          <View style={styles.iconCircle}>
            <Ionicons name="keypad-outline" size={36} color="#1F5F3B" />
          </View>

          <Text style={styles.title}>Almost there</Text>
          <Text style={styles.subtitle}>
            Please enter the 6-digit code sent to your account for verification.
          </Text>
          <Text style={styles.destination} numberOfLines={1}>
            {safeEmail || "Account unavailable"}
          </Text>

          <View style={styles.otpContainer}>
            {otp.map((digit, index) => (
              <TextInput
                key={index}
                ref={(el) => {
                  inputsRef.current[index] = el;
                }}
                style={[styles.otpBox, digit && styles.otpBoxFilled]}
                keyboardType="number-pad"
                maxLength={1}
                value={digit}
                onChangeText={(text) => handleChange(text, index)}
                onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, index)}
                textAlign="center"
              />
            ))}
          </View>

          <TouchableOpacity
            style={[styles.button, !canSubmit && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={!canSubmit}
          >
            {isSubmitting ? <ActivityIndicator color="#FFFFFF" size="small" /> : null}
            <Text style={styles.buttonText}>
              {isSubmitting ? "Verifying..." : "Verify"}
            </Text>
          </TouchableOpacity>

          <Text style={styles.timerText}>
            Request new code in {formatTime(timeLeft)}s
          </Text>
          <Text style={styles.resendText}>Didn't receive any code? Resend Again</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F7FAF8",
  },
  blobTop: {
    position: "absolute",
    top: -90,
    right: -80,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "#DDEEE3",
  },
  blobBottom: {
    position: "absolute",
    bottom: -130,
    left: -110,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: "rgba(31,95,59,0.1)",
  },
  container: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 22,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 34,
    paddingHorizontal: 20,
    paddingVertical: 28,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E4E7EC",
    shadowColor: "#123524",
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
  },
  iconCircle: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: "#DDEEE3",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  title: {
    color: "#123524",
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "900",
    textAlign: "center",
  },
  subtitle: {
    marginTop: 8,
    color: "#667085",
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "600",
    textAlign: "center",
  },
  destination: {
    marginTop: 8,
    color: "#1F5F3B",
    fontSize: 13,
    fontWeight: "900",
    maxWidth: "90%",
  },
  otpContainer: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    marginTop: 26,
    marginBottom: 24,
  },
  otpBox: {
    width: 44,
    height: 52,
    borderWidth: 1,
    borderColor: "#E4E7EC",
    backgroundColor: "#F7FAF8",
    color: "#123524",
    textAlign: "center",
    fontSize: 20,
    fontWeight: "900",
    borderRadius: 15,
  },
  otpBoxFilled: {
    borderColor: "#1F5F3B",
    backgroundColor: "#FFFFFF",
  },
  button: {
    minHeight: 56,
    borderRadius: 22,
    backgroundColor: "#1F5F3B",
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    shadowColor: "#1F5F3B",
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  buttonDisabled: {
    opacity: 0.55,
    shadowOpacity: 0,
    elevation: 0,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
  },
  timerText: {
    color: "#667085",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 16,
  },
  resendText: {
    color: "#1F5F3B",
    fontSize: 13,
    fontWeight: "900",
    marginTop: 10,
    textAlign: "center",
  },
});
