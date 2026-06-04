from cache_utils import get_cache, set_cache
from recommendationModel.parsing import load_books, load_reviews, make_book_id, normalize_text
from recommendationModel.embeddings import EmbeddingBuilder
from recommendationModel.model import HybridRecommender
from recommendationModel.housedBooks.modelIncorp import AvailabilityCache, AvailabilityService, ContextAwareRecommender
from recommendationModel.genreCategorization import fetch_wikipedia_genres
import os
import pickle
import base64

# --- Lazy-loaders ---
def get_books_data():
    cache_key = "all_books_data"
    cached = get_cache(cache_key)
    if cached:
        return cached

    # Load only the essential CSV files
    books = {}
    if os.path.exists("./backend/recommendationModel/reviewedBooks.csv"):
        books = load_books("./backend/recommendationModel/reviewedBooks.csv")
    if os.path.exists("./backend/recommendationModel/bigReviews.csv"):
        books = load_reviews("./backend/recommendationModel/bigReviews.csv", books)

    # Cache for 1 hour
    set_cache(cache_key, books, ttl=3600)
    return books

def get_firestore_reviews():
    cache_key = "firestore_reviews"
    cached = get_cache(cache_key)
    if cached:
        return cached

    from review_model import Review
    reviews = list(Review.collection.limit(500).fetch())  # LIMIT ADDED
    set_cache(cache_key, reviews, ttl=300)
    return reviews

def get_ratings_docs():
    cache_key = "ratings_docs"
    cached = get_cache(cache_key)
    if cached:
        return cached

    from firebase_admin import firestore
    db = firestore.client()
    ratings_docs = [doc.to_dict() for doc in db.collection("ratings").limit(500).stream()]  # LIMIT ADDED
    set_cache(cache_key, ratings_docs, ttl=300)
    return ratings_docs

def get_book_embeddings(books_data):
    cache_key = "book_embeddings"
    cached = get_cache(cache_key)
    if cached:
        return cached

    embedder = EmbeddingBuilder()
    book_embeddings = embedder.build_book_embeddings(books_data)
    set_cache(cache_key, book_embeddings, ttl=86400)
    return book_embeddings

def get_recommender(books_data, book_embeddings):
    cache_key = "recommender"
    cached = get_cache(cache_key)
    if cached:
        return cached

    cache = AvailabilityCache(redis_host="localhost", redis_port=6380)
    availability_service = AvailabilityService(cache)
    recommender = HybridRecommender(book_embeddings, books_data)
    context_recommender = ContextAwareRecommender(
        base_recommender=recommender,
        books=books_data,
        availability_service=availability_service,
        initial_pool=50,
        expansion_step=50,
        max_pool=300
    )
    set_cache(cache_key, (recommender, context_recommender), ttl=86400)
    return recommender, context_recommender

# --- Initialize on first use ---
_books_data = None
_recommender = None
_context_recommender = None

def get_books():
    global _books_data
    if _books_data is None:
        _books_data = get_books_data()
    return _books_data

def get_recommender_instance():
    global _recommender, _context_recommender
    if _recommender is None:
        books = get_books()
        firestore_reviews = get_firestore_reviews()
        ratings_docs = get_ratings_docs()
        books = firestore_reviews_to_model_format(firestore_reviews, books)
        books = firestore_ratings_to_book_data(ratings_docs, books)
        for book_id, book in books.items():
            if not book.get("genres"):
                book["genres"] = fetch_wikipedia_genres(book["title"], book.get("author"))
        book_embeddings = get_book_embeddings(books)
        _recommender, _context_recommender = get_recommender(books, book_embeddings)
    return _recommender, _context_recommender

def firestore_reviews_to_model_format(firestore_reviews, books):
    from recommendationModel.parsing import make_book_id, normalize_text
    from recommendationModel.sentiment import ReviewSentimentAnalyzer
    analyzer = ReviewSentimentAnalyzer()
    seen = set()
    for r in firestore_reviews:
        if not r.approved:
            continue
        title = r.book_title
        author = r.author
        if not title or not author:
            continue
        book_id = make_book_id(title, author)
        if book_id not in books:
            genres = fetch_wikipedia_genres(title, author)
            books[book_id] = {"title": title, "author": author, "genres": genres, "reviews": []}
        try:
            stars = int(r.rating)
        except:
            stars = None
        raw_grades = r.recommended_audience_grade or []
        clean_grades = []
        if isinstance(raw_grades, list):
            for g in raw_grades:
                try:
                    clean_grades.append(int(g))
                except:
                    continue
        else:
            try:
                clean_grades.append(int(raw_grades))
            except:
                pass
        key = (book_id, normalize_text(r.review or ""))
        if key in seen:
            continue
        seen.add(key)
        sentiment = analyzer.score(r.review) if r.review else 0.5
        books[book_id]["reviews"].append({
            "stars": int(r.rating) if r.rating else None,
            "text": normalize_text(r.review or ""),
            "recommended_grades": clean_grades,
            "sentiment": sentiment
        })
    return books

def firestore_ratings_to_book_data(ratings_docs, books):
    for r in ratings_docs:
        title = r.get("title")
        author = r.get("author")
        if not title or not author:
            continue
        book_id = make_book_id(title, author)
        rating = r.get("rating")
        if not book_id or rating is None:
            continue
        if book_id not in books:
            genres = fetch_wikipedia_genres(title, author)
            books[book_id] = {"title": title, "author": author, "genres": genres, "reviews": []}
        try:
            stars = int(rating)
        except:
            continue
        if not books[book_id]["genres"]:
            books[book_id]["genres"] = fetch_wikipedia_genres(books[book_id]["title"])
        books[book_id]["reviews"].append({
            "stars": stars,
            "text": "",
            "recommended_grades": [],
            "sentiment": stars / 5
        })
    return books