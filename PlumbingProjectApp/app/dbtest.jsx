import React, { useState, useEffect } from "react";
import { getAuth } from "firebase/auth";

export default function App() {
  const [title, setTitle] = useState("");
  const [books, setBooks] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [activeTab, setActiveTab] = useState("reviews");
  const [loading, setLoading] = useState(false);
  
  const [reviewForm, setReviewForm] = useState({
    first_name: "Test",
    last_name: "User",
    email: "test@example.com",
    grade: 10,
    school: "Test School",
    phone_number: "",
    book_title: "The Toll",
    author: "Neal Shusterman",
    rating: 5,
    review: "This is a test review for the database import functionality. Great book with excellent character development and an engaging plot.",
    anonymous: "anonymous"
  });

  const getIdToken = async () => {
    const auth = getAuth();
    const user = auth.currentUser;
    if (!user) {
      throw new Error("User not logged in");
    }
    return await user.getIdToken(true);
  };

  const addBook = async () => {
    if (!title) {
      alert("Please enter title");
      return;
    }

    setLoading(true);
    try {
      const idToken = await getIdToken();
      
      const res = await fetch("https://bibliomaniacs.onrender.com/add_book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken, title })
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to add book");
      }

      const data = await res.json();
      console.log("Added book:", data);
      setTitle("");
      fetchBooks();
      alert("Book added successfully!");
    } catch (err) {
      console.error(err);
      alert("Failed to add book: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const submitReview = async () => {
    setLoading(true);
    try {
      const idToken = await getIdToken();
      
      const res = await fetch("https://bibliomaniacs.onrender.com/submit_review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idToken,
          ...reviewForm
        })
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to submit review");
      }

      const data = await res.json();
      console.log("Submitted review:", data);
      alert(`Review submitted successfully!\nID: ${data.id}\nEntry ID: ${data.entry_id}`);
      fetchReviews();
    } catch (err) {
      console.error(err);
      alert("Failed to submit review: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchBooks = async () => {
    try {
      const res = await fetch("https://bibliomaniacs.onrender.com/get_books");
      const data = await res.json();
      setBooks(data);
    } catch (err) {
      console.error(err);
      alert("Failed to fetch books");
    }
  };

  const fetchReviews = async () => {
    try {
      const res = await fetch("https://bibliomaniacs.onrender.com/get_reviews");
      const data = await res.json();
      setReviews(data);
    } catch (err) {
      console.error(err);
      alert("Failed to fetch reviews");
    }
  };

  useEffect(() => {
    fetchBooks();
    fetchReviews();
  }, []);

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      <h1 style={{ fontSize: 34, fontWeight: 800, textAlign: "center" }}>Database Test</h1>
      <p style={{ fontSize: 16, color: "#3b3b3b", textAlign: "center", marginBottom: 30 }}>
        Test adding books and reviews to the database
      </p>

      <div style={{ display: "flex", gap: 12, marginBottom: 24, justifyContent: "center" }}>
        <button
          onClick={() => setActiveTab("books")}
          style={{
            padding: "12px 24px",
            backgroundColor: activeTab === "books" ? "#2b7a4b" : "white",
            color: activeTab === "books" ? "white" : "#2b7a4b",
            border: "2px solid #2b7a4b",
            borderRadius: 12,
            fontWeight: 700,
            cursor: "pointer"
          }}
        >
          Books
        </button>
        <button
          onClick={() => setActiveTab("reviews")}
          style={{
            padding: "12px 24px",
            backgroundColor: activeTab === "reviews" ? "#2b7a4b" : "white",
            color: activeTab === "reviews" ? "white" : "#2b7a4b",
            border: "2px solid #2b7a4b",
            borderRadius: 12,
            fontWeight: 700,
            cursor: "pointer"
          }}
        >
          Reviews
        </button>
      </div>

      {activeTab === "books" && (
        <div>
          <div style={{ backgroundColor: "#f5f5f5", padding: 20, borderRadius: 12, marginBottom: 24 }}>
            <input
              type="text"
              placeholder="Enter book title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={{
                width: "100%",
                padding: 12,
                borderRadius: 8,
                border: "1px solid #ddd",
                marginBottom: 12,
                fontSize: 16
              }}
            />
            
            <div style={{ display: "flex", gap: 12 }}>
              <button
                onClick={addBook}
                disabled={loading}
                style={{
                  backgroundColor: loading ? "#ccc" : "#2b7a4b",
                  color: "white",
                  padding: "12px 18px",
                  borderRadius: 12,
                  border: "none",
                  fontWeight: 700,
                  cursor: loading ? "not-allowed" : "pointer"
                }}
              >
                {loading ? "Adding..." : "Add Book"}
              </button>
              <button
                onClick={fetchBooks}
                style={{
                  backgroundColor: "white",
                  color: "#2b7a4b",
                  padding: "12px 18px",
                  borderRadius: 12,
                  border: "2px solid #2b7a4b",
                  fontWeight: 700,
                  cursor: "pointer"
                }}
              >
                Refresh Books
              </button>
            </div>
          </div>

          <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16 }}>
            Books in Database ({books.length})
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {books.length === 0 ? (
              <p style={{ color: "#666", textAlign: "center", padding: 20 }}>No books yet.</p>
            ) : (
              books.map((book) => (
                <div
                  key={book.id}
                  style={{
                    backgroundColor: "#eaf6ea",
                    padding: 16,
                    borderRadius: 12,
                    border: "1px solid #cfe8cf"
                  }}
                >
                  <p style={{ fontWeight: 700, color: "#224c2f" }}>{book.title}</p>
                  <p style={{ fontSize: 14, color: "#666" }}>ID: {book.id}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {activeTab === "reviews" && (
        <div>
          <div style={{ backgroundColor: "#f5f5f5", padding: 20, borderRadius: 12, marginBottom: 24 }}>
            <h3 style={{ marginBottom: 16, fontSize: 18, fontWeight: 700 }}>Submit Review Form</h3>
            
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <input
                type="text"
                placeholder="First Name"
                value={reviewForm.first_name}
                onChange={(e) => setReviewForm({...reviewForm, first_name: e.target.value})}
                style={{ padding: 10, borderRadius: 8, border: "1px solid #ddd" }}
              />
              <input
                type="text"
                placeholder="Last Name"
                value={reviewForm.last_name}
                onChange={(e) => setReviewForm({...reviewForm, last_name: e.target.value})}
                style={{ padding: 10, borderRadius: 8, border: "1px solid #ddd" }}
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <input
                type="email"
                placeholder="Email"
                value={reviewForm.email}
                onChange={(e) => setReviewForm({...reviewForm, email: e.target.value})}
                style={{ padding: 10, borderRadius: 8, border: "1px solid #ddd" }}
              />
              <input
                type="number"
                placeholder="Grade"
                value={reviewForm.grade}
                onChange={(e) => setReviewForm({...reviewForm, grade: parseInt(e.target.value)})}
                style={{ padding: 10, borderRadius: 8, border: "1px solid #ddd" }}
              />
            </div>

            <input
              type="text"
              placeholder="School"
              value={reviewForm.school}
              onChange={(e) => setReviewForm({...reviewForm, school: e.target.value})}
              style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #ddd", marginBottom: 12 }}
            />

            <input
              type="text"
              placeholder="Book Title"
              value={reviewForm.book_title}
              onChange={(e) => setReviewForm({...reviewForm, book_title: e.target.value})}
              style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #ddd", marginBottom: 12 }}
            />

            <input
              type="text"
              placeholder="Author"
              value={reviewForm.author}
              onChange={(e) => setReviewForm({...reviewForm, author: e.target.value})}
              style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #ddd", marginBottom: 12 }}
            />

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", marginBottom: 6, fontWeight: 600, fontSize: 14 }}>
                Rating: {reviewForm.rating}/5
              </label>
              <input
                type="range"
                min="1"
                max="5"
                value={reviewForm.rating}
                onChange={(e) => setReviewForm({...reviewForm, rating: parseInt(e.target.value)})}
                style={{ width: "100%" }}
              />
            </div>

            <textarea
              placeholder="Review text"
              value={reviewForm.review}
              onChange={(e) => setReviewForm({...reviewForm, review: e.target.value})}
              style={{ 
                width: "100%", 
                padding: 10, 
                borderRadius: 8, 
                border: "1px solid #ddd", 
                marginBottom: 12,
                minHeight: 100,
                fontFamily: "inherit"
              }}
            />

            <div style={{ display: "flex", gap: 12 }}>
              <button
                onClick={submitReview}
                disabled={loading}
                style={{
                  backgroundColor: loading ? "#ccc" : "#2b7a4b",
                  color: "white",
                  padding: "12px 18px",
                  borderRadius: 12,
                  border: "none",
                  fontWeight: 700,
                  cursor: loading ? "not-allowed" : "pointer"
                }}
              >
                {loading ? "Submitting..." : "Submit Review"}
              </button>
              <button
                onClick={fetchReviews}
                style={{
                  backgroundColor: "white",
                  color: "#2b7a4b",
                  padding: "12px 18px",
                  borderRadius: 12,
                  border: "2px solid #2b7a4b",
                  fontWeight: 700,
                  cursor: "pointer"
                }}
              >
                Refresh Reviews
              </button>
            </div>
          </div>

          <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16 }}>
            Reviews in Database ({reviews.length})
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {reviews.length === 0 ? (
              <p style={{ color: "#666", textAlign: "center", padding: 20 }}>No reviews yet.</p>
            ) : (
              reviews.map((review) => (
                <div
                  key={review.id}
                  style={{
                    backgroundColor: "#fff",
                    padding: 16,
                    borderRadius: 12,
                    border: "1px solid #ddd"
                  }}
                >
                  <h3 style={{ fontWeight: 700, marginBottom: 8 }}>{review.book_title}</h3>
                  <p style={{ fontSize: 14, color: "#666", marginBottom: 4 }}>
                    By {review.author} | Reviewed by {review.first_name} {review.last_name}
                  </p>
                  <p style={{ fontSize: 14, color: "#666", marginBottom: 8 }}>
                    Rating: {review.rating}/5 | Grade: {review.grade} | Entry ID: {review.entry_id}
                  </p>
                  <p style={{ fontSize: 14 }}>{review.review?.substring(0, 150)}...</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}