from __future__ import annotations

import json
import sqlite3

import pytest

from apps.api.app import main as api_main
from apps.api.app.core import (
    adaptive_weight_score,
    add_raw_items,
    build_community_graph,
    candidate_products,
    community_similarity,
    diversify_candidates,
    ensure_schema,
    feedback_nudge,
    hash_password,
    iso_now,
    new_id,
    preprocess_user,
    product_price_is_verified,
)


def make_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    ensure_schema(conn)
    return conn


def insert_user(conn: sqlite3.Connection, name: str = "Test User", email: str = "test@example.com", behavior=None, onboarding=None, role: str = "user") -> str:
    user_id = new_id()
    conn.execute(
        """
        insert into users (user_id, name, email, password_hash, is_synthetic, persona_tag, role, behavior_vector, onboarding_answers, created_at)
        values (?, ?, ?, ?, 0, null, ?, ?, ?, ?)
        """,
        (
            user_id,
            name,
            email,
            hash_password("secret123"),
            role,
            json.dumps(behavior or {"Electronics": 0.5, "Fashion": 0.5}),
            json.dumps(onboarding or ["Electronics", "Fashion"]),
            iso_now(),
        ),
    )
    return user_id


def insert_product(
    conn: sqlite3.Connection,
    title: str,
    category: str,
    price: float,
    brand: str = "Generic",
    product_id: str | None = None,
) -> str:
    product_id = product_id or new_id()
    conn.execute(
        """
        insert into products (
            product_id, title, category, brand, price, description, avg_rating, review_count,
            source_platform, embedding, attributes, last_updated
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            product_id,
            title,
            category,
            brand,
            price,
            f"{title} description",
            4.5,
            10,
            "amazon",
            json.dumps([0.0] * 384),
            json.dumps({}),
            iso_now(),
        ),
    )
    return product_id


def test_community_similarity_formula() -> None:
    assert community_similarity(0.25, 0.60) == 0.355


def test_adaptive_weighting_formula() -> None:
    assert adaptive_weight_score(0.82, 0.65, 0.40, 0.55) == 0.658


def test_preprocessing_dedup_merges_near_duplicates() -> None:
    conn = make_conn()
    user_id = insert_user(conn)
    product_id = insert_product(conn, "Wireless Earbuds Pro", "Electronics", 1499, brand="SoundCore")
    conn.executemany(
        """
        insert into wishlist_items_raw (
            item_id, connection_id, user_id, platform, platform_product_id, title, price, category, raw_payload, fetched_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
            (new_id(), None, user_id, "amazon", None, "Wireless Earbuds Pro", 1499, "Electronics", json.dumps({}), iso_now()),
            (new_id(), None, user_id, "flipkart", None, "Wireless Earbuds-Pro", 1529, "Electronics", json.dumps({}), iso_now()),
        ],
    )
    result = preprocess_user(conn, user_id)
    assert result["unified_wishlist_size"] == 1
    row = conn.execute("select source_platforms from unified_wishlist_items where user_id = ?", (user_id,)).fetchone()
    assert sorted(json.loads(row["source_platforms"])) == ["amazon", "flipkart"]


