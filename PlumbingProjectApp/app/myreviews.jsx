import React, { useState, useEffect, useRef } from "react";
import { View, Text, TextInput, ScrollView, SafeAreaContext, TouchableOpacity } from "react-native";
import ReviewModal from "./reviewmodal";
import { RequireAccess } from "../components/requireaccess";
import { getAuth } from "firebase/auth";
import { auth, app } from "../backend/firebaseConfig";
import { getFirestore, doc, getDoc, updateDoc, deleteField } from "firebase/firestore";

export default function MyReviews() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [sortOrder, setSortOrder] = useState("newest");
  const [userName] = useState("John Smith");
  const [bookTitle, setBookTitle] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [review, setReview] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [titleFlagged, setTitleFlagged] = useState(false);
  const [titleCheckLoading, setTitleCheckLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [rating, setRating] = useState(0);
  const [gradeLevel, setGradeLevel] = useState("");
  const [school, setSchool] = useState("");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [anonPref, setAnonPref] = useState("");
  const [recommendedGrades, setRecommendedGrades] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingReviewId, setEditingReviewId] = useState(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedReview, setSelectedReview] = useState(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [dailyReviewsRemaining, setDailyReviewsRemaining] = useState(2);
  const [dailyReviewsSubmitted, setDailyReviewsSubmitted] = useState(0);
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [selectedComment, setSelectedComment] = useState("");
  
  const debounceTimer = useRef(null);

  const statusColor = {
    Approved: "#2b7a4b",
    Pending: "#cc9a06",
    Rejected: "#c0392b",
  };

  const db = getFirestore(app);

  const approvedReviews = reviews.filter(r => r.status === "Approved").length;
  const volunteerHours = (approvedReviews * 0.5).toFixed(1);

  // Calculate daily reviews from today's submissions
  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayReviews = reviews.filter(r => {
      const reviewDate = new Date(r.createdAt);
      reviewDate.setHours(0, 0, 0, 0);
      return reviewDate.getTime() === today.getTime();
    }).length;

    setDailyReviewsSubmitted(todayReviews);
    setDailyReviewsRemaining(Math.max(0, 2 - todayReviews));
  }, [reviews]);

  const filtered = reviews
    .filter((r) => {
      const matchStatus = statusFilter === "All" || r.status === statusFilter;
      const matchSearch = r.bookTitle.toLowerCase().includes(search.toLowerCase());
      return matchStatus && matchSearch;
    })
    .sort((a, b) => {
      const dateA = new Date(a.createdAt);
      const dateB = new Date(b.createdAt);
      return sortOrder === "newest" ? dateB - dateA : dateA - dateB;
    });

  const exportCSV = () => {
    const headers = ["Book Title", "Review", "Rating", "Status", "Date"];
    const rows = filtered.map(r => [r.bookTitle, r.review, r.rating, r.status, r.createdAt]);
    const csvContent = [headers.join(","), ...rows.map(row => row.map(cell => `"${cell}"`).join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "my_reviews.csv";
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handleTitleChange = (text) => {
    setBookTitle(text);

    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    const trimmed = text.trim();
    if (!trimmed) {
      setTitleFlagged(false);
      setTitleCheckLoading(false);
      return;
    }

    setTitleCheckLoading(true);
    debounceTimer.current = setTimeout(async () => {
      try {
        const response = await fetch(
          `https://bibliomaniacs-ytnd.onrender.com/check_book_popularity?title=${encodeURIComponent(trimmed)}`
        );
        if (response.ok) {
          const data = await response.json();
          setTitleFlagged(data.commonly_reviewed === true);
        } else {
          setTitleFlagged(false);
        }
      } catch (err) {
        console.warn("Title check failed:", err);
        setTitleFlagged(false);
      } finally {
        setTitleCheckLoading(false);
      }
    }, 500);
  };

  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  const gradeOptions = ["6", "7", "8", "9", "10", "11", "12"];
  const anonOptions = ["Yes", "No", "First Name Only"];

  const toggleRecommendedGrade = (level) => {
    if (recommendedGrades.includes(level)) {
      setRecommendedGrades(recommendedGrades.filter((g) => g !== level));
    } else {
      setRecommendedGrades([...recommendedGrades, level]);
    }
  };
  

  const fetchUserReviews = async (user) => {
    try {
      if (!user) return;

      const idToken = await user.getIdToken(true);

      const res = await fetch("https://bibliomaniacs-ytnd.onrender.com/get_user_reviews", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ idToken }),
      });

      const data = await res.json();

      if (!res.ok) {
        console.error("Backend error:", data);
        return;
      }

      setReviews(
        data.reviews.map(r => ({
          id: r.id,
          bookTitle: r.book_title,
          author: r.author,
          review: r.review,
          rating: r.rating,
          status: r.status,
          createdAt: r.date_received,
          comment: r.comment_to_user,
          timeEarned: r.time_earned,
          first_name: r.first_name,
          last_name: r.last_name,
          email: user.email,
          phone_number: r.phone_number,
          school: r.school,
          grade: r.grade,
          recommended_audience_grade: r.recommended_audience_grade,
          anonymous: r.anonymous,
          date_received: r.date_received,
        }))
      );
    } catch (err) {
      console.error("Failed to load reviews:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteReview = async (reviewId) => {
    const confirmed = window.confirm(
      "Are you sure you want to delete this pending review? This action cannot be undone."
    );

    if (!confirmed) return;

    try {
      const auth = getAuth();
      const user = auth.currentUser;

      if (!user) {
        alert("You must be logged in");
        return;
      }

      const idToken = await user.getIdToken(true);

      const res = await fetch(
        `https://bibliomaniacs-ytnd.onrender.com/delete_user_review/${reviewId}`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ idToken }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Failed to delete review");
        return;
      }

      alert("Review deleted successfully");
      setReviews((prev) => prev.filter((r) => r.id !== reviewId));
    } catch (err) {
      console.error("Delete failed:", err);
      alert("Error deleting review");
    }
  };

  const fetchUserProfile = async (user) => {
    try {
      const userRef = doc(db, "users", user.uid);
      const snap = await getDoc(userRef);

      if (snap.exists()) {
        const data = snap.data();
        setFirstName(data.first_name ?? "");
        setLastName(data.last_name ?? "");
        setGradeLevel(data.grade ?? "");
        setEmail(data.email ?? "");
        setPhoneNumber(data.phone ?? "");
        setSchool(data.school ?? "");
      } else {
        setFirstName("");
        setLastName("");
        setGradeLevel("");
        setEmail("");
        setPhoneNumber("");
        setSchool("");
      }
    } catch (err) {
      console.error("Failed to load profile:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const auth = getAuth();

    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (!user) {
        setLoading(false);
        return;
      }

      fetchUserReviews(user);
      fetchUserProfile(user);
    });

    return () => unsubscribe();
  }, []);

  const handleSubmitReview = async () => {
    const auth = getAuth();
    const user = auth.currentUser;
    if (!user) {
      alert("You must be logged in");
      return;
    }

    // Check daily limit before submitting
    if (!isEditMode && dailyReviewsRemaining <= 0) {
      alert("You've reached your daily limit of 2 reviews. Please try again tomorrow!");
      return;
    }

    const wordCount = review.trim().split(/\s+/).filter(Boolean).length;
    if (wordCount < 200) {
      alert(`Your review must be at least 200 words. Current count: ${wordCount} words.`);
      return;
    }

    const idToken = await user.getIdToken(true);

    const reviewData = {
      id: editingReviewId,
      idToken: idToken,
      first_name: firstName,
      last_name: lastName,
      email: user.email,
      phone_number: phoneNumber,
      school: school,
      book_title: bookTitle,
      author: authorName,
      rating: rating,
      review: review,
      grade: gradeLevel,
      school: school,
      recommended_audience_grade: recommendedGrades,
      anonymous: anonPref,
    };

    try {
      const url = isEditMode
        ? `https://bibliomaniacs-ytnd.onrender.com/update_user_review/${editingReviewId}`
        : "https://bibliomaniacs-ytnd.onrender.com/submit_review";

      const method = isEditMode ? "PUT" : "POST";

      console.log("Review ID:", editingReviewId);
      console.log("Data:", JSON.stringify(reviewData))
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reviewData),
      });

      const result = await response.json();

      if (response.ok) {
        console.log("Success:", result);

        // Update daily counts from response if provided
        if (result.daily_reviews_remaining !== undefined) {
          setDailyReviewsRemaining(result.daily_reviews_remaining);
          setDailyReviewsSubmitted(result.daily_reviews_submitted);
        }

        // Only notify admins for new reviews, not edits
        if (!isEditMode) {
          try {
            await fetch("https://bibliomaniacs-ytnd.onrender.com/notify_admins", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                idToken,
                sender: `${firstName} ${lastName}`,
                book: bookTitle,
                status: "new_review"
              }),
            });
          } catch (notifErr) {
            console.error("Failed to notify admins:", notifErr);
          }
        }

        setModalVisible(false);
        setIsEditMode(false);
        setEditingReviewId(null);
        alert(isEditMode ? "Review updated!" : "Review submitted!");
        await fetchUserReviews(user);
      } else if (response.status === 429) {
        alert(result.message || "You've reached your daily limit of 2 reviews. Please try again tomorrow!");
      } else {
        alert(result.error || "Submission failed. Please try again.");
      }
    } catch (error) {
      console.error("Error submitting review:", error);
      alert("An error occurred while connecting to the server.");
    }
  };

  const openEditModal = (review) => {
    setEditingReviewId(review.id);
    setIsEditMode(true);

    setBookTitle(review.bookTitle);
    setAuthorName(review.author || "");
    setEmail(review.email || "");
    setPhoneNumber(review.phone_number || "");
    setSchool(review.school || "");
    setReview(review.review);
    setRating(review.rating);
    setGradeLevel(
      review.grade !== undefined && review.grade !== null
        ? String(review.grade)
        : ""
    );
    setRecommendedGrades(review.recommended_audience_grade || []);
    setAnonPref(review.anonymous || "");
    setFirstName(review.first_name || "");
    setLastName(review.last_name || "");
    setTitleFlagged(false);
    setTitleCheckLoading(false);

    setModalVisible(true);
  };

  const viewReview = (review) => {
    setSelectedReview(review);
    setShowViewModal(true);
  };

  const generateCertificate = () => {
    const certificateHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          @page { size: landscape; margin: 0; }
          body { margin: 0; padding: 0; font-family: 'Georgia', serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%); }
          .certificate { width: 800px; padding: 60px; background: white; border: 20px solid #2b7a4b; box-shadow: 0 0 50px rgba(0,0,0,0.3); text-align: center; position: relative; }
          .header { font-size: 48px; font-weight: bold; color: #2b7a4b; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 4px; }
          .name { font-size: 36px; font-weight: bold; color: #1a4d2e; text-decoration: underline; margin: 20px 0; }
          .hours { font-size: 32px; font-weight: bold; color: #2b7a4b; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="certificate">
          <div class="header">Certificate of Appreciation</div>
          <div class="name">${firstName} ${lastName}</div>
          <div class="hours">${volunteerHours} Volunteer Hours</div>
          <div class="date">Issued on ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
        </div>
      </body>
      </html>
    `;
    const blob = new Blob([certificateHTML], { type: "text/html" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    // ✅ FIXED: Use actual firstName + lastName instead of hardcoded userName
    a.download = `volunteer_certificate_${`${firstName} ${lastName}`.trim().replace(/\s+/g, '_')}.html`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  useEffect(() => {
    const auth = getAuth();

    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (!user) return;

      try {
        const db = getFirestore();
        const userRef = doc(db, "users", user.uid);
        const snap = await getDoc(userRef);

        if (!snap.exists()) return;

        const data = snap.data() || {};
        const current = Array.isArray(data.notifications) ? data.notifications : [];

        const filtered = current.filter((n) => n?.type !== "review_status");

        if (filtered.length !== current.length) {
          await updateDoc(userRef, { notifications: filtered });
        }
      } catch (err) {
        console.error("Failed clearing review_status notifications:", err);
      }
    });

    return unsubscribe;
  }, []);

  function clampReview(text) {
    const maxChars = 190;
    if (!text || text.length <= maxChars) return text;
  
    const cut = text.slice(0, maxChars);
    return cut.slice(0, cut.lastIndexOf(" ")) + "...";
  }

  return (
    <RequireAccess
      allowRoles={["user", "admin"]}
      redirectTo="/notfound"
    >
    <div className="flex flex-col pb-12 px-6 bg-gray-50 min-h-screen overflow-y-auto">
      <div className="w-full max-w-7xl py-6 mx-auto">
        <div>
          <h1 className="text-4xl font-bold mb-2 text-center text-gray-800">My Submitted Reviews</h1>
          <p className="text-center text-gray-600 mb-6">View the status of your submitted reviews</p>

          {/* Daily Limit Warning */}
          {dailyReviewsRemaining === 0 && (
            <div className="mb-6 p-4 bg-orange-50 border-l-4 border-orange-400 rounded-lg max-w-4xl mx-auto">
              <div className="flex items-center">
                <div className="flex-1">
                  <p className="text-orange-800 font-semibold">
                    ⚠️ Daily Review Limit Reached
                  </p>
                  <p className="text-sm text-orange-700 mt-1">
                    You've submitted {dailyReviewsSubmitted} reviews today. You can submit 2 more reviews tomorrow!
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
            <div className="bg-white rounded-lg shadow-sm p-5 border-l-4 border-gray-400">
              <div className="text-3xl font-bold text-gray-700">{reviews.length}</div>
              <div className="text-sm text-gray-500 font-semibold">Total Reviews</div>
            </div>
            <div className="bg-white rounded-lg shadow-sm p-5 border-l-4 border-green-600">
              <div className="text-3xl font-bold text-green-700">{approvedReviews}</div>
              <div className="text-sm text-gray-500 font-semibold">Approved</div>
            </div>
            <div className="bg-white rounded-lg shadow-sm p-5 border-l-4 border-yellow-600">
              <div className="text-3xl font-bold text-yellow-700">{reviews.filter(r => r.status === "Pending").length}</div>
              <div className="text-sm text-gray-500 font-semibold">Pending</div>
            </div>
            <div className="bg-white rounded-lg shadow-sm p-5 border-l-4 border-blue-600">
              <div className="text-3xl font-bold text-blue-700">{volunteerHours}</div>
              <div className="text-sm text-gray-500 font-semibold">Volunteer Hours</div>
            </div>
            <div className="bg-white rounded-lg shadow-sm p-5 border-l-4 border-purple-600">
              <div className="text-3xl font-bold text-purple-700">{dailyReviewsRemaining}</div>
              <div className="text-sm text-gray-500 font-semibold">Reviews Left Today</div>
            </div>
          </div>

          {/* Action Buttons */}
          {/* <div className="flex flex-wrap gap-3 mb-6 justify-center bg-white p-6 rounded-lg shadow-sm">
          <div className="flex flex-wrap justify-center gap-4">
            <button onClick={exportCSV} className="bg-green-900 text-white font-bold py-4 px-8 rounded-lg">Export CSV</button>
            <button onClick={generateCertificate} className="bg-blue-700 text-white font-bold py-4 px-8 rounded-lg">📜 Certificate</button>
            <button
              onClick={() => setModalVisible(true)}
              className={`bg-green-700 text-white font-bold py-4 px-8 rounded-lg ${dailyReviewsRemaining === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
              disabled={dailyReviewsRemaining === 0}
            >
              + Add New Review {dailyReviewsRemaining > 0 && `(${dailyReviewsRemaining} left today)`}
            </button>
          </div>
          </div> */}

          {/* Filters */}
          <div className="flex flex-wrap gap-3 mb-6 justify-center bg-white p-6 rounded-lg shadow-sm">
            <input
              type="text"
              placeholder="Search by book title..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="border border-green-200 rounded-lg px-4 py-2 w-64 focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            {["All", "Approved", "Pending", "Rejected"].map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-5 py-2 rounded-lg font-bold border-2 transition-colors ${statusFilter === s ? "bg-green-700 text-white" : "bg-white text-green-700 border-green-700"
                  }`}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Table */}
          <div className="bg-white rounded-lg shadow-sm overflow-x-auto">
            <table className="w-full min-w-max">
              <thead className="bg-green-50 border-b-2 border-green-200">
                <tr>
                  <th className="px-4 py-4 text-left font-bold text-gray-700">Book</th>
                  <th className="px-4 py-4 text-left font-bold text-gray-700">Review</th>
                  <th className="px-4 py-4 text-left font-bold text-gray-700">Rating</th>
                  <th className="px-4 py-4 text-left font-bold text-gray-700">Status</th>
                  <th className="px-4 py-4 text-left font-bold text-gray-700">Date</th>
                  <th className="px-4 py-4 text-left font-bold text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-b border-green-100 hover:bg-green-50">
                    <td className="align-top px-4 py-4 font-medium">{r.bookTitle}: {r.author}</td>
                    <td className="reviewDisplayCell">{clampReview(r.review)}</td>
                    <td className="align-top px-4 py-4">⭐ {r.rating}</td>
                    <td className="align-top px-4 py-4">
                      <span className="font-bold" style={{ color: statusColor[r.status] }}>
                        {r.status}
                      </span>

                      {r.status === "Rejected" && r.comment && (
                        <div>
                          <button
                            onClick={() => {
                              setSelectedComment(r.comment);
                              setShowCommentModal(true);
                            }}
                            className="text-blue-600 hover:underline hover:text-blue-700 cursor-pointer text-sm transition-colors duration-150"
                          >
                            View Comment
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="align-top px-4 py-4 text-gray-600">{new Date(r.createdAt).toLocaleDateString()}</td>
                    <td className="align-top px-4 py-4">
                      <div className="flex gap-3">
                        <button
                          onClick={() => viewReview(r)}
                          className="text-blue-600 font-bold hover:underline"
                        >
                          View
                        </button>

                        {r.status === "Pending" && (
                          <>
                            <button
                              onClick={() => openEditModal(r)}
                              className="text-green-700 font-bold hover:underline"
                            >
                              Edit
                            </button>

                            <button
                              onClick={() => handleDeleteReview(r.id)}
                              className="text-red-600 font-bold hover:underline"
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <button
        onClick={() => {
          if (dailyReviewsRemaining === 0) {
            alert("You've reached your daily limit of 2 reviews. Please try again tomorrow!");
            return;
          }
          setIsEditMode(false);
          setEditingReviewId(null);
          setBookTitle(""); setAuthorName(""); setReview(""); setRating(0);
          setRecommendedGrades([]); setAnonPref(""); setTitleFlagged(false);
          setModalVisible(true);
        }}
        title={dailyReviewsRemaining === 0 ? "Daily limit reached" : `Add review (${dailyReviewsRemaining} left today)`}
        className={`fixed bottom-8 right-8 z-50 w-14 h-14 rounded-full text-white text-3xl font-bold shadow-lg flex items-center justify-center transition-opacity
          ${dailyReviewsRemaining === 0 ? "bg-gray-400 cursor-not-allowed opacity-60" : "bg-green-700 hover:bg-green-800 cursor-pointer"}`}
      >
        +
      </button>

      <ReviewModal
        modalVisible={modalVisible}
        setModalVisible={setModalVisible}
        bookTitle={bookTitle}
        handleTitleChange={handleTitleChange}
        authorName={authorName}
        setAuthorName={setAuthorName}
        review={review}
        setReview={setReview}
        titleFlagged={titleFlagged}
        titleCheckLoading={titleCheckLoading}
        gradeLevel={gradeLevel}
        setGradeLevel={setGradeLevel}
        firstName={firstName}
        setFirstName={setFirstName}
        lastName={lastName}
        setLastName={setLastName}
        email={email}
        setEmail={setEmail}
        phoneNumber={phoneNumber}
        setPhoneNumber={setPhoneNumber}
        school={school}
        setSchool={setSchool}
        recommendedGrades={recommendedGrades}
        toggleRecommendedGrade={toggleRecommendedGrade}
        anonPref={anonPref}
        setAnonPref={setAnonPref}
        rating={rating}
        setRating={setRating}
        gradeOptions={gradeOptions}
        anonOptions={anonOptions}
        onSubmit={handleSubmitReview}
        isEditMode={isEditMode}
        reviewWordCount={review.trim().split(/\s+/).filter(Boolean).length}
      />

      {showCommentModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-2xl">
            <h2 className="text-xl font-bold mb-4 text-gray-800">
              Admin Comment
            </h2>

            <div className="bg-gray-50 p-4 rounded text-gray-800 whitespace-pre-line">
              {selectedComment}
            </div>

            <div className="flex justify-end mt-6">
              <button
                onClick={() => setShowCommentModal(false)}
                className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-2 px-6 rounded-lg"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showViewModal && selectedReview && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl mx-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold mb-4 text-gray-800">Review Details</h2>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <p className="text-sm text-gray-500 font-semibold">Date Received</p>
                <p className="text-gray-800">{new Date(selectedReview.date_received).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 font-semibold">Reviewer</p>
                <p className="text-gray-800">{selectedReview.first_name} {selectedReview.last_name}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 font-semibold">Grade</p>
                <p className="text-gray-800">{selectedReview.grade}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 font-semibold">School</p>
                <p className="text-gray-800">{selectedReview.school}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 font-semibold">Email</p>
                <p className="text-gray-800 text-sm">{selectedReview.email}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 font-semibold">Phone</p>
                <p className="text-gray-800">{selectedReview.phone_number}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 font-semibold">Anonymous</p>
                <p className="text-gray-800">{selectedReview.anonymous}</p>
              </div>
            </div>

            <div className="border-t pt-4 mb-4">
              <h3 className="font-bold text-lg mb-2 text-gray-800">Book Information</h3>
              <p className="text-sm text-gray-500 font-semibold">Title</p>
              <p className="text-gray-800 mb-2">{selectedReview.bookTitle}</p>
              <p className="text-sm text-gray-500 font-semibold">Author</p>
              <p className="text-gray-800 mb-2">{selectedReview.author}</p>
              <p className="text-sm text-gray-500 font-semibold">Rating</p>
              <p className="text-gray-800 mb-2">★ {Number(selectedReview.rating).toFixed(1)} / 5</p>
              <p className="text-sm text-gray-500 font-semibold">Recommended Grade</p>
              <p className="text-gray-800">{Array.isArray(selectedReview.recommended_audience_grade)
                ? selectedReview.recommended_audience_grade.join(", ")
                : selectedReview.recommended_audience_grade || "N/A"}</p>
            </div>

            <div className="border-t pt-4 mb-4">
              <p className="text-sm text-gray-500 font-semibold mb-2">Review</p>
              <p className="text-gray-800 bg-gray-50 p-3 rounded whitespace-pre-line">{selectedReview.review}</p>
            </div>

            <div className="flex gap-3 justify-end mt-6">
              <button
                onClick={() => setShowViewModal(false)}
                className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-2 px-6 rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </RequireAccess>
  );
}
