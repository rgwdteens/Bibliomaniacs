import redis
import hashlib
import json
import os

cache = redis.Redis(host="redis://red-d6keeht6ubrc73edn16g", port=6379, db=0)
# cache = redis.Redis(host="localhost", port=6380, db=0)

def get_cache(key):
    cached = cache.get(key)
    if cached:
        return json.loads(cached)
    return None

def set_cache(key, value, ttl=3600):
    cache.set(key, json.dumps(value), ex=ttl)

def make_prompt_key(prompt):
    return hashlib.sha256(prompt.encode()).hexdigest()

def delete_cache_prefix(prefix):
    for key in cache.scan_iter(f"{prefix}*"):
        cache.delete(key)