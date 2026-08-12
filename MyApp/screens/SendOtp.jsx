import { useState } from "react";
import {
  Button,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import api from "../lib/api";
import useFormAutoScroll from "./hooks/useFormAutoScroll";
import {
  isValidEmail,
  normalizeEmail,
  sanitizeEmailInput,
} from "./utils/validation";

export default function SendOtp({ navigation }) {
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const { scrollRef, registerInput, scrollToInput } = useFormAutoScroll(36);

  const handleEmail = (text) => {
    const rawEmail = sanitizeEmailInput(text).slice(0, 120);
    const cleanEmail = normalizeEmail(rawEmail);
    setEmail(rawEmail);
    setMessage("");

    if (!rawEmail) {
      setEmailError("Email is required.");
    } else if (!isValidEmail(cleanEmail)) {
      setEmailError("Enter a valid email address.");
    } else {
      setEmailError("");
    }
  };

  const handleEnter = () => {
    if (!email || emailError) {
      setMessage("Please enter a valid email.");
      return;
    }

    setLoading(true);
    setMessage("");

    api
      .post("/user/send-otp", { email: normalizeEmail(email) })
      .then((response) => {
        setMessage(response.data.message);
        navigation.navigate("VerifyOtp", { email: normalizeEmail(email) });
      })
      .catch((error) => {
        setMessage(error.response?.data?.message || "Server error");
      })
      .finally(() => {
        setLoading(false);
      });
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ flexGrow: 1, padding: 20, justifyContent: "center" }}
      >
        <Text>Enter Email</Text>

        <TextInput
          style={{
            height: 44,
            borderWidth: 1,
            borderColor: emailError ? "red" : "#ccc",
            marginBottom: 5,
            padding: 8,
            borderRadius: 10,
          }}
          placeholder="Email"
          value={email}
          onChangeText={handleEmail}
          onFocus={() => scrollToInput("email")}
          onLayout={registerInput("email")}
          autoCapitalize="none"
          keyboardType="email-address"
          autoCorrect={false}
          maxLength={120}
        />

        {emailError ? (
          <Text style={{ color: "red", marginBottom: 10 }}>{emailError}</Text>
        ) : null}

        <Button
          title={loading ? "Sending..." : "Send OTP"}
          onPress={handleEnter}
          disabled={loading || !!emailError || !email}
        />

        {message ? <Text style={{ marginTop: 10 }}>{message}</Text> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
