import requests
import re
import time

WIKI_SEARCH_URL = "https://en.wikipedia.org/w/api.php"
WIKI_PARSE_URL = "https://en.wikipedia.org/w/api.php"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (BookRecommender/1.0; +https://example.com)"
}

CANONICAL_GENRES = {
    "fantasy": ["fantasy", "magic", "dragon", "sword", "kingdom", "myth"],
    "sci-fi": ["science fiction", "sci-fi", "space", "future", "alien", "technology", "dystopia"],
    "romance": ["romance", "love", "relationship", "romantic"],
    "mystery": ["mystery", "detective", "crime", "murder", "investigation"],
    "thriller": ["thriller", "suspense", "psychological thriller"],
    "horror": ["horror", "ghost", "supernatural", "monster"],
    "historical-fiction": ["historical", "war", "period", "biography"],
    "young-adult": ["young adult", "ya", "teen", "coming of age"],
    "dystopian": ["dystopian", "post-apocalyptic", "totalitarian"],
    "literary-fiction": ["literary fiction", "contemporary", "realism"]
}

def safe_get_json(url, params=None):
    try:
        r = requests.get(url, params=params, headers=HEADERS, timeout=10)

        if r.status_code != 200:
            print(f"[HTTP ERROR] {r.status_code} for {url}")
            return None

        if not r.text or not r.text.strip():
            print(f"[EMPTY RESPONSE] {url}")
            return None

        return r.json()

    except Exception as e:
        print(f"[REQUEST FAILED] {url} -> {e}")
        return None

def normalize(text: str) -> str:
    if not text:
        return ""
    text = text.lower()
    text = re.sub(r"[^\w\s-]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text

def find_wiki_page(title: str):
    params = {
        "action": "query",
        "list": "search",
        "srsearch": title,
        "format": "json"
    }

    data = safe_get_json(WIKI_SEARCH_URL, params)

    if not data:
        return None

    results = data.get("query", {}).get("search", [])

    if not results:
        return None

    return results[0].get("title")

def fetch_wikitext(page_title: str):
    params = {
        "action": "parse",
        "page": page_title,
        "prop": "wikitext",
        "format": "json"
    }

    data = safe_get_json(WIKI_PARSE_URL, params)

    if not data:
        return ""

    try:
        return data["parse"]["wikitext"]["*"]
    except:
        return ""


def extract_genres(wikitext: str):
    match = re.search(r"\|\s*genre\s*=\s*(.+)", wikitext)

    if not match:
        return []

    raw = match.group(1)

    # stop at next field
    raw = raw.split("\n")[0]

    # clean wiki markup
    raw = re.sub(r"\[\[|\]\]", "", raw)
    raw = raw.replace(" and ", ",").replace("&", ",")

    parts = [p.strip() for p in raw.split(",")]

    return [p for p in parts if p]


def map_to_canonical(raw_genres):
    text = " ".join(raw_genres).lower()

    scores = {}

    for genre, keywords in CANONICAL_GENRES.items():
        score = 0

        for kw in keywords:
            if kw in text:
                score += 1

        if score > 0:
            scores[genre] = score

    if not scores:
        return ["literary-fiction"]  # safe fallback

    return sorted(scores, key=scores.get, reverse=True)[:3]


def fetch_wikipedia_genres(title: str, author: str = None):
    try:
        title_page = find_wiki_page(title)
        title_genres = []
        title_score = 0

        if title_page:
            wikitext = fetch_wikitext(title_page)
            title_genres = extract_genres(wikitext)
            title_score = len(title_genres)

        author_genres = []
        author_score = 0

        if author:
            query = f"{title} {author}"
            author_page = find_wiki_page(query)

            if author_page and normalize(title) in normalize(author_page):
                wikitext = fetch_wikitext(author_page)
                author_genres = extract_genres(wikitext)
                author_score = len(author_genres)

        raw_genres = []

        if author_score > title_score and author_genres:
            raw_genres = author_genres
        else:
            raw_genres = title_genres

        if not raw_genres:
            return ["literary-fiction"]

        return map_to_canonical(raw_genres)

    except Exception as e:
        print(f"[Wikipedia Genre Error] {title}: {e}")
        return ["literary-fiction"]

def bulk_fetch(titles, delay=0.2):
    results = {}

    for t in titles:
        results[t] = fetch_wikipedia_genres(t)
        time.sleep(delay)

    return results

if __name__ == "__main__":
    print(fetch_wikipedia_genres("Dune"))
    print(fetch_wikipedia_genres("The Hunger Games"))
    print(fetch_wikipedia_genres("Harry Potter and the Sorcerer's Stone"))
    print(fetch_wikipedia_genres("And Then There Were None"))