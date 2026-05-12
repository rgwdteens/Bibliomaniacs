import numpy as np
from sklearn.metrics.pairwise import cosine_similarity

class HybridRecommender:
    def __init__(self, book_embeddings, books):
        self.book_embeddings = book_embeddings
        self.books = books

    def build_user_profile(self, user_reviews):
        vectors = []
        weights = []

        for r in user_reviews:
            book_id = r["book_id"]
            stars = r.get("stars", 3)

            if book_id not in self.book_embeddings:
                continue

            book = self.books[book_id]

            sentiments = [
                rev.get("sentiment", 0.5)
                for rev in book["reviews"]
                if rev.get("sentiment") is not None
            ]

            avg_sentiment = np.mean(sentiments) if sentiments else 0

            sentiment_weight = avg_sentiment

            centered = (stars - 3) / 2
            final_weight = centered


            vectors.append(self.book_embeddings[book_id]["centroid"])
            weights.append(final_weight)

        if not vectors:
            return None

        vectors = np.vstack(vectors)
        weights = np.array(weights).reshape(-1, 1)

        weight_sum = np.sum(weights)
        if weight_sum == 0:
            return None

        return np.sum(vectors * weights, axis=0) / weight_sum

    def sentiment_score(self, book):
        sentiments = [
            r.get("sentiment")
            for r in book["reviews"]
            if r.get("sentiment") is not None
        ]

        if not sentiments:
            return 0.5

        avg = np.mean(sentiments)

        return avg


    def genre_score(self, user_genres, book_genres):
        if not user_genres or not book_genres:
            return 0.0
        return len(set(user_genres) & set(book_genres)) / len(set(user_genres))

    def grade_score(self, user_grade, book):
        grades = []
        for r in book["reviews"]:
            grades.extend(r["recommended_grades"])

        if not grades:
            return 0.5

        avg = sum(grades) / len(grades)
        return max(0, 1 - abs(float(user_grade) - avg) / 6)

    def adaptive_weights(self, user_profile, user_reviews):
        #return so weights sum to 1
        n_reviews = len(user_reviews)

        emb_w = min(0.5, 0.2 + 0.08 * n_reviews)

        genre_w = max(0.15, 0.4 - 0.05 * n_reviews)
        grade_w = 0.15
        sentiment_w = 1.0 - (emb_w + genre_w + grade_w)

        weights = {
            "embedding": emb_w,
            "genre": genre_w,
            "grade": grade_w,
            "sentiment": sentiment_w
        }

        s = sum(weights.values())
        for k in weights:
            weights[k] /= s

        return weights

    def semantic_similarity(self, user_profile, book_id):
        # soft max similarity
        book = self.book_embeddings[book_id]
        vecs = book["review_vectors"]

        sims = cosine_similarity(
            user_profile.reshape(1, -1),
            vecs
        )[0]

        # soft-top-k pooling
        top = np.sort(sims)[-3:]
        return float(np.mean(top))

    def recommend(self, user_profile, user_reviews, user_genres, user_grade, top_k=10):
        weights = self.adaptive_weights(user_profile, user_reviews)
        scores = []

        for book_id in self.books:
            book = self.books[book_id]

            genre = self.genre_score(user_genres, book["genres"])
            grade = self.grade_score(user_grade, book)
            sentiment = self.sentiment_score(book)

            if book_id in self.book_embeddings:
                sim = self.semantic_similarity(user_profile, book_id)
                uncertainty = self.book_embeddings[book_id]["variance"]
            else:
                sim = 0
                uncertainty = 0
            
            final = (
                weights["embedding"] * sim +
                weights["genre"] * genre +
                weights["grade"] * grade +
                weights["sentiment"] * sentiment
            )

            final *= np.exp(-0.3 * uncertainty)

            scores.append((book_id, final))

        scores = sorted(scores, key=lambda x: x[1], reverse=True)

        candidates = scores[:50]

        ids, vals = zip(*candidates)
        vals = np.array(vals)

        # temperature controls exploration
        temperature = 0.05
        probs = np.exp(vals / temperature)
        probs /= np.sum(probs)

        chosen = np.random.choice(len(ids), size=top_k, replace=False, p=probs)

        return [(ids[i], float(vals[i])) for i in chosen]
    
    def cold_start_recommend(self, user_genres, user_grade, top_k=10):
        scores = []

        for book_id, book in self.books.items():
            genre_score = self.genre_score(user_genres, book["genres"])
            grade_score = self.grade_score(user_grade, book)

            final_score = (
                0.7 * genre_score +
                0.3 * grade_score
            )

            scores.append((book_id, final_score))

        scores.sort(key=lambda x: x[1], reverse=True)
        return scores[:top_k]
