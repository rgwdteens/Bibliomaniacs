import React, { useState, useEffect } from "react";
import { Search, Star, ThumbsUp, Calendar, TrendingUp, TrendingDown, Filter, ArrowLeft } from "lucide-react";
import { View, Text, TextInput, Pressable, ScrollView, Alert } from "react-native";
import { getAuth } from "firebase/auth";
import { useLocalSearchParams } from "expo-router";

export default function AllReviews() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [selectedReview, setSelectedReview] = useState(null);
  const[communityRating, setCommunityRating] = useState(0);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [userRating, setUserRating] = useState(0);
  const [userStarHover, setUserStarHover] = useState(0);
  const { reviewId } = useLocalSearchParams();
  const GENRE_IMAGES = {
    horror: "https://images.unsplash.com/photo-1509565840034-3c385bbe6451",
    fantasy: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23",
    "sci-fi": "https://images.unsplash.com/photo-1451187580459-43490279c0fa",
    sci: "https://images.unsplash.com/photo-1446776811953-b23d57bd21aa",
    romance: "https://images.unsplash.com/photo-1518199266791-5375a83190b7",
    mystery: "https://images.unsplash.com/photo-1524985069026-dd778a71c7b4",
    thriller: "https://images.unsplash.com/photo-1517971071642-34a2d3ecc9cd",
    "historical-fiction": "https://images.unsplash.com/photo-1461360228754-6e81c478b882",
    "young-adult": "https://images.unsplash.com/photo-1529156069898-49953e39b3ac",
    dystopian: "https://images.unsplash.com/photo-1520975922323-9d5f6f6b2c5b",
    "literary-fiction": "https://images.unsplash.com/photo-1481627834876-b7833e8f5570",
    classics: "https://images.unsplash.com/photo-1512820790803-83ca734da794",
    classic: "https://images.unsplash.com/photo-1512820790803-83ca734da794",
    fiction: "https://images.unsplash.com/photo-1512820790803-83ca734da794",
    novel: "https://images.unsplash.com/photo-1512820790803-83ca734da794",
    contemporary: "https://images.unsplash.com/photo-1495446815901-a7297e633e8d",
    drama: "https://images.unsplash.com/photo-1495446815901-a7297e633e8d",
    default: "https://images.unsplash.com/photo-1519682337058-a94d519337bc"
  };

  useEffect(() => {
    // fetch('http://localhost:5001/clear_cache', { method: 'POST' })
    fetchReviews();
  }, []);

  const fetchCommunityRating = async (bookId) => {
    try {
      const res = await fetch(`http://localhost:5001/get_community_rating/${bookId}`);
      const data = await res.json();
      if (res.ok & data.rating_count != 0) {
        setCommunityRating(data.average_rating);
      }

      const auth = getAuth();
      const user = auth.currentUser;
      if (!user) return; 

      const idToken = await user.getIdToken(true);
      const res2 = await fetch(`http://localhost:5001/get_users_community_rating/${bookId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken, book_id: bookId }),
      });
      const data2 = await res2.json();
      if (res2.ok && data2.rating !== null) {
        setUserRating(data2.rating);
      }
      console.log(userRating);
    } catch (err) {
      console.error("Failed to fetch community rating:", err);
    }
  };

  const getBookImage = (book) => {
    const genres = book.genres || [];

    for (let g of genres) {
      const key = g.toLowerCase();
      if (GENRE_IMAGES[key]) return GENRE_IMAGES[key];
    }

    return GENRE_IMAGES.default;
  };

  const handleSubmitCommunityRating = async (bookId, star) => {
    setUserRating(star);
    try {
      const auth = getAuth();
      const user = auth.currentUser;
      if (!user) {
        alert("You must be logged in to rate a book.");
        return;
      }
  
      const idToken = await user.getIdToken(true);
  
      const res = await fetch("http://localhost:5001/submit_community_rating", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken, book_id: bookId, rating: star }),
      });
  
      const data = await res.json();
      if (!res.ok) {
        console.error("Failed to submit rating:", data.error);
        return;
      }
  
      // Update communityRating local state
      setCommunityRating(data.new_average);
  
    } catch (err) {
      console.error("Failed to submit community rating:", err);
    }
  };

  const fetchReviews = async () => {
    setLoading(true);
    setError(null);

    try {
      const auth = getAuth();
      const user = auth.currentUser;

      let res;

      if (user) {
        const idToken = await user.getIdToken(true);

        res = await fetch(
          "http://localhost:5001/get_recommended_reviews",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ idToken })
          }
        );
      } else {
        res = await fetch(
          "http://localhost:5001/get_reviews?status=approved"
        );
      }

      if (!res.ok) {
        throw new Error("Failed to fetch reviews");
      }

      const data = await res.json();

      setReviews(data);

    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (reviewId && reviews.length > 0) {
      const found = reviews.find(
        (r) => String(r.id) === String(reviewId)
      );

      if (found) {
        setSelectedReview(found);
        fetchCommunityRating(found.id);
      }
    }
  }, [reviewId, reviews]);

  // Filter + search logic
  let filtered = reviews.filter(
    (r) =>
      r.book_title.toLowerCase().includes(search.toLowerCase()) ||
      r.author.toLowerCase().includes(search.toLowerCase()) ||
      (r.first_name + " " + r.last_name).toLowerCase().includes(search.toLowerCase())
  );

  if (filter === "Top Rated") {
    filtered.sort((a, b) => b.rating - a.rating);
  } else if (filter === "Lowest Rated") {
    filtered.sort((a, b) => a.rating - b.rating);
  } else if (filter === "Newest") {
    filtered.sort((a, b) => new Date(b.date_received) - new Date(a.date_received));
  } else if (filter === "Oldest") {
    filtered.sort((a, b) => new Date(a.date_received) - new Date(b.date_received));
  } else if (filter === "Best Match") {
    filtered.sort((a, b) => {
      const scoreDiff =
        (b.recommendation_score || 0) -
        (a.recommendation_score || 0);

      if (scoreDiff !== 0) {
        return scoreDiff;
      }

      return a.book_title.localeCompare(b.book_title);
    });

  } else if (filter === "Worst Match") {
    filtered.sort((a, b) => {
      const scoreDiff =
        (a.recommendation_score || 0) -
        (b.recommendation_score || 0);

      if (scoreDiff !== 0) {
        return scoreDiff;
      }

      return b.book_title.localeCompare(a.book_title);
    });
  }

  const filterOptions = [
    { label: "All", icon: Filter },
    { label: "Best Match", icon: ThumbsUp },
    { label: "Worst Match", icon: TrendingDown },
    { label: "Top Rated", icon: TrendingUp },
    { label: "Lowest Rated", icon: TrendingDown },
    { label: "Newest", icon: Calendar },
    { label: "Oldest", icon: Calendar },
  ];

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-emerald-600 border-t-transparent mx-auto mb-4"></div>
          <p className="text-emerald-700 font-semibold">Loading reviews...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md text-center">
          <div className="text-red-500 text-5xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Error Loading Reviews</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={fetchReviews}
            className="px-6 py-3 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // Expanded Review Modal
  if (selectedReview) {
    const reviewerName = selectedReview.anonymous === "anonymous" 
      ? "Anonymous" 
      : selectedReview.anonymous === "first name only"
      ? selectedReview.first_name
      : `${selectedReview.first_name} ${selectedReview.last_name}`;

    return (
      <ScrollView>
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 pb-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          {/* Back Button */}
          <button
            onClick={() => {setSelectedReview(null); setUserRating(null); setCommunityRating(null)}
            }
            className="flex items-center gap-2 mb-8 text-emerald-700 hover:text-emerald-900 
                     font-semibold transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to all reviews
          </button>

          {/* Expanded Review Card */}
          <div className="bg-white rounded-2xl shadow-lg overflow-hidden border border-emerald-100">
            {/* Compact Header */}
            <div className="bg-gradient-to-r from-emerald-600 to-teal-600 p-5">
              <h1 className="text-2xl font-bold text-white mb-1">{selectedReview.book_title}</h1>
              <p className="text-emerald-50 mb-3">by {selectedReview.author}</p>
              
              <div className="flex flex-wrap items-center gap-2 text-sm text-white/90 mb-2">
                <span className="font-semibold">Reviewed by {reviewerName}</span>
                {selectedReview.grade && (
                  <>
                    <span>•</span>
                    <span>Grade {selectedReview.grade}</span>
                  </>
                )}
                {selectedReview.school && (
                  <>
                    <span>•</span>
                    <span>{selectedReview.school}</span>
                  </>
                )}
              </div>

              <div className="flex items-center gap-4 text-sm text-white">
                <div className="flex items-center gap-1">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      className={`w-4 h-4 ${
                        i < Math.floor(selectedReview.rating)
                          ? "fill-amber-300 text-amber-300"
                          : i < selectedReview.rating
                          ? "fill-amber-300/50 text-amber-300"
                          : "fill-white/30 text-white/30"
                      }`}
                    />
                  ))}
                  <span className="ml-1 font-bold">{Number(selectedReview.rating).toFixed(1)}/5</span>
                </div>
                
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  {new Date(selectedReview.date_received).toLocaleDateString('en-US', { 
                    month: 'short', 
                    day: 'numeric', 
                    year: 'numeric' 
                  })}
                </span>
              </div>

              {/* After the existing rating/date div in the header */}
              <div className="mt-3 pt-3 border-t border-white/20">
                <div className="text-white/80 text-xs mb-2 font-semibold">
                  {communityRating > 0 
                    ? <div className="flex items-center gap-1">
                        <ThumbsUp className="w-4 h-4 fill-white text-white"/>
                        <span className="ml-1 font-bold">{Number(communityRating*20).toFixed(0)}% Liked</span>
                      </div>
                    : "No community ratings yet"}
                </div>
                <p className="text-white text-xs mb-1">Rate this book:</p>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      onClick={() => handleSubmitCommunityRating(selectedReview.id, star)}
                      className="transition-transform hover:scale-125"
                    >
                      <Star
                        className={`w-6 h-6 ${
                          star <= userStarHover || star <= userRating
                            ? "fill-amber-300 text-amber-300"
                            : "fill-white/30 text-white/30"
                        }`}
                        onMouseEnter={() => setUserStarHover(star)}
                        onMouseLeave={() => setUserStarHover(0)}
                      />
                    </button>
                  ))}
                </div>
              </div>
            </div>
            
            {/* Full Review Content */}
            <div className="p-8 md:p-12">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Review</h2>
              <div className="prose prose-lg max-w-none">
                <p className="text-gray-700 leading-relaxed whitespace-pre-line">
                  {selectedReview.review}
                </p>
              </div>

              {/* Additional Info */}
              {selectedReview.call_number && (
                <div className="mt-8 pt-6 border-t border-gray-200">
                  <p className="text-sm text-gray-600">
                    <span className="font-semibold">Call Number:</span> {selectedReview.call_number}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      </ScrollView>
    );
  }
  

  // Main Reviews Grid View
  return (
    <ScrollView>
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-gray-900 mb-3">
            All Reviews
          </h1>
          <p className="text-gray-600">
            Discover what our community is reading
          </p>
        </div>

        {/* Search Bar */}
        <div className="mb-8 max-w-2xl mx-auto">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search by book title, author, or reviewer..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-12 pr-4 py-4 text-lg border-2 border-emerald-200 rounded-2xl 
                       focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100
                       transition-all duration-200 shadow-sm"
            />
          </div>
        </div>

        {/* Filter Buttons */}
        <div className="flex flex-wrap gap-3 justify-center mb-12">
          {filterOptions.map(({ label, icon: Icon }) => (
            <button
              key={label}
              onClick={() => setFilter(label)}
              className={`flex items-center gap-2 px-6 py-3 rounded-xl font-semibold
                       transition-all duration-200 transform hover:scale-105
                       ${
                         filter === label
                           ? "bg-emerald-600 text-white shadow-lg shadow-emerald-200"
                           : "bg-white text-emerald-700 border-2 border-emerald-200 hover:border-emerald-400"
                       }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Results Count */}
        <div className="text-center mb-6">
          <p className="text-gray-600">
            Showing <span className="font-semibold text-emerald-700">{filtered.length}</span> {filtered.length === 1 ? 'review' : 'reviews'}
          </p>
        </div>

        {/* Review Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 max-w-6xl mx-auto">
          {filtered.map((r) => {
            const reviewerName = r.anonymous === "anonymous" 
              ? "Anonymous" 
              : r.anonymous === "first name only"
              ? r.first_name
              : `${r.first_name} ${r.last_name}`;

            return (
              <button
                key={r.id}
                onClick={() => {setSelectedReview(r); fetchCommunityRating(r.id)}
                }
                className="bg-white rounded-xl shadow-md hover:shadow-xl 
                         transition-all duration-300 transform hover:-translate-y-1
                         border border-emerald-100 p-4 text-left cursor-pointer group"
              >

              <img
                src={getBookImage(r)}
                className="w-full h-28 object-cover rounded-lg mb-2"
              />
                <div className="space-y-2">
                  {/* Title and Author */}
                  <div>
                    <h3 className="text-base font-bold text-gray-900 line-clamp-2 group-hover:text-emerald-600 transition-colors">
                      {r.book_title}
                    </h3>
                    <p className="text-xs text-gray-500 mt-1">by {r.author}</p>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1">
                      <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                      <span className="text-sm font-bold text-gray-900">
                        {Number(r.rating).toFixed(1)}
                      </span>
                    </div>
                    <span className="text-xs font-semibold px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full">
                      {reviewerName}
                    </span>
                  </div>

                  {/* Review Preview */}
                  <p className="text-xs text-gray-600 leading-relaxed line-clamp-2">
                    {r.review}
                  </p>

                  {/* Date */}
                  <div className="flex items-center gap-1 text-xs text-gray-400 pt-1 border-t border-gray-100">
                    <Calendar className="w-3 h-3" />
                    <span>
                      {new Date(r.date_received).toLocaleDateString('en-US', { 
                        month: 'short', 
                        year: 'numeric' 
                      })}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* No Results */}
        {filtered.length === 0 && (
          <div className="text-center py-20">
            <div className="bg-white rounded-2xl shadow-lg max-w-md mx-auto p-10 border-2 border-dashed border-gray-200">
              <Search className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                No reviews found
              </h3>
              <p className="text-gray-600">
                Try adjusting your search or filters
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
    </ScrollView>
  );
}