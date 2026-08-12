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
import { Picker } from "@react-native-picker/picker";

import styles from "../../Designs/StepPersonal";
import useFormAutoScroll from "../hooks/useFormAutoScroll";
import { sanitizeTextInput } from "../utils/validation";

const STREET_MAX_LENGTH = 160;

const BARANGAY_OPTIONS = [
  "Bagong Sikat",
  "Balbalino",
  "Banganan",
  "Calabasa",
  "Don Mariano Marcos",
  "Hilera",
  "Imbunia",
  "Kasanglayan",
  "Lambakin",
  "Langla",
  "Mabini",
  "Maligaya",
  "Marawa",
  "Naglabrahan",
  "Pamacpacan",
  "Pinanggaan",
  "Putlod",
  "San Andres",
  "San Josef",
  "San Nicolas",
  "San Roque",
  "Santo Tomas North",
  "Santo Tomas South",
  "Sapang",
  "Ulanin-Pitak",
];

export default function StepAddress({
  barangay = "",
  street = "",
  onNext = () => {},
}) {
  const [localBarangay, setLocalBarangay] = useState(barangay);
  const [localStreet, setLocalStreet] = useState(street);
  const [focused, setFocused] = useState({});
  const { scrollRef, contentRef, registerInput, registerField, scrollToInput, handleScroll } =
    useFormAutoScroll(230);

  const setFocus = (key, value) =>
    setFocused((prev) => ({ ...prev, [key]: value }));

  const barangayError = useMemo(
    () => (localBarangay ? "" : "Please select your barangay."),
    [localBarangay]
  );

  const streetError = useMemo(() => {
    const cleaned = sanitizeTextInput(localStreet, {
      maxLength: STREET_MAX_LENGTH,
    });
    return cleaned.length >= 3
      ? ""
      : "Street / house no. / landmark must be at least 3 characters.";
  }, [localStreet]);

  const canProceed = !barangayError && !streetError;

  const handleNext = () => {
    if (!canProceed) return;

    const cleanedStreet = sanitizeTextInput(localStreet, {
      maxLength: STREET_MAX_LENGTH,
    });

    onNext({
      barangay: localBarangay,
      street: cleanedStreet,
      address: [cleanedStreet, localBarangay, "Jaen, Nueva Ecija"]
        .filter(Boolean)
        .join(", "),
    });
  };

  const addressPreview = [localStreet, localBarangay, "Jaen, Nueva Ecija"]
    .filter(Boolean)
    .join(", ");

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

        <Text style={styles.title}>Address Information</Text>

        <View
          ref={registerField("barangay")}
          collapsable={false}
          style={styles.fieldContainer}
          onLayout={registerInput("barangay")}
        >
          <Text style={styles.label}>Barangay</Text>
        <View style={styles.pickerShell}>
          <Picker
            selectedValue={localBarangay}
            onFocus={() => scrollToInput("barangay")}
            onValueChange={(value) => {
              scrollToInput("barangay");
              setLocalBarangay(value);
            }}
            style={[
              styles.picker,
              { color: localBarangay ? "#111827" : "#9CA3AF" },
            ]}
          >
            <Picker.Item label="Select Barangay" value="" />
            {BARANGAY_OPTIONS.map((item) => (
              <Picker.Item key={item} label={item} value={item} />
            ))}
          </Picker>
        </View>
          {barangayError ? <Text style={styles.error}>{barangayError}</Text> : null}
        </View>

        <View
          ref={registerField("street")}
          collapsable={false}
          style={styles.fieldContainer}
        >
          <Text style={styles.label}>Street / Address</Text>
          <TextInput
            style={styles.input}
            placeholder="House no., street, purok, landmark"
            value={localStreet}
            onFocus={() => {
              setFocus("street", true);
              scrollToInput("street");
            }}
            onLayout={registerInput("street")}
            onBlur={() => setFocus("street", false)}
            onChangeText={(text) =>
              setLocalStreet(
                sanitizeTextInput(text, { maxLength: STREET_MAX_LENGTH })
              )
            }
            maxLength={STREET_MAX_LENGTH}
          />
          {focused.street && streetError ? (
            <Text style={styles.error}>{streetError}</Text>
          ) : null}
        </View>

        <View
          style={{
            width: "100%",
            backgroundColor: "#F7FAF8",
            borderWidth: 1,
            borderColor: "#E5E7EB",
            borderRadius: 12,
            padding: 12,
            marginTop: 4,
            marginBottom: 14,
          }}
        >
          <Text
            style={{
              fontSize: 11,
              fontWeight: "800",
              color: "#6B7280",
              marginBottom: 4,
              textTransform: "uppercase",
            }}
          >
            Address Preview
          </Text>

          <Text
            style={{
              fontSize: 13,
              lineHeight: 18,
              color: "#111827",
              fontWeight: "600",
            }}
          >
            {addressPreview || "No address set yet"}
          </Text>
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
