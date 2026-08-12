import React, { useContext } from "react";
import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
} from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { GestureHandlerRootView } from "react-native-gesture-handler";

/* ================= AUTH SCREENS ================= */
import GetStarted from "./screens/GetStarted";
import LogIn from "./screens/LogIn";
import AppBootstrap from "./screens/AppBootstrap";
import PrivacyGate from "./screens/PrivacyGate";
import PrivacySwiper from "./screens/PrivacySwiper";
import RegisterFlow from "./screens/signup/RegisterFlow";
import SendOtp from "./screens/SendOtp";
import VerifyOtp from "./screens/VerifyOtp";
import EmailVerifyer from "./screens/EmailVerifyer";
import PasswordReset from "./screens/PasswordReset";

/* ================= POST-LOGIN APP ================= */
import AppShell from "./screens/AppShell";

/* ================= PROVIDERS ================= */
import { UserProvider } from "./screens/UserProvider";
import { UserContext } from "./screens/UserContext";
import SearchProvider from "./screens/SearchContext";
import { ThemeProvider, ThemeContext } from "./screens/contexts/ThemeContext";

const Stack = createNativeStackNavigator();

/* ================= AUTH STACK ================= */
function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName="AppBootstrap">
      <Stack.Screen name="AppBootstrap" component={AppBootstrap} />
      <Stack.Screen name="GetStarted" component={GetStarted} />
      <Stack.Screen name="LogIn" component={LogIn} />
      <Stack.Screen name="PrivacyGate" component={PrivacyGate} />
      <Stack.Screen name="DataPrivacy" component={PrivacySwiper} />
      <Stack.Screen name="RegisterFlow" component={RegisterFlow} />
      <Stack.Screen name="SendOtp" component={SendOtp} />
      <Stack.Screen name="EmailVerifyer" component={EmailVerifyer} />
      <Stack.Screen name="PasswordReset" component={PasswordReset} />
      <Stack.Screen
        name="VerifyOtp"
        component={VerifyOtp}
        options={{ presentation: "modal" }}
      />
    </Stack.Navigator>
  );
}

/* ================= APP STACK ================= */
function AppStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="AppShell" component={AppShell} />
    </Stack.Navigator>
  );
}

/* ================= ROOT SWITCH ================= */
function RootNavigator() {
  const { user, loading } = useContext(UserContext);

  if (loading) return null;

  return user ? <AppStack /> : <AuthStack />;
}

/* ================= APP ROOT ================= */
export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <UserProvider>
          <SearchProvider>
            <ThemeContext.Consumer>
              {({ theme }) => {
                const baseTheme =
                  theme.mode === "dark" ? DarkTheme : DefaultTheme;
                const navigationTheme = {
                  ...baseTheme,
                  colors: {
                    ...baseTheme.colors,
                    primary: theme.primary,
                    background: theme.background,
                    card: theme.surface,
                    text: theme.text,
                    border: theme.border,
                    notification: theme.danger,
                  },
                };

                return (
                  <NavigationContainer theme={navigationTheme}>
                    <RootNavigator />
                  </NavigationContainer>
                );
              }}
            </ThemeContext.Consumer>
          </SearchProvider>
        </UserProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
