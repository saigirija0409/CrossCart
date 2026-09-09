from __future__ import annotations

import csv
import hashlib
import hmac
import json
import math
import os
import random
import re
import sqlite3
import string
import time
import uuid
import urllib.error
import urllib.request
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any, Iterable

import jwt
import networkx as nx
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from .config import PERSONAS_PATH, settings
from .db import execute, fetch_all, fetch_one


CATEGORY_TAXONOMY = [
    "Electronics",
    "Computers",
    "Audio",
    "Gaming",
    "Fashion",
    "Footwear",
    "Accessories",
    "Home & Kitchen",
    "Furniture",
    "Decor",
    "Appliances",
    "Fitness",
    "Sports",
    "Wellness",
    "Wearables",
    "Books",
    "Stationery",
    "Office Supplies",
    "Education",
    "Beauty",
    "Personal Care",
    "Groceries",
    "Kids",
]

BRAND_LIBRARY = {
    "Electronics": ["Sony", "Samsung", "Apple", "Anker", "BoAt", "ASUS", "HP", "Dell", "Realme", "Xiaomi"],
    "Computers": ["HP", "Dell", "Lenovo", "ASUS", "Acer", "MSI", "Apple"],
    "Audio": ["Sony", "JBL", "BoAt", "Sennheiser", "Anker", "Noise", "Apple"],
    "Gaming": ["ASUS", "Xbox", "PlayStation", "Razer", "MSI"],
    "Fashion": ["H&M", "Zara", "Mango", "Levis", "FabIndia", "Roadster", "HRX"],
    "Footwear": ["Nike", "Adidas", "Puma", "Bata", "Skechers"],
    "Accessories": ["Fossil", "Titan", "Casio", "Chumbak", "Mango"],
    "Home & Kitchen": ["Prestige", "Philips", "Bajaj", "Ikea", "Wonderchef"],
    "Furniture": ["Ikea", "Urban Ladder", "Home Centre", "Nilkamal"],
    "Decor": ["Chumbak", "Ikea", "Home Centre", "Peepul Tree"],
    "Appliances": ["Philips", "Bajaj", "LG", "Samsung", "Crompton"],
    "Fitness": ["Cult", "Decathlon", "Nike", "Puma", "Fitbit"],
    "Sports": ["Decathlon", "Nike", "Adidas", "Cosco"],
    "Wellness": ["The Body Shop", "Minimalist", "Mamaearth", "Nykaa", "Dot & Key", "Missha"],
    "Wearables": ["Fitbit", "Noise", "Boat", "Samsung", "Apple"],
    "Books": ["Penguin", "HarperCollins", "Macmillan", "Rupa"],
    "Stationery": ["Classmate", "Camlin", "Navneet", "Cello"],
    "Office Supplies": ["HP", "Deli", "Kores", "Classmate"],
    "Education": ["McGraw Hill", "Pearson", "Oxford", "Arihant"],
    "Beauty": ["Maybelline", "Lakme", "Nykaa", "L'Oreal", "Minimalist", "Dot & Key", "Missha"],
    "Personal Care": ["Park Avenue", "Mamaearth", "Dove", "Nivea", "The Body Shop", "L'Oreal", "Old Spice", "Garnier"],
    "Groceries": ["Aashirvaad", "Sunfeast", "Tata", "Fortune"],
    "Kids": ["FirstCry", "Chicco", "Lego", "Funskool"],
}

PLATFORMS = ["amazon", "flipkart", "myntra", "ajio", "tatacliq", "nykaa"]
DEFAULT_DEMO_EMAIL = "demo@wishlist.local"
DEFAULT_DEMO_PASSWORD = "Demo1234!"
DEFAULT_ADMIN_EMAIL = "admin@wishlist.local"
DEFAULT_ADMIN_PASSWORD = "Admin1234!"
VECTOR_SIZE = 384


PERSONAS = json.loads(PERSONAS_PATH.read_text(encoding="utf-8"))


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def iso_now() -> str:
    return utc_now().isoformat()


def new_id() -> str:
    return str(uuid.uuid4())


def normalize_text(value: str | None) -> str:
    if not value:
        return ""
    value = value.lower()
    value = re.sub(r"[\W_]+", " ", value, flags=re.UNICODE)
    return re.sub(r"\s+", " ", value).strip()


def normalize_title(value: str | None) -> str:
    return normalize_text(value)


def clean_wishlist_title(value: str | None) -> str:
    """Remove storefront UI labels that are not part of a product's title."""
    text = (value or "").replace("\xa0", " ")
    text = re.sub(r"(?:₹|rs\.?|inr|\$)\s*(?:[\d,]+|nan)\b", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"\b(?:out\s+of\s+stock|show\s+similar|move\s+to\s+bag|add\s+to\s+bag|move\s+to\s+cart|select\s+size)\s*", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"\(\s*\)", " ", text)
    return re.sub(r"\s+", " ", text).strip(" -–—()")


def wishlist_title_identity(value: str | None) -> str:
    """A stable key for merging the same saved product across storefront markup."""
    normalized = normalize_title(clean_wishlist_title(value))
    # Some legacy scraped names began with a rating such as `4.5New Balance`.
    normalized = re.sub(r"^\d+\s+\d+(?=[a-z])", "", normalized)
    return normalized.strip()


def product_price_is_verified(product: dict[str, Any]) -> bool:
    """Only show a price as current when it came from a user's storefront sync."""
    attributes = json_maybe_load(product.get("attributes"), {})
    return bool(attributes.get("user_added"))


def tokenize(value: str) -> list[str]:
    return [part for part in normalize_text(value).split(" ") if part]


def text_to_vector(text: str, size: int = VECTOR_SIZE) -> list[float]:
    buckets = [0.0] * size
    tokens = tokenize(text)
    if not tokens:
        return buckets
    for token in tokens:
        digest = hashlib.sha256(token.encode("utf-8")).hexdigest()
        idx = int(digest[:8], 16) % size
        buckets[idx] += 1.0
    norm = math.sqrt(sum(v * v for v in buckets))
    if norm == 0:
        return buckets
    return [round(v / norm, 6) for v in buckets]


def vector_from_json(raw: str | list[float] | None) -> list[float]:
    if raw is None:
        return [0.0] * VECTOR_SIZE
    if isinstance(raw, dict):
        raw = [raw[key] for key in sorted(raw)]
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except Exception:
            return [0.0] * VECTOR_SIZE
        if isinstance(raw, dict):
            raw = [raw[key] for key in sorted(raw)]
    values = [float(v) for v in raw]
    if len(values) < VECTOR_SIZE:
        values.extend([0.0] * (VECTOR_SIZE - len(values)))
    return values[:VECTOR_SIZE]


def json_maybe_load(value: Any, default: Any) -> Any:
    if value is None:
        return default
    if isinstance(value, (dict, list)):
        return value
    if isinstance(value, str):
        try:
            return json.loads(value)
        except Exception:
            return default
    return value


def vector_mean(vectors: Iterable[list[float]]) -> list[float]:
    vectors = list(vectors)
    if not vectors:
        return [0.0] * VECTOR_SIZE
    total = [0.0] * VECTOR_SIZE
    for vec in vectors:
        vec = vector_from_json(vec)
        for idx, value in enumerate(vec):
            total[idx] += value
    count = float(len(vectors))
    averaged = [value / count for value in total]
    norm = math.sqrt(sum(v * v for v in averaged))
    if norm == 0:
        return averaged
    return [round(v / norm, 6) for v in averaged]


def cosine_similarity(a: list[float] | str | None, b: list[float] | str | None) -> float:
    vec_a = vector_from_json(a)
    vec_b = vector_from_json(b)
    return round(sum(x * y for x, y in zip(vec_a, vec_b)), 6)


def jaccard_similarity(a: set[str], b: set[str]) -> float:
    if not a and not b:
        return 0.0
    union = a | b
    if not union:
        return 0.0
    return round(len(a & b) / len(union), 6)


def community_similarity(wishlist_similarity: float, behavior_similarity: float) -> float:
    return round(0.7 * wishlist_similarity + 0.3 * behavior_similarity, 6)


def adaptive_weight_score(
    wishlist_similarity: float,
    community_preference: float,
    trending_score: float,
    browsing_history_score: float,
) -> float:
    return round(
        settings.weight_wishlist_sim * wishlist_similarity
        + settings.weight_community_pref * community_preference
        + settings.weight_trending * trending_score
        + settings.weight_browsing * browsing_history_score,
        6,
    )


def hash_password(password: str, salt: str | None = None) -> str:
    salt = salt or os.urandom(16).hex()
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 120_000).hex()
    return f"{salt}${digest}"


def verify_password(password: str, stored: str) -> bool:
    try:
        salt, digest = stored.split("$", 1)
    except ValueError:
        return False
    check = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 120_000).hex()
    return hmac.compare_digest(check, digest)


