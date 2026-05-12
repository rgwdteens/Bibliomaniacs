from flask import Flask, request, jsonify
import firebase_admin
from firebase_admin import credentials, auth, firestore
from flask_cors import CORS
import asyncio
from datetime import datetime, timedelta
import hashlib
from modelsetup import chat
from cache import get_cache, set_cache, make_prompt_key, delete_cache_prefix
from config import ADMIN_EMAILS
from fireo import connection
from fireo.models import Model
from fireo.fields import TextField, IDField, NumberField, ListField
from review_model import Review, create_review, process_review, calculate_user_hours
import traceback
import time
from datetime import datetime, timedelta, timezone
import os
from email_utils import generate_email_draft, generate_bulk_email_drafts
from better_profanity import profanity
import logging
from recommendationModel.parsing import load_books, load_reviews
from recommendationModel.embeddings import EmbeddingBuilder
from recommendationModel.model import HybridRecommender
from recommendationModel.evaluation import RecommenderEvaluator
from recommendationModel.housedBooks.modelIncorp import (AvailabilityCache, AvailabilityService, ContextAwareRecommender)
from recommendationModel.parsing import make_book_id, normalize_text
import pickle
import base64

app = Flask(__name__)
CORS(app)

service_key_json = os.environ.get("FIREBASE_SERVICE_KEY")

if service_key_json:
    with open("serviceKey.json", "w") as f:
        f.write(service_key_json)

cred = credentials.Certificate("serviceKey.json")
firebase_admin.initialize_app(cred)

connection(from_file="serviceKey.json")
db = firestore.client()

profanity.load_censor_words()

REJECTION_REASON_TEMPLATES = {
    "below_ya": """This book is categorized as Children's or Middle Grade. Please submit YA or above titles only.""",

    "duplicate": """A review has already been submitted for this book. Please check the submitted reviews list before submitting.""",

    "plagiarism": """Your review appears to contain copied material. All reviews must be original and written by the submitter.""",

    "location": """We only accept submissions from Ridgewood, NJ students or those attending school in the area.""",

    "limit": """You have exceeded the daily limit of two reviews. Please submit again on the next day."""
}

def firestore_reviews_to_model_format(firestore_reviews, books):
    from recommendationModel.parsing import make_book_id, normalize_text
    from recommendationModel.sentiment import ReviewSentimentAnalyzer

    analyzer = ReviewSentimentAnalyzer()

    for r in firestore_reviews:
        if not r.approved:
            continue

        title = r.book_title
        author = r.author

        if not title or not author:
            continue

        book_id = make_book_id(title, author)

        if book_id not in books:
            books[book_id] = {
                "title": title,
                "author": author,
                "genres": [],
                "reviews": []
            }
        
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

        seen = set()

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
        book_id = r.get("bookId")
        rating = r.get("rating")

        if not book_id or rating is None:
            continue

        if book_id not in books:
            continue

        try:
            stars = int(rating)
        except:
            continue

        # basically create synthetic review
        books[book_id]["reviews"].append({
            "stars": stars,
            "text": "", 
            "recommended_grades": [],
            "sentiment": stars / 5 
        })

    return books
def load_or_train_model():
    cache_key = "book_embeddings"
    cached = get_cache(cache_key)

    if cached:
        print("Loading embeddings from cache...")
        book_embeddings = pickle.loads(base64.b64decode(cached))
    else:
        print("Training new model...")

        embedder = EmbeddingBuilder()
        book_embeddings = embedder.build_book_embeddings(books_data)

        set_cache(
            cache_key,
            base64.b64encode(pickle.dumps(book_embeddings)).decode("utf-8"),
            ttl=86400
        )

    recommender = HybridRecommender(book_embeddings, books_data)

    context_recommender = ContextAwareRecommender(
        base_recommender=recommender,
        books=books_data,
        availability_service=availability_service,
        initial_pool=50,
        expansion_step=50,
        max_pool=300
    )

    return book_embeddings, recommender, context_recommender

cache = AvailabilityCache(
    redis_host="localhost",
    redis_port=6380,
)

availability_service = AvailabilityService(cache)

books_data = load_books("./backend/recommendationModel/reviewedBooks.csv")
books_data = load_reviews("./backend/recommendationModel/bigReviews.csv", books_data)
firestore_reviews = list(Review.collection.fetch())
books_data = firestore_reviews_to_model_format(firestore_reviews, books_data)
ratings_docs = [doc.to_dict() for doc in db.collection("ratings").stream()]
books_data = firestore_ratings_to_book_data(ratings_docs, books_data)
book_embeddings, recommender, context_recommender = load_or_train_model()
print("Model Ready.")



class Book(Model):
    id = IDField()
    title = TextField()
    added_by = TextField()

def verify_firebase_token(id_token):
    """Verify Firebase ID token"""
    try:
        decoded_token = auth.verify_id_token(id_token)
        return decoded_token
    except Exception:
        return None

def get_admin_emails():
    """Fetch admin emails from Firestore"""
    try:
        admin_doc = db.collection("settings").document("admins").get()
        if admin_doc.exists:
            return admin_doc.to_dict().get("emails", [])
        return []
    except Exception as e:
        print(f"Error fetching admin emails")
        return []
    
def get_admin_ids():
    doc = db.collection("settings").document("admins").get()

    if not doc.exists:
        return []

    data = doc.to_dict() or {}
    emails = data.get("emails", [])
    uids = []

    for email in emails:
        try:
            user = auth.get_user_by_email(email)
            uids.append(user.uid)
        except Exception as e:
            print(f"Could not convert admin email to UID")

    return uids


def get_all_users():
    docs = db.collection("users").get()
    uids = []

    for doc in docs:
        data = doc.to_dict() or {}
        email = data.get("email")

        if email:
            uids.append(doc.id)

    return uids

