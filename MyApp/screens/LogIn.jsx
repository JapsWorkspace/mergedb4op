import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Dimensions,
  KeyboardAvoidingView,
  ImageBackground,
  Platform,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";

import api from "../lib/api";
import { COLORS, createLoginStyles } from "../Designs/LogIn";
import { UserContext } from "./UserContext";
import { sanitizeUsername } from "./utils/validation";

const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MS = 10 * 60 * 1000;
const LOGIN_LOCKOUT_MESSAGE =
  "Too many failed attempts. Login is locked for 10 minutes.";

export default function LogIn({ navigation }) {
  const initialMetrics = useRef(Dimensions.get("window")).current;
  const styles = useMemo(
    () => createLoginStyles(initialMetrics.width, initialMetrics.height),
    [initialMetrics.height, initialMetrics.width]
  );
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [staySignedIn] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [failedLoginAttempts, setFailedLoginAttempts] = useState(0);
  const [lockUntil, setLockUntil] = useState(0);
  const [lockRemainingMs, setLockRemainingMs] = useState(0);
  const [focusedField, setFocusedField] = useState(null);
  const usernameRef = useRef(null);
  const passwordRef = useRef(null);
  const usernameErrorAnim = useRef(new Animated.Value(0)).current;
  const passwordErrorAnim = useRef(new Animated.Value(0)).current;

  const { setUser } = useContext(UserContext);
  const isLoginLocked = lockUntil > Date.now() || lockRemainingMs > 0;

  useEffect(() => {
    if (!lockUntil) {
      setLockRemainingMs(0);
      return undefined;
    }

    const updateLockRemaining = () => {
      const remainingMs = Math.max(0, lockUntil - Date.now());
      setLockRemainingMs(remainingMs);

      if (remainingMs <= 0) {
        setLockUntil(0);
        setFailedLoginAttempts(0);
      }
    };

    updateLockRemaining();
    const timerId = setInterval(updateLockRemaining, 1000);

    return () => clearInterval(timerId);
  }, [lockUntil]);

  const runFieldErrorAnimation = (field) => {
    const target = field === "username" ? usernameErrorAnim : passwordErrorAnim;

    target.stopAnimation();
    target.setValue(0);

    Animated.sequence([
      Animated.timing(target, {
        toValue: 1,
        duration: 90,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      }),
      Animated.timing(target, {
        toValue: 0,
        duration: 520,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
    ]).start();
  };

  const showLoginError = (message, field = "both") => {
    setError(message);

    if (field === "username" || field === "both") {
      runFieldErrorAnimation("username");
    }

    if (field === "password" || field === "both") {
      runFieldErrorAnimation("password");
    }
  };

  const getAnimatedInputStyle = (anim, field) => {
    const baseBorderColor = focusedField === field ? COLORS.primary : COLORS.border;

    return {
      borderColor: anim.interpolate({
        inputRange: [0, 1],
        outputRange: [baseBorderColor, COLORS.danger],
      }),
      transform: [
        {
          translateX: anim.interpolate({
            inputRange: [0, 0.18, 0.36, 0.54, 0.72, 1],
            outputRange: [0, -8, 7, -5, 3, 0],
          }),
        },
      ],
    };
  };
  const getLoginErrorMessage = (err) => {
    const raw =
      err?.response?.data?.message ||
      err?.response?.data?.error ||
      err?.message ||
      "";
    const text = String(raw).toLowerCase();

    if (text.includes("verified")) {
      return "Please complete phone and email verification before signing in.";
    }

    if (err?.response?.status === 401 || text.includes("invalid")) {
      return "Invalid username or password";
    }

    if (text.includes("network") || text.includes("timeout")) {
      return "Please check your connection and try again.";
    }

    return raw || "Login failed. Please check your account.";
  };

  const validate = () => {
    if (!sanitizeUsername(username)) {
      showLoginError("Username is required", "username");
      return false;
    }

    if (!String(password || "").trim()) {
      showLoginError("Password is required", "password");
      return false;
    }

    return true;
  };

  const handleLogin = async () => {
    setError("");

    if (isSubmitting) return;

    if (isLoginLocked) {
      showLoginError(LOGIN_LOCKOUT_MESSAGE, "both");
      return;
    }

    if (!validate()) return;

    setIsSubmitting(true);

    try {
      const cleanUsername = sanitizeUsername(username);
      const res = await api.post("/user/login", {
        username: cleanUsername,
        password: String(password || "").trim(),
      });
      const data = res.data || {};

      if (data.twoFactor && data.email) {
        setFailedLoginAttempts(0);
        setLockUntil(0);
        setLockRemainingMs(0);
        navigation.navigate("VerifyOtp", {
          userId: data.userId,
          email: data.email,
          purpose: "two_factor",
        });
        await api.post("/user/send-otp", { email: data.email, purpose: "two_factor" });
        return;
      }

      if (!data.user?._id) {
        showLoginError("We could not complete sign-in. Please try again.", "both");
        return;
      }

      setUser({
        ...data.user,
        id: data.user._id,
      }, { persist: staySignedIn });

      setFailedLoginAttempts(0);
      setLockUntil(0);
      setLockRemainingMs(0);
      setUsername("");
      setPassword("");
    } catch (err) {
      const message = getLoginErrorMessage(err);
      const raw =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "";
      const isInvalidCredentials =
        err?.response?.status === 401 ||
        String(raw).toLowerCase().includes("invalid");

      if (isInvalidCredentials) {
        const nextAttempts = failedLoginAttempts + 1;
        setFailedLoginAttempts(nextAttempts);

        if (nextAttempts >= MAX_FAILED_LOGIN_ATTEMPTS) {
          setLockUntil(Date.now() + LOGIN_LOCKOUT_MS);
          showLoginError(LOGIN_LOCKOUT_MESSAGE, "both");
          return;
        }
      }

      showLoginError(message, "both");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 18 : 0}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
        >
          <ImageBackground
            source={require("../stores/assets/loginbg.png")}
            style={styles.heroBg}
            imageStyle={styles.heroImage}
            resizeMode="cover"
          >
            <View style={styles.heroOverlay} />
            <View pointerEvents="none" style={styles.heroDiagonalCut} />
            <View style={styles.heroContent}>
              <Text style={styles.heroTitle}>Welcome</Text>
              <Text style={styles.heroSubtitle}>Login to your account</Text>
            </View>
          </ImageBackground>

          <View style={styles.formCard}>
            <Animated.View
              style={[
                styles.inputShell,
                focusedField === "username" && styles.inputShellFocused,
                getAnimatedInputStyle(usernameErrorAnim, "username"),
              ]}
            >
              <Ionicons name="person-outline" size={18} color={COLORS.muted} />
              <TextInput
                ref={usernameRef}
                style={styles.inputField}
                placeholder="Username"
                placeholderTextColor={COLORS.placeholder}
                value={username}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                blurOnSubmit={false}
                onFocus={() => setFocusedField("username")}
                onBlur={() =>
                  setFocusedField((current) =>
                    current === "username" ? null : current
                  )
                }
                onChangeText={(text) => setUsername(sanitizeUsername(text))}
                onSubmitEditing={() => passwordRef.current?.focus()}
              />
            </Animated.View>

            <Animated.View
              style={[
                styles.inputShell,
                styles.passwordShell,
                focusedField === "password" && styles.inputShellFocused,
                getAnimatedInputStyle(passwordErrorAnim, "password"),
              ]}
            >
              <Ionicons name="lock-closed-outline" size={18} color={COLORS.muted} />
              <TextInput
                ref={passwordRef}
                style={styles.inputField}
                placeholder="Password"
                placeholderTextColor={COLORS.placeholder}
                secureTextEntry={!showPassword}
                value={password}
                returnKeyType="done"
                onSubmitEditing={handleLogin}
                onFocus={() => setFocusedField("password")}
                onBlur={() =>
                  setFocusedField((current) =>
                    current === "password" ? null : current
                  )
                }
                onChangeText={setPassword}
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowPassword((value) => !value)}
                activeOpacity={0.75}
              >
                <Ionicons
                  name={showPassword ? "eye-off-outline" : "eye-outline"}
                  size={18}
                  color={COLORS.muted}
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.forgotButton}
                onPress={() => navigation.navigate("EmailVerifyer")}
                activeOpacity={0.75}
              >
                <Text style={styles.forgotText}>FORGOT</Text>
              </TouchableOpacity>
            </Animated.View>

            {!!error && (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle-outline" size={16} color={COLORS.danger} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <TouchableOpacity
              style={[
                styles.loginButton,
                (isSubmitting || isLoginLocked) && styles.loginButtonDisabled,
              ]}
              onPress={handleLogin}
              disabled={isSubmitting || isLoginLocked}
              activeOpacity={0.88}
            >
              <LinearGradient
                colors={["#10B981", "#047857", "#035F46"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.buttonGradient}
              >
                {isSubmitting ? <ActivityIndicator color="#FFFFFF" size="small" /> : null}
                <Text style={styles.loginButtonText}>
                  {isSubmitting ? "LOGIN..." : "LOGIN"}
                </Text>
                {!isSubmitting ? (
                  <Ionicons name="arrow-forward-outline" size={21} color="#FFFFFF" />
                ) : null}
              </LinearGradient>
            </TouchableOpacity>

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            <TouchableOpacity
              style={styles.signupButton}
              onPress={() => navigation.navigate("DataPrivacy")}
              activeOpacity={0.84}
            >
              <Text style={styles.signupButtonText}>Sign Up</Text>
              <Ionicons name="person-add-outline" size={18} color={COLORS.primaryDark} />
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