def create_token(user: dict[str, Any]) -> str:
    payload = {
        "sub": user["user_id"],
        "email": user["email"],
        "role": user["role"],
        "name": user["name"],
        "iat": int(time.time()),
        "exp": int(time.time()) + 60 * 60 * 24 * 7,
    }
    return jwt.encode(payload, settings.secret_key, algorithm="HS256")


def decode_token(token: str) -> dict[str, Any]:
    return jwt.decode(token, settings.secret_key, algorithms=["HS256"])


def build_category_weights(persona_tag: str) -> dict[str, float]:
    persona = next((p for p in PERSONAS if p["tag"] == persona_tag), PERSONAS[0])
    weights = {}
    top = persona["categories"]
    base = 0.05
    for idx, category in enumerate(CATEGORY_TAXONOMY):
        if category in top[:3]:
            weights[category] = round(0.24 - idx * 0.01 if idx < 3 else 0.18, 4)
        elif category in top:
            weights[category] = 0.08
        else:
            weights[category] = base
    total = sum(weights.values()) or 1.0
    return {category: round(value / total, 6) for category, value in weights.items()}


def default_behavior_vector(persona_tag: str) -> dict[str, float]:
    return build_category_weights(persona_tag)


def category_alias_map() -> dict[str, str]:
    aliases = {
        "shampoo": "Personal Care",
        "conditioner": "Personal Care",
        "hair": "Personal Care",
        "beer shiny": "Personal Care",
        "park avenue": "Personal Care",
        "facewash": "Personal Care",
        "face wash": "Personal Care",
        "lotion": "Personal Care",
        "cream": "Personal Care",
        "soap": "Personal Care",
        "grooming": "Personal Care",
        "perfume": "Personal Care",
        "fragrance": "Personal Care",
        "serum": "Beauty",
        "beauty": "Beauty",
        "personal care": "Personal Care",
        "cosmetics": "Beauty",
        "makeup": "Beauty",
        "electronics": "Electronics",
        "mobile": "Electronics",
        "phone": "Electronics",
        "earbuds": "Audio",
        "headphone": "Audio",
        "headphones": "Audio",
        "audio": "Audio",
        "computer": "Computers",
        "laptop": "Computers",
        "gaming": "Gaming",
        "fashion": "Fashion",
        "clothing": "Fashion",
        "apparel": "Fashion",
        "footwear": "Footwear",
        "shoes": "Footwear",
        "accessories": "Accessories",
        "home": "Home & Kitchen",
        "kitchen": "Home & Kitchen",
        "furniture": "Furniture",
        "decor": "Decor",
        "appliance": "Appliances",
        "fitness": "Fitness",
        "sports": "Sports",
        "wellness": "Wellness",
        "wearable": "Wearables",
        "smartwatch": "Wearables",
        "watch": "Wearables",
        "books": "Books",
        "stationery": "Stationery",
        "office": "Office Supplies",
        "education": "Education",
        "groceries": "Groceries",
        "kids": "Kids",
    }
    return aliases


def map_category(text: str | None) -> str:
    raw = normalize_text(text)
    if not raw:
        return "General"
    aliases = category_alias_map()
    for key, value in aliases.items():
        if key in raw:
            return value
    if text in CATEGORY_TAXONOMY and text != "Electronics":
        return text

    # Smart keyword inference for uncategorized items
    if any(w in raw for w in ["shampoo", "wash", "soap", "cream", "lotion", "hair", "skin", "care", "beer", "grooming", "perfume", "serum", "deodorant", "body"]):
        return "Personal Care"
    if any(w in raw for w in ["shirt", "pant", "jean", "dress", "top", "wear", "cloth", "belt", "cap", "glass", "shoe", "tshirt", "t-shirt", "jacket", "curtis", "saree", "heel", "sneaker", "boot", "trouser", "kurta"]):
        return "Fashion"
    if any(w in raw for w in ["book", "guide", "paperback", "hardcover", "novel", "edition"]):
        return "Books"
    if any(w in raw for w in ["phone", "laptop", "cable", "tech", "audio", "charge", "usb", "gadget", "screen", "earbud", "headphone", "monitor", "keyboard", "mouse"]):
        return "Electronics"

    return "Fashion" if any(w in raw for w in ["men", "women", "kids", "fit", "style", "cotton"]) else "General"


def brand_from_text(text: str | None, category: str | None = None) -> str | None:
    raw = normalize_text(text)
    candidates = BRAND_LIBRARY.get(category or "", [])
    for brand in candidates:
        if normalize_text(brand) in raw:
            return brand
    for brand_list in BRAND_LIBRARY.values():
        for brand in brand_list:
            if normalize_text(brand) in raw:
                return brand
    return None


def sample_product_title(category: str, brand: str) -> str:
    patterns = {
        "Electronics": ["Wireless {brand} Earbuds Pro", "{brand} Smartwatch Series", "{brand} Portable Charger"],
        "Computers": ["{brand} Laptop Pro", "{brand} Mechanical Keyboard", "{brand} 4K Monitor"],
        "Audio": ["{brand} Noise Cancelling Headphones", "{brand} Bluetooth Speaker", "{brand} Studio Earbuds"],
        "Gaming": ["{brand} Gaming Mouse", "{brand} Mechanical Gaming Keyboard", "{brand} Console Accessory Kit"],
        "Fashion": ["{brand} Oversized Shirt", "{brand} Relaxed Fit Jeans", "{brand} Everyday Tee"],
        "Footwear": ["{brand} Running Shoes", "{brand} Casual Sneakers", "{brand} Everyday Slides"],
        "Accessories": ["{brand} Analog Watch", "{brand} Travel Backpack", "{brand} Leather Wallet"],
        "Home & Kitchen": ["{brand} Air Fryer", "{brand} Non Stick Cookware Set", "{brand} Mixer Grinder"],
        "Furniture": ["{brand} Study Desk", "{brand} Accent Chair", "{brand} Storage Cabinet"],
        "Decor": ["{brand} Table Lamp", "{brand} Wall Decor Set", "{brand} Cushion Cover Set"],
        "Appliances": ["{brand} Steam Iron", "{brand} Air Purifier", "{brand} Room Heater"],
        "Fitness": ["{brand} Yoga Mat", "{brand} Dumbbell Set", "{brand} Resistance Bands"],
        "Sports": ["{brand} Cricket Kit", "{brand} Training Ball", "{brand} Sports Bottle"],
        "Wellness": ["{brand} Vitamin Pack", "{brand} Self Care Kit", "{brand} Skincare Bundle"],
        "Wearables": ["{brand} Fitness Tracker", "{brand} Smart Band", "{brand} Health Watch"],
        "Books": ["{brand} Bestseller Edition", "{brand} Paperback Classic", "{brand} Study Guide"],
        "Stationery": ["{brand} Notebook Set", "{brand} Premium Pen Set", "{brand} Planner"],
        "Office Supplies": ["{brand} Desk Organizer", "{brand} Document Holder", "{brand} Label Pack"],
        "Education": ["{brand} Exam Prep Guide", "{brand} Reference Book", "{brand} Learning Kit"],
        "Beauty": ["{brand} Matte Lipstick", "{brand} Serum Duo", "{brand} Face Palette"],
        "Personal Care": ["{brand} Shampoo Duo", "{brand} Body Wash Set", "{brand} Skincare Routine Pack"],
        "Groceries": ["{brand} Snack Box", "{brand} Breakfast Pack", "{brand} Pantry Bundle"],
        "Kids": ["{brand} Learning Toy", "{brand} Activity Set", "{brand} Story Book Box"],
    }
    template = random.choice(patterns.get(category, ["{brand} Product"]))
    return template.format(brand=brand)


def sample_description(category: str, brand: str, price: float) -> str:
    extras = {
        "Electronics": "long battery life, compact charging, everyday performance",
        "Fashion": "soft fabric, clean silhouette, easy styling",
        "Home & Kitchen": "durable build, kitchen-friendly, easy to clean",
        "Books": "popular pick, strong reviews, easy to gift",
        "Beauty": "daily-use formula, lightweight feel, simple routine",
    }
    return f"{brand} {category.lower()} pick with {extras.get(category, 'practical daily use')}. Priced around {price:.0f}."


