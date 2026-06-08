# some things i realized
# scraping availability into core preference model is probably not the best idea and it should be more of a contextual, dynamic re-ranking layer on top of recommendations
# basically not a preference signal, but a context constraint
# architecturally:
# rec model -> candidate list -> availability re-ranker -> final output




#HybridRecommender (preferences)
#        ↓
#candidate pool (ranked by relevance)
#        ↓
#ContextAwareRecommender
#        ↓
#Availability filtering + re-ranking
#        ↓
#final recommendations
#availability is not influencing scores, only which items survive to the top

import redis
import json
from typing import List, Tuple
from housedBooks.availability import avail
import time

class AvailabilityCache:
    def __init__(self, redis_host="redis://red-d6keeht6ubrc73edn16g", redis_port=6379):
        self.redis = redis.Redis(host=redis_host, port=redis_port, decode_responses=True)

    def _key(self, title: str) -> str:
        return f"availability:{title.lower()}"

    def get(self, title: str):
        value = self.redis.get(self._key(title))
        if value is None:
            return None
        
        data = json.loads(value)
        return data

    def set(self, title: str, available: bool):
        data = {
            "available": available,
            "timestamp": time.time()
        }
        self.redis.set(self._key(title), json.dumps(data))

    def is_stale(self, title: str, max_age_hours=24):
        data = self.get(title)
        if data is None:
            return True
        
        age = time.time() - data["timestamp"]
        return age > max_age_hours * 3600

class AvailabilityService:
    def __init__(self, cache: AvailabilityCache):
        self.cache = cache

    def check(self, title: str):
        data = self.cache.get(title)

        if data is None:
            return None  # unknown

        return data["available"]

    def check_bulk(self, titles):
        results = {}

        for title in titles:
            data = self.cache.get(title)

            if data is None:
                results[title] = None
                continue

            if isinstance(data, dict):
                results[title] = data.get("available")

            elif isinstance(data, int):
                results[title] = bool(data)

            elif isinstance(data, str):
                if data in ["1", "true", "True"]:
                    results[title] = True
                elif data in ["0", "false", "False"]:
                    results[title] = False
                else:
                    results[title] = None

            else:
                results[title] = None

        return results

class ContextAwareRecommender:
    def __init__(self, base_recommender, books, availability_service, initial_pool=50, expansion_step=50, max_pool=300):
        self.base = base_recommender
        self.books = books
        self.availability_service = availability_service

        self.initial_pool = initial_pool
        self.expansion_step = expansion_step
        self.max_pool = max_pool

    def _get_candidates(self, user_profile, user_reviews, user_genres, user_grade, pool_size):
        if user_profile is None:
            return self.base.cold_start_recommend(
                user_genres=user_genres,
                user_grade=user_grade,
                top_k=pool_size
            )
        else:
            return self.base.recommend(
                user_profile=user_profile,
                user_reviews=user_reviews,
                user_genres=user_genres,
                user_grade=user_grade,
                top_k=pool_size
            )

    def recommend(self, user_profile, user_reviews, user_genres, user_grade, top_k=10) -> List[Tuple[str, float]]:
        pool_size = self.initial_pool

        while pool_size <= self.max_pool:
            candidates = self._get_candidates(user_profile, user_reviews, user_genres, user_grade, pool_size)

            titles = [self.books[bid]["title"] for bid, _ in candidates]

            availability_map = self.availability_service.check_bulk(titles)

            adjusted = []

            for (book_id, score), title in zip(candidates, titles):
                availability = availability_map.get(title)

                if availability is True:
                    adjusted_score = score + 0.1
                elif availability is False:
                    adjusted_score = score - 0.15
                else:
                    adjusted_score = score 
                
                adjusted.append((book_id, adjusted_score))

            adjusted.sort(key=lambda x: x[1], reverse=True)
            return adjusted[:top_k]