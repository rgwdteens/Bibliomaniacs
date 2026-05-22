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
  const API_BASE_URL = "http://localhost:5001";

  const GENRE_IMAGES = {
    horror: "https://images.unsplash.com/photo-1509565840034-3c385bbe6451",
    fantasy: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23",
    "sci-fi": "https://images.unsplash.com/photo-1451187580459-43490279c0fa",
    sci: "https://images.unsplash.com/photo-1446776811953-b23d57bd21aa",
    Romance: "https://images.unsplash.com/photo-1518199266791-5375a83190b7",
    mystery: "https://images.unsplash.com/photo-1524985069026-dd778a71c7b4",
    thriller: "https://images.unsplash.com/photo-1517971071642-34a2d3ecc9cd",
    "historical-fiction": "https://images.unsplash.com/photo-1461360228754-6e81c478b882",
    "young-adult": "https://images.unsplash.com/photo-1529156069898-49953e39b3ac",
    horror: "https://images.unsplash.com/photo-1509565840034-3c385bbe6451",
    dystopian: "https://images.unsplash.com/photo-1520975922323-9d5f6f6b2c5b",
    "literary-fiction": "https://images.unsplash.com/photo-1481627834876-b7833e8f5570",
    classics: "https://images.unsplash.com/photo-1512820790803-83ca734da794",
    classic: "https://images.unsplash.com/photo-1512820790803-83ca734da794",
    fiction: "https://images.unsplash.com/photo-1528207776546-365bb710ee93",
    novel: "https://images.unsplash.com/photo-1528207776546-365bb710ee93",
    contemporary: "https://images.unsplash.com/photo-1495446815901-a7297e633e8d",
    drama: "https://images.unsplash.com/photo-1495446815901-a7297e633e8d",
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
      setbookOfTheWeekGenre(genres[0]);
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

              <View className="adminHomeBookMetaRow">
                <View className="adminHomeBookTag">
                  <Text className="adminHomeBookTagText">
                    {bookOfTheWeekGenre}
                  </Text>
                </View>
                
              </View>

              <Text className="adminHomeBookBlurb">{bookOfTheWeek.blurb}</Text>
            </View>
          </View>

        </View>
      </View>
    </View>
    </RequireAccess>
  );
}
