import React, { useMemo, useState } from "react";
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

import styles from "../../Designs/StepPersonal";
import useFormAutoScroll from "../hooks/useFormAutoScroll";
import {
  USERNAME_MAX_LENGTH,
  getUsernameError,
  sanitizeName,
  sanitizeUsername,
} from "../utils/validation";

export default function StepPersonal({
  fName = "",
  lName = "",
  username = "",
  onNext = () => {},
}) {
  const [localFName, setLocalFName] = useState(fName);
  const [localLName, setLocalLName] = useState(lName);
  const [localUsername, setLocalUsername] = useState(username);
  const [focused, setFocused] = useState({});
  const { scrollRef, contentRef, registerInput, registerField, scrollToInput, handleScroll } =
    useFormAutoScroll(230);

  const setFocus = (key, value) =>
    setFocused((prev) => ({ ...prev, [key]: value }));

  const fNameError =
    localFName.trim().length >= 2
      ? ""
      : "First name must be at least 2 characters.";

  const lNameError =
    localLName.trim().length >= 2
      ? ""
      : "Last name must be at least 2 characters.";

  const usernameError = useMemo(
    () => getUsernameError(localUsername),
    [localUsername]
  );

  const canProceed = !fNameError && !lNameError && !usernameError;

  const handleNext = () => {
    if (!canProceed) return;

    onNext({
      fName: localFName,
      lName: localLName,
      username: localUsername,
    });
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 60 : 0}
    >
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.container, { paddingBottom: 260 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        <View ref={contentRef} collapsable={false}>
          <Image
            source={require("../../stores/assets/application1.png")}
            style={styles.image}
            resizeMode="contain"
          />

          <Text style={styles.title}>Personal Information</Text>

        <View
          ref={registerField("fName")}
          collapsable={false}
          style={styles.fieldContainer}
        >
          <Text style={styles.label}>First Name</Text>
          <TextInput
            style={styles.input}
            placeholder="First Name"
            value={localFName}
            onFocus={() => {
              setFocus("fName", true);
              scrollToInput("fName");
            }}
            onLayout={registerInput("fName")}
            onBlur={() => setFocus("fName", false)}
            onChangeText={(t) => setLocalFName(sanitizeName(t))}
            maxLength={50}
          />
          {focused.fName && fNameError ? (
            <Text style={styles.error}>{fNameError}</Text>
          ) : null}
        </View>

        <View
          ref={registerField("lName")}
          collapsable={false}
          style={styles.fieldContainer}
        >
          <Text style={styles.label}>Last Name</Text>
          <TextInput
            style={styles.input}
            placeholder="Last Name"
            value={localLName}
            onFocus={() => {
              setFocus("lName", true);
              scrollToInput("lName");
            }}
            onLayout={registerInput("lName")}
            onBlur={() => setFocus("lName", false)}
            onChangeText={(t) => setLocalLName(sanitizeName(t))}
            maxLength={50}
          />
          {focused.lName && lNameError ? (
            <Text style={styles.error}>{lNameError}</Text>
          ) : null}
        </View>

        <View
          ref={registerField("username")}
          collapsable={false}
          style={styles.fieldContainer}
        >
          <Text style={styles.label}>Username</Text>
          <TextInput
            style={styles.input}
            placeholder="Username"
            value={localUsername}
            autoCapitalize="none"
            onFocus={() => {
              setFocus("username", true);
              scrollToInput("username");
            }}
            onLayout={registerInput("username")}
            onBlur={() => setFocus("username", false)}
            onChangeText={(t) => setLocalUsername(sanitizeUsername(t))}
            maxLength={USERNAME_MAX_LENGTH}
          />
          {focused.username && usernameError ? (
            <Text style={styles.error}>{usernameError}</Text>
          ) : null}
        </View>

        <TouchableOpacity
          style={[styles.button, !canProceed && { opacity: 0.5 }]}
          disabled={!canProceed}
          onPress={handleNext}
        >
          <Text style={styles.buttonText}>NEXT</Text>
        </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
