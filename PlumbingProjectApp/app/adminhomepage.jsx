import React from "react";
import { View, Text, Pressable, ImageBackground } from "react-native";
import { useRouter } from "expo-router";
import { RequireAccess } from "../components/requireaccess";
import { useState, useEffect } from "react";
import { auth, app } from "../firebaseConfig";
import { getAuth } from "firebase/auth";

export default function AdminHomePage() {
  const router = useRouter();

  const [authReady, setAuthReady] = useState(false);
  const [loadingBook, setLoadingBook] = useState(true);
  const [bookOfTheWeekGenre, setbookOfTheWeekGenre] = useState("");
  const API_BASE_URL = "https://bibliomaniacs.onrender.com";

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



  const bookOfTheWeek = {
    title: "To Kill a Mockingbird",
    genre: "Bildungsroman",
    stars: "4.3",
    pages: "285",
    descr: "Quick Read",
    blurb:
      "The conscience of a town steeped in prejudice, violence and hypocrisy is pricked by the stamina of one man's struggle for justice. But the weight of history will only tolerate so much.",
  };

  const [bookOfWeek, setBookOfWeek] = useState({
    title: "",
    author: "",
    lastUpdated: "",
  });

  useEffect(() => {
    const auth = getAuth();
    auth.currentUser;
    
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        setAuthReady(true);
      } else {
        setAuthReady(false);
        console.error("User not authenticated");
      }
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
        console.log(bookOFWeek);
      } else {
        console.error("Failed to fetch book of the week");
      }
    } catch (error) {
      console.error("Error fetching book of the week:", error);
    } finally {
      setLoadingBook(false);
    }
  };

  const getGenreImage = (genres) => {
    if (!genres) return GENRE_IMAGES.default;

    const genreArray = Array.isArray(genres)
      ? genres
      : typeof genres === "string"
      ? [genres]
      : [];

    for (const g of genreArray) {
      if (!g || typeof g !== "string") continue;

      const normalized = g.toLowerCase().trim();

      for (const key in GENRE_IMAGES) {
        if (normalized.includes(key)) {
          return GENRE_IMAGES[key];
        }
      }
    }

    return GENRE_IMAGES.default;
  };
  useEffect(() => {
    if (bookOfWeek?.genres || bookOfWeek?.genre) {
      const genres = bookOfWeek.genres || [bookOfWeek.genre];
      setbookOfTheWeekGenre(genres[0].substring(0, 1).toUpperCase() + genres[0].substring(1));
    }
  }, [bookOfWeek]);
  const getBookOfWeekImage = (book) => {
    const genres = book?.genres || [book?.genre];
    return getGenreImage(genres);
  };

  return (
    <RequireAccess
      allowRoles={["admin"]}
      redirectTo="/notfound"
    >
    <View className="adminHomeRoot pt-16">
      <View className="adminHomeHeroSection">
        <View className="adminHomeHeroInner">

          {/* LEFT COLUMN */}
          <View className="adminHomeLeft">
            <Text className="adminHomeTitle">Welcome, Admin!</Text>

            <Text className="adminHomeTagline">
              As a Bibliomaniacs admin, you are granted full access to the admin pages, including the homepage, dashboard, and collection of all reviews. You may also explore the reviews from the user perspective.
            </Text>

            <View className="adminHomeBullets">
              <Text className="adminHomeBullet">• Approve or reject book reviews</Text>
              <Text className="adminHomeBullet">• Notify volunteers of their review status</Text>
              <Text className="adminHomeBullet">• Update the book of the week</Text>
            </View>

            <View className="adminHomeCtas">
              <Pressable
                className="landingPrimaryBtn"
                onPress={() => router.push("/admindashboard")}
              >
                <Text className="adminHomePrimaryText">Dashboard</Text>
              </Pressable>

            </View>
          </View>

          {/* RIGHT COLUMN – Book of the Week */}
          <View className="adminHomeRight">
            <View className="adminHomeBookCard">
              <Text className="adminHomeBookLabel">Book of the Week</Text>
              <Text className="adminHomeBookTitle">{bookOfWeek.title}</Text>

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
      </View>
    </View>
    </RequireAccess>
  );
}
