import { useState, useEffect, useRef } from "react";
import { RequireAccess } from "../components/requireaccess";
import { getAuth } from "firebase/auth";
import { getFirestore, doc, getDoc, updateDoc } from "firebase/firestore";
import { Mail, MailCheck, ChevronDown, Info, Send, Clock, CheckCircle, XCircle } from "lucide-react";
import { View, Text, ScrollView } from "react-native";

// ── Tooltip component ──────────────────────────────────────────────────────────
function Tooltip({ text, children }) {
  const [visible, setVisible] = useState(false);
  return (
    <span
      className="relative inline-flex items-center"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 text-xs bg-gray-800 text-white rounded-lg px-3 py-2 shadow-lg z-50 pointer-events-none leading-relaxed">
          {text}
          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800" />
        </span>
      )}
    </span>
  );
}

// ── Labelled dropdown ──────────────────────────────────────────────────────────
function FilterSelect({ label, tooltip, value, onChange, options }) {
  return (
    <div className="flex flex-col gap-1 min-w-[160px]">
      <div className="flex items-center gap-1">
        <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
          {label}
        </label>
        {tooltip && (
          <Tooltip text={tooltip}>
            <Info className="w-3.5 h-3.5 text-gray-400 cursor-help" />
          </Tooltip>
        )}
      </div>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none border border-gray-300 rounded-lg px-3 py-2 pr-8 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 cursor-pointer"
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
      </div>
    </div>
  );
}

// ── Labelled date input ────────────────────────────────────────────────────────
function DateFilter({ label, value, onChange }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
        {label}
      </label>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
      />
    </div>
  );
}

