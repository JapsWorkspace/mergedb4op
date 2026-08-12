import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";

import styles from "../../Designs/StepSecurity";
import PasswordStrengthMeter from "../components/PasswordStrengthMeter";
import useFormAutoScroll from "../hooks/useFormAutoScroll";
import { getPasswordError } from "../utils/validation";

export default function StepSecurity({
  password: initialPassword = "",
  confirmPassword: initialConfirmPassword = "",
  onPasswordChange = () => {},
  onConfirmChange = () => {},
  onNext = () => {},
  onValidChange = () => {},
  onBack = () => {},
}) {
  const navigation = useNavigation();

  /* ================= LOCAL STATE ================= */
  const [password, setPassword] = useState(initialPassword);
  const [confirmPassword, setConfirmPassword] = useState(
    initialConfirmPassword
  );

  const [focused, setFocused] = useState({
    password: false,
    confirm: false,
  });

  const setFocus = (field, value) =>
    setFocused((prev) => ({ ...prev, [field]: value }));

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const { scrollRef, contentRef, registerInput, registerField, scrollToInput, handleScroll } =
    useFormAutoScroll(230);

  /* ================= CLEAN VALUES ================= */
  const cleanPassword = password.trim();
  const cleanConfirm = confirmPassword.trim();

  /* ================= SYNC TO PARENT ================= */
  useEffect(() => {
    onPasswordChange(cleanPassword);
  }, [cleanPassword, onPasswordChange]);

  useEffect(() => {
    onConfirmChange(cleanConfirm);
  }, [cleanConfirm, onConfirmChange]);

  /* ================= VALIDATION ================= */
  const passwordError = useMemo(() => {
    return getPasswordError(cleanPassword);
  }, [cleanPassword]);

  const confirmError = useMemo(() => {
    if (!cleanConfirm) return "";
    if (cleanConfirm !== cleanPassword)
      return "Passwords do not match.";
    return "";
  }, [cleanConfirm, cleanPassword]);

  const canProceed =
    cleanPassword.length >= 8 &&
    !passwordError &&
    !confirmError &&
    cleanConfirm === cleanPassword;

  /* ================= SYNC VALID STATE (FIXED) ================= */
  useEffect(() => {
    if (typeof onValidChange === "function") {
      onValidChange(canProceed);
    }
  }, [canProceed, onValidChange]);

  /* ================= NEXT ================= */
  const handleNext = () => {
    if (!canProceed) return;

    onNext({
      password: cleanPassword,
      confirmPassword: cleanConfirm,
    });
  };

  const handleBack = () => {
    if (onBack) return onBack();
    navigation.goBack();
  };

  /* ================= UI ================= */
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 60 : 0}
    >
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{
          flexGrow: 1,
          padding: 24,
          paddingBottom: 260,
          backgroundColor: "#fff",
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        <View ref={contentRef} collapsable={false}>
        <Image
          source={require("../../stores/assets/application2.png")}
          style={styles.image}
          resizeMode="contain"
        />

        <Text style={styles.title}>Security Setup</Text>

        <View
          ref={registerField("password")}
          collapsable={false}
          style={styles.fieldContainer}
        >
          <Text style={styles.label}>Password</Text>
          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#6B7280"
              secureTextEntry={!showPassword}
              textContentType="newPassword"
              autoComplete="new-password"
              importantForAutofill="yes"
              selectionColor="#166534"
              cursorColor="#166534"
              value={password}
              onFocus={() => {
                setFocus("password", true);
                scrollToInput("password");
              }}
              onLayout={registerInput("password")}
              onBlur={() => setFocus("password", false)}
              onChangeText={setPassword}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={64}
            />

            <TouchableOpacity
              onPress={() => setShowPassword((p) => !p)}
              style={styles.eyeIcon}
            >
              <Ionicons
                name={showPassword ? "eye-off" : "eye"}
                size={22}
                color="#6B7280"
              />
            </TouchableOpacity>
          </View>
          {focused.password && passwordError ? (
            <Text style={styles.error}>{passwordError}</Text>
          ) : null}
          <PasswordStrengthMeter
            password={cleanPassword}
            textColor="#4B5563"
            mutedColor="#9CA3AF"
            surfaceColor="#F3F4F6"
            borderColor="#E5E7EB"
          />
        </View>

        <View
          ref={registerField("confirm")}
          collapsable={false}
          style={styles.fieldContainer}
        >
          <Text style={styles.label}>Confirm Password</Text>
          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.input}
              placeholder="Confirm Password"
              placeholderTextColor="#6B7280"
              secureTextEntry={!showConfirm}
              textContentType="newPassword"
              autoComplete="new-password"
              importantForAutofill="yes"
              selectionColor="#166534"
              cursorColor="#166534"
              value={confirmPassword}
              onFocus={() => {
                setFocus("confirm", true);
                scrollToInput("confirm");
              }}
              onLayout={registerInput("confirm")}
              onBlur={() => setFocus("confirm", false)}
              onChangeText={setConfirmPassword}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={64}
            />

            <TouchableOpacity
              onPress={() => setShowConfirm((p) => !p)}
              style={styles.eyeIcon}
            >
              <Ionicons
                name={showConfirm ? "eye-off" : "eye"}
                size={22}
                color="#6B7280"
              />
            </TouchableOpacity>
          </View>
          {focused.confirm && confirmError ? (
            <Text style={styles.error}>{confirmError}</Text>
          ) : null}
        </View>

        {/* NEXT */}
        <TouchableOpacity
          disabled={!canProceed}
          onPress={handleNext}
          style={[
            styles.button,
            !canProceed && { opacity: 0.5 },
          ]}
        >
          <Text style={styles.buttonText}>NEXT</Text>
        </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
