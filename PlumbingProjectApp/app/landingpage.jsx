import React, { useEffect, useState } from "react";
import { Link, useRouter } from "expo-router";
import { View, Text, TextInput, Pressable, FlatList, StyleSheet, ScrollView, Alert, Dimensions, ImageBackground } from "react-native";
import { initializeApp } from "firebase/app";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut, } from "firebase/auth";
import Carousel from "react-native-reanimated-carousel";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";
import { interpolate, interpolateColor } from 'react-native-reanimated';
import axios from "axios";
import { auth, app } from "../backend/firebaseConfig";
import { RequireAccess } from "../components/requireaccess";

export default function LandingPage() {
  const router = useRouter();
  const db = getFirestore(app);
  const { width } = Dimensions.get("window");
  const CARD_WIDTH = Math.min(width * 0.7, 340);

  const [authReady, setAuthReady] = useState(false);
  const [loadingBook, setLoadingBook] = useState(true);
  const API_BASE_URL = "http://localhost:5001";
  const [bookOfTheWeekGenre, setbookOfTheWeekGenre] = useState("");


  const [index, setIndex] = useState(0);

  const GENRE_IMAGES = {
    horror: "https://images.unsplash.com/photo-1504701954957-2010ec3bcec1",
    fantasy: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23",
    "sci-fi": "https://images.unsplash.com/photo-1451187580459-43490279c0fa",
    sci: "https://images.unsplash.com/photo-1446776811953-b23d57bd21aa",
    romance: "https://images.unsplash.com/photo-1518199266791-5375a83190b7",
    mystery: "https://images.unsplash.com/photo-1577401159468-3bbc7ee440b5",
    thriller: "https://images.unsplash.com/photo-1628490673809-6c16ee26d28d",
    "historical-fiction": "https://images.unsplash.com/photo-1505664194779-8beaceb93744",
    "young-adult": "https://images.unsplash.com/photo-1529156069898-49953e39b3ac",
    dystopian: "https://images.unsplash.com/photo-1713362280665-21ffc10ae3b0",
    "literary-fiction": "https://images.unsplash.com/photo-1455390582262-044cdead277a",
    classics: "https://images.unsplash.com/photo-1478641300939-0ec5188d3802",
    classic: "https://images.unsplash.com/photo-1478641300939-0ec5188d3802",
    fiction: "https://images.unsplash.com/photo-1673526475171-753a32e74535",
    novel: "https://images.unsplash.com/photo-1651643367896-43a10f05bc69",
    drama: "https://images.unsplash.com/photo-1601723897234-327147304013",
    default: "https://images.unsplash.com/photo-1519682337058-a94d519337bc"
  };

  const [bookOfWeek, setBookOfWeek] = useState({
    title: "",
    author: "",
    lastUpdated: "",
  });

  const getGenreImage = (genres) => {
    if (!genres || genres.length === 0) {
      return GENRE_IMAGES.default;
    }

    for (const g of genres) {
      if (g) {
        const normalized = g.toLowerCase().trim();

        if (GENRE_IMAGES[normalized]) {
          return GENRE_IMAGES[normalized];
        }
      }
    }

    return GENRE_IMAGES.default;
  };

  const getBookOfWeekImage = (book) => {
    const genres = book?.genres || [book?.genre];
    return getGenreImage(genres);
  };

  useEffect(() => {
    if (bookOfWeek?.genres || bookOfWeek?.genre) {
      const genres = bookOfWeek.genres || [bookOfWeek.genre];
      setbookOfTheWeekGenre(genres[0].substring(0, 1).toUpperCase() + genres[0].substring(1));
    }
  }, [bookOfWeek]);
  
  const next = () => {
    setIndex((prev) => (prev + 1) % topRecs.length);
  };

  const prev = () => {
    setIndex((prev) => (prev - 1 + topRecs.length) % topRecs.length);
  };

  const topRecs = [
    {
      title: "Harry Potter",
      meta: "Fantasy · 4.7 ★",
      genres: ["fantasy"],
    },
    {
      title: "Atomic Habits",
      meta: "Non-fiction · 4.6 ★",
      genres: ["contemporary"],
    },
    {
      title: "Dark Matter",
      meta: "Sci-fi · 4.9 ★",
      genres: ["sci-fi"],
    },
  ];

  const getUserRole = async (user) => {
    const idToken = await user.getIdToken(true);
  
    const res = await axios.post("https://bibliomaniacs.onrender.com/get_user_role", {
      idToken,
    });
  
    return typeof res.data === "string" ? res.data : res.data.role;
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
  const bookOfTheWeek = {
    "title": "To Kill a Mockingbird",
    "genre": "Bildungsroman",
    "stars": "4.3",
    "pages": "285",
    "descr": "Quick Read", 
    "blurb": "The conscience of a town steeped in prejudice, violence and hypocrisy is pricked by the stamina of one man's struggle for justice. But the weight of history will only tolerate so much."
  }

  useEffect(() => {
    const auth = getAuth();
    
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setAuthReady(true);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const auth = getAuth();

    if (authReady) {
      fetchBookOfWeek();
    }
  }, [authReady]);

  const fetchBookOfWeek = async () => {
    try {
      setLoadingBook(true);
      const response = await fetch(`${API_BASE_URL}/get_book_of_week`);

      if (response.ok) {
        const data = await response.json();
        setBookOfWeek(data);
        console.log(bookOfWeek);
      } else {
        console.error("Failed to fetch book of the week");
      }
    } catch (error) {
      console.error("Error fetching book of the week:", error);
    } finally {
      setLoadingBook(false);
    }
  };


  return (
    <ScrollView className="landingPageRoot landingScroll">
      {/* === TOP BAND === */}
      <View className="landingTopSection">
        <View className="landingTopInner">
          {/* LEFT COLUMN */}
          <View className="landingTopLeft">
            {/* Copy block */}
            <View className="landingTopCopy">
              <Text className="landingTitle">Bibliomaniacs</Text>

              <Text className="landingTagline">
                Book review website that enhances Ridgewood Public Library’s volunteer review
                service by streamlining personal information entry, organizing hours, and
                providing recommendations.
              </Text>

              <View className="landingBullets">
                <Text className="landingBullet">• Share your opinions on your favorite books</Text>
                <Text className="landingBullet">• Explore new works approved by fellow teens</Text>
                <Text className="landingBullet">• Earn community service hours</Text>
              </View>
            </View>

            {/* CTAs pinned towards bottom of the column */}
            <View className="landingCtaRowBottom">
              <Pressable
                className="landingPrimaryBtn"
                onPress={handleGoogleSignIn}
              >
                <Text className="landingPrimaryText">Sign Up</Text>
              </Pressable>

              <Pressable
                className="landingSecondaryBtn"
                onPress={handleGoogleSignIn}
              >
                <Text className="landingSecondaryText">Log In</Text>
              </Pressable>
            </View>
          </View>


          {/* RIGHT COLUMN – Book of the Week */}
          <View className="bookWeekCard">
            <Text className="bookWeekLabel">Book of the Week</Text>
            <Text className="bookWeekTitle">{bookOfWeek.title}</Text>

            <ImageBackground
                source={{ uri: getBookOfWeekImage(bookOfWeek) }}
                className="bookWeekCover"
                imageStyle={{ borderRadius: 16 }}
              >
                <View
                  style={{
                    flex: 1,
                    backgroundColor: "rgba(0,0,0,0.25)",
                    justifyContent: "flex-end",
                    padding: 12,
                    borderRadius: 16,
                  }}
                >
                </View>
              </ImageBackground>

            <View className="bookWeekMetaRow">
                <View className="bookWeekTag">
                  <Text className="bookWeekTagText">
                    {bookOfTheWeekGenre}
                  </Text>
                </View>
              </View>

              <Text className="bookWeekBlurb">{bookOfTheWeek.blurb}</Text>
          </View>
        </View>
      </View>

      {/* === BOTTOM BAND === */}
      <View className="landingBottomSection">
        <View className="recsHeaderRow">
          <Text className="recsTitle">Top Recommendations</Text>
          <Pressable>
            <Link href="explorer" className="recsShowMore">Show more</Link>
          </Pressable>
        </View>
        <View style>
          <Carousel
            width={width}
            height={300}
            data={topRecs}
            loop
            autoPlay
            autoPlayInterval={3000}
            scrollAnimationDuration={800}
            mode="custom"
            customAnimation={(value) => {
              'worklet';
              const zIndex = interpolate(
                value,
                [-1, -0.5, 0, 0.5, 1],
                [1, 5, 20, 5, 1]
              );

              const scale = interpolate(
                value,
                [-1, 0, 1],
                [0.8, 1, 0.8]
              );

              const opacity = interpolate(
                value,
                [-1, -0.5, 0, 0.5, 1],
                [0.4, 0.8, 1, 0.8, 0.4]
              );

              const translateX = interpolate(
                value,
                [-1, 0, 1],
                [-width * 0.25, 0, width * 0.25]
              );

              return {
                transform: [
                  { scale },
                  { translateX }
                ],
                zIndex,
                opacity,
              };
            }}
            windowSize={3}
            renderItem={({ item }) => (
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                <View
                  style={{
                    width: CARD_WIDTH,
                    backgroundColor: '#f6faf6',
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.1,
                    shadowRadius: 8,
                    elevation: 5,
                  }}
                  className="carouselCard"
                >
                  <ImageBackground
                    source={{ uri: getGenreImage(item.genres) }}
                    className="carouselThumb"
                    imageStyle={{
                      borderTopLeftRadius: 16,
                      borderTopRightRadius: 16,
                    }}
                  >
                    <View
                      style={{
                        flex: 1,
                        backgroundColor: "rgba(0,0,0,0.25)",
                        borderTopLeftRadius: 16,
                        borderTopRightRadius: 16,
                      }}
                    />
                  </ImageBackground>
                  <Text className="carouselTitle">{item.title}</Text>
                  <Text className="carouselMeta">{item.meta}</Text>
                </View>
              </View>
            )}
          />
        </View>
      </View>


<View className="footer">
        <View className="footerInner">

          <View className="flex flex-row flex-wrap justify-between gap-10">

            <View className="w-60">
                <Text className="footerBrand">Bibliomaniacs</Text>
                <Text className="footerText">
                  Building better reading habits for the Ridgewood community.
                </Text>
              </View>

              <View className="w-60">
                <Text className="footerTitle">Contact Us</Text>
                <Text className="footerText">Email: ask@ridgewoodlibrary.org</Text>
                <Text className="footerText">Phone: (201) 670-5600</Text>
                <Text className="footerText">125 North Maple Ave. Ridgewood, NJ 07450</Text>
              </View>

              <View className="w-60">
                <Text className="footerTitle">Follow Us</Text>
                <Link href="https://www.youtube.com/channel/UC7o0gxy5ZpOkq3eU2dNYQIg" className="footerText">Youtube</Link>
                <Link href="https://www.instagram.com/ridgewoodlibrary/?hl=en" className="footerText">Instagram</Link>
                <Link href="https://www.facebook.com/ridgewoodlibrarynj/#" className="footerText">Facebook</Link>
              </View>

          </View>

          <View className="footerDivider" />

          <Text className="footerCopyright">
            @{new Date().getFullYear()} Ridgewood Public Library. All Rights Reserved
          </Text>

        </View>
      </View>
    </ScrollView>
  );
}

// import { Link } from "expo-router";
// import { View, Text, Pressable, StyleSheet, Image, ScrollView, Platform } from "react-native";
// import jsPDF from "jspdf";

// export default function LandingPage() {

//   const generateCertificate = () => {
//     const doc = new jsPDF({
//       orientation: "portrait",
//       unit: "pt",
//       format: "a4",
//     });

//     doc.setFontSize(28);
//     doc.text("Certificate of Volunteer Hours", 50, 100);

//     doc.setFontSize(20);
//     doc.text("This certifies that NAME", 50, 150);
//     doc.text("has completed 15 volunteer hours", 50, 180);

//     doc.setFontSize(18);
//     doc.text("Ridgewood Public Library", 50, 210);

//     if (Platform.OS === "web") {
//       doc.save("certificate.pdf");
//     } else {
//       doc.output("dataurlstring").then((pdfDataUri) => {
//         const base64 = pdfDataUri.split(",")[1];

//         import("expo-file-system").then(FileSystem => {
//           import("expo-sharing").then(Sharing => {
//             const fileUri = FileSystem.cacheDirectory + "certificate.pdf";
//             FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 })
//               .then(() => Sharing.shareAsync(fileUri));
//           });
//         });
//       });
//     }
//   };

//   return (
//     <ScrollView contentContainerStyle={{ alignItems: 'center' }}>
//       <View className="container">
//         <Text className="title">Welcome to Bibliomaniacs</Text>
//         <Text className="subtitle">
//           Track what you read, discover new favorites, and see what our community loves.
//         </Text>

//         <Image
//           source={{ uri: "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=1600" }}
//           className="hero"
//         />

//       <View className="ctaRow">
//         <Link href="/explorer" asChild>
//           <Pressable className="primaryBtn">
//             <Text className="primaryText">Read Our Reviews</Text>
//           </Pressable>
//         </Link>
//         <Pressable className="secondaryBtn" onPress={() => alert("Logging coming soon!")}>
//           <Text className="secondaryText">Start Logging</Text>
//         </Pressable>
//         <Pressable
//           className="primaryBtn"
//           onPress={generateCertificate}
//         >
//           <Text className="primaryText">Generate Certificate</Text>
//         </Pressable>
//       </View>

//         <View className="features">
//           {["Web-first", "Mobile ready", "JSX only"].map((f, i) => (
//             <View key={i} className="featureCard">
//               <Text className="featureText">{f}</Text>
//             </View>
//           ))}
//         </View>
//       </View>
//     </ScrollView>
//   );
// }

// // const styles = StyleSheet.create({
// //   container: { padding: 24, gap: 16, alignItems: "center" },
// //   title: { fontSize: 34, fontWeight: "800", textAlign: "center" },
// //   subtitle: { fontSize: 16, color: "#3b3b3b", textAlign: "center", maxWidth: 720 },
// //   hero: { width: "100%", maxWidth: 960, height: 320, borderRadius: 20, backgroundColor: "#ddd" },
// //   ctaRow: { flexDirection: "row", gap: 12, marginTop: 10, flexWrap: "wrap" },
// //   primaryBtn: { backgroundColor: "#2b7a4b", paddingVertical: 12, paddingHorizontal: 18, borderRadius: 12 },
// //   primaryText: { color: "white", fontWeight: "700" },
// //   secondaryBtn: { backgroundColor: "white", borderWidth: 2, borderColor: "#2b7a4b", paddingVertical: 12, paddingHorizontal: 18, borderRadius: 12 },
// //   secondaryText: { color: "#2b7a4b", fontWeight: "700" },
// //   features: { flexDirection: "row", gap: 12, flexWrap: "wrap", justifyContent: "center" },
// //   featureCard: { backgroundColor: "#eaf6ea", borderWidth: 1, borderColor: "#cfe8cf", borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14 },
// //   featureText: { color: "#224c2f", fontWeight: "700" },
// // });
