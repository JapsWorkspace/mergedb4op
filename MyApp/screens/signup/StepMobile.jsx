import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
} from "react-native";
import { useMemo, useState, useCallback } from "react";

import styles from "../../Designs/StepMobile";
import useFormAutoScroll from "../hooks/useFormAutoScroll";
import {
  getPhoneError,
  isValidGmail,
  normalizeEmail,
  sanitizeEmailInput,
  sanitizePhoneLocal,
} from "../utils/validation";

export default function StepMobile({
  phone = "",
  email = "",
  phoneError,
  emailError,
  onPhoneChange = () => {},
  onEmailChange = () => {},
  onBack,
  onSubmit,
  isSubmitting = false,
}) {
  const [submitError, setSubmitError] = useState("");
  const { scrollRef, contentRef, registerInput, registerField, scrollToInput, handleScroll } =
    useFormAutoScroll(230);

  const phoneErrorLocal = useMemo(() => getPhoneError(phone), [phone]);

  const emailErrorLocal = useMemo(() => {
    const cleanEmail = normalizeEmail(email);

    if (!cleanEmail) return "Email is required.";
    return isValidGmail(cleanEmail)
      ? ""
      : "Use a valid Gmail address ending in @gmail.com.";
  }, [email]);

  const canSubmit =
    Boolean(phone) &&
    Boolean(email) &&
    !phoneErrorLocal &&
    !emailErrorLocal &&
    !isSubmitting;

  const handlePhoneChange = useCallback(
    (text) => {
      setSubmitError("");
      onPhoneChange(sanitizePhoneLocal(text));
    },
    [onPhoneChange]
  );

  const handleEmailChange = useCallback(
    (text) => {
      setSubmitError("");
      onEmailChange(sanitizeEmailInput(text));
    },
    [onEmailChange]
  );

  const handleSubmit = async () => {
    if (!canSubmit) {
      setSubmitError("Please complete all fields correctly.");
      return;
    }

    if (!onSubmit) return;

    setSubmitError("");

    try {
      await onSubmit({
        phone: `63${sanitizePhoneLocal(phone)}`,
        email: normalizeEmail(email),
      });
    } catch (err) {
      const message =
        err?.message ||
        err?.response?.data?.message ||
        "Registration failed.";
      const lower = message.toLowerCase();

      if (lower.includes("email")) {
        setSubmitError("This email is already registered.");
      } else if (lower.includes("phone")) {
        setSubmitError("This phone number is already registered.");
      } else if (lower.includes("username")) {
        setSubmitError("This username is already taken.");
      } else {
        setSubmitError("Registration failed. Please try again.");
      }
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 60 : 0}
    >
      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{
          flexGrow: 1,
          padding: 20,
          paddingBottom: 260,
        }}
      >
        <View ref={contentRef} collapsable={false} style={styles.container}>
          <Image
            source={require("../../stores/assets/application3.png")}
            style={styles.image}
            resizeMode="contain"
          />

          <Text style={styles.title}>Contact Information</Text>

          {!!submitError && (
            <Text
              style={[
                styles.error,
                { textAlign: "center", fontWeight: "600" },
              ]}
            >
              {submitError}
            </Text>
          )}

          <View
            ref={registerField("phone")}
            collapsable={false}
            style={styles.fieldGroup}
          >
            <Text style={styles.label}>Mobile Number</Text>

            <View style={styles.inputCard}>
              <View style={styles.prefixBox}>
                <Text style={styles.prefixText}>+63</Text>
              </View>

              <TextInput
                style={styles.input}
                placeholder="9171234567"
                keyboardType="phone-pad"
                value={phone}
                onFocus={() => scrollToInput("phone")}
                onLayout={registerInput("phone")}
                onChangeText={handlePhoneChange}
                maxLength={10}
              />
            </View>

            {!!phoneErrorLocal && (
              <Text style={styles.error}>{phoneErrorLocal}</Text>
            )}

            {!phoneErrorLocal && !!phoneError && (
              <Text style={styles.error}>{phoneError}</Text>
            )}
          </View>

          <View
            ref={registerField("email")}
            collapsable={false}
            style={styles.fieldGroup}
          >
            <Text style={styles.label}>Email</Text>

            <View style={styles.inputCard}>
              <TextInput
                style={styles.input}
                placeholder="example@gmail.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                value={email}
                onFocus={() => scrollToInput("email")}
                onLayout={registerInput("email")}
                onChangeText={handleEmailChange}
                maxLength={120}
              />
            </View>

            {!!emailErrorLocal && (
              <Text style={styles.error}>{emailErrorLocal}</Text>
            )}

            {!emailErrorLocal && !!emailError && (
              <Text style={styles.error}>{emailError}</Text>
            )}
          </View>

          <TouchableOpacity
            style={[styles.button, !canSubmit && { opacity: 0.5 }]}
            disabled={!canSubmit}
            onPress={handleSubmit}
          >
            <Text style={styles.buttonText}>
              {isSubmitting ? "SUBMITTING..." : "SUBMIT"}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
