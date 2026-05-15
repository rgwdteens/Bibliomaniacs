import React, { useState, useEffect } from "react";
import { RequireAccess } from "../components/requireaccess";
import { Link } from "expo-router";
import { View, Text, Pressable, ScrollView } from "react-native";
import { interpolate, interpolateColor } from 'react-native-reanimated';
import Carousel from "react-native-reanimated-carousel";
import { Dimensions } from "react-native";
import { getAuth } from "firebase/auth";
import { getFirestore, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { auth, app } from "../firebaseConfig";
import { router } from "expo-router";

const { width } = Dimensions.get("window");
const CARD_WIDTH = Math.min(width * 0.7, 340);

export default function LandingPage() {
  const [recommendations, setRecommendations] = useState([]);
  const [loadingRecs, setLoadingRecs] = useState(true);
  const [authReady, setAuthReady] = useState(false);
  const [loadingBook, setLoadingBook] = useState(true);
  const [selectedReview, setSelectedReview] = useState(null);
  const [reviewMessage, setReviewMessage] = useState("");
  const API_BASE_URL = "http://localhost:5001";

  useEffect(() => {
    const auth = getAuth();
    const user = auth.currentUser;

    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (!user) return;

      if (user) {

        if (!user) {
          alert("You must be logged in");
          return;
        }
        try {
          const idToken = await user.getIdToken(true);
          const response = await fetch("http://localhost:5001/get_recommendations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idToken: idToken })
          });

          const result = await response.json();
          if (result.recommendations) {
            setRecommendations(result.recommendations);
          }
        } catch (err) {
          console.error("Rec fetch failed:", err);
        } finally {
          setLoadingRecs(false);
        }
      }


      try {
        const db = getFirestore(app);
        const userRef = doc(db, "users", user.uid);
        const snap = await getDoc(userRef);

        if (!snap.exists()) return;

        const data = snap.data() || {};
        const current = Array.isArray(data.notifications) ? data.notifications : [];

        const filtered = current.filter((n) => n?.type !== "book_of_the_week");

        if (filtered.length !== current.length) {
          await updateDoc(userRef, { notifications: filtered });
        }
      } catch (err) {
        console.error("Failed clearing review_status notifications:", err);
      }
    });

    return unsubscribe;
  }, []);
  
  const [bookOfWeek, setBookOfWeek] = useState({
    title: "",
    author: "",
    lastUpdated: "",
  });

  const handleRecommendationPress = async (book) => {
    try {
      const res = await fetch(
        "http://localhost:5001/get_reviews?status=approved"
      );

      const data = await res.json();

      const matchingReview = data.find(
        (r) =>
          r.book_title?.toLowerCase().trim() ===
          book.title?.toLowerCase().trim()
      );

      if (matchingReview) {
        router.push({
          pathname: "/explorer",
          params: {
            reviewId: matchingReview.id,
          },
        });
      } else {
        alert(
          "No Bibliomaniacs user has written a review for this book yet."
        );
      }
    } catch (err) {
      console.error("Failed loading review:", err);
    }
  };
  
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

  const bookOfTheWeek = {
    title: "To Kill a Mockingbird",
    genre: "Bildungsroman",
    stars: "4.3",
    pages: "285",
    descr: "Quick Read",
    blurb:
      "The conscience of a town steeped in prejudice, violence and hypocrisy is pricked by the stamina of one man's struggle for justice. But the weight of history will only tolerate so much.",
  };

  const topRecs = [
    {
      title: "Harry Potter",
      meta: "Fantasy · 4.7 ★",
    },
    {
      title: "Atomic Habits",
      meta: "Non-fiction · 4.6 ★",
    },
    {
      title: "Dark Matter",
      meta: "Sci-fi · 4.9 ★",
    },
  ];

  const [index, setIndex] = useState(0);

  const next = () => {
    setIndex((prev) => (prev + 1) % recommendations.length);
  };

  const prev = () => {
    setIndex((prev) => (prev - 1 + recommendations.length) % recommendations.length);
  };

  if (selectedReview) {
    return (
      <ScrollView className="bg-emerald-50 min-h-screen">
        <View className="max-w-4xl mx-auto px-6 py-10">

          <Pressable
            onPress={() => {
              setSelectedReview(null);
              setReviewMessage("");
            }}
            className="mb-6"
          >
            <Text className="text-emerald-700 font-semibold text-lg">
              ← Back to all recommendations
            </Text>
          </Pressable>

          <View className="bg-white rounded-2xl p-8 shadow-md">

            <Text className="text-3xl font-bold text-gray-900 mb-2">
              {selectedReview.book_title || selectedReview.title}
            </Text>

            <Text className="text-lg text-gray-600 mb-6">
              by {selectedReview.author}
            </Text>

            {selectedReview.noReview ? (
              <Text className="text-gray-500 text-base">
                {reviewMessage}
              </Text>
            ) : (
              <>
                <Text className="text-emerald-700 font-semibold mb-3">
                  Community Review
                </Text>

                <Text className="text-gray-700 leading-7 text-base">
                  {selectedReview.review}
                </Text>

                <View className="mt-6 pt-4 border-t border-gray-200">
                  <Text className="text-sm text-gray-500">
                    Rating: ⭐ {selectedReview.rating}
                  </Text>
                </View>
              </>
            )}
          </View>
        </View>
      </ScrollView>
    );
  }

  return (
    <RequireAccess
      allowRoles={["user", "admin"]}
      redirectTo="/notfound"
    >
      <ScrollView className="landingPageRoot landingScroll">
        {/* === TOP BAND === */}
        <View className="landingTopSection">
          <View className="landingTopInner">
            <View className="homeTopLeft">
              <Text className="landingTitle">Welcome Back!</Text>

              <Text className="landingTagline pt-2 pb-8">
                Book review website that enhances Ridgewood Public Library’s
                volunteer review service by streamlining personal information
                entry, organizing hours, and providing recommendations.
              </Text>

              <Pressable
                className="landingPrimaryBtn self-start"
                onPress={() => navigation?.navigate?.("myreviews")}
              >
                <Text className="landingPrimaryText">Add a Review</Text>
              </Pressable>
            </View>

          {/* RIGHT COLUMN – Book of the Week */}
          <View className="bookWeekCard">
            <Text className="bookWeekLabel">Book of the Week</Text>
            <Text className="bookWeekTitle">{bookOfWeek.title}</Text>

              <View className="bookWeekCover" />

              <View className="bookWeekMetaRow">
                <View className="bookWeekTag">
                  <Text className="bookWeekTagText">
                    {bookOfTheWeek.genre} · {bookOfTheWeek.stars} ★
                  </Text>
                </View>
                <Text className="bookWeekPages">
                  {bookOfTheWeek.pages} · {bookOfTheWeek.descr}
                </Text>
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
              data={recommendations}
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
                  <Pressable
                    onPress={() => handleRecommendationPress(item)}
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
                    <View className="carouselThumb" />
                    <Text className="carouselTitle">{item.title}</Text>
                    <Text className="carouselMeta">
                      {item.author}
                    </Text>

                    <Text className="carouselMeta">
                      ⭐ {item.avg_rating && item.avg_rating > 0
                          ? item.avg_rating.toFixed(1)
                          : "N/A"}
                    </Text>
                  </Pressable>
                </View>
              )}
            />
          </View>
        </View>



        {/* FOOTER */}
        < View className="footer" >
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
        </View >
      </ScrollView >
    </RequireAccess>
  );
}
