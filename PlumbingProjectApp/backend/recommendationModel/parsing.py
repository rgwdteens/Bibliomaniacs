import pandas as pd
import re
from collections import defaultdict
# from sentiment import ReviewSentimentAnalyzer
from recommendationModel.sentiment import ReviewSentimentAnalyzer

analyzer = ReviewSentimentAnalyzer()

def normalize_text(text: str) -> str:
    text = text.lower()
    text = re.sub(r"[^\w\s]", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()

def tokenize_genres(raw_genre):
    if pd.isna(raw_genre):
        return []

    raw = normalize_text(raw_genre)
    parts = re.split(r"[,/&]", raw)

    tokens = set()
    for part in parts:
        for token in part.split():
            if len(token) > 2:
                tokens.add(token)

    return sorted(tokens)

def make_book_id(title, author):
    return normalize_text(f"{title}::{author}")

def load_books(csv_path):
    df = pd.read_csv(csv_path)
    df = df[["AUTHOR", "TITLE", "GENRE"]].dropna()
    books = {}  
    for _, row in df.iterrows():
        book_id = make_book_id(row["TITLE"], row["AUTHOR"])
        genres = tokenize_genres(row["GENRE"])

        if not genres:
            genres = fetch_wikipedia_genres(row["TITLE"], row["AUTHOR"])

        books[book_id] = {
            "title": row["TITLE"].strip(),
            "author": row["AUTHOR"].strip(),
            "genres": genres,
            "reviews": []
        }

    return books

def load_reviews(csv_path, books):
    df = pd.read_csv(csv_path)

    df = df.rename(columns={
        "Title of book": "TITLE",
        "Author of book": "AUTHOR",
        "Grade": "GRADE",
        "What grade level would you recommend this book to?": "RECOMMENDED_GRADES",
        "How many stars would you give this book?": "STARS",
        "Submit your review below (200-400 word count)": "REVIEW"
    })

    df = df.dropna(subset=["TITLE", "AUTHOR", "REVIEW"])

    for _, row in df.iterrows():
        book_id = make_book_id(row["TITLE"], row["AUTHOR"])

        if book_id not in books:
            for existing_id in books:
                if normalize_text(row["TITLE"]) in existing_id:
                    book_id = existing_id
                    break
            else:
                continue
        
        sentiment = analyzer.score(row["REVIEW"])

        books[book_id]["reviews"].append({
            "stars": int(row["STARS"]) if not pd.isna(row["STARS"]) else None,
            "grade": int(row["GRADE"]) if not pd.isna(row["GRADE"]) else None,
            "recommended_grades": (
                [int(g.strip()) for g in str(row["RECOMMENDED_GRADES"]).split(",") if g.strip().isdigit()]
                if not pd.isna(row["RECOMMENDED_GRADES"])
                else []
            ),
            "text": normalize_text(row["REVIEW"]),
            "sentiment": sentiment
        })

    return books
# def search_books(reviews_dict, query):
#     query_norm = normalize_for_search(query)
#     results = {}

#     for title, data in reviews_dict.items():
#         title_norm = normalize_for_search(title)

#         if query_norm in title_norm:
#             results[title] = data

#     return results

# books = books_csv_to_dict("reviewedBooks.csv")
# reviews = reviews_csv_to_dict("bigReviews.csv")
# book = search_books(reviews, "My Hero Academia")

# for title, data in book.items():
#     print(f"\n{title} by {data['author']}")
#     print("Reviews:", len(data["reviews"]))
#     for i, r in enumerate(data["reviews"], 1):
#         print(f"\nReview {i}")
#         print("Stars:", r["stars"])
#         print("Recommended grades:", r["recommended_grades"])
#         print(r["review_text"][:300], "...")