def seed_catalog_products(conn: sqlite3.Connection, total_per_platform: int = 250) -> None:
    existing = fetch_one(conn, "select count(*) as c from products")
    if existing and existing["c"]:
        return
    random.seed(42)
    categories = CATEGORY_TAXONOMY
    rows = []
    for platform in PLATFORMS:
        for idx in range(total_per_platform):
            category = random.choice(categories)
            brand = random.choice(BRAND_LIBRARY.get(category, ["Generic"]))
            price_floor, price_ceiling = {
                "Electronics": (799, 49999),
                "Computers": (1999, 89999),
                "Audio": (499, 24999),
                "Gaming": (699, 49999),
                "Fashion": (299, 12999),
                "Footwear": (499, 16999),
                "Accessories": (199, 17999),
                "Home & Kitchen": (249, 24999),
                "Furniture": (799, 39999),
                "Decor": (199, 9999),
                "Appliances": (699, 25999),
                "Fitness": (299, 16999),
                "Sports": (249, 12999),
                "Wellness": (149, 14999),
                "Wearables": (999, 34999),
                "Books": (99, 1999),
                "Stationery": (49, 2499),
                "Office Supplies": (99, 4999),
                "Education": (199, 3999),
                "Beauty": (99, 4999),
                "Personal Care": (99, 6999),
                "Groceries": (49, 4999),
                "Kids": (149, 9999),
            }[category]
            price = round(random.uniform(price_floor, price_ceiling), 2)
            title = sample_product_title(category, brand)
            description = sample_description(category, brand, price)
            embedding = json.dumps(text_to_vector(f"{title}. {category}. {brand}. {description}"))
            rows.append(
                (
                    new_id(),
                    title,
                    category,
                    brand,
                    price,
                    description,
                    round(random.uniform(3.5, 4.9), 2),
                    random.randint(15, 6000),
                    platform,
                    embedding,
                    json.dumps({"color": random.choice(["black", "silver", "blue", "olive", "beige", "rose"]), "tags": [category.lower()]}),
                    iso_now(),
                )
            )
    conn.executemany(
        """
        insert into products (
            product_id, title, category, brand, price, description,
            avg_rating, review_count, source_platform, embedding, attributes, last_updated
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        rows,
    )


def seed_users_and_wishlists(conn: sqlite3.Connection, count: int = 80) -> None:
    existing = fetch_one(conn, "select count(*) as c from users where is_synthetic = 1")
    if existing and existing["c"]:
        return
    random.seed(7)
    products = fetch_all(conn, "select product_id, title, category, brand, price, source_platform, embedding from products")
    persona_lookup = {persona["tag"]: persona for persona in PERSONAS}
    for idx in range(count):
        persona = PERSONAS[idx % len(PERSONAS)]
        user_id = new_id()
        name = f"{persona['label'].split(' ')[0]} User {idx + 1}"
        email = f"{persona['tag']}.{idx + 1}@synthetic.local"
        behavior_vector = default_behavior_vector(persona["tag"])
        conn.execute(
            """
            insert into users (user_id, name, email, password_hash, is_synthetic, persona_tag, role, behavior_vector, onboarding_answers, created_at)
            values (?, ?, ?, ?, 1, ?, 'user', ?, ?, ?)
            """,
            (user_id, name, email, hash_password("Synthetic123!"), persona["tag"], json.dumps(behavior_vector), json.dumps(persona["categories"][:3]), iso_now()),
        )
        selected = 0
        raw_rows = []
        for _ in range(random.randint(15, 40)):
            category = random.choice(persona["categories"] if random.random() < 0.75 else CATEGORY_TAXONOMY)
            eligible = [p for p in products if p["category"] == category]
            if not eligible:
                eligible = products
            product = random.choice(eligible)
            raw_rows.append(
                (
                    new_id(),
                    None,
                    user_id,
                    product["source_platform"],
                    product["product_id"],
                    product["title"],
                    product["price"],
                    product["category"],
                    json.dumps({"seeded": True, "product_id": product["product_id"]}),
                    iso_now(),
                )
            )
            selected += 1
        conn.executemany(
            """
            insert into wishlist_items_raw (
                item_id, connection_id, user_id, platform, platform_product_id, title, price, category, raw_payload, fetched_at
            ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            raw_rows,
        )
        preprocess_user(conn, user_id)
    seed_demo_users(conn)


def seed_demo_users(conn: sqlite3.Connection) -> None:
    for name, email, password, role in [
        ("Demo User", DEFAULT_DEMO_EMAIL, DEFAULT_DEMO_PASSWORD, "user"),
        ("Admin User", DEFAULT_ADMIN_EMAIL, DEFAULT_ADMIN_PASSWORD, "admin"),
    ]:
        existing = fetch_one(conn, "select user_id, role from users where email = ?", (email,))
        if existing:
            if existing.get("role") != role:
                conn.execute("update users set role = ? where email = ?", (role, email))
                conn.commit()
            continue
        conn.execute(
            """
            insert into users (user_id, name, email, password_hash, is_synthetic, persona_tag, role, behavior_vector, onboarding_answers, created_at)
            values (?, ?, ?, ?, 0, null, ?, ?, ?, ?)
            """,
            (
                new_id(),
                name,
                email,
                hash_password(password),
                role,
                json.dumps({category: 1 / len(CATEGORY_TAXONOMY) for category in CATEGORY_TAXONOMY}),
                json.dumps(["Electronics", "Home & Kitchen", "Books"]),
                iso_now(),
            ),
        )
        conn.commit()


def ensure_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        create table if not exists users (
            user_id text primary key,
            name text not null,
            email text not null unique,
            password_hash text not null,
            is_synthetic integer not null default 0,
            persona_tag text,
            role text not null default 'user' check (role in ('user','admin')),
            behavior_vector text not null default '{}',
            onboarding_answers text not null default '[]',
            created_at text not null
        );

        create table if not exists platform_connections (
            connection_id text primary key,
            user_id text not null references users(user_id) on delete cascade,
            platform text not null check (platform in ('amazon','flipkart','myntra','ajio','tatacliq','nykaa')),
            auth_token text,
            connected_at text not null,
            last_synced_at text,
            sync_confirmed_at text,
            unique(user_id, platform)
        );

        create table if not exists wishlist_items_raw (
            item_id text primary key,
            connection_id text references platform_connections(connection_id) on delete cascade,
            user_id text not null references users(user_id) on delete cascade,
            platform text not null,
            platform_product_id text,
            title text not null,
            price real,
            category text,
            raw_payload text,
            fetched_at text not null
        );

        create table if not exists products (
            product_id text primary key,
            title text not null,
            category text not null,
            brand text,
            price real,
            description text,
            avg_rating real,
            review_count integer default 0,
            source_platform text not null check (source_platform in ('amazon','flipkart','myntra','ajio','tatacliq','nykaa')),
            embedding text not null,
            attributes text,
            last_updated text not null
        );

        create index if not exists idx_products_category on products(category);
        create index if not exists idx_products_source_platform on products(source_platform);

        create table if not exists unified_wishlist_items (
            unified_item_id text primary key,
            user_id text not null references users(user_id) on delete cascade,
            canonical_product_id text references products(product_id),
            title text not null,
            category text,
            price real,
            source_url text,
            source_platforms text not null default '[]',
            added_at text not null,
            unique(user_id, canonical_product_id)
        );

        create index if not exists idx_unified_wishlist_user on unified_wishlist_items(user_id);

        create table if not exists community_graph_edges (
            edge_id text primary key,
            user_id_a text not null references users(user_id) on delete cascade,
            user_id_b text not null references users(user_id) on delete cascade,
            similarity_score real not null,
            computed_at text not null,
            check (user_id_a < user_id_b)
        );

        create table if not exists communities (
            community_id text primary key,
            computed_at text not null,
            algorithm_version text not null default 'leiden-v1'
        );

        create table if not exists user_community_membership (
            user_id text not null references users(user_id) on delete cascade,
            community_id text not null references communities(community_id) on delete cascade,
            computed_at text not null,
            primary key (user_id, computed_at)
        );

        create index if not exists idx_membership_user on user_community_membership(user_id, computed_at desc);

        create table if not exists recommendations (
            recommendation_id text primary key,
            user_id text not null references users(user_id) on delete cascade,
            product_id text not null references products(product_id),
            final_score real,
            wishlist_similarity real,
            community_preference real,
            trending_score real,
            browsing_history_score real,
            explanation_text text not null,
            rank integer,
            generated_at text not null,
            generated_by text
        );

        create index if not exists idx_reco_user_time on recommendations(user_id, generated_at desc);

        create table if not exists feedback (
            feedback_id text primary key,
            user_id text not null references users(user_id) on delete cascade,
            recommendation_id text not null references recommendations(recommendation_id) on delete cascade,
            action text not null check (action in ('like','dislike','rating')),
            rating_value integer,
            created_at text not null
        );

        create table if not exists agent_job_log (
            job_id text primary key,
            user_id text references users(user_id) on delete set null,
            stage text not null,
            status text not null check (status in ('SUCCESS','FAILED','RUNNING')),
            duration_ms integer,
            retry_count integer default 0,
            error_message text,
            created_at text not null
        );

        create index if not exists idx_job_log_stage_status on agent_job_log(stage, status, created_at desc);

        create table if not exists onboarding_preferences (
            user_id text primary key references users(user_id) on delete cascade,
            answers_json text not null,
            created_at text not null
        );
        """
    )
    connection_table = conn.execute(
        "select sql from sqlite_master where type = 'table' and name = 'platform_connections'"
    ).fetchone()
    if connection_table and "tatacliq" not in connection_table["sql"].lower():
        conn.commit()
        conn.execute("PRAGMA foreign_keys = OFF")
        conn.executescript(
            """
            create table platform_connections_v2 (
                connection_id text primary key,
                user_id text not null references users(user_id) on delete cascade,
                platform text not null check (platform in ('amazon','flipkart','myntra','ajio','tatacliq','nykaa')),
                auth_token text,
                connected_at text not null,
                last_synced_at text,
                unique(user_id, platform)
            );
            insert into platform_connections_v2 (
                connection_id, user_id, platform, auth_token, connected_at, last_synced_at
            ) select connection_id, user_id, platform, auth_token, connected_at, last_synced_at
            from platform_connections;
            drop table platform_connections;
            alter table platform_connections_v2 rename to platform_connections;
            """
        )
        conn.execute("PRAGMA foreign_keys = ON")
    connection_columns = {row["name"] for row in conn.execute("pragma table_info(platform_connections)").fetchall()}
    if "sync_confirmed_at" not in connection_columns:
        conn.execute("alter table platform_connections add column sync_confirmed_at text")
    wishlist_columns = {row["name"] for row in conn.execute("pragma table_info(unified_wishlist_items)").fetchall()}
    if "source_url" not in wishlist_columns:
        conn.execute("alter table unified_wishlist_items add column source_url text")
    cleanup_non_products(conn)


def record_job(conn: sqlite3.Connection, stage: str, status: str, duration_ms: int | None = None, retry_count: int = 0, error_message: str | None = None, user_id: str | None = None) -> None:
    conn.execute(
        """
        insert into agent_job_log (job_id, user_id, stage, status, duration_ms, retry_count, error_message, created_at)
        values (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (new_id(), user_id, stage, status, duration_ms, retry_count, error_message, iso_now()),
    )


NON_PRODUCT_EXPRESSIONS = re.compile(
    r"(main\s+content|search\s+alt|cart\s+shift|home\s+shift|about\s+amazon|sell|fresh|subscribe|save|your\s+orders|business\s+account|returns\s*(?:&|and)\s*orders|your\s+account|sign\s+in|log\s+in|help|customer\s+service|wish\s*list|wishlist|menu|search|home|filters|sort\s+by|privacy\s+notice|conditions\s+of\s+use|select\s+all|delete\s+item|see\s+all\s+buying\s+options|end\s+of\s+list|deliver\s+to|buy\s+again|gift\s+cards|amazon\s+pay|prime\s+video|bestseller\s+edition|\d+%\s*off|flat\s*\d+%\s*off|move\s+to\s+bag|add\s+to\s+bag|move\s+to\s+cart|\bunder\b|\bitems\s+under\b|\bcaps\s+under\b|\bbelts\s+under\b|\bsunglasses\s+under\b)",
    re.IGNORECASE,
)


def is_valid_product(title: str | None, price: float | int | None = None) -> bool:
    if not title or len(title.strip()) < 4:
        return False
    t = title.strip().lower()
    if t in {"beauty & grooming", "men", "women", "kids", "home & living", "studio", "genz", "grooming", "beauty", "footwear", "accessories", "offers", "coupons", "gift cards", "customer care", "myntra insider", "track orders", "contact us", "topwear", "bottomwear", "blog", "careers", "press", "terms of use", "privacy policy", "sitemap", "about us"}:
        return False
    if any(b in t for b in ["no new updates", "latest offers", "izooto", "notification", "powered by"]):
        return False
    if re.search(r"\b(shirts?|tshirts?|pants?|jeans?|jackets?|caps?|belts?|sunglasses?|shoes?|dresses?|kurtas?|items?|deals?|products?|brands?)\s+under\b", t):
        return False
    if re.search(r"^\s*.*under\s+\d+.*$", t):
        return False
    if re.search(r"^\s*(\d+%\s*off|flat\s*\d+%\s*off|off|discount|assured|move\s+to\s+bag|add\s+to\s+bag|move\s+to\s+cart|select\s+size|remove|done)\s*$", t):
        return False
    if NON_PRODUCT_EXPRESSIONS.search(t):
        if t in ["sell", "fresh", "main content", "about amazon", "your subscribe & save items", "search alt + /", "cart shift + alt + c", "home shift + alt + h"] or len(t) < 12:
            return False
        if re.search(r"^(about amazon|sell|fresh|main content|search alt|cart shift|home shift|your subscribe & save items|bestseller edition|\d+%\s*off|move\s+to\s+bag)$", t):
            return False

    return True


def is_valid_product_title(title: str | None) -> bool:
    return is_valid_product(title, 99.0)


def cleanup_non_products(conn: sqlite3.Connection) -> None:
    conn.execute("delete from recommendations where product_id in (select product_id from products where price is null or price <= 0)")
    products = fetch_all(conn, "select product_id, title, price from products")
    for p in products:
        if not is_valid_product(p.get("title"), p.get("price")):
            pid = p["product_id"]
            conn.execute("delete from recommendations where product_id = ?", (pid,))
            conn.execute("delete from unified_wishlist_items where canonical_product_id = ?", (pid,))
            conn.execute("delete from products where product_id = ?", (pid,))

    raw = fetch_all(conn, "select item_id, title, price from wishlist_items_raw")
    for r in raw:
        if not is_valid_product(r.get("title"), r.get("price")):
            conn.execute("delete from wishlist_items_raw where item_id = ?", (r["item_id"],))

    uni = fetch_all(conn, "select unified_item_id, title, price from unified_wishlist_items")
    for u in uni:
        if not is_valid_product(u.get("title"), u.get("price")):
            conn.execute("delete from unified_wishlist_items where unified_item_id = ?", (u["unified_item_id"],))
    conn.commit()


def cleanup_orphan_user_products(conn: sqlite3.Connection) -> None:
    """Remove dynamic catalog rows left behind when a user re-syncs a store."""
    referenced = {
        row["canonical_product_id"]
        for row in fetch_all(conn, "select distinct canonical_product_id from unified_wishlist_items")
        if row.get("canonical_product_id")
    }
    for product in fetch_all(conn, "select product_id, attributes from products"):
        attributes = json_maybe_load(product.get("attributes"), {})
        if attributes.get("user_added") and product["product_id"] not in referenced:
            conn.execute("delete from products where product_id = ?", (product["product_id"],))


def preprocess_user(conn: sqlite3.Connection, user_id: str) -> dict[str, Any]:
    raw_items = fetch_all(conn, "select * from wishlist_items_raw where user_id = ? order by fetched_at asc", (user_id,))
    products = fetch_all(conn, "select * from products")
    unified_before = fetch_all(conn, "select * from unified_wishlist_items where user_id = ?", (user_id,))
    merged = 0
    inserted = 0
    category_counter: Counter[str] = Counter()

    for item in raw_items:
        item_title = clean_wishlist_title(item.get("title") or "Wishlist Product")
        if not is_valid_product(item_title):
            continue
        raw_item_price = item.get("price")
        item_price = float(raw_item_price) if raw_item_price not in (None, "") else None
        if item_price is not None and item_price <= 0:
            item_price = None
        item_category = map_category(item.get("category") or item_title)
        item_payload = json_maybe_load(item.get("raw_payload"), {})
        item_url = item_payload.get("url") if isinstance(item_payload, dict) else None
        if not item_url and str(item.get("platform_product_id") or "").startswith(("http://", "https://")):
            item_url = item.get("platform_product_id")
        item_brand = brand_from_text(item_title, item_category)
        candidate_product = None
        if item.get("platform_product_id"):
            candidate_product = next((p for p in products if p["product_id"] == item["platform_product_id"]), None)
        if candidate_product is None:
            normalized_title = normalize_title(item_title)
            for product in products:
                if product["category"] != item_category:
                    continue
                title_score = SequenceMatcher(None, normalized_title, normalize_title(product["title"])).ratio()
                product_price = float(product["price"] or 0)
                price_match = item_price is not None and product_price and abs(item_price - product_price) / max(product_price, 1) <= 0.05
                if title_score > 0.9 and (item_price is None or price_match):
                    candidate_product = product
                    break

        canonical_id = candidate_product["product_id"] if candidate_product else new_id()
        if candidate_product is None:
            # Dynamically register the user's actual product into the catalog for recommendation algorithms
            embedding = json.dumps(text_to_vector(f"{item_title}. {item_category}. {item_brand or 'Generic'}."))
            raw_plat = str(item.get("platform") or "amazon").lower()
            safe_source_platform = raw_plat if raw_plat in PLATFORMS else "amazon"
            conn.execute(
                """
                insert into products (
                    product_id, title, category, brand, price, description, avg_rating, review_count, source_platform, embedding, attributes, last_updated
                ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    canonical_id,
                    item_title,
                    item_category,
                    item_brand,
                    item_price,
                    f"User wishlist item: {item_title}",
                    4.5,
                    10,
                    safe_source_platform,
                    embedding,
                    json.dumps({"user_added": True}),
                    iso_now(),
                ),
            )
            products.append({
                "product_id": canonical_id,
                "title": item_title,
                "category": item_category,
                "brand": item_brand,
                "price": item_price,
            })

        # Match by normalized title or canonical id in user's unified wishlist
        normalized_item_title = wishlist_title_identity(item_title)
        existing = next(
            (row for row in unified_before if wishlist_title_identity(row["title"]) == normalized_item_title or row["canonical_product_id"] == canonical_id),
            None,
        )

        if existing:
            platforms = set(json_maybe_load(existing.get("source_platforms"), []))
            platforms.add(item["platform"])
            conn.execute(
                "update unified_wishlist_items set canonical_product_id = ?, category = ?, title = ?, source_platforms = ?, price = coalesce(nullif(?, 0), price), source_url = coalesce(?, source_url) where unified_item_id = ?",
                (canonical_id, item_category, item_title, json.dumps(sorted(platforms)), item_price, item_url, existing["unified_item_id"]),
            )
            merged += 1
        else:
            conn.execute(
                """
                insert into unified_wishlist_items (
                    unified_item_id, user_id, canonical_product_id, title, category, price, source_url, source_platforms, added_at
                ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    new_item_id := new_id(),
                    user_id,
                    canonical_id,
                    item_title,
                    item_category,
                    item_price if item_price is not None else (candidate_product["price"] if candidate_product else None),
                    item_url,
                    json.dumps([item["platform"]]),
                    iso_now(),
                ),
            )
            inserted += 1
            unified_before.append(
                {
                    "unified_item_id": new_item_id,
                    "title": item_title,
                    "canonical_product_id": canonical_id,
                    "source_platforms": [item["platform"]],
                }
            )
        category_counter[item_category] += 1

    user = fetch_one(conn, "select * from users where user_id = ?", (user_id,))
    if user:
        behavior = json_maybe_load(user.get("behavior_vector"), {})
        total = sum(category_counter.values()) or 1
        for category, count in category_counter.items():
            behavior[category] = round(((behavior.get(category, 0.0) * 0.65) + (count / total) * 0.35), 6)
        norm = sum(behavior.values()) or 1.0
        behavior = {category: round(float(value) / norm, 6) for category, value in behavior.items()}
        conn.execute("update users set behavior_vector = ? where user_id = ?", (json.dumps(behavior), user_id))

    return {"imported": len(raw_items), "duplicates_merged": merged, "unified_wishlist_size": fetch_one(conn, "select count(*) as c from unified_wishlist_items where user_id = ?", (user_id,))["c"], "inserted": inserted}


def add_raw_items(conn: sqlite3.Connection, user_id: str, platform: str, items: list[dict[str, Any]], connection_id: str | None = None) -> dict[str, Any]:
    plat_lower = (platform or "manual").lower()
    # Keep historical recommendation rows because feedback references them. Mark
    # the visible feed stale so the next request regenerates against new wishlist data.
    conn.execute("update recommendations set generated_by = 'stale' where user_id = ? and generated_by like 'recommendations%'", (user_id,))
    if plat_lower != "manual":
        conn.execute("delete from wishlist_items_raw where user_id = ? and lower(platform) = ?", (user_id, plat_lower))
        conn.execute("delete from unified_wishlist_items where user_id = ? and (lower(source_platforms) like ? or lower(source_platforms) = ?)", (user_id, f'%"{plat_lower}"%', plat_lower))
    
    normalized = 0
    for item in items:
        conn.execute(
            """
            insert into wishlist_items_raw (
                item_id, connection_id, user_id, platform, platform_product_id, title, price, category, raw_payload, fetched_at
            ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                new_id(),
                connection_id,
                user_id,
                item.get("platform") or platform,
                item.get("platform_product_id"),
                item.get("title") or "Wishlist Item",
                item.get("price"),
                item.get("category"),
                json.dumps(item),
                iso_now(),
            ),
        )
        normalized += 1
    result = preprocess_user(conn, user_id)
    cleanup_orphan_user_products(conn)
    return result


def import_csv_items(conn: sqlite3.Connection, user_id: str, csv_text: str) -> dict[str, Any]:
    reader = csv.DictReader(csv_text.splitlines())
    buckets: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in reader:
        title = row.get("product_name") or row.get("title") or row.get("name") or ""
        platform = (row.get("platform") or "manual").strip().lower()
        buckets[platform].append(
            {
                "platform": platform,
                "title": title.strip(),
                "price": float(row["price"]) if row.get("price") else None,
                "category": row.get("category") or None,
                "platform_product_id": row.get("product_id") or row.get("platform_product_id"),
                "raw_payload": row,
            }
        )
    combined = {"imported": 0, "duplicates_merged": 0, "unified_wishlist_size": 0, "inserted": 0}
    for platform, items in buckets.items():
        result = add_raw_items(conn, user_id, platform, items)
        for key, value in result.items():
            if isinstance(value, int):
                combined[key] = combined.get(key, 0) + value
            else:
                combined[key] = value
    combined["unified_wishlist_size"] = fetch_one(conn, "select count(*) as c from unified_wishlist_items where user_id = ?", (user_id,))["c"]
    return combined


def get_latest_membership(conn: sqlite3.Connection, user_id: str) -> dict[str, Any] | None:
    return fetch_one(
        conn,
        """
        select m.user_id, m.community_id, m.computed_at
        from user_community_membership m
        where m.user_id = ?
        order by m.computed_at desc
        limit 1
        """,
        (user_id,),
    )


def build_community_graph(conn: sqlite3.Connection) -> dict[str, Any]:
    users = fetch_all(conn, "select user_id, behavior_vector, persona_tag from users order by created_at asc")
    if not users:
        return {"edges": 0, "communities": 0}
    unified = fetch_all(
        conn,
        """
        select u.user_id, p.category, p.product_id
        from unified_wishlist_items u
        left join products p on p.product_id = u.canonical_product_id
        """,
    )
    wishlist_by_user: dict[str, set[str]] = defaultdict(set)
    for row in unified:
        wishlist_by_user[row["user_id"]].add(row["category"] or "Electronics")
    behavior_by_user = {row["user_id"]: row["behavior_vector"] for row in users}

    conn.execute("delete from community_graph_edges")
    computed_at = iso_now()
    edges = 0
    graph = nx.Graph()
    for user in users:
        graph.add_node(user["user_id"])

    for idx, left in enumerate(users):
        for right in users[idx + 1 :]:
            left_wishlist = wishlist_by_user.get(left["user_id"], set())
            right_wishlist = wishlist_by_user.get(right["user_id"], set())
            sim = 0.7 * jaccard_similarity(left_wishlist, right_wishlist) + 0.3 * cosine_similarity(left["behavior_vector"], right["behavior_vector"])
            if sim > settings.community_similarity_threshold:
                graph.add_edge(left["user_id"], right["user_id"], weight=sim)
                conn.execute(
                    """
                    insert into community_graph_edges (edge_id, user_id_a, user_id_b, similarity_score, computed_at)
                    values (?, ?, ?, ?, ?)
                    """,
                    (new_id(), min(left["user_id"], right["user_id"]), max(left["user_id"], right["user_id"]), float(round(sim, 4)), computed_at),
                )
                edges += 1

    conn.execute("delete from communities")
    conn.execute("delete from user_community_membership")
    communities = []
    partitions = []
    algorithm_version = "leiden-v2"
    if graph.number_of_edges() == 0:
        partitions = [{user["user_id"]} for user in users]
    else:
        try:
            import igraph as ig
            import leidenalg

            user_list = [u["user_id"] for u in users]
            user_to_idx = {uid: idx for idx, uid in enumerate(user_list)}
            ig_graph = ig.Graph(n=len(user_list), directed=False)
            edges_list = []
            weights_list = []
            for u, v, data in graph.edges(data=True):
                edges_list.append((user_to_idx[u], user_to_idx[v]))
                weights_list.append(float(data.get("weight", 1.0)))
            if edges_list:
                ig_graph.add_edges(edges_list)
                ig_graph.es["weight"] = weights_list

            partition = leidenalg.find_partition(
                ig_graph,
                leidenalg.ModularityVertexPartition,
                weights="weight",
                seed=42,
            )
            for community_indices in partition:
                partitions.append({user_list[idx] for idx in community_indices})
        except Exception:
            try:
                partitions = list(nx.algorithms.community.louvain_communities(graph, seed=42, weight="weight"))
                algorithm_version = "louvain-fallback"
            except Exception:
                partitions = list(nx.algorithms.community.greedy_modularity_communities(graph, weight="weight"))
                algorithm_version = "modularity-fallback"

    for community_nodes in partitions:
        community_id = new_id()
        conn.execute(
            "insert into communities (community_id, computed_at, algorithm_version) values (?, ?, ?)",
            (community_id, computed_at, algorithm_version),
        )
        communities.append(community_id)
        for user_id in community_nodes:
            conn.execute(
                "insert into user_community_membership (user_id, community_id, computed_at) values (?, ?, ?)",
                (user_id, community_id, computed_at),
            )
    return {"edges": edges, "communities": len(communities), "computed_at": computed_at, "algorithm_version": algorithm_version}



def community_summary(conn: sqlite3.Connection, community_id: str | None) -> dict[str, float]:
    if not community_id:
        return {}
    members = fetch_all(
        conn,
        """
        select u.user_id, u.behavior_vector
        from user_community_membership m
        join users u on u.user_id = m.user_id
        where m.community_id = ?
        """,
        (community_id,),
    )
    category_counts: Counter[str] = Counter()
    total = 0
    for member in members:
        wishlist = fetch_all(
            conn,
            """
            select p.category
            from unified_wishlist_items u
            join products p on p.product_id = u.canonical_product_id
            where u.user_id = ?
            """,
            (member["user_id"],),
        )
        for row in wishlist:
            category_counts[row["category"]] += 1
            total += 1
    if total == 0:
        return {}
    return {category: count / total for category, count in category_counts.items()}


def trending_scores(conn: sqlite3.Connection) -> dict[str, float]:
    since = (utc_now() - timedelta(days=7)).isoformat()
    rows = fetch_all(
        conn,
        """
        select canonical_product_id, count(*) as c
        from unified_wishlist_items
        where added_at >= ?
        group by canonical_product_id
        """,
        (since,),
    )
    if not rows:
        return {}
    max_count = max(row["c"] for row in rows) or 1
    return {row["canonical_product_id"]: round(float(row["c"]) / max_count, 6) for row in rows}


def top_categories_from_wishlist(conn: sqlite3.Connection, user_id: str, limit: int = 3) -> list[str]:
    rows = fetch_all(
        conn,
        """
        select p.category, count(*) as c
        from unified_wishlist_items u
        join products p on p.product_id = u.canonical_product_id
        where u.user_id = ?
        group by p.category
        order by c desc
        limit ?
        """,
        (user_id, limit),
    )
    return [row["category"] for row in rows]


def user_profile_summary(conn: sqlite3.Connection, user_id: str) -> dict[str, Any]:
    user = fetch_one(conn, "select * from users where user_id = ?", (user_id,))
    wishlist = fetch_all(
        conn,
        """
        select u.*, p.brand, p.source_platform, p.embedding
        from unified_wishlist_items u
        left join products p on p.product_id = u.canonical_product_id
        where u.user_id = ?
        """,
        (user_id,),
    )
    top_categories = Counter([row["category"] for row in wishlist if row["category"]])
    return {
        "user": user,
        "wishlist_count": len(wishlist),
        "top_categories": [category for category, _ in top_categories.most_common(3)],
        "behavior_vector": json_maybe_load(user.get("behavior_vector"), {}) if user else {},
        "onboarding_answers": json_maybe_load(user.get("onboarding_answers"), []) if user else [],
    }


def build_query_vector(conn: sqlite3.Connection, user_id: str, query: str | None = None) -> list[float]:
    wishlist = fetch_all(
        conn,
        """
        select u.title, u.category, p.brand, p.embedding
        from unified_wishlist_items u
        left join products p on p.product_id = u.canonical_product_id
        where u.user_id = ?
        """,
        (user_id,),
    )
    vectors = []
    for row in wishlist:
        if row.get("embedding"):
            vec = vector_from_json(row["embedding"])
            if any(v != 0 for v in vec):
                vectors.append(vec)
                continue
        text = f"{row.get('title', '')} {row.get('category', '')} {row.get('brand', '')}".strip()
        if text:
            vectors.append(text_to_vector(text))

    if query:
        vectors.append(text_to_vector(query))

    if not vectors:
        return [0.0] * VECTOR_SIZE

    return vector_mean(vectors)


def candidate_products(conn: sqlite3.Connection, query_vector: list[float], exclude_user_id: str | None = None, limit: int = 100) -> list[dict[str, Any]]:
    user_owned = set()
    if exclude_user_id:
        user_owned = {row["canonical_product_id"] for row in fetch_all(conn, "select canonical_product_id from unified_wishlist_items where user_id = ?", (exclude_user_id,))}
    products = fetch_all(conn, "select * from products")
    best_by_title: dict[str, tuple[float, dict[str, Any]]] = {}
    for product in products:
        if product["product_id"] in user_owned:
            continue
        if not is_valid_product(product.get("title"), product.get("price")):
            continue
        emb = vector_from_json(product.get("embedding"))
        if query_vector and isinstance(emb, list) and len(emb) == len(query_vector):
            similarity = round(sum(x * y for x, y in zip(emb, query_vector)), 6)
        else:
            similarity = 0.0
        identity = wishlist_title_identity(product.get("title"))
        previous = best_by_title.get(identity)
        # Keep one catalog entry per product title. Tie-break by a stable ID, never
        # by the generated catalog price, because it is not a live retailer quote.
        if previous is None or similarity > previous[0] or (similarity == previous[0] and product["product_id"] < previous[1]["product_id"]):
            best_by_title[identity] = (similarity, product)
    scored = list(best_by_title.values())
    scored.sort(key=lambda item: item[0], reverse=True)
    return [{"product": product, "wishlist_similarity": round(score, 6)} for score, product in scored[:limit]]


def browsing_history_score(user: dict[str, Any], category: str | None) -> float:
    behavior = json_maybe_load(user.get("behavior_vector"), {})
    if not behavior or not category:
        return 0.0
    return round(float(behavior.get(category, 0.0)), 6)


def community_preference_score(conn: sqlite3.Connection, community_id: str | None) -> dict[str, float]:
    if not community_id:
        return {}
    rows = fetch_all(
        conn,
        """
        select p.category, count(*) as c
        from user_community_membership m
        join unified_wishlist_items u on u.user_id = m.user_id
        join products p on p.product_id = u.canonical_product_id
        where m.community_id = ?
        group by p.category
        """,
        (community_id,),
    )
    total = sum(row["c"] for row in rows) or 1
    return {row["category"]: round(float(row["c"]) / total, 6) for row in rows}


def cold_start_adjustment(conn: sqlite3.Connection, user_id: str, product_category: str | None) -> tuple[float, float]:
    user = fetch_one(conn, "select onboarding_answers from users where user_id = ?", (user_id,))
    answers = []
    if user and user.get("onboarding_answers"):
        try:
            answers = json.loads(user["onboarding_answers"])
        except Exception:
            answers = []
    if product_category and product_category in answers:
        return 1.0, 1.0
    return 0.0, 0.0


def explanation_for_product(product: dict[str, Any], profile: dict[str, Any], community_top: list[str], scores: dict[str, float]) -> str:
    title = product.get("title", "Product")
    category = product.get("category") or map_category(title) or "General"
    brand = product.get("brand") or brand_from_text(title, category) or "Verified Brand"
    rating = product.get("avg_rating") or 4.5

    wish_sim = scores.get("wishlist_similarity", 0)
    comm_pref = scores.get("community_preference", 0)
    trend = scores.get("trending_score", 0)
    history = scores.get("browsing_history_score", 0)

    reasons: list[str] = []
    top_categories = {str(value).lower() for value in profile.get("top_categories") or []}
    if category.lower() in top_categories:
        reasons.append(f"it matches your saved {category.lower()} picks")
    elif wish_sim >= 0.25:
        reasons.append("its style is close to products already in your wishlist")
    if history >= 0.15:
        reasons.append(f"you frequently explore {category.lower()}")
    if comm_pref >= 0.20 or category in community_top:
        reasons.append("shoppers with similar taste are saving this category")
    if trend >= 0.35:
        reasons.append("it is gaining momentum across wishlists")
    if not reasons:
        reasons.append(f"it adds a highly rated ({rating}★) {brand} option to your mix")

    return f"Why it fits: {reasons[0].capitalize()}" + (f", and {reasons[1]}" if len(reasons) > 1 else "") + "."


def diversify_candidates(candidates: list[dict[str, Any]], top_n: int) -> list[dict[str, Any]]:
    """Use relevance-first MMR so one category or brand cannot dominate the feed."""
    remaining = list(candidates)
    selected: list[dict[str, Any]] = []
    category_counts: Counter[str] = Counter()
    brand_counts: Counter[str] = Counter()

    while remaining and len(selected) < top_n:
        best_index = 0
        best_score = float("-inf")
        for index, candidate in enumerate(remaining):
            product = candidate["product"]
            category = str(product.get("category") or "General").lower()
            brand = str(product.get("brand") or "").lower()
            tokens = set(tokenize(product.get("title") or ""))
            nearest_title = max(
                (jaccard_similarity(tokens, set(tokenize(item["product"].get("title") or ""))) for item in selected),
                default=0.0,
            )
            novelty_penalty = 0.18 * nearest_title + 0.07 * category_counts[category]
            if brand:
                novelty_penalty += 0.05 * brand_counts[brand]
            mmr_score = float(candidate["final_score"]) - novelty_penalty
            stable_tie = str(product.get("product_id") or "")
            current_tie = str(remaining[best_index]["product"].get("product_id") or "")
            if mmr_score > best_score or (mmr_score == best_score and stable_tie < current_tie):
                best_index = index
                best_score = mmr_score

        chosen = remaining.pop(best_index)
        selected.append(chosen)
        chosen_product = chosen["product"]
        category_counts[str(chosen_product.get("category") or "General").lower()] += 1
        chosen_brand = str(chosen_product.get("brand") or "").lower()
        if chosen_brand:
            brand_counts[chosen_brand] += 1

    selected_ids = {item["product"].get("product_id") for item in selected}
    return selected + [item for item in candidates if item["product"].get("product_id") not in selected_ids]


def anthropic_rank_products(candidates: list[dict[str, Any]], top_n: int, profile: dict[str, Any], community_top: list[str]) -> list[dict[str, Any]] | None:
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key or not api_key.startswith("sk-ant"):
        return None
    try:
        prompt = {
            "top_n": top_n,
            "profile": profile,
            "community_top": community_top,
            "candidates": [
                {
                    "product_id": item["product"]["product_id"],
                    "title": item["product"]["title"],
                    "category": item["product"]["category"],
                    "brand": item["product"].get("brand"),
                    "price": item["product"].get("price"),
                    "final_score": item["final_score"],
                    "wishlist_similarity": item["wishlist_similarity"],
                    "community_preference": item["community_preference"],
                    "trending_score": item["trending_score"],
                    "browsing_history_score": item["browsing_history_score"],
                }
                for item in candidates[:30]
            ],
        }
        request_body = json.dumps(
            {
                "model": "claude-haiku-4-5-20251001",
                "max_tokens": 1200,
                "temperature": 0.3,
                "system": (
                    "You are a product-recommendation ranking engine for a wishlist app. "
                    "Return JSON only with a recommendations array. Each entry must contain product_id, rank, and a concise explanation."
                ),
                "messages": [
                    {
                        "role": "user",
                        "content": json.dumps(prompt, ensure_ascii=False),
                    }
                ],
            }
        ).encode("utf-8")
        req = urllib.request.Request(
            "https://api.anthropic.com/v1/messages",
            data=request_body,
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=3) as response:
            payload = json.loads(response.read().decode("utf-8"))
        content = "".join(block.get("text", "") for block in payload.get("content", []) if isinstance(block, dict))
        parsed = json.loads(content)
        recommendations = parsed.get("recommendations") or []
        if not recommendations:
            return None
        valid_ids = {item["product"]["product_id"] for item in candidates}
        normalized = []
        seen_ids: set[str] = set()
        for entry in recommendations:
            product_id = str(entry.get("product_id") or "")
            if product_id not in valid_ids or product_id in seen_ids:
                continue
            seen_ids.add(product_id)
            normalized.append(
                {
                    "product_id": product_id,
                    "rank": len(normalized) + 1,
                    "explanation": str(entry["explanation"])[:220],
                }
            )
            if len(normalized) >= top_n:
                break
        for item in candidates:
            product_id = item["product"]["product_id"]
            if len(normalized) >= top_n:
                break
            if product_id in seen_ids:
                continue
            seen_ids.add(product_id)
            scores = {
                "wishlist_similarity": item["wishlist_similarity"],
                "community_preference": item["community_preference"],
                "trending_score": item["trending_score"],
                "browsing_history_score": item["browsing_history_score"],
            }
            normalized.append({
                "product_id": product_id,
                "rank": len(normalized) + 1,
                "explanation": explanation_for_product(item["product"], profile, community_top, scores),
            })
        return normalized
    except (urllib.error.URLError, urllib.error.HTTPError, ValueError, KeyError, TimeoutError, json.JSONDecodeError):
        return None


def llm_rank_products(candidates: list[dict[str, Any]], top_n: int, profile: dict[str, Any], community_top: list[str], refresh: bool = False) -> list[dict[str, Any]]:
    anthropic_result = anthropic_rank_products(candidates, top_n, profile, community_top)
    if anthropic_result:
        return anthropic_result

    ordered = candidates[:top_n]

    results = []
    for rank, item in enumerate(ordered, start=1):
        product = item["product"]
        scores = {
            "wishlist_similarity": item["wishlist_similarity"],
            "community_preference": item["community_preference"],
            "trending_score": item["trending_score"],
            "browsing_history_score": item["browsing_history_score"],
        }
        results.append(
            {
                "product_id": product["product_id"],
                "rank": rank,
                "explanation": explanation_for_product(product, profile, community_top, scores),
            }
        )
    return results


def score_products(
    conn: sqlite3.Connection,
    user_id: str,
    query_vector: list[float],
    top_n: int,
    query_text: str | None = None,
    refresh: bool = False,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    user = fetch_one(conn, "select * from users where user_id = ?", (user_id,))
    profile = user_profile_summary(conn, user_id)
    membership = get_latest_membership(conn, user_id)
    community_id = membership["community_id"] if membership else None
    community_map = community_preference_score(conn, community_id)
    trending_map = trending_scores(conn)
    community_top = [category for category, _ in sorted(community_map.items(), key=lambda item: item[1], reverse=True)[:3]]

    wishlist_rows = fetch_all(
        conn,
        """
        select u.title, u.category, p.brand
        from unified_wishlist_items u
        left join products p on p.product_id = u.canonical_product_id
        where u.user_id = ?
        """,
        (user_id,),
    )
    user_categories = set(w["category"].lower() for w in wishlist_rows if w.get("category"))
    user_tokens_list = [set(tokenize(w["title"])) for w in wishlist_rows if w.get("title")]

    # Fetch user feedback history (likes & dislikes)
    disliked_pids = set()
    liked_categories = set()
    liked_brands = set()

    feedback_rows = fetch_all(
        conn,
        """
        select f.action, f.rating_value, r.product_id, p.category, p.brand
        from feedback f
        join recommendations r on r.recommendation_id = f.recommendation_id
        join products p on p.product_id = r.product_id
        where f.user_id = ?
        """,
        (user_id,)
    )

    for fb in feedback_rows:
        act = fb["action"]
        rv = fb["rating_value"]
        if act == "dislike" or (act == "rating" and rv is not None and rv <= 2):
            if fb.get("product_id"):
                disliked_pids.add(fb["product_id"])
        elif act == "like" or (act == "rating" and rv is not None and rv >= 4):
            if fb.get("category"): liked_categories.add(fb["category"].lower())
            if fb.get("brand"): liked_brands.add(fb["brand"].lower())

    current_reco_pids = set()
    if refresh:
        current_recos = fetch_all(
            conn,
            """
            select product_id from recommendations
            where user_id = ? and generated_by = 'recommendations-v2'
              and generated_at = (
                select max(generated_at) from recommendations
                where user_id = ? and generated_by = 'recommendations-v2'
              )
            """,
            (user_id, user_id),
        )
        current_reco_pids = set(r["product_id"] for r in current_recos)

    raw_candidates = candidate_products(conn, query_vector, exclude_user_id=user_id, limit=200)

    user_wishlist_count = len(wishlist_rows)
    onboarding_answers = set(profile.get("onboarding_answers") or [])
    query_tokens = set(tokenize(query_text or ""))

    personalized: list[dict[str, Any]] = []
    for candidate in raw_candidates:
        product = candidate["product"]
        pid = product.get("product_id")
        title_lower = (product.get("title") or "").lower()
        pid_lower = (pid or "").lower()

        # EXCLUDE DISLIKED PRODUCTS & TEST PRODUCTS
        if pid in disliked_pids or "test" in title_lower or "demo" in title_lower or "sample" in title_lower or "test" in pid_lower:
            continue

        # IF REFRESHING, EXCLUDE CURRENTLY DISPLAYED RECOMMENDATIONS
        if refresh and current_reco_pids and pid in current_reco_pids and len(raw_candidates) > top_n * 2:
            continue

        emb = product.get("embedding")
        if isinstance(emb, list) and query_vector:
            emb_sim = round(sum(x * y for x, y in zip(emb, query_vector)), 6)
        else:
            emb_sim = round(cosine_similarity(product.get("embedding"), query_vector), 6)

        cat_match = 1.0 if (product.get("category") or "").lower() in user_categories else 0.0
        cand_tokens = set(tokenize(product.get("title", "")))
        title_sim = max([jaccard_similarity(cand_tokens, tok_set) for tok_set in user_tokens_list], default=0.0)

        if user_wishlist_count > 0:
            wishlist_similarity = round(0.35 * emb_sim + 0.45 * cat_match + 0.20 * title_sim, 6)
        else:
            wishlist_similarity = emb_sim
        if query_tokens:
            searchable_tokens = cand_tokens | set(tokenize(product.get("category") or "")) | set(tokenize(product.get("brand") or ""))
            query_relevance = len(query_tokens & searchable_tokens) / max(len(query_tokens), 1)
            wishlist_similarity = round(max(wishlist_similarity, query_relevance), 6)

        community_preference = round(float(community_map.get(product["category"], 0.0)), 6)
        trending_score = round(float(trending_map.get(product["product_id"], 0.0)), 6)
        browsing_score = browsing_history_score(user or {}, product["category"])

        if user_wishlist_count < 5:
            ob_match = 1.0 if product.get("category") in onboarding_answers else 0.0
            trending_score = round(0.60 * trending_score + 0.40 * ob_match, 6)

        like_boost = 0.0
        if (product.get("category") or "").lower() in liked_categories:
            like_boost += 0.35
        if (product.get("brand") or "").lower() in liked_brands:
            like_boost += 0.25

        base_final = (
            settings.weight_wishlist_sim * wishlist_similarity
            + settings.weight_community_pref * community_preference
            + settings.weight_trending * trending_score
            + settings.weight_browsing * browsing_score
            + like_boost
        )

        final_score = round(max(0.0, base_final), 6)

        personalized.append(
            {
                "product": product,
                "wishlist_similarity": wishlist_similarity,
                "community_preference": community_preference,
                "trending_score": trending_score,
                "browsing_history_score": browsing_score,
                "final_score": final_score,
            }
        )

    personalized.sort(key=lambda item: (-item["final_score"], str(item["product"].get("product_id") or "")))
    personalized = diversify_candidates(personalized, top_n)

    ranked = llm_rank_products(personalized, top_n, profile, community_top, refresh=refresh)
    return personalized, {"community_id": community_id, "generated_at": iso_now(), "ranked": ranked, "profile": profile, "community_top": community_top, "query_text": query_text}


def persist_recommendations(conn: sqlite3.Connection, user_id: str, personalized: list[dict[str, Any]], ranked: list[dict[str, Any]], generated_by: str | None = None) -> list[dict[str, Any]]:
    rows = []
    batch_generated_at = iso_now()
    lookup = {entry.get("product_id") or entry["product"]["product_id"]: entry for entry in personalized}
    for entry in ranked:
        candidate = lookup[entry["product_id"]]
        product = candidate["product"]
        recommendation_id = new_id()
        conn.execute(
            """
            insert into recommendations (
                recommendation_id, user_id, product_id, final_score, wishlist_similarity,
                community_preference, trending_score, browsing_history_score,
                explanation_text, rank, generated_at, generated_by
            ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                recommendation_id,
                user_id,
                product["product_id"],
                candidate["final_score"],
                candidate["wishlist_similarity"],
                candidate["community_preference"],
                candidate["trending_score"],
                candidate["browsing_history_score"],
                entry["explanation"],
                entry["rank"],
                batch_generated_at,
                generated_by,
            ),
        )
        rows.append(
            {
                "recommendation_id": recommendation_id,
                "product": product,
                "rank": entry["rank"],
                "final_score": candidate["final_score"],
                "wishlist_similarity": candidate["wishlist_similarity"],
                "community_preference": candidate["community_preference"],
                "trending_score": candidate["trending_score"],
                "browsing_history_score": candidate["browsing_history_score"],
                "explanation": entry["explanation"],
            }
        )
    conn.commit()
    return rows


def latest_recommendations(conn: sqlite3.Connection, user_id: str, limit: int) -> list[dict[str, Any]]:
    rows = fetch_all(
        conn,
        """
        select r.*, p.title, p.category, p.brand, p.price, p.source_platform, p.avg_rating, p.review_count, p.attributes
        from recommendations r
        join products p on p.product_id = r.product_id
        where r.user_id = ? and p.price is not null and p.price > 0
        order by r.generated_at desc, r.rank asc
        """,
        (user_id,),
    )
    valid = [r for r in rows if is_valid_product(r.get("title"), r.get("price"))]
    return valid[:limit]


def feedback_nudge(conn: sqlite3.Connection, user_id: str, recommendation_id: str, action: str, rating_value: int | None = None) -> dict[str, Any]:
    recommendation = fetch_one(conn, "select * from recommendations where recommendation_id = ? and user_id = ?", (recommendation_id, user_id))
    if not recommendation:
        raise ValueError("recommendation not found")
    product = fetch_one(conn, "select * from products where product_id = ?", (recommendation["product_id"],))
    if not product:
        raise ValueError("product not found")
    conn.execute(
        """
        insert into feedback (feedback_id, user_id, recommendation_id, action, rating_value, created_at)
        values (?, ?, ?, ?, ?, ?)
        """,
        (new_id(), user_id, recommendation_id, action, rating_value, iso_now()),
    )
    if action in {"like", "dislike"}:
        user = fetch_one(conn, "select behavior_vector from users where user_id = ?", (user_id,))
        behavior = json_maybe_load(user["behavior_vector"], {}) if user else {}
        current = float(behavior.get(product["category"], 0.0))
        if action == "like":
            current *= 1.10
        else:
            current *= 0.85
        behavior[product["category"]] = round(max(current, 0.0), 6)
        total = sum(float(v) for v in behavior.values()) or 1.0
        behavior = {category: round(float(value) / total, 6) for category, value in behavior.items()}
        conn.execute("update users set behavior_vector = ? where user_id = ?", (json.dumps(behavior), user_id))
    elif action == "rating":
        pass
    return {"feedback_id": new_id(), "behavior_vector_updated": action in {"like", "dislike"}}


def admin_metrics(conn: sqlite3.Connection) -> dict[str, Any]:
    stages = fetch_all(
        conn,
        """
        select stage, avg(coalesce(duration_ms, 0)) as avg_duration, count(*) as total,
               sum(case when status = 'SUCCESS' then 1 else 0 end) as successes
        from agent_job_log
        group by stage
        order by stage
        """,
    )
    return {
        "pipeline_latency": stages,
        "users": fetch_one(conn, "select count(*) as c from users")["c"],
        "products": fetch_one(conn, "select count(*) as c from products")["c"],
        "recommendations": fetch_one(conn, "select count(*) as c from recommendations")["c"],
        "communities": fetch_one(conn, "select count(*) as c from communities")["c"],
        "active_users_30d": fetch_one(
            conn,
            """
            select count(distinct user_id) as c
            from (
                select user_id from wishlist_items_raw where fetched_at >= ?
                union
                select user_id from recommendations where generated_at >= ?
            )
            """,
            ((utc_now() - timedelta(days=30)).isoformat(), (utc_now() - timedelta(days=30)).isoformat()),
        )["c"],
        "agent_success_rates": [
            {
                "stage": row["stage"],
                "success_rate": round((row["successes"] or 0) / max(row["total"], 1), 4),
            }
            for row in stages
        ],
    }


def admin_reports(conn: sqlite3.Connection) -> dict[str, Any]:
    latest = fetch_one(conn, "select community_id, computed_at from communities order by computed_at desc limit 1")
    if latest:
        community_sizes = fetch_all(
            conn,
            """
            select community_id, count(*) as size
            from user_community_membership
            group by community_id
            order by size desc
            """,
        )
    else:
        community_sizes = []
    feedback_rows = fetch_all(conn, "select action, count(*) as c from feedback group by action")
    like_count = next((row["c"] for row in feedback_rows if row["action"] == "like"), 0)
    recommendation_count = fetch_one(conn, "select count(*) as c from recommendations")["c"] or 1
    ctr_proxy = round(like_count / recommendation_count, 4)
    return {
        "latest_graph_run": latest,
        "community_sizes": community_sizes,
        "feedback_breakdown": feedback_rows,
        "ctr_proxy": ctr_proxy,
        "catalog_size": fetch_one(conn, "select count(*) as c from products")["c"],
        "user_count": fetch_one(conn, "select count(*) as c from users")["c"],
    }


def paginated_products(conn: sqlite3.Connection, limit: int = 50, offset: int = 0) -> list[dict[str, Any]]:
    return fetch_all(conn, "select * from products order by last_updated desc limit ? offset ?", (limit, offset))


def paginated_users(conn: sqlite3.Connection, limit: int = 50, offset: int = 0) -> list[dict[str, Any]]:
    return fetch_all(conn, "select * from users order by created_at desc limit ? offset ?", (limit, offset))


def product_by_id(conn: sqlite3.Connection, product_id: str) -> dict[str, Any] | None:
    return fetch_one(conn, "select * from products where product_id = ?", (product_id,))


def recommendation_by_id(conn: sqlite3.Connection, recommendation_id: str, user_id: str | None = None) -> dict[str, Any] | None:
    if user_id:
        return fetch_one(conn, "select * from recommendations where recommendation_id = ? and user_id = ?", (recommendation_id, user_id))
    return fetch_one(conn, "select * from recommendations where recommendation_id = ?", (recommendation_id,))


def search_products(conn: sqlite3.Connection, user_id: str, query: str, top_n: int = 10) -> list[dict[str, Any]]:
    query_vector = build_query_vector(conn, user_id, query)
    personalized, meta = score_products(conn, user_id, query_vector, top_n, query_text=query)
    return persist_recommendations(conn, user_id, personalized, meta["ranked"][:top_n], generated_by="search")


def validate_weights() -> None:
    total = round(settings.weight_wishlist_sim + settings.weight_community_pref + settings.weight_trending + settings.weight_browsing, 6)
    if abs(total - 1.0) > 1e-6:
        raise ValueError("Recommendation weights must sum to 1.0")


def run_batch_graph_job_sync(conn: sqlite3.Connection) -> dict[str, Any]:
    validate_weights()
    return build_community_graph(conn)
