// screens/PersonalDetails.jsx
import React, { useContext, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
  Alert,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Picker } from "@react-native-picker/picker";

import api from "../lib/api";
import { UserContext } from "./UserContext";
import { useTheme } from "./contexts/ThemeContext";
import styles, { COLORS } from "../Designs/PersonalDetails";
import useFormAutoScroll from "./hooks/useFormAutoScroll";
import {
  getPhoneError,
  getUsernameError,
  safeDisplayText,
  sanitizeIncidentText,
  sanitizePhoneLocal,
  sanitizeUsername,
} from "./utils/validation";

const DISTRICT_OPTIONS = [
  "District 1",
  "District 2",
  "District 3",
  "District 4",
];


const DEFAULT_AVATAR =
  "https://ui-avatars.com/api/?background=E5E7EB&color=6B7280&rounded=true&name=User";
const BARANGAY_BY_DISTRICT = {
  "District 1": [
    "Bagong Sikat",
    "Balbalino",
    "Banganan",
    "Langla",
    "Mabini",
    "Maligaya",
    "Santo Tomas South",
  ],
  "District 2": [
    "Imbunia",
    "Lambakin",
    "Marawa",
    "Naglabrahan",
    "San Josef",
    "San Roque",
    "Santo Tomas North",
  ],
  "District 3": [
    "Don Mariano Marcos",
    "Hilera",
    "Pinanggaan",
    "San Andres",
    "San Nicolas",
    "Ulanin-Pitak",
  ],
  "District 4": [
    "Calabasa",
    "Kasanglayan",
    "Pamacpacan",
    "Putlod",
    "Sapang",
  ],
};

function sanitizeStreetDetails(value) {
  return sanitizeIncidentText(value, 160).trimStart();
}

function getAddressError({ district, barangay, street }) {
  if (!district) return "Please select a district.";
  if (!barangay) return "Please select a barangay.";
  if (!street.trim()) return "Please enter your street or address details.";
  if (street.trim().length < 3) return "Street or address details are too short.";
  return "";
}

function buildFullAddress({ district, barangay, street }) {
  return [street, barangay, district, "Jaen, Nueva Ecija"]
    .filter(Boolean)
    .join(", ");
}

function getUserId(user) {
  return user?._id || user?.id || user?.userId || "";
}

