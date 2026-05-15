import { useState, useEffect } from "react";
import { RequireAccess } from "../components/requireaccess";
import { getAuth } from "firebase/auth";
import { getFirestore, doc, getDoc, updateDoc } from "firebase/firestore";
import { Mail, MailCheck, Filter, Scroll } from "lucide-react";
import { View, Text, ScrollView } from "react-native";

export default function AdminReviews() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [gradeFilter, setGradeFilter] = useState("All");
  const [schoolFilter, setSchoolFilter] = useState("All");
  const [emailSentFilter, setEmailSentFilter] = useState("All");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [sortBy, setSortBy] = useState("date_received");
  const [sortOrder, setSortOrder] = useState("desc");
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedReview, setSelectedReview] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [confirmModal, setConfirmModal] = useState({ show: false, reviewId: null, action: null });
  const [stats, setStats] = useState(null);
  const [updating, setUpdating] = useState(null);
  const [emailDraftModal, setEmailDraftModal] = useState({ show: false, draft: null, reviewId: null });
  const [loadingDraft, setLoadingDraft] = useState(null);
  const [hoveredUser, setHoveredUser] = useState(null);
  const [hoverHours, setHoverHours] = useState({});
  const [hoveredRow, setHoveredRow] = useState(null);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [customMessage, setCustomMessage] = useState("");

  useEffect(() => {
    fetch('http://localhost:5001/clear_cache', { method: 'POST' });
    fetchReviews();
    fetchStats();
  }, [statusFilter, gradeFilter, schoolFilter, emailSentFilter, sortBy, sortOrder]);

  const getIdToken = async () => {
    const auth = getAuth();
    const user = auth.currentUser;
    if (!user) throw new Error("User not logged in");
    return await user.getIdToken(true);
  };

  const fetchReviews = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "All") params.append("status", statusFilter.toLowerCase());
      if (gradeFilter !== "All") params.append("grade", gradeFilter);
      if (schoolFilter !== "All") params.append("school", schoolFilter);
      if (emailSentFilter !== "All") params.append("email_sent", emailSentFilter === "Sent" ? "sent" : "not_sent");
      if (search) params.append("search", search);
      params.append("sort_by", sortBy);
      params.append("sort_order", sortOrder);

      const response = await fetch(`http://localhost:5001/get_reviews?${params}`);
      const data = await response.json();
      setReviews(data);
    } catch (error) {
      console.error("Failed to fetch reviews");
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await fetch("http://localhost:5001/get_review_stats");
      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error("Failed to fetch stats");
    }
  };

  const fetchUserHours = async (email) => {
    if (hoverHours[email]) return;

    try {
      const res = await fetch("http://localhost:5001/get_user_hours_by_email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      setHoverHours(prev => ({
        ...prev,
        [email]: data.total_hours || 0
      }));
    } catch (err) {
      console.error("Failed to fetch user hours");
    }
  };

  const clearCacheAndRefresh = async () => {
    try {
      await fetch('http://localhost:5001/clear_cache', { method: 'POST' });
      await fetchReviews();
      await fetchStats();
    } catch (err) {
      fetchReviews();
      fetchStats();
    }
  };

  const statusColor = {
    Approved: "#2b7a4b",
    Pending: "#cc9a06",
    Rejected: "#c0392b",
  };


  const REJECTION_TEMPLATES = [
    {
      key: "below_ya",
      label: "Book below YA level",
      template: `This book is categorized as Children's or Middle Grade. Please submit YA or above.`
    },
    {
      key: "duplicate",
      label: "Already reviewed",
      template: `A review has already been submitted for this book.`
    },
    {
      key: "plagiarism",
      label: "Plagiarism",
      template: `Your review appears to contain copied content. Reviews must be original.`
    },
    {
      key: "location",
      label: "Outside Ridgewood",
      template: `We only accept submissions from Ridgewood students.`
    },
    {
      key: "limit",
      label: "More than 2 per day",
      template: `You exceeded the daily limit of 2 reviews.`
    }
  ];

  const filtered_rev = reviews.filter((r) => {
    const searchLower = search.toLowerCase();
    const matchSearch =
      r.book_title?.toLowerCase().includes(search.toLowerCase()) ||
      r.author?.toLowerCase().includes(search.toLowerCase()) ||
      `${r.first_name} ${r.last_name}`.toLowerCase().includes(search.toLowerCase()) ||
      r.email?.toLowerCase().includes(searchLower);
    const matchFrom = !fromDate || new Date(r.date_received) >= new Date(fromDate);
    const matchTo = !toDate || new Date(r.date_received) <= new Date(toDate);
    const status = r.approved ? "Approved" : (r.date_processed ? "Rejected" : "Pending");
    const matchStatus = statusFilter === "All" || status === statusFilter;
    return matchSearch && matchFrom && matchTo && matchStatus;
  });

  const handleActionClick = (review, newStatus) => {
    const currentStatus = review.approved ? "Approved" : (review.date_processed ? "Rejected" : "Pending");
    if (currentStatus === newStatus) {
      return;
    }

    setConfirmModal({ show: true, reviewId: review.id, action: newStatus, review });
  };

  const confirmAction = async () => {
    const { reviewId, action } = confirmModal;
    setUpdating(reviewId);

    try {
      const idToken = await getIdToken();
      const approved = action === "Approved";

      const updateData = {
        idToken,
        approved,
      };

      if (action !== "Pending") {
        updateData.date_processed = new Date().toISOString();
      }

      if (confirmModal.action === "Rejected") {
        updateData.comment_to_user = customMessage;
        updateData.rejection_reason_key = selectedTemplate?.key || "custom";
      }

      const response = await fetch(`http://localhost:5001/update_review/${reviewId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updateData),
      });

      if (response.ok) {
        const result = await response.json();
        
        // Send notification to reviewer
        try {
          const review = confirmModal.review;
          const reviewerEmail = review.email;
          const bookTitle = review.book_title;
          const newStatusLower = action.toLowerCase();
      
          // Get admin sender info
          const auth = getAuth();
          const adminUser = auth.currentUser;
      
          const senderFirstName =
            adminUser?.first_name ||
            adminUser?.displayName?.split(" ")[0] ||
            "";
          const senderLastName =
            adminUser?.last_name ||
            (adminUser?.displayName?.includes(" ")
              ? adminUser.displayName.split(" ").slice(1).join(" ")
              : "");
      
          // Backend request to look up UID by email
          const resRecipient = await fetch("http://localhost:5001/get_uid_by_email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: reviewerEmail }),
          });
      
          const recipientData = await resRecipient.json();

          if (resRecipient.ok && recipientData.uid) {
            const recipientUid = recipientData.uid;
            
            // Send the notification
            await fetch("http://localhost:5001/notify_recipients", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                idToken,
                sender: `${senderFirstName} ${senderLastName}`,
                recipients: [recipientUid],
                book: bookTitle,
                status: newStatusLower,
              }),
            });
          }
        } catch (notifErr) {
          console.error("Failed to send notification");
        }

        // Close confirm modal
        setConfirmModal({ show: false, reviewId: null, action: null, review: null });

        // Show email draft if one was generated
        if (result.email_draft) {
          setEmailDraftModal({
            show: true,
            draft: result.email_draft,
            reviewId: reviewId
          });
        } else {
          await clearCacheAndRefresh();
        }
      } else {
        const error = await response.json();
        alert(error.error || "Failed to update review");
      }
    } catch (error) {
      alert("Failed to update review");
    } finally {
      setUpdating(null);
    }
  };

  const toggleEmailSent = async (reviewId, currentValue) => {
    try {
      const idToken = await getIdToken();

      const response = await fetch(`http://localhost:5001/update_review/${reviewId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idToken,
          sent_confirmation_email: !currentValue
        }),
      });

      if (response.ok) {
        await clearCacheAndRefresh();
      }
    } catch (error) {
      console.error("Failed to toggle email status");
    }
  };

  const viewEmailDraft = async (reviewId) => {
    setLoadingDraft(reviewId);
    try {
      const idToken = await getIdToken();
      const response = await fetch(`http://localhost:5001/get_email_draft/${reviewId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });

      if (response.ok) {
        const result = await response.json();
        setEmailDraftModal({
          show: true,
          draft: result.email_draft,
          reviewId: reviewId
        });
      } else {
        const error = await response.json();
        alert(error.error || "Failed to generate email draft");
      }
    } catch (error) {
      alert("Failed to generate email draft");
    } finally {
      setLoadingDraft(null);
    }
  };

  const markEmailAsSent = async () => {
    const { reviewId } = emailDraftModal;
    try {
      const idToken = await getIdToken();
      const response = await fetch(`http://localhost:5001/mark_email_sent/${reviewId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });

      if (response.ok) {
        setEmailDraftModal({ show: false, draft: null, reviewId: null });
        await clearCacheAndRefresh();
      } else {
        const error = await response.json();
        alert(error.error || "Failed to mark email as sent");
      }
    } catch (error) {
      alert("Failed to mark email as sent");
    }
  };

  const copyEmailToClipboard = () => {
    const { draft } = emailDraftModal;
    const emailText = `To: ${draft.to}\nSubject: ${draft.subject}\n\n${draft.text_body}`;
    navigator.clipboard.writeText(emailText);
    alert("Email copied to clipboard!");
  };

  const exportCSV = () => {
    const headers = [
      "Entry ID", "Date Received", "Date Processed", "First Name", "Last Name",
      "Grade", "School", "Email", "Phone", "Book Title", "Author",
      "Recommended Grade", "Rating", "Review", "Anonymous", "Approved",
      "Email Sent", "Call Number", "Notes"
    ];

    const rows = filtered_rev.map(r => [
      r.entry_id, r.date_received, r.date_processed, r.first_name, r.last_name,
      r.grade, r.school, r.email, r.phone_number, r.book_title, r.author,
      r.recommended_audience_grade?.join(", "), r.rating, r.review, r.anonymous,
      r.approved ? "Yes" : "No", r.sent_confirmation_email ? "Yes" : "No",
      r.call_number, r.notes_to_admin
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.map(cell => `"${cell || ""}"`).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reviews_export_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const viewDetails = (review) => {
    setSelectedReview(review);
    setShowDetailModal(true);
  };

  const uniqueGrades = ["All", ...new Set(reviews.map(r => r.grade).filter(Boolean))].sort();
  const uniqueSchools = ["All", ...new Set(reviews.map(r => r.school).filter(Boolean))].sort();
  
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

        const filtered = current.filter((n) => n?.type !== "new_review");

        if (filtered.length !== current.length) {
          await updateDoc(userRef, { notifications: filtered });
        }
      } catch (err) {
        console.error("Failed clearing new_review notifications");
      }
    });

    return unsubscribe;
  }, []);

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

        const filtered = current.filter((n) => n?.type !== "new_review");

        if (filtered.length !== current.length) {
          await updateDoc(userRef, { notifications: filtered });
        }
      } catch (err) {
        console.error("Failed clearing new_review notifications");
      }
    });

    return unsubscribe;
  }, []);

  return (
    <RequireAccess
      allowRoles={["admin"]}
      redirectTo="/notfound"
    >
      <div className="flex flex-col items-center pb-12 px-6 bg-gray-50 min-h-screen">
        <ScrollView>

          <div className="w-full max-w-[1600px] py-6">
            <div className="flex items-center justify-center mb-6">
              <h1 className="text-4xl font-bold text-gray-800">
                Manage Submitted Reviews
              </h1>
            </div>

            {/* Stats Cards */}
            {stats && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                <div className="bg-white rounded-lg shadow-sm p-4 border-l-4 border-gray-400">
                  <div className="text-2xl font-bold text-gray-700">{stats.total_reviews}</div>
                  <div className="text-xs text-gray-500 font-semibold">Total Reviews</div>
                </div>
                <div className="bg-white rounded-lg shadow-sm p-4 border-l-4 border-green-600">
                  <div className="text-2xl font-bold text-green-700">{stats.approved_reviews}</div>
                  <div className="text-xs text-gray-500 font-semibold">Approved</div>
                </div>
                <div className="bg-white rounded-lg shadow-sm p-4 border-l-4 border-yellow-600">
                  <div className="text-2xl font-bold text-yellow-700">{stats.pending_reviews}</div>
                  <div className="text-xs text-gray-500 font-semibold">Pending</div>
                </div>
                <div className="bg-white rounded-lg shadow-sm p-4 border-l-4 border-blue-600">
                  <div className="text-2xl font-bold text-blue-700">{stats.total_volunteer_hours}</div>
                  <div className="text-xs text-gray-500 font-semibold">Volunteer Hours</div>
                </div>
                <div className="bg-white rounded-lg shadow-sm p-4 border-l-4 border-red-600">
                  <div className="text-2xl font-bold text-red-700">{stats.emails_not_sent || 0}</div>
                  <div className="text-xs text-gray-500 font-semibold">Emails Not Sent</div>
                </div>
              </div>
            )}

            {/* Filters */}
            <div className="flex flex-wrap gap-3 mb-6 justify-center bg-white p-6 rounded-lg shadow-sm">
              <input
                type="text"
                placeholder="Search books, authors, reviewers, emails..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && fetchReviews()}
                className="border border-green-200 rounded-lg px-4 py-2 w-64 focus:outline-none focus:ring-2 focus:ring-green-500"
              />

              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="border border-green-200 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
              />

              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="border border-green-200 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
              />

              {["All", "Approved", "Pending", "Rejected"].map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-5 py-2 rounded-lg font-bold border-2 transition-colors ${statusFilter === s
                      ? "bg-green-700 text-white border-green-700"
                      : "bg-white text-green-700 border-green-700 hover:bg-green-50"
                    }`}
                >
                  {s}
                </button>
              ))}

              {/* Email Sent Filter */}
              <div className="flex items-center gap-2 border-l-2 border-gray-300 pl-3">
                <Filter className="w-4 h-4 text-gray-600" />
                {["All", "Sent", "Not Sent"].map((s) => (
                  <button
                    key={s}
                    onClick={() => setEmailSentFilter(s)}
                    className={`px-4 py-2 rounded-lg font-semibold text-sm border-2 transition-colors ${emailSentFilter === s
                        ? "bg-purple-600 text-white border-purple-600"
                        : "bg-white text-purple-600 border-purple-600 hover:bg-purple-50"
                      }`}
                  >
                    {s === "All" ? "All Emails" : s}
                  </button>
                ))}
              </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-lg shadow-sm overflow-x-auto">
              {loading ? (
                <div className="text-center py-12 text-gray-500">Loading reviews...</div>
              ) : (
                <table className="w-full min-w-max">
                  <thead className="bg-green-50 border-b-2 border-green-200">
                    <tr>
                      <th className="px-3 py-3 text-left font-bold text-gray-700 text-sm">Date</th>
                      <th className="px-3 py-3 text-left font-bold text-gray-700 text-sm">Reviewer</th>
                      <th className="px-3 py-3 text-left font-bold text-gray-700 text-sm">Grade</th>
                      <th className="px-3 py-3 text-left font-bold text-gray-700 text-sm">Book Title</th>
                      <th className="px-3 py-3 text-left font-bold text-gray-700 text-sm">Author</th>
                      <th className="px-3 py-3 text-left font-bold text-gray-700 text-sm">Rating</th>
                      <th className="px-3 py-3 text-left font-bold text-gray-700 text-sm">Status</th>
                      <th className="px-3 py-3 text-left font-bold text-gray-700 text-sm">Email</th>
                      <th className="px-3 py-3 text-left font-bold text-gray-700 text-sm">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered_rev.map((r) => {
                      const status = r.approved ? "Approved" : (r.date_processed ? "Rejected" : "Pending");
                      const isUpdating = updating === r.id;

                      return (
                        <tr key={r.id} className="border-b border-green-100 hover:bg-green-50 transition-colors">
                          <td className="px-3 py-3 text-sm text-gray-600">
                            {new Date(r.date_received).toLocaleDateString()}
                          </td>
                          <td className="px-3 py-3 text-sm font-semibold text-gray-800 relative">
                            <span
                              onMouseEnter={() => {
                                setHoveredRow(r.id);
                                fetchUserHours(r.email);
                              }}
                              onMouseLeave={() => setHoveredRow(null)}
                              className="cursor-pointer hover:underline"
                            >
                              {r.first_name} {r.last_name}
                            </span>

                            {hoveredRow === r.id && (
                              <div className="absolute z-50 top-8 left-0 bg-black text-white text-xs px-3 py-2 rounded-lg shadow-lg whitespace-nowrap animate-fade-in">
                                {r.first_name} {r.last_name} has{" "}
                                <span className="font-bold text-green-400">
                                  {hoverHours[r.email] ?? "..."}
                                </span>{" "}
                                total volunteer hours
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-3 text-sm text-gray-700">{r.grade}</td>
                          <td className="px-3 py-3 text-sm font-medium text-gray-800">{r.book_title}</td>
                          <td className="px-3 py-3 text-sm text-gray-700">{r.author}</td>
                          <td className="px-3 py-3 text-sm">
                            <span className="text-green-700 font-bold">★ {Number(r.rating).toFixed(1)}</span>
                          </td>
                          <td className="px-3 py-3 text-sm">
                            <span className="font-bold" style={{ color: statusColor[status] }}>
                              {status}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            {status !== "Pending" && (
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => toggleEmailSent(r.id, r.sent_confirmation_email)}
                                  className={`p-1 rounded transition-colors ${r.sent_confirmation_email
                                      ? "text-green-600 hover:bg-green-100"
                                      : "text-gray-400 hover:bg-gray-100"
                                    }`}
                                  title={r.sent_confirmation_email ? "Email sent" : "Email not sent"}
                                >
                                  {r.sent_confirmation_email ? (
                                    <MailCheck className="w-5 h-5" />
                                  ) : (
                                    <Mail className="w-5 h-5" />
                                  )}
                                </button>
                                {!r.sent_confirmation_email && (
                                  <button
                                    onClick={() => viewEmailDraft(r.id)}
                                    disabled={loadingDraft === r.id}
                                    className="text-xs bg-purple-600 hover:bg-purple-700 text-white font-semibold py-1 px-2 rounded disabled:opacity-50"
                                    title="View email draft"
                                  >
                                    {loadingDraft === r.id ? "Loading..." : "View Draft"}
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            {isUpdating ? (
                              <div className="text-gray-500 text-sm">Updating...</div>
                            ) : (
                              <div className="flex gap-2">
                                <button
                                  onClick={() => viewDetails(r)}
                                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-1 px-3 rounded text-xs transition-colors"
                                >
                                  View
                                </button>
                                <button
                                  onClick={() => handleActionClick(r, "Approved")}
                                  disabled={status === "Approved"}
                                  className={`font-bold py-1 px-3 rounded text-xs transition-colors ${status === "Approved"
                                      ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                                      : "bg-green-700 hover:bg-green-800 text-white"
                                    }`}
                                >
                                  ✓
                                </button>
                                <button
                                  onClick={() => handleActionClick(r, "Rejected")}
                                  disabled={status === "Rejected"}
                                  className={`font-bold py-1 px-3 rounded text-xs transition-colors ${status === "Rejected"
                                      ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                                      : "bg-red-600 hover:bg-red-700 text-white"
                                    }`}
                                >
                                  ✗
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {filtered_rev.length === 0 && (
                      <tr>
                        <td colSpan="9" className="text-center py-12 text-gray-500">
                          No reviews match your filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>

            {/* Export Button */}
            <div className="mt-8 flex justify-center">
              <button
                onClick={exportCSV}
                className="bg-green-900 hover:bg-green-950 text-white font-bold py-4 px-8 rounded-lg text-lg transition-colors shadow-md"
              >
                Export Full Database as CSV
              </button>
            </div>
          </div>
        </ScrollView>

        {/* Detail Modal */}
        {showDetailModal && selectedReview && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl p-6 w-full max-w-2xl mx-4 shadow-2xl max-h-[90vh] overflow-y-auto">
              <h2 className="text-2xl font-bold mb-4 text-gray-800">Review Details</h2>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="text-sm text-gray-500 font-semibold">Entry ID</p>
                  <p className="text-gray-800">{selectedReview.entry_id}</p>
                </div>
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
                <p className="text-gray-800 mb-2">{selectedReview.book_title}</p>
                <p className="text-sm text-gray-500 font-semibold">Author</p>
                <p className="text-gray-800 mb-2">{selectedReview.author}</p>
                <p className="text-sm text-gray-500 font-semibold">Rating</p>
                <p className="text-gray-800 mb-2">★ {Number(selectedReview.rating).toFixed(1)} / 5</p>
                <p className="text-sm text-gray-500 font-semibold">Recommended Grade</p>
                <p className="text-gray-800">{selectedReview.recommended_audience_grade?.join(", ") || "N/A"}</p>
              </div>

              <div className="border-t pt-4 mb-4">
                <p className="text-sm text-gray-500 font-semibold mb-2">Review</p>
                <p className="text-gray-800 bg-gray-50 p-3 rounded whitespace-pre-line">{selectedReview.review}</p>
              </div>

              <div className="border-t pt-4 mb-4">
                <h3 className="font-bold text-lg mb-2 text-gray-800">Admin Fields</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-gray-500 font-semibold">Call Number</p>
                    <p className="text-gray-800">{selectedReview.call_number || "N/A"}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 font-semibold">Time Earned</p>
                    <p className="text-gray-800">{0.5} hrs</p>
                  </div>
                  <div>
                    <p className="text-gray-500 font-semibold">Label Created</p>
                    <p className="text-gray-800">{selectedReview.label_created ? "Yes" : "No"}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 font-semibold">On Volgistics</p>
                    <p className="text-gray-800">{selectedReview.on_volgistics ? "Yes" : "No"}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 font-semibold">Email Sent</p>
                    <p className={`font-semibold ${selectedReview.sent_confirmation_email ? "text-green-600" : "text-red-600"}`}>
                      {selectedReview.sent_confirmation_email ? "Yes" : "No"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 justify-end mt-6">
                <button
                  onClick={() => setShowDetailModal(false)}
                  className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-2 px-6 rounded-lg transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Confirmation Modal */}
        {confirmModal.show && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 w-full max-w-lg mx-4 shadow-2xl">

              <h2 className="text-2xl font-bold mb-3 text-gray-800">
                Confirm {confirmModal.action}
              </h2>

              <p className="text-gray-600 mb-2">
                Book: <span className="font-semibold">{confirmModal.review?.book_title}</span>
              </p>

              <p className="text-gray-600 mb-4">
                Change status to{" "}
                <span className="font-bold" style={{ color: statusColor[confirmModal.action] }}>
                  {confirmModal.action}
                </span>
                ?
              </p>

              {confirmModal.action === "Rejected" && (
                <div className="mt-4 border-t pt-4">

                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Rejection Reason
                  </label>

                  <select
                    onChange={(e) => {
                      const template = REJECTION_TEMPLATES.find(t => t.key === e.target.value);
                      setSelectedTemplate(template);
                      setCustomMessage(template?.template || "");
                    }}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-red-500"
                  >
                    <option value="">Select a reason...</option>
                    {REJECTION_TEMPLATES.map(t => (
                      <option key={t.key} value={t.key}>
                        {t.label}
                      </option>
                    ))}
                  </select>

                  <textarea
                    value={customMessage}
                    onChange={(e) => setCustomMessage(e.target.value)}
                    rows={4}
                    placeholder="Customize feedback for the user..."
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
                  />

                  <p className="text-xs text-gray-500 mt-2">
                    This message will be shown to the user in their notifications.
                  </p>
                </div>
              )}

              <p className="text-sm text-purple-600 mt-4 mb-6 font-medium">
                📧 You'll be able to review the email draft before sending.
              </p>

              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => {
                    setConfirmModal({ show: false, reviewId: null, action: null, review: null });
                    setSelectedTemplate(null);
                    setCustomMessage("");
                  }}
                  className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-2 px-6 rounded-lg transition-colors"
                >
                  Cancel
                </button>

                <button
                  onClick={() => {
                    if (confirmModal.action === "Rejected" && !customMessage.trim()) {
                      alert("Please provide feedback for rejection.");
                      return;
                    }

                    confirmAction();
                  }}
                  className="text-white font-bold py-2 px-6 rounded-lg transition-colors"
                  style={{ backgroundColor: statusColor[confirmModal.action] }}
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Email Draft Modal */}
        {emailDraftModal.show && emailDraftModal.draft && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[90vh]">
              {/* Header - Fixed */}
              <div className="flex items-center justify-between p-6 border-b border-gray-200">
                <h2 className="text-2xl font-bold text-gray-800">Email Draft Preview</h2>
                <span className={`px-3 py-1 rounded-full text-sm font-semibold ${emailDraftModal.draft.status === 'approved'
                    ? 'bg-green-100 text-green-800'
                    : 'bg-red-100 text-red-800'
                  }`}>
                  {emailDraftModal.draft.status === 'approved' ? 'Approval' : 'Rejection'}
                </span>
              </div>

              {/* Scrollable Content */}
              <div className="overflow-y-auto flex-1 p-6">
                <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="grid grid-cols-1 gap-2 text-sm">
                    <div>
                      <span className="font-semibold text-gray-600">To:</span>{" "}
                      <span className="text-gray-800">{emailDraftModal.draft.to}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-gray-600">Subject:</span>{" "}
                      <span className="text-gray-800">{emailDraftModal.draft.subject}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-gray-600">Reviewer:</span>{" "}
                      <span className="text-gray-800">{emailDraftModal.draft.reviewer_name}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-gray-600">Book:</span>{" "}
                      <span className="text-gray-800">{emailDraftModal.draft.book_title}</span>
                    </div>
                  </div>
                </div>


                {/* Tabs for HTML and Plain Text */}
                <div className="mb-4">
                  <div className="flex border-b border-gray-200">
                    <button
                      onClick={() => {
                        const tabs = document.querySelectorAll('.email-tab');
                        const contents = document.querySelectorAll('.email-content');
                        tabs.forEach(t => t.classList.remove('border-purple-600', 'text-purple-600'));
                        contents.forEach(c => c.classList.add('hidden'));
                        tabs[0].classList.add('border-purple-600', 'text-purple-600');
                        contents[0].classList.remove('hidden');
                      }}
                      className="email-tab px-4 py-2 font-semibold border-b-2 border-purple-600 text-purple-600 transition-colors"
                    >
                      HTML Preview
                    </button>
                    <button
                      onClick={() => {
                        const tabs = document.querySelectorAll('.email-tab');
                        const contents = document.querySelectorAll('.email-content');
                        tabs.forEach(t => t.classList.remove('border-purple-600', 'text-purple-600'));
                        contents.forEach(c => c.classList.add('hidden'));
                        tabs[1].classList.add('border-purple-600', 'text-purple-600');
                        contents[1].classList.remove('hidden');
                      }}
                      className="email-tab px-4 py-2 font-semibold border-b-2 border-transparent text-gray-600 hover:text-gray-800 transition-colors"
                    >
                      Plain Text
                    </button>
                  </div>
                </div>

                {/* HTML Preview */}
                <div className="email-content mb-4">
                  <div className="border border-gray-300 rounded-lg p-4 bg-white max-h-64 overflow-y-auto">
                    <div dangerouslySetInnerHTML={{ __html: emailDraftModal.draft.html_body }} />
                  </div>
                </div>

                {/* Plain Text Preview */}
                <div className="email-content hidden mb-4">
                  <div className="border border-gray-300 rounded-lg p-4 bg-gray-50 max-h-64 overflow-y-auto">
                    <pre className="whitespace-pre-wrap text-sm font-mono text-gray-800">
                      {emailDraftModal.draft.text_body}
                    </pre>
                  </div>
                </div>

                <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded">
                  <p className="text-sm text-yellow-800">
                    <strong>Note:</strong> Copy this content to your email client and send it manually.
                    After sending, click "Mark as Sent" to update tracking.
                  </p>
                </div>
              </div>

              {/* Footer - Fixed */}
              <div className="flex gap-3 justify-end p-6 border-t border-gray-200 bg-gray-50">
                <button
                  onClick={() => {
                    setEmailDraftModal({ show: false, draft: null, reviewId: null });
                    clearCacheAndRefresh();
                  }}
                  className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-2 px-6 rounded-lg transition-colors"
                >
                  Close
                </button>
                <button
                  onClick={copyEmailToClipboard}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-6 rounded-lg transition-colors"
                >
                  📋 Copy to Clipboard
                </button>
                <button
                  onClick={markEmailAsSent}
                  className="bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-6 rounded-lg transition-colors"
                >
                  ✓ Mark as Sent
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </RequireAccess>
  );
}