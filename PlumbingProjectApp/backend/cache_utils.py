import os
import redis
import pickle
import base64

# Use Redis if available, otherwise fall back to in-memory
REDIS_URL = os.environ.get("REDIS_URL")

if REDIS_URL:
    redis_client = redis.from_url(REDIS_URL)
else:
    redis_client = None

def get_cache(key):
    if redis_client:
        try:
            cached = redis_client.get(key)
            if cached:
                return pickle.loads(cached)
        except Exception:
            pass
    return None

def set_cache(key, value, ttl=3600):
    if redis_client:
        try:
            redis_client.setex(key, ttl, pickle.dumps(value))
        except Exception:
            pass

def delete_cache(key):
    if redis_client:
        try:
            redis_client.delete(key)
        except Exception:
            pass