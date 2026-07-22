import "./login";
import { getFirestore, doc, getDoc, updateDoc } from "firebase/firestore";
import { auth, app } from "../firebaseConfig";
import { useState, useRef, useEffect } from "react";
import { Image, Animated, Dimensions, Pressable, Text, View, TextInput, ScrollView, Alert } from "react-native";
import { Link, Stack, usePathname, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { signInWithPopup, GoogleAuthProvider} from "firebase/auth";
import { Ionicons, Octicons, FontAwesome5, AntDesign } from "@expo/vector-icons";
import { onAuthStateChanged, signOut } from "firebase/auth";
import axios from "axios";
import './global.css';

export default function Layout() {
  const pathname = usePathname();
  const router = useRouter();
  const [role, setRole] = useState(null);

  const db = getFirestore(app);
  const [currentUser, setCurrentUser] = useState(null);

  // Map a route to a simple page name  
  function getPage() {
    if (pathname.startsWith("/landingpage")) return "landingpage";
    if (pathname === "/homepage") return "homepage";
    if (pathname.startsWith("/explorer")) return "explorer";
    if (pathname.startsWith("/myreviews")) return "myreviews";
    if (pathname.startsWith("/reviewpage")) return "reviewpage";
    if (pathname.startsWith("/profile")) return "profile";
    if (pathname.startsWith("/admin-reviews")) return "admin-reviews";
    if (pathname.startsWith("/admindashboard")) return "admindashboard";
    if (pathname.startsWith("/adminhomepage")) return "adminhomepage";
    if (pathname.startsWith("/login")) return "login";
    if (pathname.startsWith("/certificate")) return "certificate";

    return "";
  }

  const [isOpen, setIsOpen] = useState(false);
  const slideAnim = useRef(new Animated.Value(-270)).current;
  const SCREEN_WIDTH = Dimensions.get("window").width;

  const [notifOpen, setNotifOpen] = useState(false);


  // NOTIFICATION VARIABLES
  const [notifications, setNotifications] = useState([]);
  const [loadingNotifs, setLoadingNotifs] = useState(false);

  const shouldScroll = notifications.length > 6;

  const getUserRole = async (user) => {
    const idToken = await user.getIdToken(true);
  
    const res = await axios.post("https://bibliomaniacs-ytnd.onrender.com/get_user_role", {
      idToken,
    });
  
    return typeof res.data === "string" ? res.data : res.data.role;
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setCurrentUser(null);
      setRole(null);
      toggleMenu();
      console.log("Logged out");
      router.push("/landingpage");
    } catch (error) {
      console.log("Logout Failed", error.message);
    }
  };

  const handleNotificationPress = (notif) => {
    setNotifOpen(false);
    switch (notif?.type) {
      case "new_review":
        router.push("/admin-reviews");
        break;
  
      case "review_status":
        router.push("/myreviews");
        break;

      case "book_of_the_week":
        if (role==="admin") {
          router.push("/admindashboard");
        } else {
          router.push("/homepage");
        }
        
        break;
  
      default:
        router.push("/myreviews");
        break;
    }
  };

  const fetchNotifications = async () => {
    try {
      const user = auth.currentUser;
      if (!user) {
        setNotifications([]);
        return;
      }
  
      setLoadingNotifs(true);
  
      const db = getFirestore(app);
      const userRef = doc(db, "users", user.uid);
      const snap = await getDoc(userRef);
  
      if (!snap.exists()) {
        setNotifications([]);
        return;
      }
  
      const data = snap.data() || {};
      const arr = Array.isArray(data.notifications) ? data.notifications : [];
  
      // Optional: ensure newest first (if createdAt exists)
      const sorted = [...arr].sort((a, b) => (b?.createdAt || 0) - (a?.createdAt || 0));
  
      // Only show most recent 12
      setNotifications(sorted.slice(0, 12));
    } catch (err) {
      console.error("Error fetching notifications:", err);
      setNotifications([]);
    } finally {
      setLoadingNotifs(false);
    }
  };


  const fetchRole = async () => {
    try {
      const user = auth.currentUser;
      if (!user) {
        setRole("no account"); // TEMP FIX
        return;
      }
  
      const idToken = await user.getIdToken(true);
  
      const res = await axios.post("https://bibliomaniacs-ytnd.onrender.com/get_user_role", {
        idToken,
      });
      const roleValue = typeof res.data === "string" ? res.data : res.data.role;

      setRole(roleValue);

    } catch (err) {
      console.error(err);
    }
  };


  const toggleMenu = () => {
    const toValue = isOpen ? -270 : 0;
    setIsOpen(!isOpen);

    fetchRole();

    Animated.timing(slideAnim, {
      toValue,
      duration: 250,
      useNativeDriver: true,
    }).start();
  };

  const handleGoogleSignIn = async () => {
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);
      let isNewUser = false;
      if (!userSnap.exists()) {
        isNewUser = true;
        await setDoc(userRef, { email: user.email, role: "user" });
      }

      const role = await getUserRole(user);  

      Alert.alert("Login Success", `Welcome ${user.displayName}!`);
      if (isOpen) {
        toggleMenu();
      }
      if (isNewUser) {
        router.replace("/profilesetup");
      } else if (role == "admin") {
        router.replace("/adminhomepage");
      } else {
        router.replace("/homepage");
        console.log(user.role);
      }

    } catch (error) {
      console.error("LandingPage Google Login Error:", error);
      Alert.alert("Login Failed", error.message || "Unknown error");
    }
  };

  const profileDirect = () => {
    fetchRole();

    if (role == "no account" || role == null) {
      handleGoogleSignIn();
    } else {
      router.push("/profile");
    }
  }


  function NavItem({ icon, IconSet, label, page, href }) {
    const isActive = getPage() === page;
  
    return (
      <Link href={href} asChild>
        <Pressable
          className={`flex-row items-center px-3 py-2 rounded-lg gap-3
            ${isActive ? "bg-gray-100" : ""}
          `}
        >
          <IconSet
            name={icon}
            size={18}
            className={isActive ? "text-green-600" : "text-gray-500"}
          />
  
          <Text
            className={`text-sm
              ${isActive ? "text-green-600 font-semibold" : "text-gray-800"}
            `}
          >
            {label}
          </Text>
        </Pressable>
      </Link>
    );
  }

  useEffect(() => {    
    const unsubscribe = auth.onAuthStateChanged((user) => {
      fetchRole();
    });
  
    return unsubscribe;
  }, []);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#f8fbf7" }}>
    <View className="topbar flex-row items-center px-4">
      <Pressable className="iconBtn" onPress={toggleMenu}>
        <Ionicons name="menu" size={18} />
      </Pressable>

      <View className="flex-1 flex-row">
        <Pressable
          className="iconBtn ml-auto"
          onPress={async () => {
            setIsOpen(false);

            setNotifOpen((v) => {
              const next = !v;
              if (next) fetchNotifications();
              return next;
            });
          }}
        >
          <FontAwesome5 name="inbox" size={16} color="rgb(71, 71, 71)" />
        </Pressable>
      </View>

      <Pressable
        className="iconBtn ml-auto rounded-full"
        onPress={() => profileDirect()}
      >
        <Ionicons name="person-circle-outline" size={20} color='rgb(71, 71, 71)' />
      </Pressable>
    </View>

    {/* NOTIFICATION MENU */}
    {notifOpen && (
      <Pressable
        onPress={() => setNotifOpen(false)}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 5, // below popover, above page
          backgroundColor: "transparent",
        }}
      />
    )}

    {/* Notification Popover */}
    {notifOpen && (
      <View
        style={{
          position: "absolute",
          top: 62, // tweak if your topbar height differs
          right: 16, // aligns under right-side icons
          width: 320, // fixed width
          maxHeight: Dimensions.get("window").height * 0.55, // a little over half screen
          backgroundColor: "white",
          borderRadius: 14,
          paddingVertical: 10,
          zIndex: 6,
          shadowColor: "#000",
          shadowOpacity: 0.12,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 6 },
          borderWidth: 1,
          borderColor: "#e5e7eb",
        }}
      >
        <View style={{ paddingHorizontal: 12, paddingBottom: 8 }}>
          <Text style={{ fontSize: 16, fontWeight: "600", color: "#111827" }}>
            Notifications
          </Text>
          <Text style={{ fontSize: 14, color: "#6b7280", marginTop: 2 }}>
            Recent activity
          </Text>
        </View>

        <View style={{ height: 1, backgroundColor: "#e5e7eb" }} />

        {/* List (top-aligned; scroll only if needed) */}
        <View
          style={{
            maxHeight: shouldScroll ? Dimensions.get("window").height * 0.55 : undefined,
          }}
        >
          <ScrollView
            style={{ paddingHorizontal: 10, paddingTop: 8 }}
            contentContainerStyle={{ paddingBottom: 10 }}
          >
            {loadingNotifs ? (
              <Text style={{ padding: 14, color: "#6b7280", fontSize: 14 }}>
                Loading...
              </Text>
            ) : notifications.length === 0 ? (
              <Text style={{ padding: 14, color: "#6b7280", fontSize: 14 }}>
                No new messages
              </Text>
            ) : (
              notifications.map((n, idx) => (
                <Pressable
                  key={n.id || `${n.type}-${n.createdAt || idx}`}
                  onPress={() => handleNotificationPress(n)}
                  style={{
                    flexDirection: "row",
                    alignItems: "flex-start",
                    gap: 10,
                    paddingVertical: 10,
                    paddingHorizontal: 10,
                    borderRadius: 12,
                  }}
                >
                  <Octicons
                    name={n.icon || "mail-outline"}
                    size={18}
                    color="#374151"
                    style={{ marginTop: 1 }}
                  />

                  <Text
                    style={{
                      flex: 1,
                      fontSize: 13,
                      color: "#111827",
                      lineHeight: 18,
                    }}
                  >
                    {n.message || n.text || "Notification"}
                  </Text>
                </Pressable>
              ))
            )}
          </ScrollView>
        </View>
      </View>
    )}

      <Stack screenOptions={{ headerShown: false }} />

      {/* Drawer Backdrop */}
      {isOpen && (
        <Pressable
          onPress={toggleMenu}
          style={{
            position: "absolute",
            width: SCREEN_WIDTH,
            height: "100%",
            backgroundColor: "rgba(0,0,0,0.35)",
            zIndex: 1,
          }}
        />
      )}

      {/* Sliding Sidebar */}
      <Animated.View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: 260,
          height: "100%",
          backgroundColor: "white",
          paddingTop: 60,
          paddingHorizontal: 20,
          zIndex: 2,
          transform: [{ translateX: slideAnim }],
          shadowColor: "#000",
          shadowOpacity: 0.15,
          shadowRadius: 8,
        }}
      >
        {/* Logo */}
        {role === "user" ? (
          <View style={{ marginBottom: 30, flexDirection: "row", alignItems: "center", gap: 5 }} href="/homepage">
            <Image source={require("../assets/logo.png")} style={{ width: 22, height: 22, resizeMode: "contain" }} />
            <Text style={{ fontSize: 22, fontWeight: "600" }}>Bibliomaniacs</Text>
          </View>
        ) : role === "admin" ? (
          <View style={{ marginBottom: 30, flexDirection: "row", alignItems: "center", gap: 5 }} href="/adminhomepage">
            <Image source={require("../assets/logo.png")} style={{ width: 22, height: 22, resizeMode: "contain" }} />
            <Text style={{ fontSize: 22, fontWeight: "600" }}>Bibliomaniacs</Text>
          </View>
        ) : (
          <View style={{ marginBottom: 30, flexDirection: "row", alignItems: "center", gap: 5 }} href="/landingpage">
            <Image source={require("../assets/logo.png")} style={{ width: 22, height: 22, resizeMode: "contain" }} />
            <Text style={{ fontSize: 22, fontWeight: "600" }}>Bibliomaniacs</Text>
          </View>
        )}

        {/* Navigation Group */}
        {/* homepage, explorer, myreviews, reviewpage, profile, admin-reviews, admindashboard, adminhomepage */}
        <View className="mt-4 space-y-1">
          {role === "no account" && (
            <>
              <NavItem icon="home-outline" IconSet={Ionicons} label="Landing Page" page="landingpage" href="/landingpage" />
              <NavItem icon="trending-up-outline" IconSet={Ionicons} label="Explorer" page="explorer" href="/explorer" />
            </>
          )}

          {role === "user" && (
            <>
              <NavItem icon="checkbox-outline" IconSet={Ionicons} label="Homepage" page="homepage" href="/homepage" />
              <NavItem icon="trending-up-outline" IconSet={Ionicons} label="Explorer" page="explorer" href="/explorer" />
              <NavItem icon="document-text-outline" IconSet={Ionicons} label="My Reviews" page="myreviews" href="/myreviews" />
              <NavItem icon="file-tray-full-outline" IconSet={Ionicons} label="Certificates" page="certificate" href="/certificate" />
              <NavItem icon="checkbox-outline" IconSet={Ionicons} label="Profile" page="profile" href="/profile" />
            </>
          )}

          {role === "admin" && (
            <>
            <NavItem icon="checkbox-outline" IconSet={Ionicons} label="Admin Homepage" page="adminhomepage" href="/adminhomepage" />
            <NavItem icon="calendar-outline" IconSet={Ionicons} label="Admin Dashboard" page="admindashboard" href="/admindashboard" />
            <NavItem icon="document-text-outline" IconSet={Ionicons} label="Admin Reviews" page="admin-reviews" href="/admin-reviews" />
            
            <View style={{ height: 1, backgroundColor: "#e5e7eb", marginVertical: 20 }} />
            <NavItem icon="trending-up-outline" IconSet={Ionicons} label="Explorer" page="explorer" href="/explorer" />
            </>
          )}

          <View style={{ height: 1, backgroundColor: "#e5e7eb", marginVertical: 20 }} />
          
          <NavItem icon="question-circle" IconSet={AntDesign} label="About" page="about" href="https://ridgewoodlibrary.org/about/" />
          {role === "no account" ? (
            <>
              <Pressable className={"flex-row items-center px-3 py-2 rounded-lg gap-3"} onPress={handleGoogleSignIn}>
                <Ionicons name="person" size={18} className={"text-gray-500"}/>
                <Text className={"text-sm text-gray-800"}>Login</Text>
              </Pressable>
            </>
          ) : (
            <Pressable className={"flex-row items-center px-3 py-2 rounded-lg gap-3"} onPress={handleLogout}>
              <Ionicons name="person" size={18} className={"text-gray-500"}/>
              <Text className={"text-sm text-gray-800"}>Logout</Text>
            </Pressable>
          )}
        </View>
      </Animated.View>
    </SafeAreaView>

    
  );
}