// ── Email status cell ──────────────────────────────────────────────────────────
function EmailStatusCell({ review, onToggle, onViewDraft, loadingDraft }) {
  const status = review.approved
    ? "Approved"
    : review.date_processed
    ? "Rejected"
    : "Pending";

  if (status === "Pending") return null;

  const sent = review.sent_confirmation_email;

  return (
    <div className="flex items-center gap-2">
      <Tooltip
        text={
          sent
            ? "Confirmation email was sent. Click to mark as NOT sent."
            : "Confirmation email has NOT been sent yet. Click to mark as sent."
        }
      >
        <button
          onClick={() => onToggle(review.id, sent)}
          className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors ${
            sent
              ? "bg-green-50 text-green-700 border-green-300 hover:bg-green-100"
              : "bg-orange-50 text-orange-700 border-orange-300 hover:bg-orange-100"
          }`}
          aria-label={sent ? "Email sent — click to undo" : "Email not sent — click to mark sent"}
        >
          {sent ? (
            <>
              <MailCheck className="w-3.5 h-3.5" />
              Sent
            </>
          ) : (
            <>
              <Mail className="w-3.5 h-3.5" />
              Not Sent
            </>
          )}
        </button>
      </Tooltip>

      {!sent && (
        <Tooltip text="Preview the auto-generated email draft for this reviewer">
          <button
            onClick={() => onViewDraft(review.id)}
            disabled={loadingDraft === review.id}
            className="flex items-center gap-1 text-xs bg-purple-600 hover:bg-purple-700 text-white font-semibold py-1 px-2 rounded disabled:opacity-50 transition-colors"
          >
            <Send className="w-3 h-3" />
            {loadingDraft === review.id ? "Loading…" : "Draft"}
          </button>
        </Tooltip>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function AdminReviews() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [emailSentFilter, setEmailSentFilter] = useState("all");
  const [gradeFilter, setGradeFilter] = useState("All");
  const [schoolFilter, setSchoolFilter] = useState("All");
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

  useEffect(() => {
    fetch("http://localhost:5001/clear_cache", { method: "POST" });
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
      if (statusFilter !== "all") params.append("status", statusFilter);
      if (gradeFilter !== "All") params.append("grade", gradeFilter);
      if (schoolFilter !== "All") params.append("school", schoolFilter);
      if (emailSentFilter !== "all")
        params.append("email_sent", emailSentFilter === "sent" ? "sent" : "not_sent");
      if (search) params.append("search", search);
      params.append("sort_by", sortBy);
      params.append("sort_order", sortOrder);

      const response = await fetch(`http://localhost:5001/get_reviews?${params}`);
      const data = await response.json();
      setReviews(data);
    } catch {
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
    } catch {
      console.error("Failed to fetch stats");
    }
  };

  const clearCacheAndRefresh = async () => {
    try {
      await fetch("http://localhost:5001/clear_cache", { method: "POST" });
    } catch {}
    await fetchReviews();
    await fetchStats();
  };

  const statusColor = {
    Approved: "#2b7a4b",
    Pending: "#cc9a06",
    Rejected: "#c0392b",
  };

  // Client-side filtering for search text + date range
  const filtered = reviews.filter((r) => {
    const q = search.toLowerCase();
    const matchSearch =
      !search ||
      r.book_title?.toLowerCase().includes(q) ||
      r.author?.toLowerCase().includes(q) ||
      `${r.first_name} ${r.last_name}`.toLowerCase().includes(q);
    const matchFrom = !fromDate || new Date(r.date_received) >= new Date(fromDate);
    const matchTo = !toDate || new Date(r.date_received) <= new Date(toDate);
    return matchSearch && matchFrom && matchTo;
  });

  const handleActionClick = (review, newStatus) => {
    const current = review.approved ? "Approved" : review.date_processed ? "Rejected" : "Pending";
    if (current === newStatus) return;
    setConfirmModal({ show: true, reviewId: review.id, action: newStatus, review });
  };

  const confirmAction = async () => {
    const { reviewId, action } = confirmModal;
    setUpdating(reviewId);
    try {
      const idToken = await getIdToken();
      const updateData = { idToken, approved: action === "Approved" };
      if (action !== "Pending") updateData.date_processed = new Date().toISOString();

      const response = await fetch(`http://localhost:5001/update_review/${reviewId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updateData),
      });

      if (response.ok) {
        const result = await response.json();

        // Notify reviewer
        try {
          const auth = getAuth();
          const adminUser = auth.currentUser;
          const senderFirst = adminUser?.displayName?.split(" ")[0] || "";
          const senderLast = adminUser?.displayName?.split(" ").slice(1).join(" ") || "";

          const resRecipient = await fetch("http://localhost:5001/get_uid_by_email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: confirmModal.review.email }),
          });
          const recipientData = await resRecipient.json();

          if (resRecipient.ok && recipientData.uid) {
            await fetch("http://localhost:5001/notify_recipients", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                idToken,
                sender: `${senderFirst} ${senderLast}`,
                recipients: [recipientData.uid],
                book: confirmModal.review.book_title,
                status: action.toLowerCase(),
              }),
            });
          }
        } catch {}

        setConfirmModal({ show: false, reviewId: null, action: null, review: null });

        if (result.email_draft) {
          setEmailDraftModal({ show: true, draft: result.email_draft, reviewId });
        } else {
          await clearCacheAndRefresh();
        }
      } else {
        const error = await response.json();
        alert(error.error || "Failed to update review");
      }
    } catch {
      alert("Failed to update review");
    } finally {
      setUpdating(null);
    }
  };

  // ── FIX: toggle uses the CURRENT sent value from state, not a stale prop ──
  const toggleEmailSent = async (reviewId, currentlySent) => {
    // Optimistic update
    setReviews((prev) =>
      prev.map((r) =>
        r.id === reviewId ? { ...r, sent_confirmation_email: !currentlySent } : r
      )
    );
    try {
      const idToken = await getIdToken();
      const response = await fetch(`http://localhost:5001/update_review/${reviewId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken, sent_confirmation_email: !currentlySent }),
      });
      if (!response.ok) {
        // Revert on failure
        setReviews((prev) =>
          prev.map((r) =>
            r.id === reviewId ? { ...r, sent_confirmation_email: currentlySent } : r
          )
        );
        console.error("Failed to toggle email status");
      }
      // Refresh stats silently
      fetchStats();
    } catch {
      setReviews((prev) =>
        prev.map((r) =>
          r.id === reviewId ? { ...r, sent_confirmation_email: currentlySent } : r
        )
      );
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
        setEmailDraftModal({ show: true, draft: result.email_draft, reviewId });
      } else {
        const error = await response.json();
        alert(error.error || "Failed to generate email draft");
      }
    } catch {
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
    } catch {
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
      "Entry ID","Date Received","Date Processed","First Name","Last Name",
      "Grade","School","Email","Phone","Book Title","Author",
      "Recommended Grade","Rating","Review","Anonymous","Approved",
      "Email Sent","Call Number","Notes",
    ];
    const rows = filtered.map((r) => [
      r.entry_id, r.date_received, r.date_processed, r.first_name, r.last_name,
      r.grade, r.school, r.email, r.phone_number, r.book_title, r.author,
      r.recommended_audience_grade?.join(", "), r.rating, r.review, r.anonymous,
      r.approved ? "Yes" : "No", r.sent_confirmation_email ? "Yes" : "No",
      r.call_number, r.notes_to_admin,
    ]);
    const csv = [headers.join(","), ...rows.map((row) => row.map((c) => `"${c || ""}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reviews_export_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const viewDetails = (review) => {
    setSelectedReview(review);
    setShowDetailModal(true);
  };

  const uniqueGrades = ["All", ...new Set(reviews.map((r) => r.grade).filter(Boolean))].sort();
  const uniqueSchools = ["All", ...new Set(reviews.map((r) => r.school).filter(Boolean))].sort();

  // Clear new_review notifications on mount
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
        const cleaned = current.filter((n) => n?.type !== "new_review");
        if (cleaned.length !== current.length) await updateDoc(userRef, { notifications: cleaned });
      } catch {}
    });
    return unsubscribe;
  }, []);

  // ── Status options ──────────────────────────────────────────────────────────
  const statusOptions = [
    { value: "all", label: "All Statuses" },
    { value: "pending", label: "Pending" },
    { value: "approved", label: "Approved" },
    { value: "rejected", label: "Rejected" },
  ];

  const emailOptions = [
    { value: "all", label: "All Reviews" },
    { value: "not_sent", label: "Email Not Sent" },
    { value: "sent", label: "Email Sent" },
  ];

  const sortOptions = [
    { value: "date_received", label: "Date Received" },
    { value: "book_title", label: "Book Title" },
    { value: "last_name", label: "Reviewer Name" },
    { value: "rating", label: "Rating" },
  ];

  return (
    <RequireAccess allowRoles={["admin"]} redirectTo="/notfound">
      <div className="flex flex-col items-center pb-12 px-6 bg-gray-50 min-h-screen">
          <div className="w-full max-w-[1600px] py-6">
            <div className="flex items-center justify-center mb-6">
              <h1 className="text-4xl font-bold text-gray-800">Manage Submitted Reviews</h1>
            </div>

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

            <div className="bg-white p-5 rounded-lg shadow-sm mb-6 border border-gray-200">
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">
                  Filter &amp; Search
                </h2>
                <Tooltip text="Use the fields below to narrow down the review list. All filters combine together.">
                  <Info className="w-4 h-4 text-gray-400 cursor-help" />
                </Tooltip>
              </div>

              <div className="flex flex-wrap gap-4 items-end">
                <div className="flex flex-col gap-1 min-w-[240px]">
                  <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                    Search
                  </label>
                  <input
                    type="text"
                    placeholder="Book title, author, or reviewer name…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && fetchReviews()}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-1">
                    <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                      Date Range
                    </label>
                    <Tooltip text="Filter reviews submitted between these two dates (inclusive).">
                      <Info className="w-3.5 h-3.5 text-gray-400 cursor-help" />
                    </Tooltip>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={fromDate}
                      onChange={(e) => setFromDate(e.target.value)}
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    />
                    <span className="text-gray-400 text-sm font-medium">to</span>
                    <input
                      type="date"
                      value={toDate}
                      onChange={(e) => setToDate(e.target.value)}
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    />
                  </div>
                </div>

                <FilterSelect
                  label="Status"
                  tooltip="Filter by review approval status: Pending (awaiting decision), Approved, or Rejected."
                  value={statusFilter}
                  onChange={setStatusFilter}
                  options={statusOptions}
                />

                <FilterSelect
                  label="Confirmation Email"
                  tooltip="Filter by whether a confirmation email has been sent to the reviewer after their review was processed."
                  value={emailSentFilter}
                  onChange={setEmailSentFilter}
                  options={emailOptions}
                />

                <FilterSelect
                  label="Grade"
                  value={gradeFilter}
                  onChange={setGradeFilter}
                  options={uniqueGrades.map((g) => ({ value: g, label: g }))}
                />

                <FilterSelect
                  label="School"
                  value={schoolFilter}
                  onChange={setSchoolFilter}
                  options={uniqueSchools.map((s) => ({ value: s, label: s }))}
                />

                <FilterSelect
                  label="Sort By"
                  value={sortBy}
                  onChange={setSortBy}
                  options={sortOptions}
                />

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                    Order
                  </label>
                  <div className="relative">
                    <select
                      value={sortOrder}
                      onChange={(e) => setSortOrder(e.target.value)}
                      className="appearance-none border border-gray-300 rounded-lg px-3 py-2 pr-8 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 cursor-pointer"
                    >
                      <option value="desc">Newest First</option>
                      <option value="asc">Oldest First</option>
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                </div>

                <button
                  onClick={() => {
                    setSearch("");
                    setFromDate("");
                    setToDate("");
                    setStatusFilter("all");
                    setEmailSentFilter("all");
                    setGradeFilter("All");
                    setSchoolFilter("All");
                    setSortBy("date_received");
                    setSortOrder("desc");
                  }}
                  className="self-end text-xs text-gray-500 hover:text-red-600 border border-gray-300 hover:border-red-300 rounded-lg px-3 py-2 transition-colors"
                >
                  Reset Filters
                </button>
              </div>

              {(statusFilter !== "all" || emailSentFilter !== "all" || fromDate || toDate || search) && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="text-xs text-gray-500 font-medium self-center">Active:</span>
                  {search && (
                    <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full">
                      Search: "{search}"
                    </span>
                  )}
                  {statusFilter !== "all" && (
                    <span className="text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full capitalize">
                      Status: {statusFilter}
                    </span>
                  )}
                  {emailSentFilter !== "all" && (
                    <span className="text-xs bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-full">
                      Email: {emailSentFilter === "sent" ? "Sent" : "Not Sent"}
                    </span>
                  )}
                  {(fromDate || toDate) && (
                    <span className="text-xs bg-orange-50 text-orange-700 border border-orange-200 px-2 py-0.5 rounded-full">
                      Dates: {fromDate || "…"} → {toDate || "…"}
                    </span>
                  )}
                  <span className="text-xs text-gray-400 self-center">
                    {filtered.length} result{filtered.length !== 1 ? "s" : ""}
                  </span>
                </div>
              )}
            </div>

            <div className="bg-white rounded-lg shadow-sm overflow-x-auto">
              {loading ? (
                <div className="text-center py-12 text-gray-500">Loading reviews…</div>
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
                      <th className="px-3 py-3 text-left font-bold text-gray-700 text-sm">
                        <div className="flex items-center gap-1">
                          Confirmation Email
                          <Tooltip text="Shows whether a confirmation email was sent to the reviewer. 'Not Sent' = email pending. Click the badge to toggle. Click 'Draft' to preview the email.">
                            <Info className="w-3.5 h-3.5 text-gray-400 cursor-help" />
                          </Tooltip>
                        </div>
                      </th>
                      <th className="px-3 py-3 text-left font-bold text-gray-700 text-sm">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r) => {
                      const status = r.approved ? "Approved" : r.date_processed ? "Rejected" : "Pending";
                      const isUpdating = updating === r.id;

                      return (
                        <tr key={r.id} className="border-b border-green-100 hover:bg-green-50 transition-colors">
                          <td className="px-3 py-3 text-sm text-gray-600">
                            {new Date(r.date_received).toLocaleDateString()}
                          </td>
                          <td className="px-3 py-3 text-sm font-semibold text-gray-800">
                            {r.first_name} {r.last_name}
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
                            <EmailStatusCell
                              review={r}
                              onToggle={toggleEmailSent}
                              onViewDraft={viewEmailDraft}
                              loadingDraft={loadingDraft}
                            />
                          </td>
                          <td className="px-3 py-3">
                            {isUpdating ? (
                              <div className="text-gray-500 text-sm">Updating…</div>
                            ) : (
                              <div className="flex gap-2">
                                <button
                                  onClick={() => viewDetails(r)}
                                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-1 px-3 rounded text-xs transition-colors"
                                >
                                  View
                                </button>
                                <Tooltip text="Approve this review">
                                  <button
                                    onClick={() => handleActionClick(r, "Approved")}
                                    disabled={status === "Approved"}
                                    className={`font-bold py-1 px-3 rounded text-xs transition-colors ${
                                      status === "Approved"
                                        ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                                        : "bg-green-700 hover:bg-green-800 text-white"
                                    }`}
                                  >
                                    ✓
                                  </button>
                                </Tooltip>
                                <Tooltip text="Reject this review">
                                  <button
                                    onClick={() => handleActionClick(r, "Rejected")}
                                    disabled={status === "Rejected"}
                                    className={`font-bold py-1 px-3 rounded text-xs transition-colors ${
                                      status === "Rejected"
                                        ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                                        : "bg-red-600 hover:bg-red-700 text-white"
                                    }`}
                                  >
                                    ✗
                                  </button>
                                </Tooltip>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {filtered.length === 0 && (
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

            <div className="mt-8 flex justify-center">
              <button
                onClick={exportCSV}
                className="bg-green-900 hover:bg-green-950 text-white font-bold py-4 px-8 rounded-lg text-lg transition-colors shadow-md"
              >
                Export Full Database as CSV
              </button>
            </div>
          </div>

        {showDetailModal && selectedReview && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl p-6 w-full max-w-2xl mx-4 shadow-2xl max-h-[90vh] overflow-y-auto">
              <h2 className="text-2xl font-bold mb-4 text-gray-800">Review Details</h2>
              <div className="grid grid-cols-2 gap-4 mb-4">
                {[
                  ["Entry ID", selectedReview.entry_id],
                  ["Date Received", new Date(selectedReview.date_received).toLocaleString()],
                  ["Reviewer", `${selectedReview.first_name} ${selectedReview.last_name}`],
                  ["Grade", selectedReview.grade],
                  ["School", selectedReview.school],
                  ["Email", selectedReview.email],
                  ["Phone", selectedReview.phone_number],
                  ["Anonymous", selectedReview.anonymous],
                ].map(([label, val]) => (
                  <div key={label}>
                    <p className="text-sm text-gray-500 font-semibold">{label}</p>
                    <p className="text-gray-800 text-sm">{val}</p>
                  </div>
                ))}
              </div>
              <div className="border-t pt-4 mb-4">
                <h3 className="font-bold text-lg mb-2 text-gray-800">Book Information</h3>
                {[
                  ["Title", selectedReview.book_title],
                  ["Author", selectedReview.author],
                  ["Rating", `★ ${Number(selectedReview.rating).toFixed(1)} / 5`],
                  ["Recommended Grade", selectedReview.recommended_audience_grade?.join(", ") || "N/A"],
                ].map(([label, val]) => (
                  <div key={label} className="mb-2">
                    <p className="text-sm text-gray-500 font-semibold">{label}</p>
                    <p className="text-gray-800">{val}</p>
                  </div>
                ))}
              </div>
              <div className="border-t pt-4 mb-4">
                <p className="text-sm text-gray-500 font-semibold mb-2">Review</p>
                <p className="text-gray-800 bg-gray-50 p-3 rounded whitespace-pre-line">{selectedReview.review}</p>
              </div>
              <div className="border-t pt-4 mb-4">
                <h3 className="font-bold text-lg mb-2 text-gray-800">Admin Fields</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><p className="text-gray-500 font-semibold">Call Number</p><p>{selectedReview.call_number || "N/A"}</p></div>
                  <div><p className="text-gray-500 font-semibold">Time Earned</p><p>0.5 hrs</p></div>
                  <div><p className="text-gray-500 font-semibold">Label Created</p><p>{selectedReview.label_created ? "Yes" : "No"}</p></div>
                  <div><p className="text-gray-500 font-semibold">On Volgistics</p><p>{selectedReview.on_volgistics ? "Yes" : "No"}</p></div>
                  <div>
                    <p className="text-gray-500 font-semibold">Confirmation Email</p>
                    <p className={`font-semibold ${selectedReview.sent_confirmation_email ? "text-green-600" : "text-orange-600"}`}>
                      {selectedReview.sent_confirmation_email ? "Sent" : "Not Sent"}
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex gap-3 justify-end mt-6">
                <button
                  onClick={() => setShowDetailModal(false)}
                  className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-2 px-6 rounded-lg"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {confirmModal.show && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4 shadow-2xl">
              <h2 className="text-2xl font-bold mb-3 text-gray-800">Confirm Action</h2>
              <p className="text-gray-600 mb-2">
                Book: <span className="font-semibold">{confirmModal.review?.book_title}</span>
              </p>
              <p className="text-gray-600 mb-2">
                Change status to{" "}
                <span className="font-bold" style={{ color: statusColor[confirmModal.action] }}>
                  {confirmModal.action}
                </span>
                ?
              </p>
              <p className="text-sm text-purple-600 mb-6 font-medium">
                📧 You'll be able to review the email draft before sending.
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setConfirmModal({ show: false, reviewId: null, action: null, review: null })}
                  className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-2 px-6 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmAction}
                  className="text-white font-bold py-2 px-6 rounded-lg"
                  style={{ backgroundColor: statusColor[confirmModal.action] }}
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        )}

        {emailDraftModal.show && emailDraftModal.draft && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[90vh]">
              <div className="flex items-center justify-between p-6 border-b border-gray-200">
                <h2 className="text-2xl font-bold text-gray-800">Email Draft Preview</h2>
                <span
                  className={`px-3 py-1 rounded-full text-sm font-semibold ${
                    emailDraftModal.draft.status === "approved"
                      ? "bg-green-100 text-green-800"
                      : "bg-red-100 text-red-800"
                  }`}
                >
                  {emailDraftModal.draft.status === "approved" ? "Approval" : "Rejection"}
                </span>
              </div>

              <div className="overflow-y-auto flex-1 p-6">
                <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200 text-sm space-y-1">
                  <div><span className="font-semibold text-gray-600">To:</span> {emailDraftModal.draft.to}</div>
                  <div><span className="font-semibold text-gray-600">Subject:</span> {emailDraftModal.draft.subject}</div>
                  <div><span className="font-semibold text-gray-600">Reviewer:</span> {emailDraftModal.draft.reviewer_name}</div>
                  <div><span className="font-semibold text-gray-600">Book:</span> {emailDraftModal.draft.book_title}</div>
                </div>

                <div className="mb-4">
                  <div className="flex border-b border-gray-200">
                    {["HTML Preview", "Plain Text"].map((tab, i) => (
                      <button
                        key={tab}
                        onClick={() => {
                          document.querySelectorAll(".email-tab").forEach((t, j) => {
                            t.classList.toggle("border-purple-600", i === j);
                            t.classList.toggle("text-purple-600", i === j);
                            t.classList.toggle("border-transparent", i !== j);
                            t.classList.toggle("text-gray-600", i !== j);
                          });
                          document.querySelectorAll(".email-content").forEach((c, j) => {
                            c.classList.toggle("hidden", i !== j);
                          });
                        }}
                        className={`email-tab px-4 py-2 font-semibold border-b-2 transition-colors ${
                          i === 0
                            ? "border-purple-600 text-purple-600"
                            : "border-transparent text-gray-600 hover:text-gray-800"
                        }`}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="email-content mb-4">
                  <div className="border border-gray-300 rounded-lg p-4 bg-white max-h-64 overflow-y-auto">
                    <div dangerouslySetInnerHTML={{ __html: emailDraftModal.draft.html_body }} />
                  </div>
                </div>

                <div className="email-content hidden mb-4">
                  <div className="border border-gray-300 rounded-lg p-4 bg-gray-50 max-h-64 overflow-y-auto">
                    <pre className="whitespace-pre-wrap text-sm font-mono text-gray-800">
                      {emailDraftModal.draft.text_body}
                    </pre>
                  </div>
                </div>

                <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded">
                  <p className="text-sm text-yellow-800">
                    <strong>Next step:</strong> Copy this draft to your email client, send it to the reviewer,
                    then click <strong>"Mark as Sent"</strong> below to update the tracking record.
                  </p>
                </div>
              </div>

              <div className="flex gap-3 justify-end p-6 border-t border-gray-200 bg-gray-50">
                <button
                  onClick={() => {
                    setEmailDraftModal({ show: false, draft: null, reviewId: null });
                    clearCacheAndRefresh();
                  }}
                  className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-2 px-6 rounded-lg"
                >
                  Close
                </button>
                <button
                  onClick={copyEmailToClipboard}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-6 rounded-lg"
                >
                  📋 Copy to Clipboard
                </button>
                <Tooltip text="Confirm you've sent this email. This updates the tracker so you can see which reviewers have been contacted.">
                  <button
                    onClick={markEmailAsSent}
                    className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-6 rounded-lg"
                  >
                    <MailCheck className="w-4 h-4" />
                    Mark as Sent
                  </button>
                </Tooltip>
              </div>
            </div>
          </div>
        )}
      </div>
    </RequireAccess>
  );
}