def test_preprocessing_cleans_storefront_text_and_merges_repeated_cards() -> None:
    conn = make_conn()
    user_id = insert_user(conn)
    conn.executemany(
        """
        insert into wishlist_items_raw (
            item_id, connection_id, user_id, platform, platform_product_id, title, price, category, raw_payload, fetched_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
            (new_id(), None, user_id, "myntra", "m-1", "OUT OF STOCKNike Air Force 1 '07 Rs.NaN SHOW SIMILAR", 10795, "Footwear", json.dumps({}), iso_now()),
            (new_id(), None, user_id, "myntra", "m-2", "Nike Air Force 1 '07", 10795, "Footwear", json.dumps({}), iso_now()),
        ],
    )
    result = preprocess_user(conn, user_id)
    assert result["unified_wishlist_size"] == 1
    row = conn.execute("select title, price from unified_wishlist_items where user_id = ?", (user_id,)).fetchone()
    assert row["title"] == "Nike Air Force 1 '07"
    assert row["price"] == 10795


def test_candidates_deduplicate_same_catalog_product_title() -> None:
    conn = make_conn()
    insert_product(conn, "H&M Oversized Shirt", "Fashion", 1299, product_id="shirt-a")
    insert_product(conn, "H&M Oversized Shirt", "Fashion", 1599, product_id="shirt-b")
    candidates = candidate_products(conn, [0.0] * 384)
    shirts = [candidate for candidate in candidates if candidate["product"]["title"] == "H&M Oversized Shirt"]
    assert len(shirts) == 1
    assert shirts[0]["product"]["price"] == 1299


def test_recommendations_balance_relevance_with_category_and_brand_diversity() -> None:
    candidates = [
        {"product": {"product_id": "a", "title": "Pro Wireless Earbuds", "category": "Electronics", "brand": "Acme"}, "final_score": 0.90},
        {"product": {"product_id": "b", "title": "Wireless Earbuds Pro", "category": "Electronics", "brand": "Acme"}, "final_score": 0.88},
        {"product": {"product_id": "c", "title": "Relaxed Linen Shirt", "category": "Fashion", "brand": "North"}, "final_score": 0.72},
    ]
    diversified = diversify_candidates(candidates, top_n=2)
    assert [item["product"]["product_id"] for item in diversified[:2]] == ["a", "c"]


def test_only_storefront_synced_prices_are_marked_as_verified() -> None:
    assert not product_price_is_verified({"attributes": json.dumps({"tags": ["fashion"]})})
    assert product_price_is_verified({"attributes": json.dumps({"user_added": True})})


def test_feedback_nudges_behavior_vector() -> None:
    conn = make_conn()
    user_id = insert_user(conn, behavior={"Electronics": 0.5, "Fashion": 0.5}, onboarding=["Electronics", "Fashion"])
    product_id = insert_product(conn, "Wireless Earbuds Pro", "Electronics", 1499, brand="SoundCore")
    recommendation_id = new_id()
    conn.execute(
        """
        insert into recommendations (
            recommendation_id, user_id, product_id, final_score, wishlist_similarity, community_preference,
            trending_score, browsing_history_score, explanation_text, rank, generated_at, generated_by
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (recommendation_id, user_id, product_id, 0.658, 0.82, 0.65, 0.40, 0.55, "Test explanation", 1, iso_now(), "tests"),
    )
    before = json.loads(conn.execute("select behavior_vector from users where user_id = ?", (user_id,)).fetchone()["behavior_vector"])
    feedback_nudge(conn, user_id, recommendation_id, "dislike")
    after = json.loads(conn.execute("select behavior_vector from users where user_id = ?", (user_id,)).fetchone()["behavior_vector"])
    assert after["Electronics"] < before["Electronics"]


def test_leiden_determinism() -> None:
    conn = make_conn()
    user_ids = [insert_user(conn, name=f"User {i}", email=f"user{i}@example.com", behavior={"Electronics": 0.9, "Fashion": 0.1}, onboarding=["Electronics"]) for i in range(4)]
    tech = insert_product(conn, "Wireless Earbuds Pro", "Electronics", 1499, brand="SoundCore")
    fashion = insert_product(conn, "Relaxed Fit Jeans", "Fashion", 1299, brand="Zara")
    for user_id in user_ids[:2]:
        conn.executemany(
            """
            insert into wishlist_items_raw (
                item_id, connection_id, user_id, platform, platform_product_id, title, price, category, raw_payload, fetched_at
            ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (new_id(), None, user_id, "amazon", tech, "Wireless Earbuds Pro", 1499, "Electronics", json.dumps({}), iso_now()),
            ],
        )
        preprocess_user(conn, user_id)
    for user_id in user_ids[2:]:
        conn.executemany(
            """
            insert into wishlist_items_raw (
                item_id, connection_id, user_id, platform, platform_product_id, title, price, category, raw_payload, fetched_at
            ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (new_id(), None, user_id, "flipkart", fashion, "Relaxed Fit Jeans", 1299, "Fashion", json.dumps({}), iso_now()),
            ],
        )
        preprocess_user(conn, user_id)

    first = build_community_graph(conn)
    memberships_1 = sorted(
        [sorted(row["user_id"] for row in conn.execute("select user_id from user_community_membership where community_id = ?", (community_id,)).fetchall())
         for community_id in [row["community_id"] for row in conn.execute("select community_id from communities").fetchall()]]
    )
    conn.execute("delete from communities")
    conn.execute("delete from user_community_membership")
    second = build_community_graph(conn)
    memberships_2 = sorted(
        [sorted(row["user_id"] for row in conn.execute("select user_id from user_community_membership where community_id = ?", (community_id,)).fetchall())
         for community_id in [row["community_id"] for row in conn.execute("select community_id from communities").fetchall()]]
    )
    assert first["communities"] == second["communities"]
    assert memberships_1 == memberships_2


def test_llm_ranking_fallback_returns_valid_list(monkeypatch: pytest.MonkeyPatch) -> None:
    conn = make_conn()
    user_id = insert_user(conn)
    user = conn.execute("select * from users where user_id = ?", (user_id,)).fetchone()
    for idx in range(8):
        insert_product(conn, f"Product {idx}", "Electronics", 1000 + idx * 10)

    def boom(*args, **kwargs):
        raise RuntimeError("anthropic down")

    monkeypatch.setattr(api_main, "score_products", boom)
    result = api_main.recommendation_response(conn, user, 5)
    assert len(result["recommendations"]) == 5
    assert all(item["explanation"] for item in result["recommendations"])


def test_rag_vector_search_and_explanations() -> None:
    from apps.api.app.core import build_query_vector, search_products
    conn = make_conn()
    user_id = insert_user(conn, behavior={"Audio": 0.8, "Gaming": 0.2})
    insert_product(conn, "Sony Noise Cancelling Headphones", "Audio", 14999, brand="Sony")
    insert_product(conn, "Razer Mechanical Keyboard", "Gaming", 4999, brand="Razer")
    insert_product(conn, "Zara Casual Shirt", "Fashion", 1999, brand="Zara")

    query_vec = build_query_vector(conn, user_id, "headphones noise cancelling")
    assert len(query_vec) == 384
    assert any(v > 0 for v in query_vec)

    results = search_products(conn, user_id, "headphones", top_n=2)
    assert len(results) == 2
    assert results[0]["product"]["category"] == "Audio"
    assert "explanation" in results[0]
    assert len(results[0]["explanation"]) > 0


def test_history_and_job_logging() -> None:
    from apps.api.app.core import record_job, score_products, persist_recommendations, build_query_vector
    conn = make_conn()
    user_id = insert_user(conn)
    product_id = insert_product(conn, "Anker Power Bank", "Electronics", 2499, brand="Anker")
    record_job(conn, "COMMUNITY_GRAPH", "SUCCESS", duration_ms=120)
    job_row = conn.execute("select * from agent_job_log where stage = 'COMMUNITY_GRAPH'").fetchone()
    assert job_row["status"] == "SUCCESS"
    assert job_row["duration_ms"] == 120

    q_vec = build_query_vector(conn, user_id)
    personalized, meta = score_products(conn, user_id, q_vec, top_n=1)
    recs = persist_recommendations(conn, user_id, personalized, meta["ranked"])
    assert len(recs) == 1
    reco_in_db = conn.execute("select * from recommendations where recommendation_id = ?", (recs[0]["recommendation_id"],)).fetchone()
    assert reco_in_db is not None or reco_in_db["product_id"] == product_id