@app.route("/check_content", methods=["POST"])
def check_content():
    data = request.get_json(silent=True) or {}
    text = data.get("text", "").strip()

    if not text:
        return jsonify({"ok": True, "flags": []}), 200

    flags = []

    if profanity.contains_profanity(text):
        flags.append({
            "type": "profanity",
            "message": "Your review contains inappropriate language. Please revise before submitting."
        })

        censored = profanity.censor(text)
        original_words = text.split()
        censored_words = censored.split()

        bad_words = [
            orig for orig, cens in zip(original_words, censored_words)
            if orig != cens
        ]

        logging.warning(f"Profanity detected: {bad_words}")

    words = text.split()
    word_count = len(words)

    if word_count >= 20:
        from collections import Counter
        freq = Counter(w.lower() for w in words)
        most_common_word, most_common_count = freq.most_common(1)[0]
        if most_common_count / word_count > 0.20 and most_common_word not in {"the","a","an","and","is","of","to","in","it","was","i"}:
            flags.append({
                "type": "spam_repetition",
                "message": f'Your review repeats the word "{most_common_word}" too many times. Please write a more varied review.'
            })

    if word_count >= 10:
        alpha_words = [w for w in words if w.isalpha()]
        if alpha_words:
            caps_ratio = sum(1 for w in alpha_words if w.isupper() and len(w) > 1) / len(alpha_words)
            if caps_ratio > 0.6:
                flags.append({
                    "type": "spam_caps",
                    "message": "Your review appears to be written in excessive capital letters. Please use normal casing."
                })

    if word_count >= 10:
        avg_len = sum(len(w) for w in words) / word_count
        if avg_len < 2.5:
            flags.append({
                "type": "spam_gibberish",
                "message": "Your review doesn't appear to contain real words. Please write a genuine review."
            })

    letters = [c.lower() for c in text if c.isalpha()]
    if len(letters) > 40:
        vowels = sum(1 for c in letters if c in "aeiou")
        if vowels / len(letters) < 0.1:
            flags.append({
                "type": "spam_gibberish",
                "message": "Your review doesn't appear to contain real words. Please write a genuine review."
            })

    if len(text) > 30:
        symbol_ratio = sum(1 for c in text if not c.isalnum() and not c.isspace()) / len(text)
        if symbol_ratio > 0.35:
            flags.append({
                "type": "spam_symbols",
                "message": "Your review contains too many special characters or symbols."
            })

    seen = set()
    unique_flags = []
    for f in flags:
        if f["type"] not in seen:
            seen.add(f["type"])
            unique_flags.append(f)

    return jsonify({
        "ok": len(unique_flags) == 0,
        "flags": unique_flags
    }), 200


@app.route("/notify_admins", methods=["POST"])
def notify_admins_route():
    try:
        data = request.get_json(silent=True) or {}

        id_token = data.get("idToken")
        if not id_token:
            return jsonify({"error": "Missing ID token"}), 401

        decoded = verify_firebase_token(id_token)
        if not decoded:
            return jsonify({"error": "Invalid ID token"}), 401

        sender = data.get("sender", "")
        book = data.get("book", "")
        status = data.get("status", "")

        recipients = get_admin_ids()

        recipients = [uid for uid in recipients if uid]
        recipients = list(dict.fromkeys(recipients))

        payload, code = notify_recipients(sender, recipients, book, status)
        return jsonify(payload), code

    except Exception as e:
        print("notify_admins_route ERROR")
        print(traceback.format_exc())
        return jsonify({"error": str(e), "trace": traceback.format_exc()}), 500
    

@app.route("/notify_all", methods=["POST"])
def notify_all_route():
    try:
        data = request.get_json(silent=True) or {}

        id_token = data.get("idToken")
        if not id_token:
            return jsonify({"error": "Missing ID token"}), 401

        decoded = verify_firebase_token(id_token)
        if not decoded:
            return jsonify({"error": "Invalid ID token"}), 401

        book = data.get("book", "")

        recipients = get_all_users()

        recipients = [uid for uid in recipients if uid]
        recipients = list(dict.fromkeys(recipients))

        payload, code = notify_recipients("", recipients, book, "book_of_the_week")
        return jsonify(payload), code

    except Exception as e:
        print("notify_admins_route ERROR")
        print(traceback.format_exc())
        return jsonify({"error": str(e), "trace": traceback.format_exc()}), 500
    

@app.route("/notify_recipients", methods=["POST"])
def notify_recipients_route():
    try:
        data = request.get_json(silent=True) or {}

        id_token = data.get("idToken")
        if not id_token:
            return jsonify({"error": "Missing ID token"}), 401

        decoded = verify_firebase_token(id_token)
        if not decoded:
            return jsonify({"error": "Invalid ID token"}), 401

        sender = data.get("sender", "")
        recipients = data.get("recipients", "")
        book = data.get("book", "")
        status = data.get("status", "")

        payload, code = notify_recipients(sender, recipients, book, status)
        return jsonify(payload), code

    except Exception as e:
        print("notify_reviewer_route ERROR")
        print(traceback.format_exc())
        return jsonify({"error": str(e), "trace": traceback.format_exc()}), 500


def notify_recipients(sender, recipients, book="", status=""):
    try:
        recipients = [uid for uid in recipients if uid]
        recipients = list(dict.fromkeys(recipients))

        if status == "approved":
            icon = "check-circle"
            message = f"Your review of {book} was {status}"
        elif status == "rejected":
            icon = "x-circle"
            message = f"Your review of {book} was rejected. Tap to see feedback."
        elif status == "new_review":
            icon = "book"
            message = f"{sender} submitted a new review of {book}"
        elif status == "book_of_the_week":
            icon = "sparkle"
            message = f"Check out {book}, the new Book of the Week!"
        else:
            icon = "info"
            message = "Untagged "
      
        new_notif = {
            "type": "review_status" if (status=="approved" or status=="rejected") else status,
            "icon": icon,
            "message": message,
            "createdAt": int(time.time() * 1000),
        }

        for uid in recipients:
            try:
                user_ref = db.collection("users").document(uid)
                snap = user_ref.get()

                if not snap.exists:
                    print(f"Recipient uid does not exist in Firestore.")
                    continue

                data = snap.to_dict() or {}

                notif_array = data.get("notifications", [])
                if not isinstance(notif_array, list):
                    notif_array = []

                notif_array.insert(0, new_notif)
                notif_array = notif_array[:8]
                
                user_ref.update({"notifications": notif_array})

            except Exception as inner_e:
                print(f"Error updating notifications for user")

        return {"ok": True, "sent_to": recipients}, 200

    except Exception as e:
        print("notify_reviewer error")
        return {"error": str(e)}, 500


def is_user_admin(email):
    """Check if user email is in admin list"""
    admin_emails = get_admin_emails()
    return email in admin_emails
    
def reviews_cache_key(args: dict):
    key_parts = {
        "status": args.get("status"),
        "grade": args.get("grade"),
        "school": args.get("school"),
        "search": args.get("search"),
        "sort_by": args.get("sort_by", "date_received"),
        "sort_order": args.get("sort_order", "desc"),
        "email_sent": args.get("email_sent"),
    }
    return "reviews:" + hashlib.md5(
        repr(sorted(key_parts.items())).encode()
    ).hexdigest()

