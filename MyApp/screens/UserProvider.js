// screens/UserProvider.js

import { useState, useEffect, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { UserContext } from "./UserContext";
import api from "../lib/api";

export const UserProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // ✅ CRITICAL: prevent re-initialization loops
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const loadUser = async () => {
      try {
        const storedUser = await AsyncStorage.getItem("user");

        if (!storedUser) {
          setUser(null);
          return;
        }

        const parsedUser = JSON.parse(storedUser);

        if (!parsedUser?._id) {
          await AsyncStorage.removeItem("user");
          setUser(null);
          return;
        }

        const res = await api.get(`/user/${parsedUser._id}`);

        // ✅ only update state if user actually changed
        const sameUser =
          JSON.stringify(res.data) === JSON.stringify(parsedUser);

        if (!sameUser) {
          setUser(res.data);
          await AsyncStorage.setItem("user", JSON.stringify(res.data));
        } else {
          setUser(parsedUser);
        }
      } catch (err) {
        console.error("Failed to refresh user:", err);
        await AsyncStorage.removeItem("user");
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    loadUser();
  }, []);

  const updateUser = async (data, options = {}) => {
    const persist = options.persist !== false;

    if (data) {
      setUser(data);
      if (persist) {
        await AsyncStorage.setItem("user", JSON.stringify(data));
      } else {
        await AsyncStorage.removeItem("user");
      }
    } else {
      setUser(null);
      await AsyncStorage.removeItem("user");
    }
  };

  if (loading) return null; // splash

  return (
    <UserContext.Provider value={{ user, setUser: updateUser }}>
      {children}
    </UserContext.Provider>
  );
};
