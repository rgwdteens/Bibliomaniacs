import { useState, useEffect } from "react";
import { Users, Book, FileText, Plus, X, Calendar, ExternalLink, Loader } from "lucide-react";
import { getAuth } from "firebase/auth"; // Import Firebase auth
import { View, Text, ScrollView } from "react-native";
import { RequireAccess } from "../components/requireaccess";
import { getFirestore, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { auth, app } from "../firebaseConfig";

export default function AdminDashboard() {
  const [admins, setAdmins] = useState([]);
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [showAddAdmin, setShowAddAdmin] = useState(false);
  const [loadingAdmins, setLoadingAdmins] = useState(true);

  const [bookOfWeek, setBookOfWeek] = useState({
    title: "",
    author: "",
    lastUpdated: "",
  });
  const [showUpdateBook, setShowUpdateBook] = useState(false);
  const [newBookTitle, setNewBookTitle] = useState("");
  const [newBookAuthor, setNewBookAuthor] = useState("");
  const [loadingBook, setLoadingBook] = useState(true);

const [reviewStats, setReviewStats] = useState({
  approved: 0,
  pending: 0,
  rejected: 0,
  emails_not_sent: 0,
});
  const [loadingStats, setLoadingStats] = useState(true);
  const [authReady, setAuthReady] = useState(false);

  const totalReviews = reviewStats.approved + reviewStats.pending + reviewStats.rejected;

  const API_BASE_URL = "https://bibliomaniacs.onrender.com";

  const getIdToken = async () => {
    try {
      const auth = getAuth();
      const user = auth.currentUser;
      
      if (user) {
        return await user.getIdToken();
      }
      
      return null;
    } catch (error) {
      return null;
    }
  };

  // Wait for auth to be ready
  useEffect(() => {
    const auth = getAuth();
    
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

  // Fetch admins only when auth is ready
  useEffect(() => {
    if (authReady) {
      fetchAdmins();
    }
  }, [authReady]);

  useEffect(() => {
    const auth = getAuth();
    const user = auth.currentUser;

    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (!user) return;

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
        console.error("Failed clearing review_status notifications");
      }
    });

    return unsubscribe;
  }, []);

  const fetchAdmins = async () => {
    try {
      setLoadingAdmins(true);
      const idToken = await getIdToken();
      
      if (!idToken) {
        setLoadingAdmins(false);
        return;
      }

      const response = await fetch(`${API_BASE_URL}/get_admins`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ idToken }),
      });

      if (response.ok) {
        const data = await response.json();
        setAdmins(data);
      } else {
        const error = await response.json();
        console.error("Failed to fetch admins");
      }
    } catch (error) {
      console.error("Error fetching admins");
    } finally {
      setLoadingAdmins(false);
    }
  };

  const addAdmin = async () => {
    if (newAdminEmail && newAdminEmail.includes("@")) {
      try {
        const idToken = await getIdToken();
        
        if (!idToken) {
          alert("Authentication error. Please sign in again.");
          return;
        }

        const response = await fetch(`${API_BASE_URL}/add_admin`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ 
            idToken,
            email: newAdminEmail 
          }),
        });

        if (response.ok) {
          await fetchAdmins();
          setNewAdminEmail("");
          setShowAddAdmin(false);
        } else {
          const error = await response.json();
          alert("Failed to add admin");
        }
      } catch (error) {
        alert("Failed to add admin");
      }
    }
  };

  const removeAdmin = async (email) => {
    if (!confirm(`Are you sure you want to remove ${email} as an admin?`)) {
      return;
    }

    try {
      const idToken = await getIdToken();
      
      if (!idToken) {
        alert("Authentication error. Please sign in again.");
        return;
      }

      const response = await fetch(`${API_BASE_URL}/remove_admin`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          idToken,
          email 
        }),
      });

      if (response.ok) {
        await fetchAdmins();
      } else {
        const error = await response.json();
        alert(error.error || "Failed to remove admin");
      }
    } catch (error) {
      alert("Failed to remove admin");
    }
  };

  // Fetch book of the week when auth is ready
  useEffect(() => {
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
      } else {
        console.error("Failed to fetch book of the week");
      }
    } catch (error) {
      console.error("Error fetching book of the week");
    } finally {
      setLoadingBook(false);
    }
  };

  const updateBookOfWeek = async () => {
    if (newBookTitle && newBookAuthor) {
      try {
        const idToken = await getIdToken();
        
        if (!idToken) {
          alert("Authentication error. Please sign in again.");
          return;
        }

        const response = await fetch(`${API_BASE_URL}/update_book_of_week`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ 
            idToken,
            title: newBookTitle,
            author: newBookAuthor
          }),
        });

        if (response.ok) {
          await fetchBookOfWeek();
          setNewBookTitle("");
          setNewBookAuthor("");
          setShowUpdateBook(false);

          await fetch("https://bibliomaniacs.onrender.com/notify_all", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              idToken,
              book: newBookTitle,
            }),
          });

        } else {
          const error = await response.json();
          alert(error.error || "Failed to update book of the week");
        }
      } catch (error) {
        alert("Failed to update book of the week");
      }
    }
  };

  // Fetch review statistics when auth is ready
  useEffect(() => {
    if (authReady) {
      fetchReviewStats();
    }
  }, [authReady]);

  const fetchReviewStats = async () => {
    try {
      setLoadingStats(true);
      const response = await fetch(`${API_BASE_URL}/get_review_stats`);

      if (response.ok) {
        const data = await response.json();
        setReviewStats({
          approved: data.approved_reviews,
          pending: data.pending_reviews,
          rejected: data.rejected_reviews,
          emails_not_sent: data.emails_not_sent || 0,
        });
      } else {
        console.error("Failed to fetch review stats");
      }
    } catch (error) {
      console.error("Error fetching review stats");
    } finally {
      setLoadingStats(false);
    }
  };

  const getPercentage = (value) => 
    totalReviews > 0 ? ((value / totalReviews) * 100).toFixed(1) : "0.0";

  // Show loading state while waiting for authentication
  if (!authReady) {
    return (
      <RequireAccess
      allowRoles={["admin"]}
      redirectTo="/notfound"
    >
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 flex items-center justify-center">
        <div className="text-center">
          <Loader className="w-12 h-12 text-emerald-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
      </RequireAccess>
    );
  }

  return (
    <RequireAccess
      allowRoles={["admin"]}
      redirectTo="/notfound"
    >
    <ScrollView>
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 pb-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-5xl font-bold text-gray-900 mb-3 text-center">
          Admin Dashboard
        </h1>
        <p className="text-center text-gray-600 mb-12">Manage your book review platform</p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Manage Admins Section */}
          <div className="bg-white rounded-2xl shadow-lg p-6 border border-emerald-100">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <Users className="w-6 h-6 text-emerald-600" />
                <h2 className="text-2xl font-bold text-gray-900">Manage Admins</h2>
              </div>
              <button
                onClick={() => setShowAddAdmin(true)}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white 
                         font-semibold px-4 py-2 rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Admin
              </button>
            </div>

            {loadingAdmins ? (
              <div className="flex justify-center items-center py-8">
                <Loader className="w-8 h-8 text-emerald-600 animate-spin" />
              </div>
            ) : (
              <div className="space-y-3">
                {admins.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">No admins found</p>
                ) : (
                  admins.map((admin) => (
                    <div
                      key={admin.id}
                      className="flex items-center justify-between p-3 bg-emerald-50 rounded-lg border border-emerald-100"
                    >
                      <span className="text-gray-700 font-medium">{admin.email}</span>
                      <button
                        onClick={() => removeAdmin(admin.email)}
                        className="text-red-600 hover:text-red-700 transition-colors"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}

            {showAddAdmin && (
              <div className="mt-4 p-4 bg-gray-50 rounded-lg border-2 border-emerald-200">
                <input
                  type="email"
                  placeholder="Enter admin email..."
                  value={newAdminEmail}
                  onChange={(e) => setNewAdminEmail(e.target.value)}
                  className="w-full px-4 py-2 border border-emerald-200 rounded-lg mb-3 
                           focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <div className="flex gap-2">
                  <button
                    onClick={addAdmin}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold 
                             py-2 rounded-lg transition-colors"
                  >
                    Add
                  </button>
                  <button
                    onClick={() => {
                      setShowAddAdmin(false);
                      setNewAdminEmail("");
                    }}
                    className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700 font-semibold 
                             py-2 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Book of the Week Section */}
          <div className="bg-white rounded-2xl shadow-lg p-6 border border-emerald-100">
            <div className="flex items-center gap-3 mb-6">
              <Book className="w-6 h-6 text-emerald-600" />
              <h2 className="text-2xl font-bold text-gray-900">Book of the Week</h2>
            </div>

            {loadingBook ? (
              <div className="flex justify-center items-center py-8">
                <Loader className="w-8 h-8 text-emerald-600 animate-spin" />
              </div>
            ) : (
              <>
                <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl p-6 mb-4 border border-emerald-100">
                  <h3 className="text-xl font-bold text-gray-900 mb-1">{bookOfWeek.title}</h3>
                  <p className="text-gray-600 mb-4">By: {bookOfWeek.author}</p>
                  {bookOfWeek.lastUpdated && (
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <Calendar className="w-4 h-4" />
                      <span>Last updated: {new Date(bookOfWeek.lastUpdated).toLocaleDateString('en-US', { 
                        month: 'long', 
                        day: 'numeric', 
                        year: 'numeric' 
                      })}</span>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => setShowUpdateBook(true)}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold 
                           py-2 rounded-lg transition-colors"
                >
                  Update Book of the Week
                </button>
              </>
            )}

            {showUpdateBook && (
              <div className="mt-4 p-4 bg-gray-50 rounded-lg border-2 border-emerald-200">
                <input
                  type="text"
                  placeholder="Book title..."
                  value={newBookTitle}
                  onChange={(e) => setNewBookTitle(e.target.value)}
                  className="w-full px-4 py-2 border border-emerald-200 rounded-lg mb-3 
                           focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <input
                  type="text"
                  placeholder="Author name..."
                  value={newBookAuthor}
                  onChange={(e) => setNewBookAuthor(e.target.value)}
                  className="w-full px-4 py-2 border border-emerald-200 rounded-lg mb-3 
                           focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <div className="flex gap-2">
                  <button
                    onClick={updateBookOfWeek}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold 
                             py-2 rounded-lg transition-colors"
                  >
                    Update
                  </button>
                  <button
                    onClick={() => {
                      setShowUpdateBook(false);
                      setNewBookTitle("");
                      setNewBookAuthor("");
                    }}
                    className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700 font-semibold 
                             py-2 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Review Statistics Section */}
          <div className="bg-white rounded-2xl shadow-lg p-6 border border-emerald-100 lg:col-span-2">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <FileText className="w-6 h-6 text-emerald-600" />
                <h2 className="text-2xl font-bold text-gray-900">Review Statistics</h2>
              </div>
              <button
                onClick={() => window.location.href = '/admin-reviews'}
                className="flex items-center gap-2 text-emerald-600 hover:text-emerald-700 
                         font-semibold transition-colors"
              >
                Manage Reviews
                <ExternalLink className="w-4 h-4" />
              </button>
            </div>

            {loadingStats ? (
              <div className="flex justify-center items-center py-8">
                <Loader className="w-8 h-8 text-emerald-600 animate-spin" />
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                {/* Pie Chart */}
                <div className="flex justify-center">
                  <svg width="280" height="280" viewBox="0 0 280 280" className="transform -rotate-90">
                    {totalReviews > 0 ? (
                      <>
                        {/* Approved - Green */}
                        <circle
                          cx="140"
                          cy="140"
                          r="100"
                          fill="none"
                          stroke="#2b7a4b"
                          strokeWidth="60"
                          strokeDasharray={`${(reviewStats.approved / totalReviews) * 628} 628`}
                          strokeDashoffset="0"
                        />
                        {/* Pending - Yellow */}
                        <circle
                          cx="140"
                          cy="140"
                          r="100"
                          fill="none"
                          stroke="#cc9a06"
                          strokeWidth="60"
                          strokeDasharray={`${(reviewStats.pending / totalReviews) * 628} 628`}
                          strokeDashoffset={`-${(reviewStats.approved / totalReviews) * 628}`}
                        />
                        {/* Rejected - Red */}
                        <circle
                          cx="140"
                          cy="140"
                          r="100"
                          fill="none"
                          stroke="#c0392b"
                          strokeWidth="60"
                          strokeDasharray={`${(reviewStats.rejected / totalReviews) * 628} 628`}
                          strokeDashoffset={`-${((reviewStats.approved + reviewStats.pending) / totalReviews) * 628}`}
                        />
                      </>
                    ) : (
                      <circle
                        cx="140"
                        cy="140"
                        r="100"
                        fill="none"
                        stroke="#e5e7eb"
                        strokeWidth="60"
                      />
                    )}
                    {/* Center white circle */}
                    <circle cx="140" cy="140" r="70" fill="white" />
                    {/* Total count */}
                    <text
                      x="140"
                      y="140"
                      textAnchor="middle"
                      dy=".3em"
                      className="text-4xl font-bold"
                      fill="#1f2937"
                      transform="rotate(90 140 140)"
                    >
                      {totalReviews}
                    </text>
                    <text
                      x="140"
                      y="165"
                      textAnchor="middle"
                      className="text-sm"
                      fill="#6b7280"
                      transform="rotate(90 140 165)"
                    >
                      Total
                    </text>
                  </svg>
                </div>

                {/* Legend and Stats */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg border border-green-200">
                    <div className="flex items-center gap-3">
                      <div className="w-4 h-4 bg-green-700 rounded"></div>
                      <span className="font-semibold text-gray-800">Approved</span>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-gray-900">{reviewStats.approved}</div>
                      <div className="text-sm text-gray-600">{getPercentage(reviewStats.approved)}%</div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                    <div className="flex items-center gap-3">
                      <div className="w-4 h-4 bg-yellow-600 rounded"></div>
                      <span className="font-semibold text-gray-800">Pending</span>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-gray-900">{reviewStats.pending}</div>
                      <div className="text-sm text-gray-600">{getPercentage(reviewStats.pending)}%</div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-red-50 rounded-lg border border-red-200">
                    <div className="flex items-center gap-3">
                      <div className="w-4 h-4 bg-red-600 rounded"></div>
                      <span className="font-semibold text-gray-800">Rejected</span>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-gray-900">{reviewStats.rejected}</div>
                      <div className="text-sm text-gray-600">{getPercentage(reviewStats.rejected)}%</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {reviewStats.emails_not_sent > 0 && (
            <div className="mt-6 p-4 bg-orange-50 border-l-4 border-orange-400 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-orange-800 font-semibold">
                    ⚠️ {reviewStats.emails_not_sent} update
                    {reviewStats.emails_not_sent > 1 ? "s have" : " has"} not been emailed
                  </p>
                  <p className="text-sm text-orange-700 mt-1">
                    Processed reviews are missing confirmation emails
                  </p>
                </div>
                <button
                  onClick={() =>
                    window.location.href = "/admin-reviews?filter=not_sent"
                  }
                  className="bg-orange-600 hover:bg-orange-700 text-white font-semibold px-4 py-2 rounded-lg transition-colors"
                >
                  View
                </button>
              </div>
            </div>
          )}

          </div>
        </div>
      </div>
    </div>
    </ScrollView>
    </RequireAccess>
  );
}