def user_reviews_cache_key(email: str):
    return f"user_reviews:{email}"

def invalidate_review_caches(user_email: str | None = None):
    delete_cache_prefix("reviews:")
    set_cache("all_reviews", None, ttl=1)
    set_cache("review_stats", None, ttl=1)

    if user_email:
        set_cache(f"user_reviews:{user_email}", None, ttl=1)

@app.route("/get_user_role", methods=["POST"])
def get_user_role_route():
    data = request.json

    id_token = data.get("idToken") if data else None
    if not id_token:
        return jsonify({"error": "Missing ID token"}), 401

    decoded = auth.verify_id_token(id_token)

    uid = decoded["uid"]
    email = decoded.get("email")

    role = get_user_role(uid, email)

    return jsonify({"role": role}), 200

def get_user_role(uid, email=None):
    user_ref = db.collection("users").document(uid)
    doc = user_ref.get()

    if doc.exists:
        data = doc.to_dict()
        if is_user_admin(email) and data.get("role") != "admin":
            user_ref.update({"role": "admin"})
            return "admin"
        role = data.get("role", "user")
        return role

    role = "admin" if is_user_admin(email) else "user"
    user_ref.set({"email": email, "role": role})
    return role


@app.route("/verify_token", methods=["POST"])
def verify_token():
    data = request.json
    id_token = data.get("idToken")
    if not id_token:
        return jsonify({"error": "Missing ID token"}), 401

    decoded_token = verify_firebase_token(id_token)
    if not decoded_token:
        return jsonify({"error": "Invalid or expired ID token"}), 401

    uid = decoded_token["uid"]
    email = decoded_token.get("email")
    role = get_user_role(uid, email)
    return jsonify({"uid": uid, "email": email, "role": role}), 200

# =============== ADMIN MANAGEMENT ENDPOINTS ===============

@app.route("/get_admins", methods=["POST"])
def get_admins():
    """Get list of admin emails (admin only)"""
    data = request.json
    id_token = data.get("idToken")
    
    if not id_token:
        return jsonify({"error": "Missing ID token"}), 401
    
    decoded_token = verify_firebase_token(id_token)
    if not decoded_token:
        return jsonify({"error": "Invalid ID token"}), 401
    
    email = decoded_token.get("email")
    if not is_user_admin(email):
        return jsonify({"error": "Permission denied"}), 403
    
    admin_emails = get_admin_emails()
    admins = [{"id": idx, "email": email} for idx, email in enumerate(admin_emails)]
    
    return jsonify(admins), 200

