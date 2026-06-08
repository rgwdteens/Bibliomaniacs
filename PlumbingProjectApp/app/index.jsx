import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import axios from "axios";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebaseConfig";

export default function Index() {
  const [user, setUser] = useState(undefined);   // undefined = still checking
  const [role, setRole] = useState(undefined);   // undefined = still loading role
  const [loading, setLoading] = useState(true);  // overall loading flag

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (!firebaseUser) {
          // not logged in
          setUser(null);
          setRole(null);
          setLoading(false);
          return;
        }

        setUser(firebaseUser);

        // === this is your fetchRole logic inlined ===
        const idToken = await firebaseUser.getIdToken(true);

        const res = await axios.post("https://bibliomaniacs.onrender.com/get_user_role", {
          idToken,
        });

        const roleValue =
          typeof res.data === "string" ? res.data : res.data.role;

        setRole(roleValue);
      } catch (err) {
        console.error("Error fetching role:", err);
        setRole(null); // fallback
      } finally {
        setLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  // Still checking auth/role → render nothing (or a splash screen)
  if (loading || user === undefined || role === undefined) {
    return null;
  }

  // Not logged in
  if (!user) {
    return <Redirect href="/landingpage" />;
  }

  // Logged in – route by role
  if (role === "admin") {
    return <Redirect href="/adminhomepage" />;
  }

  if (role === "user") {
    return <Redirect href="/homepage" />;
  }

}
