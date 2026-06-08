import React, { useEffect, useState } from "react";
import axios from "axios";
import { Redirect, usePathname } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { auth } from "../backend/firebaseConfig";

export function RequireAccess({
  allowRoles,
  denyRoles,
  redirectTo = "/homepage",
  children,
}) {
  const pathname = usePathname();

  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [loadingRole, setLoadingRole] = useState(false);

  const fetchRole = async (firebaseUser) => {
    try {
      if (!firebaseUser) {
        setRole("no account");
        return;
      }

      setLoadingRole(true);

      const idToken = await firebaseUser.getIdToken(true);
      const res = await axios.post("https://bibliomaniacs.onrender.com/get_user_role", { idToken });

      const roleValue = typeof res.data === "string" ? res.data : res.data.role;
      setRole(roleValue ?? "user");
    } catch (err) {
      console.error("fetchRole error:", err);
      setRole("user");
    } finally {
      setLoadingRole(false);
    }
  };

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (u) => {
      setUser(u);
      setLoadingAuth(false);
      await fetchRole(u);
    });

    return unsubscribe;
  }, []);

  if (loadingAuth || loadingRole) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  // if (!user) return <Redirect href="/login" />;

  if (denyRoles?.includes(role)) return <Redirect href={redirectTo} />;
  if (allowRoles && !allowRoles.includes(role)) return <Redirect href={redirectTo} />;

  return children;
}