@app.route("/add_admin", methods=["POST"])
def add_admin():
    """Add a new admin email (admin only)"""
    data = request.json
    id_token = data.get("idToken")
    new_email = data.get("email")
    
    if not id_token:
        return jsonify({"error": "Missing ID token"}), 401
    
    if not new_email or "@" not in new_email:
        return jsonify({"error": "Invalid email"}), 400
    
    decoded_token = verify_firebase_token(id_token)
    if not decoded_token:
        return jsonify({"error": "Invalid ID token"}), 401
    
    email = decoded_token.get("email")
    if not is_user_admin(email):
        return jsonify({"error": "Permission denied"}), 403
    
    try:
        admin_emails = get_admin_emails()
        
        if new_email in admin_emails:
            return jsonify({"error": "Email already an admin"}), 400
        
        admin_emails.append(new_email)
        db.collection("settings").document("admins").set({"emails": admin_emails})
        
        users = db.collection("users").where("email", "==", new_email).get()
        for user in users:
            db.collection("users").document(user.id).update({"role": "admin"})
        
        return jsonify({"message": "Admin added successfully"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/remove_admin", methods=["POST"])
def remove_admin():
    """Remove an admin email (admin only)"""
    data = request.json
    id_token = data.get("idToken")
    email_to_remove = data.get("email")
    
    if not id_token:
        return jsonify({"error": "Missing ID token"}), 401
    
    if not email_to_remove:
        return jsonify({"error": "Missing email"}), 400
    
    decoded_token = verify_firebase_token(id_token)
    if not decoded_token:
        return jsonify({"error": "Invalid ID token"}), 401
    
    email = decoded_token.get("email")
    if not is_user_admin(email):
        return jsonify({"error": "Permission denied"}), 403
    
    try:
        admin_emails = get_admin_emails()
        
        if email_to_remove not in admin_emails:
            return jsonify({"error": "Email is not an admin"}), 400
        
        if len(admin_emails) <= 1:
            return jsonify({"error": "Cannot remove the last admin"}), 400
        
        admin_emails.remove(email_to_remove)
        db.collection("settings").document("admins").set({"emails": admin_emails})
        
        users = db.collection("users").where("email", "==", email_to_remove).get()
        for user in users:
            db.collection("users").document(user.id).update({"role": "user"})
        
        return jsonify({"message": "Admin removed successfully"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# =============== BOOK OF THE WEEK ENDPOINTS ===============

@app.route("/get_book_of_week", methods=["GET"])
def get_book_of_week():
    """Get current book of the week"""
    try:
        book_doc = db.collection("settings").document("book_of_week").get()
        if book_doc.exists:
            return jsonify(book_doc.to_dict()), 200
        else:
            default_book = {
                "title": "No book selected",
                "author": "NA",
                "lastUpdated": datetime.now().isoformat()
            }
            return jsonify(default_book), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/update_book_of_week", methods=["POST"])
def update_book_of_week():
    """Update book of the week (admin only)"""
    data = request.json
    id_token = data.get("idToken")
    title = data.get("title")
    author = data.get("author")
    
    if not id_token:
        return jsonify({"error": "Missing ID token"}), 401
    
    if not title or not author:
        return jsonify({"error": "Missing title or author"}), 400
    
    decoded_token = verify_firebase_token(id_token)
    if not decoded_token:
        return jsonify({"error": "Invalid ID token"}), 401
    
    email = decoded_token.get("email")
    if not is_user_admin(email):
        return jsonify({"error": "Permission denied"}), 403
    
    try:
        book_data = {
            "title": title,
            "author": author,
            "lastUpdated": datetime.now().isoformat()
        }
        db.collection("settings").document("book_of_week").set(book_data)
        
        return jsonify({"message": "Book of the week updated", "book": book_data}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/add_book", methods=["POST"])
def add_book():
    data = request.json
    id_token = data.get("idToken")
    title = data.get("title")

    if not id_token:
        return jsonify({"error": "Missing ID token"}), 401

    decoded_token = verify_firebase_token(id_token)
    if not decoded_token:
        return jsonify({"error": "Invalid ID token"}), 401

    uid = decoded_token["uid"]
    email = decoded_token.get("email")
    role = get_user_role(uid, email)
    print(f"User {email} has role {role}")

    if role != "admin":
        return jsonify({"error": "Permission denied"}), 403

    if not title:
        return jsonify({"error": "Missing title"}), 400

    book = Book(title=title, added_by=uid)
    saved_book = book.save()
    
    set_cache("books", None, ttl=1)
    return jsonify({"message": "Book added", "id": saved_book.id}), 200

@app.route("/get_books", methods=["GET"])
def get_books():
    cached_books = get_cache("books")
    if cached_books:
        return jsonify(cached_books), 200

    books_query = Book.collection.fetch()

    books = []
    for b in books_query:
        books.append({
            "id": b.id,
            "title": b.title,
            "added_by": b.added_by,
        })

    set_cache("books", books, ttl=3600)
    return jsonify(books), 200


@app.route("/check_book_popularity", methods=["GET"])
def check_book_popularity():
    title = request.args.get("title", "").strip()
    threshold = request.args.get("threshold", 3, type=int)

    if not title:
        return jsonify({"error": "Missing 'title' query parameter"}), 400

    try:
        one_year_ago = datetime.now() - timedelta(days=365)

        recent_reviews = Review.collection.filter(
            "date_received", ">=", one_year_ago
        ).fetch()

        title_lower = title.lower()
        matching_reviews = [
            r for r in recent_reviews
            if r.book_title and r.book_title.lower() == title_lower
            and (r.approved or not r.date_processed)  # approved or pending, not rejected
        ]

        count = len(matching_reviews)
        is_common = count >= threshold

        return jsonify({
            "commonly_reviewed": is_common,
            "review_count": count,
            "title": title,
            "threshold": threshold,
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/get_commonly_reviewed_books", methods=["GET"])
def get_commonly_reviewed_books():
    threshold = request.args.get("threshold", 3, type=int)
    days = request.args.get("days", 365, type=int)

    cache_key = f"commonly_reviewed_books:{threshold}:{days}"
    cached = get_cache(cache_key)
    if cached:
        return jsonify(cached), 200

    try:
        cutoff = datetime.now() - timedelta(days=days)

        recent_reviews = Review.collection.filter(
            "date_received", ">=", cutoff
        ).fetch()

        book_counts: dict[str, int] = {}
        for r in recent_reviews:
            if r.book_title and (r.approved or not r.date_processed):  # approved or pending, not rejected
                key = r.book_title.strip().lower()
                book_counts[key] = book_counts.get(key, 0) + 1

        commonly_reviewed = [
            {"title": title.title(), "review_count": count}
            for title, count in book_counts.items()
            if count >= threshold
        ]

        commonly_reviewed.sort(key=lambda x: x["review_count"], reverse=True)

        payload = {
            "books": commonly_reviewed,
            "threshold": threshold,
            "days": days,
            "total": len(commonly_reviewed),
        }

        set_cache(cache_key, payload, ttl=300)
        return jsonify(payload), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500
    

@app.route("/get_community_rating/<book_id>", methods=["GET"])
def get_community_rating(book_id):
    try:
        book_ref = db.collection("reviews").document(book_id)
        book_doc = book_ref.get()

        if not book_doc.exists:
            return jsonify({"average_rating": None, "rating_count": 0}), 200

        data = book_doc.to_dict()
        comm_rating = data.get("commRating")

        if not comm_rating:
            return jsonify({"average_rating": None, "rating_count": 0}), 200

        return jsonify({
            "average_rating": comm_rating.get("avgRating"),
            "rating_count": comm_rating.get("total")
        }), 200

    except Exception as e:
        print(f"Error fetching community rating: {e}")
        return jsonify({"error": str(e)}), 500
    

@app.route("/get_users_community_rating/<book_id>", methods=["POST"])
def get_users_community_rating(book_id):
    try:
        data = request.get_json()
        id_token = data.get("idToken")
        decoded_token = verify_firebase_token(id_token)
        if not decoded_token:
            return jsonify({"error": "Invalid ID token"}), 401

        uid = decoded_token["uid"]

        # 1. Find user document by email (consistent with rest of codebase)
        user_ref = db.collection("users").document(uid)
        user_docs = user_ref.get()

        if not user_docs:
            return jsonify({"rating": None}), 200

        user_data = user_docs.to_dict() or {}
        general_ratings = user_data.get("generalRatings", [])

        for r in general_ratings:
            if r.get("bookId") == book_id:
                return jsonify({"rating": r.get("rating")}), 200

        return jsonify({"rating": None}), 200

    except Exception as e:
        print(f"Error fetching user community rating: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/submit_community_rating", methods=["POST"])
def submit_community_rating():
    try:
        data = request.get_json()
        id_token = data.get("idToken")
        book_id = data.get("book_id")
        rating = data.get("rating")

        if not id_token:
            return jsonify({"error": "Missing ID token"}), 401

        decoded_token = verify_firebase_token(id_token)
        if not decoded_token:
            return jsonify({"error": "Invalid ID token"}), 401

        uid = decoded_token["uid"]

        # 1. Find user document by email (consistent with rest of codebase)
        user_ref = db.collection("users").document(uid)
        user_doc = user_ref.get()

        if not user_doc:
            return jsonify({"error": "User not found"}), 404

        user_data = user_doc.to_dict() or {}
        general_ratings = user_data.get("generalRatings", [])

        # Sanitize any legacy nested arrays
        general_ratings = [r for r in general_ratings if isinstance(r, dict)]

        # Update if already rated, otherwise append
        existing = next((r for r in general_ratings if r.get("bookId") == book_id), None)
        if existing:
            general_ratings = [r for r in general_ratings if r.get("bookId") != book_id]

        general_ratings.append({"bookId": book_id, "rating": rating})
        user_ref.update({"generalRatings": general_ratings})

        book_ref = db.collection("reviews").document(book_id)
        book_doc = book_ref.get()
        book_data = book_doc.to_dict() or {}
        comm_rating = book_data.get("commRating", {"avgRating": 0, "total": 0})

        old_avg = comm_rating.get("avgRating", 0)
        old_total = comm_rating.get("total", 0)

        if existing:
            old_rating = existing["rating"]
            new_avg = ((old_avg * old_total) - old_rating + rating) / old_total
            new_total = old_total
        else:
            new_total = old_total + 1
            new_avg = ((old_avg * old_total) + rating) / new_total

        book_ref.update({"commRating": {"avgRating": round(new_avg, 2), "total": new_total}})

        rating_doc_id = f"{uid}_{book_id}"
        rating_ref = db.collection("ratings").document(rating_doc_id)

        rating_payload = {
            "bookId": book_id,
            "title": book_data.get("book_title", ""),
            "author": book_data.get("author", ""),
            "userEmail": user_data.get("email", ""),
            "rating": rating
        }

        # set() works for both new and existing docs
        rating_ref.set(rating_payload)

        return jsonify({"new_average": round(new_avg, 2), "total": new_total}), 200

    except Exception as e:
        print(f"Error submitting community rating: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/ask_question", methods=["POST"])
def ask_question():
    data = request.json
    question = data.get("question")
    if not question:
        return jsonify({"error": "Missing 'question' field"}), 400

    cache_key = make_prompt_key(question)
    cached_response = get_cache(cache_key)
    if cached_response:
        return jsonify({"response": cached_response}), 200

    try:
        response = asyncio.run(chat(question))
        set_cache(cache_key, response, ttl=3600)
        return jsonify({"response": response}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

def get_daily_review_count(email):
    """Count how many reviews a user has submitted today"""
    try:
        # Get start of today (midnight) in local timezone
        today_start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
        
        # Query reviews from today
        reviews = Review.collection.filter('email', '==', email).fetch()
        
        # Count reviews submitted today
        count = 0
        for review in reviews:
            if review.date_received and review.date_received >= today_start:
                count += 1
        
        return count
    except Exception as e:
        print(f"Error counting daily reviews")
        return 0

@app.route("/submit_review", methods=["POST"])
def submit_review():
    data = request.json
    id_token = data.get("idToken")
    
    if not id_token:
        return jsonify({"error": "Missing ID token"}), 401
    
    decoded_token = verify_firebase_token(id_token)
    if not decoded_token:
        return jsonify({"error": "Invalid ID token"}), 401
    
    required = ["first_name", "last_name", "email", "book_title", "school",
                "author", "rating", "review", "grade", "recommended_audience_grade"]
    for field in required:
        if not data.get(field):
            return jsonify({"error": f"Missing required field: {field}"}), 400
    
    # Check daily review limit
    user_email = data.get("email")
    daily_count = get_daily_review_count(user_email)
    
    if daily_count >= 2:
        return jsonify({
            "error": "Daily limit reached",
            "message": "You can only submit 2 reviews per day. Please try again tomorrow."
        }), 429  # 429 Too Many Requests
    
    if "recommended_audience_grade" in data:
        if not isinstance(data["recommended_audience_grade"], list):
            data["recommended_audience_grade"] = [data["recommended_audience_grade"]]

    entry_id = f"{int(datetime.now().timestamp())}_{hashlib.md5(data['email'].encode()).hexdigest()[:8]}"
    data['entry_id'] = entry_id
    
    try:
        review = create_review(data)
        invalidate_review_caches(user_email=review.email)
        
        remaining = 2 - (daily_count + 1)
        review_text = data.get("review", "")
        if profanity.contains_profanity(review_text):
            return jsonify({"error": "Review contains inappropriate language."}), 400

        return jsonify({
            "message": "Review submitted successfully",
            "id": review.id,
            "entry_id": entry_id,
            "daily_reviews_submitted": daily_count + 1,
            "daily_reviews_remaining": remaining
        }), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/bulk_import_reviews", methods=["POST"])
def bulk_import_reviews():
    data = request.json
    id_token = data.get("idToken")
    reviews_data = data.get("reviews", [])
    
    if not id_token:
        return jsonify({"error": "Missing ID token"}), 401
    
    decoded_token = verify_firebase_token(id_token)
    if not decoded_token:
        return jsonify({"error": "Invalid ID token"}), 401
    
    uid = decoded_token["uid"]
    email = decoded_token.get("email")
    role = get_user_role(uid, email)
    
    if role != "admin":
        return jsonify({"error": "Permission denied - Admin access required"}), 403
    
    if not reviews_data:
        return jsonify({"error": "No reviews provided"}), 400
    
    successful_imports = []
    failed_imports = []
    
    for idx, review_data in enumerate(reviews_data):
        try:
            if 'date_received' in review_data:
                review_data['date_received'] = datetime.fromisoformat(review_data['date_received'])
            else:
                review_data['date_received'] = datetime.now()
            
            if 'date_processed' in review_data and review_data['date_processed']:
                review_data['date_processed'] = datetime.fromisoformat(review_data['date_processed'])
            
            if 'anonymous' in review_data:
                if isinstance(review_data['anonymous'], bool):
                    review_data['anonymous'] = 'yes' if review_data['anonymous'] else 'first name only'
            
            if 'entry_id' not in review_data or not review_data['entry_id']:
                email_hash = hashlib.md5(review_data.get('email', 'unknown').encode()).hexdigest()[:8]
                review_data['entry_id'] = f"{int(review_data['date_received'].timestamp())}_{email_hash}"
            
            review_data.setdefault('approved', True)
            review_data.setdefault('added_to_reviewed_book_list', False)
            review_data.setdefault('on_volgistics', False)
            review_data.setdefault('label_created', False)
            review_data.setdefault('label_applied', False)
            review_data.setdefault('sent_confirmation_email', False)
            
            review = Review()
            for key, value in review_data.items():
                if hasattr(review, key) and value is not None:
                    setattr(review, key, value)
            
            saved_review = review.save()
            
            if review_data.get('email') and review_data.get('approved'):
                calculate_user_hours(review_data['email'])
            
            successful_imports.append({
                "index": idx,
                "id": saved_review.id,
                "entry_id": review_data['entry_id'],
                "book_title": review_data.get('book_title', 'N/A')
            })
            
        except Exception as e:
            failed_imports.append({
                "index": idx,
                "error": str(e),
                "data": review_data
            })
    
    invalidate_review_caches()
    
    return jsonify({
        "message": f"Imported {len(successful_imports)} reviews successfully",
        "successful": successful_imports,
        "failed": failed_imports,
        "total_attempted": len(reviews_data)
    }), 201 if not failed_imports else 207

@app.route("/get_reviews", methods=["GET"])
def get_reviews():
    cache_key = reviews_cache_key(request.args)
    cached = get_cache(cache_key)
    if cached:
        return jsonify(cached), 200
    
    status = request.args.get("status")
    grade = request.args.get("grade", type=int)
    school = request.args.get("school")
    search = request.args.get("search")
    sort_by = request.args.get("sort_by", "date_received")
    sort_order = request.args.get("sort_order", "desc")
    email_sent_filter = request.args.get("email_sent")
    
    query = Review.collection
    
    if status == "approved":
        query = query.filter('approved', '==', True)
    elif status == "pending":
        query = query.filter('approved', '==', False).filter('date_processed', '==', None)
    elif status == "rejected":
        query = query.filter('approved', '==', False)
    
    if grade is not None:
        query = query.filter('grade', '==', grade)
    
    if school:
        query = query.filter('school', '==', school)
    
    reviews = list(query.fetch())
    
    results = []
    for r in reviews:
        # Apply email sent filter
        if email_sent_filter:
            if email_sent_filter == "sent" and not r.sent_confirmation_email:
                continue
            elif email_sent_filter == "not_sent" and r.sent_confirmation_email:
                continue
        
        review_dict = {
            "id": r.id,
            "entry_id": r.entry_id,
            "date_received": r.date_received.isoformat() if r.date_received else None,
            "date_processed": r.date_processed.isoformat() if r.date_processed else None,
            "first_name": r.first_name,
            "last_name": r.last_name,
            "grade": r.grade,
            "school": r.school,
            "email": r.email,
            "phone_number": r.phone_number,
            "book_title": r.book_title,
            "author": r.author,
            "recommended_audience_grade": r.recommended_audience_grade or [],
            "rating": r.rating,
            "review": r.review,
            "anonymous": r.anonymous,
            "approved": r.approved,
            "added_to_reviewed_book_list": r.added_to_reviewed_book_list,
            "on_volgistics": r.on_volgistics,
            "call_number": r.call_number,
            "qr_code": r.qr_code,
            "label_created": r.label_created,
            "label_applied": r.label_applied,
            "sent_confirmation_email": r.sent_confirmation_email,
            "form_url": r.form_url,
            "notes_to_admin": r.notes_to_admin,
            "comment_to_user": r.comment_to_user,
        }
        
        if search:
            search_lower = search.lower()
            if (search_lower in r.book_title.lower() or 
                search_lower in r.author.lower() or
                search_lower in f"{r.first_name} {r.last_name}".lower()):
                results.append(review_dict)
        else:
            results.append(review_dict)
    
    reverse = sort_order == "desc"
    if sort_by == "date_received":
        results.sort(key=lambda x: x.get("date_received") or "", reverse=reverse)
    elif sort_by == "rating":
        results.sort(key=lambda x: x.get("rating") or 0, reverse=reverse)
    elif sort_by == "book_title":
        results.sort(key=lambda x: x.get("book_title") or "", reverse=reverse)
    
    set_cache(cache_key, results, ttl=300)
    
    return jsonify(results), 200

@app.route("/update_user_review/<review_id>", methods=["PUT"])
def update_user_review(review_id):
    data = request.json
    id_token = data.get("idToken")

    if not id_token:
        return jsonify({"error": "Missing ID token"}), 401

    decoded = verify_firebase_token(id_token)
    if not decoded:
        return jsonify({"error": "Invalid ID token"}), 401

    email = decoded.get("email")

    try:
        review_ref = db.collection("reviews").document(review_id)
        review_doc = review_ref.get()

        if not review_doc.exists:
            return jsonify({"error": "Review not found"}), 404

        review = review_doc.to_dict()

        if review.get("email") != email:
            return jsonify({"error": "Not authorized"}), 403

        if review.get("approved") or review.get("date_processed"):
            return jsonify({"error": "Review can no longer be edited"}), 400

        editable_fields = [
            "book_title",
            "author",
            "review",
            "rating",
            "grade",
            "school",
            "phone_number",
            "recommended_audience_grade",
            "anonymous",
            "first_name",
            "last_name",
        ]

        updates = {}
        for field in editable_fields:
            if field in data:
                updates[field] = data[field]

        review_ref.update(updates)

        invalidate_review_caches(user_email=email)

        return jsonify({"message": "Review updated"}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/update_review/<review_id>", methods=["PUT"])
def update_review(review_id):
    """Update review details (admin only) - generates email draft for status changes"""
    data = request.json
    id_token = data.get("idToken")

    if not id_token:
        return jsonify({"error": "Missing ID token"}), 401

    decoded = verify_firebase_token(id_token)
    if not decoded:
        return jsonify({"error": "Invalid ID token"}), 401

    role = get_user_role(decoded["uid"], decoded.get("email"))
    if role != "admin":
        return jsonify({"error": "Permission denied"}), 403

    try:
        review_ref = db.collection("reviews").document(review_id)
        review_doc = review_ref.get()

        if not review_doc.exists:
            return jsonify({"error": "Review not found"}), 404

        review = review_doc.to_dict()
        old_date_processed = review.get("date_processed")

        allowed_fields = [
            "approved",
            "comment_to_user",
            "rejection_reason_key",
            "notes_to_admin",
            "added_to_reviewed_book_list",
            "call_number",
            "qr_code",
            "label_created",
            "label_applied",
            "sent_confirmation_email",
            "on_volgistics",
            "recommended_audience_grade",
        ]

        updates = {}
        for field in allowed_fields:
            if field in data:
                updates[field] = data[field]

        status_changed = False
        email_draft = None

        final_comment = updates.get("comment_to_user", review.get("comment_to_user"))

        updates["date_processed"] = datetime.now()
        new_status = "approved" if data.get("approved") else "rejected"

        if not old_date_processed:
            status_changed = True

        if not data["approved"]:
            reason_key = updates.get("rejection_reason_key")

            template_text = REJECTION_REASON_TEMPLATES.get(reason_key)

            if template_text:
                if final_comment:
                    final_comment = f"{template_text}\n\nAdditional notes:\n{final_comment}"
                else:
                    final_comment = template_text

        email_draft = generate_email_draft(
            recipient_email=review["email"],
            recipient_name=f"{review['first_name']} {review['last_name']}",
            book_title=review["book_title"],
            author=review["author"],
            status=new_status,
            comment=updates.get("comment_to_user"),
            rejection_reason_key=updates.get("rejection_reason_key")
        )

        review_ref.update(updates)
        invalidate_review_caches(user_email=review.get("email"))

        return jsonify({
            "message": "Review updated successfully",
            "status_changed": status_changed,
            "email_draft": email_draft
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/get_user_hours_by_email", methods=["POST"])
def get_user_hours_by_email():
    data = request.get_json(silent=True) or {}
    email = data.get("email")

    if not email:
        return jsonify({"error": "Missing email"}), 400

    try:
        reviews = Review.collection.filter('email', '==', email).fetch()

        total_hours = sum(0.5 for r in reviews if r.approved)

        return jsonify({
            "email": email,
            "total_hours": total_hours
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/get_email_draft/<review_id>", methods=["POST"])
def get_email_draft_endpoint(review_id):
    """Generate email draft for a review (admin only)"""
    data = request.json
    id_token = data.get("idToken")

    if not id_token:
        return jsonify({"error": "Missing ID token"}), 401

    decoded = verify_firebase_token(id_token)
    if not decoded:
        return jsonify({"error": "Invalid ID token"}), 401

    role = get_user_role(decoded["uid"], decoded.get("email"))
    if role != "admin":
        return jsonify({"error": "Permission denied"}), 403

    try:
        review_doc = db.collection("reviews").document(review_id).get()

        if not review_doc.exists:
            return jsonify({"error": "Review not found"}), 404

        review = review_doc.to_dict()

        if not review.get("date_processed"):
            return jsonify({"error": "Cannot generate email for pending review"}), 400

        status = "approved" if review.get("approved") else "rejected"

        comment = review.get("comment_to_user")

        if status == "rejected":
            reason_key = review.get("rejection_reason_key")
            template_text = REJECTION_REASON_TEMPLATES.get(reason_key)

            if template_text:
                if comment:
                    comment = f"{template_text}\n\nAdditional notes:\n{comment}"
                else:
                    comment = template_text

        email_draft = generate_email_draft(
            recipient_email=review["email"],
            recipient_name=f"{review['first_name']} {review['last_name']}",
            book_title=review["book_title"],
            author=review["author"],
            status=status,
            comment=review.get("comment_to_user"),
            rejection_reason_key=review.get("rejection_reason_key")
        )

        return jsonify({"email_draft": email_draft}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/mark_email_sent/<review_id>", methods=["POST"])
def mark_email_sent(review_id):
    """Mark email as sent for a review (admin only)"""
    data = request.json
    id_token = data.get("idToken")

    if not id_token:
        return jsonify({"error": "Missing ID token"}), 401

    decoded = verify_firebase_token(id_token)
    if not decoded:
        return jsonify({"error": "Invalid ID token"}), 401

    role = get_user_role(decoded["uid"], decoded.get("email"))
    if role != "admin":
        return jsonify({"error": "Permission denied"}), 403

    try:
        review_ref = db.collection("reviews").document(review_id)
        review_doc = review_ref.get()

        if not review_doc.exists:
            return jsonify({"error": "Review not found"}), 404

        review = review_doc.to_dict()

        review_ref.update({
            "sent_confirmation_email": True
        })

        invalidate_review_caches(user_email=review.get("email"))

        return jsonify({"message": "Email marked as sent"}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500
@app.route("/delete_user_review/<review_id>", methods=["DELETE"])
def delete_user_review(review_id):
    data = request.json
    id_token = data.get("idToken")
    r_id = data.get("id")

    if not id_token:
        return jsonify({"error": "Missing ID token"}), 401

    decoded = verify_firebase_token(id_token)
    if not decoded:
        return jsonify({"error": "Invalid ID token"}), 401

    email = decoded.get("email")

    try:
        review_ref = db.collection("reviews").document(review_id)
        review_doc = review_ref.get()

        if not review_doc.exists:
            return jsonify({"error": "Review not found"}), 404

        review = review_doc.to_dict()

        if review.get("email") != email:
            return jsonify({"error": "Not authorized"}), 403

        if review.get("approved") or review.get("date_processed"):
            return jsonify({"error": "Only pending reviews can be deleted"}), 400

        review_ref.delete()
        invalidate_review_caches(user_email=review.get("email"))

        return jsonify({"message": "Review deleted successfully"}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500
@app.route("/get_user_reviews", methods=["POST"])
def get_user_reviews():
    data = request.json
    id_token = data.get("idToken")
    
    if not id_token:
        return jsonify({"error": "Missing ID token"}), 401
    
    decoded_token = verify_firebase_token(id_token)
    if not decoded_token:
        return jsonify({"error": "Invalid ID token"}), 401
    
    email = decoded_token.get("email")

    cache_key = user_reviews_cache_key(email)
    cached = get_cache(cache_key)
    # if cached:
    #     return jsonify(cached), 200
    
    try:
        reviews = Review.collection.filter('email', '==', email).fetch()
        
        results = []
        for r in reviews:
            results.append({
                "id": r.id,
                "book_title": r.book_title,
                "author": r.author,
                "first_name": r.first_name,
                "last_name": r.last_name,
                "review": r.review,
                "rating": r.rating,
                "grade": r.grade,
                "school": r.school,
                "phone_number": r.phone_number,
                "recommended_audience_grade": r.recommended_audience_grade or [],
                "anonymous": r.anonymous,
                "status": "Approved" if r.approved else ("Rejected" if r.date_processed else "Pending"),
                "date_processed": r.date_processed.isoformat() if r.date_processed else None,
                "date_received": r.date_received.isoformat() if r.date_received else None,
                "comment_to_user": r.comment_to_user,
            })
        
        total_hours = sum(0.5 for r in results)

        payload = {
            "reviews": results,
            "total_hours": sum(0.5 for r in results),
        }

        set_cache(cache_key, payload, ttl=300)
        return jsonify(payload), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500
    
@app.route("/update_certificate", methods=["POST"])
def update_certificate():
    data = request.get_json(silent=True) or {}
    id_token = data.get("idToken")

    if not id_token:
        return jsonify({"error": "Missing ID token"}), 401

    decoded = verify_firebase_token(id_token)
    if not decoded:
        return jsonify({"error": "Invalid ID token"}), 401

    uid = decoded["uid"]
    email = decoded.get("email")

    try:
        user_ref = db.collection("users").document(uid)
        user_snap = user_ref.get()

        if not user_snap.exists:
            return jsonify({"error": "User not found"}), 404

        user_data = user_snap.to_dict() or {}
        past_certificates = user_data.get("past_certificates", [])

        # Determine cutoff from the most recent certificate
        last_cert_date = None
        if past_certificates:
            sorted_certs = sorted(past_certificates, key=lambda c: c.get("timestamp", 0))
            last_cert_raw = sorted_certs[-1].get("date")

            if last_cert_raw is not None:
                last_cert_date= last_cert_raw

        # Fetch all approved reviews for this user
        all_reviews_ref = Review.collection.filter('email', '==', email).fetch()

        eligible_review_ids = []
        for r in all_reviews_ref:

            if not r.approved:
                continue

            dp = r.date_processed
            if dp is None:
                continue


            if last_cert_date is not None and dp <= last_cert_date:
                continue

            eligible_review_ids.append(r.id)

        if not eligible_review_ids:
            return

        now_ts = datetime.now().timestamp()
        now_str = datetime.now()

        new_certificate = {
            "date": now_str,        # human-readable, kept for display
            "timestamp": now_ts,    # numeric, used for comparisons
            "reviews": eligible_review_ids,
        }

        past_certificates.append(new_certificate)
        user_ref.update({"past_certificates": past_certificates})

        return jsonify({
            "message": "Certificate updated successfully",
            "certificate": new_certificate,
        }), 200

    except Exception as e:
        print("update_certificate error:")
        return jsonify({"error": str(e)}), 500
    

@app.route("/get_uid_by_email", methods=["POST"])
def get_uid_by_email():
    data = request.get_json(silent=True) or {}
    email = data.get("email")

    if not email:
        return jsonify({"error": "Missing email"}), 400

    try:
        qs = db.collection("users").where("email", "==", email).limit(1).stream()
        docs = list(qs)

        if not docs:
            return jsonify({"error": f"User not found for email: {email}"}), 404

        return jsonify({"uid": docs[0].id}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/get_review_stats", methods=["GET"])
def get_review_stats():
    cache_key = "review_stats"
    cached = get_cache(cache_key)
    if cached:
        return jsonify(cached), 200
    
    try:
        all_reviews = list(Review.collection.fetch())
        
        stats = {
            "total_reviews": len(all_reviews),
            "approved_reviews": len([r for r in all_reviews if r.approved]),
            "pending_reviews": len([r for r in all_reviews if not r.approved and not r.date_processed]),
            "rejected_reviews": len([r for r in all_reviews if not r.approved and r.date_processed]),
            "total_volunteer_hours": sum(0.5 for r in all_reviews if r.approved),
            "unique_reviewers": len(set(r.email for r in all_reviews)),
            "books_reviewed": len(set(r.book_title for r in all_reviews)),
            "average_rating": sum(r.rating for r in all_reviews) / len(all_reviews) if all_reviews else 0,
            "emails_not_sent": len([r for r in all_reviews if r.date_processed and not r.sent_confirmation_email]),
        }
        
        set_cache(cache_key, stats, ttl=300)
        
        return jsonify(stats), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/get_recommendations", methods=["POST"])
def get_recommendations():
    try:
        data = request.json
        id_token = data.get("idToken")
        
        if not id_token or not verify_firebase_token(id_token):
            return jsonify({"error": "Unauthorized"}), 401

        decoded = auth.verify_id_token(id_token)
        uid = decoded["uid"]
        email = decoded.get("email")
        print(email)

        user_doc = db.collection("users").document(uid).get().to_dict() or {}
        user_grade = user_doc.get("grade", 8) 
        user_genres = user_doc.get("favoriteGenres", ["fantasy", "adventure"])
        print(user_grade) 
        print(user_genres)

        past_reviews_query = Review.collection.filter('email', '==', email).fetch()
        
        user_reviews = []

        for r in past_reviews_query:
            if not r.book_title or r.rating is None:
                continue
            book_id = make_book_id(r.book_title, r.author)

            if book_id in books_data:
                user_reviews.append({
                    "book_id": book_id,
                    "rating": float(r.rating),
                    "source": "review"
                })

        ratings_query = db.collection("ratings").where("userEmail", "==", email).stream()

        for doc in ratings_query:
            r = doc.to_dict()

            book_id = (r.get("title") or "").lower().strip()
            rating = r.get("rating")

            if not book_id or rating is None:
                continue

            if book_id in books_data:
                user_reviews.append({
                    "book_id": book_id,
                    "rating": float(rating),
                    "source": "rating"
                })
        
        deduped = {}
        for r in user_reviews:
            bid = r["book_id"]

            if bid not in deduped:
                deduped[bid] = r
            else:
                if r["source"] == "review":
                    deduped[bid] = r

        user_reviews = list(deduped.values())
        
        user_profile = recommender.build_user_profile(user_reviews)


        if user_profile is None:
            recommendations = recommender.cold_start_recommend(
                user_genres=user_genres,
                user_grade=float(user_grade),
                top_k=10
            )
        else:
            recommendations = context_recommender.recommend(
                user_profile=user_profile,
                user_reviews=user_reviews,
                user_genres=user_genres,
                user_grade=user_grade,
                top_k=10
            )

        recommendations = sorted(recommendations, key=lambda x: x[1], reverse=True)

        output = []
        for book_id, score in recommendations:
            book_info = books_data.get(book_id, {})
            print(book_info)
            model_reviews = book_info.get("reviews", [])

            ratings = [
                float(r["stars"])
                for r in model_reviews
                if r.get("stars") is not None
            ]

            title = book_info.get("title", "").strip().lower()

            firestore_reviews = Review.collection.filter(
                'approved', '==', True
            ).fetch()

            for r in firestore_reviews:
                if r.book_title and r.book_title.strip().lower() == title:
                    if r.rating is not None:
                        ratings.append(float(r.rating))

            avg_rating = round(sum(ratings) / len(ratings), 2) if ratings else 0

            output.append({
                "book_id": book_id,
                "title": book_info.get("title", "Unknown"),
                "author": book_info.get("author", "Unknown"),
                "score": score,
                "avg_rating": avg_rating
            })

        return jsonify({"recommendations": output}), 200

    except Exception as e:
        print("rec error trace:")
        print(traceback.format_exc())
        return jsonify({"error": str(e)}), 500


@app.route("/clear_cache", methods=["POST"])
def clear_cache():
    """Clear all review caches"""
    invalidate_review_caches()
    return jsonify({"message": "Cache cleared"}), 200

@app.route('/ping')
def ping():
    try:
        return jsonify({
            "status": "OK",
            "message": "Ping received",
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500



if __name__ == "__main__":
    app.run(debug=True, port=5001, use_reloader=False)
