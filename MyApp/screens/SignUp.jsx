import { useState, useEffect } from "react";
import { Alert, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Location from "expo-location";

import api from "../lib/api";
import StepPersonal from "./signup/StepPersonal";
import StepSecurity from "./signup/StepSecurity";
import StepMobile from "./signup/StepMobile";
import SignUpHeader from "./signup/SignUpHeader";
import {
  ADDRESS_MAX_LENGTH,
  getPasswordError,
  getPhoneError,
  getUsernameError,
  isValidCoordinate,
  isValidGmail,
  normalizeEmail,
  sanitizePhoneLocal,
  sanitizeTextInput,
} from "./utils/validation";

const JAEN_CENTER = { lat: 15.3383, lng: 120.9141 };
const MAX_DISTANCE_KM = 5;
const REGISTRATION_STEPS = {
  PERSONAL: 0,
};

export default function SignUp({ navigation }) {
  const [step, setStep] = useState(0);
  const [fName, setFName] = useState("");
  const [lName, setLName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [geoDebug, setGeoDebug] = useState(false);
  const [location, setLocation] = useState(null);
  const [permission, setPermission] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const toRad = (value) => (value * Math.PI) / 180;
  const getDistanceKm = (from, to) => {
    const radiusKm = 6371;
    const dLat = toRad(to.lat - from.lat);
    const dLng = toRad(to.lng - from.lng);
    const x =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(from.lat)) *
        Math.cos(toRad(to.lat)) *
        Math.sin(dLng / 2) ** 2;

    return radiusKm * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  };

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (!mounted) return;
        setPermission(status);

        if (status === "granted") {
          const pos = await Location.getCurrentPositionAsync({});
          if (!mounted) return;

          const nextLocation =
            isValidCoordinate(pos?.coords?.latitude, pos?.coords?.longitude)
              ? {
                  lat: Number(pos.coords.latitude),
                  lng: Number(pos.coords.longitude),
                }
              : null;

          setLocation(nextLocation);
        }
      } catch {
        if (mounted) {
          setPermission("denied");
          setLocation(null);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const next = () => setStep((value) => value + 1);
  const back = () => {
    if (step === REGISTRATION_STEPS.PERSONAL) {
      navigation.navigate("LogIn");
      return;
    }

    setStep((value) => Math.max(REGISTRATION_STEPS.PERSONAL, value - 1));
  };

  const submit = async () => {
    const payload = {
      fname: sanitizeTextInput(fName, { maxLength: 50 }),
      lname: sanitizeTextInput(lName, { maxLength: 50 }),
      username,
      password,
      birthdate: sanitizeTextInput(birthdate, { maxLength: 40 }),
      phone: sanitizePhoneLocal(phone),
      email: normalizeEmail(email),
      address: sanitizeTextInput(address, { maxLength: ADDRESS_MAX_LENGTH }),
      location:
        location && isValidCoordinate(location.lat, location.lng)
          ? {
              lat: Number(location.lat),
              lng: Number(location.lng),
            }
          : null,
    };

    if (
      !payload.fname ||
      !payload.lname ||
      getUsernameError(payload.username) ||
      getPasswordError(payload.password) ||
      getPhoneError(payload.phone) ||
      !isValidGmail(payload.email) ||
      payload.address.length < 5
    ) {
      Alert.alert(
        "Incomplete Details",
        "Please review your registration details before submitting."
      );
      return;
    }

    if (!geoDebug) {
      if (permission !== "granted" || !payload.location) {
        Alert.alert(
          "Location Required",
          "Allow location access and stay within Jaen to register."
        );
        return;
      }

      const dist = getDistanceKm(payload.location, JAEN_CENTER);
      if (dist > MAX_DISTANCE_KM) {
        Alert.alert(
          "Outside Service Area",
          "Registration is only allowed in Jaen."
        );
        return;
      }
    }

    if (isSubmitting) return;

    try {
      setIsSubmitting(true);
      await api.post("/user/register", payload);
      Alert.alert("Success", "Check your email to verify.");
      navigation.replace("LogIn");
    } catch (err) {
      Alert.alert(
        "Signup failed",
        err?.response?.data?.message || "Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const pages = [
    <StepPersonal
      key="personal"
      fName={fName}
      lName={lName}
      username={username}
      address={address}
      onFNameChange={setFName}
      onLNameChange={setLName}
      onUsernameChange={setUsername}
      onAddressChange={setAddress}
      onNext={next}
    />,
    <StepSecurity
      key="security"
      password={password}
      confirmPassword={confirmPassword}
      onPasswordChange={setPassword}
      onConfirmChange={setConfirmPassword}
      onNext={next}
      onBack={back}
    />,
    <StepMobile
      key="mobile"
      phone={phone}
      email={email}
      address={address}
      birthdate={birthdate}
      onPhoneChange={setPhone}
      onEmailChange={setEmail}
      onAddressChange={setAddress}
      onBirthdateChange={setBirthdate}
      onSubmit={submit}
      onBack={back}
      isSubmitting={isSubmitting}
      geoDebug={geoDebug}
      onToggleGeoDebug={() => setGeoDebug((value) => !value)}
    />,
  ];

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <SignUpHeader step={step} onBack={back} />
        {pages[step]}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
