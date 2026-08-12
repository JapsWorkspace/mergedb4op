import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import api from "../lib/api";
import useFormAutoScroll from "./hooks/useFormAutoScroll";
import { sanitizeEmailInput } from "./utils/validation";
import {
  hasInternetConnection,
  INTERNET_CONNECTION_MESSAGE,
  isNetworkRequestError,
} from "./utils/network";

const OTP_LENGTH = 6;
const RESEND_COOLDOWN_SECONDS = 30;
const RESEND_LOCKOUT_SECONDS = 5 * 60;
const MAX_RESEND_ATTEMPTS = 5;
async function ensureInternetConnection() {
  if (!(await hasInternetConnection())) {
    Alert.alert("No internet connection", INTERNET_CONNECTION_MESSAGE);
    return false;
  }
  return true;
}

export default function EmailVerifyer({ navigation }) {
  const [step, setStep] = useState("identify");
  const [identifier, setIdentifier] = useState("");
  const [lookupResult, setLookupResult] = useState(null);
  const [selectedChannel, setSelectedChannel] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendLockout, setResendLockout] = useState(0);
  const [resendAttempts, setResendAttempts] = useState(0);
  const { scrollRef, registerInput, scrollToInput } = useFormAutoScroll(36);
  const otpInputRef = useRef(null);

  const options = useMemo(
    () => (Array.isArray(lookupResult?.options) ? lookupResult.options : []),
    [lookupResult]
  );

  useEffect(() => {
    if (resendCooldown <= 0) return undefined;

    const timerId = setInterval(() => {
      setResendCooldown((value) => Math.max(0, value - 1));
    }, 1000);

    return () => clearInterval(timerId);
  }, [resendCooldown]);

  useEffect(() => {
    if (resendLockout <= 0) return undefined;

    const timerId = setInterval(() => {
      setResendLockout((value) => {
        const nextValue = Math.max(0, value - 1);

        if (nextValue <= 0) {
          setResendAttempts(0);
        }

        return nextValue;
      });
    }, 1000);

    return () => clearInterval(timerId);
  }, [resendLockout]);

  const lookupAccount = async () => {
    const cleanIdentifier = sanitizeEmailInput(identifier);

    if (!cleanIdentifier) {
      Alert.alert("Missing account", "Enter your email, username, or phone number.");
      return;
    }

    if (!(await ensureInternetConnection())) return;

    try {
      setLoading(true);
      const res = await api.post("/user/forgot-password/lookup", {
        identifier: cleanIdentifier,
      });
      const result = res?.data || {};

      if (!Array.isArray(result.options) || result.options.length === 0) {
        Alert.alert("No recovery method", "This account has no email or phone number.");
        return;
      }

      setLookupResult(result);
      setStep("choose");
    } catch (err) {
      if (isNetworkRequestError(err)) {
        Alert.alert("No internet connection", INTERNET_CONNECTION_MESSAGE);
        return;
      }
      Alert.alert(
        "Account not found",
        err.response?.data?.message || "We could not find that account."
      );
    } finally {
      setLoading(false);
    }
  };

  const formatLockoutTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${String(secs).padStart(2, "0")}`;
  };

  const sendOtp = async (channel, options = {}) => {
    if (!lookupResult?.userId || !channel) return;

    if (options.resend && resendLockout > 0) {
      Alert.alert(
        "Please wait",
        `Please wait ${formatLockoutTime(resendLockout)} before resending OTP.`
      );
      return;
    }

    if (options.resend && resendCooldown > 0) {
      return;
    }

    if (options.resend && resendAttempts >= MAX_RESEND_ATTEMPTS - 1) {
      setResendCooldown(0);
      setResendLockout(RESEND_LOCKOUT_SECONDS);
      Alert.alert("Please wait", "Please wait before resending OTP.");
      return;
    }

    if (!(await ensureInternetConnection())) return;

    try {
      setLoading(true);
      await api.post("/user/forgot-password/send-otp", {
        userId: lookupResult.userId,
        channel,
      });
      setSelectedChannel(channel);
      setOtp("");
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
      if (options.resend) {
        setResendAttempts((value) => value + 1);
      } else {
        setResendAttempts(0);
        setResendLockout(0);
      }
      setStep("otp");
      requestAnimationFrame(() => otpInputRef.current?.focus?.());
    } catch (err) {
      if (isNetworkRequestError(err)) {
        Alert.alert("No internet connection", INTERNET_CONNECTION_MESSAGE);
        return;
      }
      Alert.alert(
        "Unable to send OTP",
        err.response?.data?.message || "Please try again shortly."
      );
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    if (!lookupResult?.userId || !selectedChannel) return;

    if (!String(otp || "").trim()) {
      Alert.alert("Invalid code", "OTP cannot be empty");
      return;
    }

    if (!/^\d{6}$/.test(otp)) {
      Alert.alert("Invalid code", "Please enter the complete 6-digit OTP.");
      return;
    }

    try {
      setLoading(true);
      const res = await api.post("/user/forgot-password/verify-otp", {
        userId: lookupResult.userId,
        channel: selectedChannel,
        otp,
      });
      const result = res?.data || {};

      navigation.replace("PasswordReset", {
        userId: lookupResult.userId,
        resetToken: result.resetToken,
        channel: selectedChannel,
        email: identifier,
      });
    } catch (err) {
      Alert.alert("Verification failed", "Incorrect OTP try again");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.safe}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          ref={scrollRef}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.container}
        >
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()} activeOpacity={0.78}>
            <Ionicons name="chevron-back" size={22} color="#1F5F3B" />
          </TouchableOpacity>

          <View style={styles.card}>
            {step === "identify" && (
              <>
                <Text style={styles.eyebrow}>Account Recovery</Text>
                <Text style={styles.title}>Find your account</Text>
                <Text style={styles.subtitle}>
                  Enter your email, username, or phone number to choose a verification method.
                </Text>

                <TextInput
                  placeholder="Email, username, or phone number"
                  value={identifier}
                  onChangeText={setIdentifier}
                  autoCapitalize="none"
                  autoCorrect={false}
                  onFocus={() => scrollToInput("identifier")}
                  onLayout={registerInput("identifier")}
                  maxLength={120}
                  style={styles.input}
                  placeholderTextColor="#7b867f"
                />

                <TouchableOpacity
                  style={[styles.button, loading && styles.buttonDisabled]}
                  onPress={lookupAccount}
                  disabled={loading}
                >
                  <Text style={styles.buttonText}>
                    {loading ? "Checking..." : "Continue"}
                  </Text>
                </TouchableOpacity>
              </>
            )}

            {step === "choose" && (
              <>
                <Text style={styles.eyebrow}>Account Recovery</Text>
                <Text style={styles.title}>Choose Verification Method</Text>
                <Text style={styles.subtitle}>
                  Please choose where you would like to receive your one-time password.
                </Text>

                {options.map((item) => (
                  <TouchableOpacity
                    key={item.channel}
                    style={styles.optionButton}
                    onPress={() => sendOtp(item.channel)}
                    disabled={loading}
                  >
                    <Ionicons
                      name={item.channel === "sms" ? "phone-portrait-outline" : "mail-outline"}
                      size={20}
                      color="#14532D"
                    />
                    <Text style={styles.optionText}>{item.label}</Text>
                  </TouchableOpacity>
                ))}
              </>
            )}

            {step === "otp" && (
              <>
                <Text style={styles.eyebrow}>Verification</Text>
                <Text style={styles.title}>Enter OTP</Text>
                <Text style={styles.subtitle}>
                  We sent a 6-digit code by {selectedChannel === "sms" ? "SMS" : "Email"}.
                </Text>

                <TextInput
                  ref={otpInputRef}
                  placeholder="6-digit code"
                  value={otp}
                  onChangeText={(value) =>
                    setOtp(String(value || "").replace(/\D/g, "").slice(0, OTP_LENGTH))
                  }
                  keyboardType="number-pad"
                  maxLength={OTP_LENGTH}
                  style={[styles.input, styles.otpInput]}
                  placeholderTextColor="#7b867f"
                />

                <TouchableOpacity
                  style={[
                    styles.button,
                    loading && styles.buttonDisabled,
                  ]}
                  onPress={verifyOtp}
                  disabled={loading}
                >
                  <Text style={styles.buttonText}>
                    {loading ? "Verifying..." : "Verify OTP"}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.linkButton,
                    (loading || resendCooldown > 0 || resendLockout > 0) &&
                      styles.linkButtonDisabled,
                  ]}
                  onPress={() => sendOtp(selectedChannel, { resend: true })}
                  disabled={loading || resendCooldown > 0 || resendLockout > 0}
                >
                  <Text
                    style={[
                      styles.linkButtonText,
                      (loading || resendCooldown > 0 || resendLockout > 0) &&
                        styles.linkButtonTextDisabled,
                    ]}
                  >
                    {resendLockout > 0
                      ? `Please wait ${formatLockoutTime(resendLockout)} before resending OTP`
                      : resendCooldown > 0
                        ? `Resend available in ${resendCooldown}s`
                        : "Resend code"}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#F4F8F2",
  },
  container: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 20,
  },
  backButton: {
    position: "absolute",
    top: 18,
    left: 20,
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
  card: {
    borderRadius: 24,
    backgroundColor: "#FFFFFF",
    padding: 22,
    borderWidth: 1,
    borderColor: "#E1EAE4",
  },
  eyebrow: {
    color: "#1D6B41",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  title: {
    marginTop: 6,
    color: "#10251B",
    fontSize: 24,
    fontWeight: "900",
  },
  subtitle: {
    marginTop: 8,
    marginBottom: 20,
    color: "#647067",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
  },
  input: {
    borderWidth: 1,
    borderColor: "#CBD8CF",
    borderRadius: 16,
    padding: 14,
    backgroundColor: "#FBFDFC",
    marginBottom: 14,
  },
  otpInput: {
    textAlign: "center",
    fontSize: 20,
    letterSpacing: 0,
  },
  button: {
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: "#14532D",
    alignItems: "center",
    justifyContent: "center",
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  buttonText: {
    color: "#FFFFFF",
    fontWeight: "900",
  },
  optionButton: {
    minHeight: 56,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#DCE7DD",
    backgroundColor: "#FBFDFC",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    marginBottom: 12,
    gap: 10,
  },
  optionText: {
    flex: 1,
    color: "#10251B",
    fontWeight: "800",
  },
  linkButton: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  linkButtonDisabled: {
    opacity: 0.62,
  },
  linkButtonText: {
    color: "#14532D",
    fontWeight: "900",
  },
  linkButtonTextDisabled: {
    color: "#7b867f",
  },
});