export default function PersonalDetails({ navigation }) {
  const { user, setUser } = useContext(UserContext);
  const { theme } = useTheme();
  const themed = useMemo(() => createPersonalThemeStyles(theme), [theme]);

  const [username, setUsername] = useState(user?.username || "");
  const [phone, setPhone] = useState(
    String(user?.phone || user?.phoneNumber || "").replace(/^0+/, "")
  );

  const [district, setDistrict] = useState(user?.district || "");
  const [barangay, setBarangay] = useState(user?.barangay || "");
  const [street, setStreet] = useState(
    user?.street ||
      user?.streetAddress ||
      user?.addressLine ||
      user?.houseAddress ||
      ""
  );

  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const { scrollRef, contentRef, registerInput, registerField, scrollToInput, handleScroll } = useFormAutoScroll(230);

  const userId = getUserId(user);

  const barangayOptions = useMemo(() => {
    return BARANGAY_BY_DISTRICT[district] || [];
  }, [district]);

  if (!user) {
    return <Text>No user logged in</Text>;
  }

  
  const fullName = `${safeDisplayText(user?.fname, "User")} ${safeDisplayText(user?.lname, "")}`.trim();
  const email = safeDisplayText(user?.email, "No email");
  const avatarSource = user?.avatar || `${DEFAULT_AVATAR}&name=${encodeURIComponent(fullName || "User")}`;
const onChangeDistrict = (value) => {
    setDistrict(value);

    if (!value) {
      setBarangay("");
    } else if (!BARANGAY_BY_DISTRICT[value]?.includes(barangay)) {
      setBarangay("");
    }

    if (error) setError("");
  };

  const savePersonalDetails = async () => {
    setError("");

    if (!userId) {
      setError("Missing user ID. Please log in again.");
      Alert.alert("Update failed", "Missing user ID. Please log in again.");
      return;
    }

    const cleanUsername = sanitizeUsername(username);
    const usernameError = getUsernameError(cleanUsername);

    if (usernameError) {
      setError(usernameError);
      return;
    }

    const cleanPhone = sanitizePhoneLocal(phone);
    const phoneError = getPhoneError(cleanPhone);

    if (phoneError) {
      setError(phoneError);
      return;
    }

    const cleanDistrict = String(district || "").trim();
    const cleanBarangay = String(barangay || "").trim();
    const cleanStreet = sanitizeStreetDetails(street);

    const addressError = getAddressError({
      district: cleanDistrict,
      barangay: cleanBarangay,
      street: cleanStreet,
    });

    if (addressError) {
      setError(addressError);
      return;
    }

    if (isSaving) return;

    setIsSaving(true);

    const fullAddress = buildFullAddress({
      district: cleanDistrict,
      barangay: cleanBarangay,
      street: cleanStreet,
    });

    const payload = {
      username: cleanUsername,
      phoneNumber: cleanPhone,
      phone: cleanPhone,
      district: cleanDistrict,
      barangay: cleanBarangay,
      street: cleanStreet,
      streetAddress: cleanStreet,
      address: fullAddress,
    };

    try {
      const response = await api.put(`/user/update/${userId}`, payload);
      const updatedUser = response?.data || {};

      const nextUser = {
        ...user,
        ...updatedUser,
        _id: updatedUser?._id || user?._id || userId,
        id: updatedUser?.id || user?.id || userId,
        username: updatedUser?.username || cleanUsername,
        phone: updatedUser?.phone || cleanPhone,
        phoneNumber: updatedUser?.phoneNumber || cleanPhone,
        district: updatedUser?.district || cleanDistrict,
        barangay: updatedUser?.barangay || cleanBarangay,
        street: updatedUser?.street || cleanStreet,
        streetAddress: updatedUser?.streetAddress || cleanStreet,
        address: updatedUser?.address || fullAddress,
      };

      setUser(nextUser);

      Alert.alert("Details updated", "Your personal details have been saved.");
      navigation.goBack();
    } catch (updateError) {
      console.log("Personal details update failed:", {
        url: `/user/update/${userId}`,
        payload,
        message: updateError?.message,
        status: updateError?.response?.status,
        data: updateError?.response?.data,
      });

      const message =
        updateError?.response?.data?.message ||
        updateError?.response?.data?.error ||
        "Failed to update personal details.";

      setError(message);
      Alert.alert("Update failed", message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.webFrame, themed.screen]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 60 : 0}
    >
      <ScrollView
        ref={scrollRef}
        style={[styles.phone, themed.screen]}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 260 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        <View ref={contentRef} collapsable={false}>
          <View style={styles.headerRow}>
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => navigation.goBack()}
            >
              <Ionicons name="chevron-back" size={23} color={theme.text} />
            </TouchableOpacity>

            <Text style={[styles.headerTitle, themed.text]}>Profile</Text>
            <View style={styles.headerSpacer} />
          </View>

          <View style={styles.profileHero}>
            <View style={[styles.avatarRing, { backgroundColor: theme.primarySoft }] }>
              <Image source={{ uri: avatarSource }} style={styles.avatar} />
              <View style={[styles.avatarBadge, { backgroundColor: theme.primary, borderColor: theme.background }] }>
                <Ionicons name="camera" size={15} color={theme.buttonText} />
              </View>
            </View>
            <Text style={[styles.profileName, themed.text]} numberOfLines={1}>
              {fullName || "User"}
            </Text>
            <Text style={[styles.profileEmail, themed.subtext]} numberOfLines={1}>
              {email}
            </Text>
          </View>

          <Text style={[styles.sectionTitle, themed.text]}>Personal Information</Text>
          <View style={styles.sectionGroup}>
            <Field icon="person-outline" label="First Name" value={user.fname} theme={theme} />
            <Field icon="person-outline" label="Last Name" value={user.lname} theme={theme} />
            <Field icon="mail-outline" label="Email" value={user.email} theme={theme} />

            <View ref={registerField("username")} collapsable={false} style={[styles.formRow, themed.card]}>
              <View style={styles.rowIconWrap}>
                <Ionicons name="at-outline" size={17} color={theme.text} />
              </View>
              <View style={styles.formRowBody}>
                <Text style={[styles.rowLabel, themed.subtext]}>Username</Text>
                <TextInput
                  style={[styles.rowInput, themed.text]}
                  value={username}
                  onChangeText={(text) => {
                    setUsername(sanitizeUsername(text));
                    if (error) setError("");
                  }}
                  placeholder="Username"
                  placeholderTextColor={theme.subtext}
                  autoCapitalize="none"
                  autoCorrect={false}
                  onFocus={() => scrollToInput("username")}
                  onLayout={registerInput("username")}
                  maxLength={24}
                />
              </View>
              <Ionicons name="pencil" size={16} color={theme.text} />
            </View>

            <View ref={registerField("phone")} collapsable={false} style={[styles.formRow, themed.card]}>
              <View style={styles.rowIconWrap}>
                <Ionicons name="call-outline" size={17} color={theme.text} />
              </View>
              <View style={styles.formRowBody}>
                <Text style={[styles.rowLabel, themed.subtext]}>Phone Number</Text>
                <TextInput
                  style={[styles.rowInput, themed.text]}
                  value={phone}
                  onChangeText={(text) => {
                    setPhone(sanitizePhoneLocal(text));
                    if (error) setError("");
                  }}
                  keyboardType="phone-pad"
                  placeholder="Phone Number"
                  placeholderTextColor={theme.subtext}
                  maxLength={10}
                  onFocus={() => scrollToInput("phone")}
                  onLayout={registerInput("phone")}
                />
              </View>
              <Ionicons name="pencil" size={16} color={theme.text} />
            </View>
          </View>

          <Text style={[styles.sectionTitle, themed.text]}>Address</Text>
          <View style={styles.sectionGroup}>
            <View ref={registerField("district")} collapsable={false} style={[styles.formRow, themed.card]}>
              <View style={styles.rowIconWrap}>
                <Ionicons name="map-outline" size={17} color={theme.text} />
              </View>
              <View style={styles.formRowBody}>
                <Text style={[styles.rowLabel, themed.subtext]}>District</Text>
                <Picker
                  selectedValue={district}
                  onFocus={() => scrollToInput("district")}
                  onValueChange={(value) => {
                    scrollToInput("district");
                    onChangeDistrict(value);
                  }}
                  style={[styles.rowPicker, { color: district ? theme.text : theme.subtext }]}
                >
                  <Picker.Item label="Select district" value="" />
                  {DISTRICT_OPTIONS.map((item) => (
                    <Picker.Item key={item} label={item} value={item} />
                  ))}
                </Picker>
              </View>
              <Ionicons name="pencil" size={16} color={theme.text} />
            </View>

            <View ref={registerField("barangay")} collapsable={false} style={[styles.formRow, themed.card]}>
              <View style={styles.rowIconWrap}>
                <Ionicons name="location-outline" size={17} color={theme.text} />
              </View>
              <View style={styles.formRowBody}>
                <Text style={[styles.rowLabel, themed.subtext]}>Barangay</Text>
                <Picker
                  selectedValue={barangay}
                  enabled={Boolean(district)}
                  onFocus={() => scrollToInput("barangay")}
                  onValueChange={(value) => {
                    scrollToInput("barangay");
                    setBarangay(value);
                    if (error) setError("");
                  }}
                  style={[styles.rowPicker, { color: barangay ? theme.text : theme.subtext, opacity: district ? 1 : 0.6 }]}
                >
                  <Picker.Item
                    label={district ? "Select barangay" : "Select district first"}
                    value=""
                  />
                  {barangayOptions.map((item) => (
                    <Picker.Item key={item} label={item} value={item} />
                  ))}
                </Picker>
              </View>
              <Ionicons name="pencil" size={16} color={theme.text} />
            </View>

            <View ref={registerField("street")} collapsable={false} style={[styles.formRow, themed.card]}>
              <View style={styles.rowIconWrap}>
                <Ionicons name="home-outline" size={17} color={theme.text} />
              </View>
              <View style={styles.formRowBody}>
                <Text style={[styles.rowLabel, themed.subtext]}>Street / Address Details</Text>
                <TextInput
                  style={[styles.rowInput, themed.text]}
                  value={street}
                  onChangeText={(text) => {
                    setStreet(sanitizeStreetDetails(text));
                    if (error) setError("");
                  }}
                  placeholder="House no., street, purok, landmark"
                  placeholderTextColor={theme.subtext}
                  autoCapitalize="words"
                  maxLength={160}
                  onFocus={() => scrollToInput("street")}
                  onLayout={registerInput("street")}
                />
              </View>
              <Ionicons name="pencil" size={16} color={theme.text} />
            </View>

            <View style={[styles.addressPreview, themed.card]}>
              <Text style={[styles.previewLabel, themed.subtext]}>Full Address Preview</Text>
              <Text style={[styles.previewText, themed.text]}>
                {district || barangay || street
                  ? buildFullAddress({
                      district: String(district || "").trim(),
                      barangay: String(barangay || "").trim(),
                      street: sanitizeStreetDetails(street),
                    })
                  : "No address set yet"}
              </Text>
            </View>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.button, { backgroundColor: theme.buttonPrimary }, isSaving && { opacity: 0.65 }]}
            onPress={savePersonalDetails}
            disabled={isSaving}
          >
            <Text style={[styles.buttonText, { color: theme.buttonText }]}> 
              {isSaving ? "Saving..." : "Save Changes"}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ icon, label, value, theme }) {
  return (
    <View style={[styles.readOnlyField, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={styles.rowIconWrap}>
        <Ionicons name={icon} size={17} color={theme.text} />
      </View>
      <View style={styles.formRowBody}>
        <Text style={[styles.readOnlyLabel, { color: theme.subtext }]}>{label}</Text>
        <Text style={[styles.readOnlyValue, { color: theme.text }]} numberOfLines={1}>
          {safeDisplayText(value, "Not set")}
        </Text>
      </View>
      <Ionicons name="lock-closed-outline" size={15} color={theme.subtext} />
    </View>
  );
}

function createPersonalThemeStyles(theme) {
  return {
    screen: {
      backgroundColor: theme.background,
    },
    card: {
      backgroundColor: theme.card,
      borderColor: theme.border,
    },
    softCard: {
      backgroundColor: theme.primarySoft,
      borderColor: theme.border,
    },
    text: {
      color: theme.text,
    },
    subtext: {
      color: theme.subtext,
    },
    input: {
      backgroundColor: theme.inputBackground,
      borderColor: theme.border,
      color: theme.text,
    },
  };
}
