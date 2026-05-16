GENRE_IMAGE_MAP = {
    "horror": "https://images.unsplash.com/photo-1509565840034-3c385bbe6451",
    "fantasy": "https://images.unsplash.com/photo-1518709268805-4e9042af9f23",
    "science-fiction": "https://images.unsplash.com/photo-1446776811953-b23d57bd21aa",
    "sci-fi": "https://images.unsplash.com/photo-1446776811953-b23d57bd21aa",
    "romance": "https://images.unsplash.com/photo-1518199266791-5375a83190b7",
    "mystery": "https://images.unsplash.com/photo-1524985069026-dd778a71c7b4",
    "thriller": "https://images.unsplash.com/photo-1517971071642-34a2d3ecc9cd",
    "default": "https://images.unsplash.com/photo-1519682337058-a94d519337bc"
}

def get_genre_image(genres):
    if not genres:
        return GENRE_IMAGE_MAP["default"]

    for g in genres:
        g = g.lower()
        if g in GENRE_IMAGE_MAP:
            return GENRE_IMAGE_MAP[g]

    return GENRE_IMAGE_MAP["default"]