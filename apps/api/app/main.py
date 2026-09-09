from __future__ import annotations

import asyncio
import inspect
import json
import re
import time
from contextlib import contextmanager
from typing import Any, Callable

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import Depends, FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import settings
from .core import (
    CATEGORY_TAXONOMY,
    add_raw_items,
    admin_metrics,
    admin_reports,
    build_community_graph,
    build_query_vector,
    create_token,
    decode_token,
    ensure_schema,
    feedback_nudge,
    fetch_all,
    fetch_one,
    get_latest_membership,
    hash_password,
    import_csv_items,
    is_valid_product,
    iso_now,
    json_maybe_load,
    latest_recommendations,
    new_id,
    paginated_products,
    paginated_users,
    persist_recommendations,
    recommendation_by_id,
    record_job,
    run_batch_graph_job_sync,
    score_products,
    seed_catalog_products,
    seed_demo_users,
    seed_users_and_wishlists,
    verify_password,
)
from .db import connect
from .schemas import (
    CategoryPreferencesRequest,
    LoginRequest,
    PlatformConnectRequest,
    RegisterRequest,
    RecommendationFeedbackRequest,
    RecommendationsResponse,
    WishlistItemCreate,
)


security = HTTPBearer(auto_error=False)
app = FastAPI(title="Wishlist Recommendation API", version="1.0")
scheduler: AsyncIOScheduler | None = None

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url, "http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@contextmanager
def get_db():
    conn = connect()
    try:
        yield conn
    finally:
        conn.close()


def json_error(code: str, message: str, status: int) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": {"code": code, "message": message}})


def db():
    with get_db() as conn:
        yield conn


def require_user(
    authorization: HTTPAuthorizationCredentials | None = Depends(security),
    conn=Depends(db),
) -> dict[str, Any]:
    if authorization is None or not authorization.credentials:
        raise HTTPException(status_code=401, detail="Missing bearer token")
    try:
        payload = decode_token(authorization.credentials)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = fetch_one(conn, "select * from users where user_id = ?", (payload["sub"],))
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def require_admin(user=Depends(require_user)) -> dict[str, Any]:
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


async def run_stage(conn, stage: str, fn: Callable[..., Any], *args, user_id: str | None = None, **kwargs):
    last_error = None
    for attempt in range(3):
        start = time.monotonic()
        try:
            result = fn(*args, **kwargs)
            if inspect.isawaitable(result):
                result = await result
            record_job(conn, stage, "SUCCESS", duration_ms=int((time.monotonic() - start) * 1000), retry_count=attempt, user_id=user_id)
            conn.commit()
            return result
        except Exception as exc:
            last_error = exc
            record_job(conn, stage, "FAILED", duration_ms=int((time.monotonic() - start) * 1000), retry_count=attempt, error_message=str(exc), user_id=user_id)
            conn.commit()
            if attempt < 2:
                await asyncio.sleep(2**attempt)
    raise last_error  # type: ignore[misc]


async def run_batch_graph_job() -> dict[str, Any]:
    with get_db() as conn:
        return await run_stage(conn, "COMMUNITY_GRAPH", run_batch_graph_job_sync, conn)


def normalize_recommendation_row(row: dict[str, Any], include_debug: bool = False) -> dict[str, Any]:
    payload = {
        "recommendation_id": row["recommendation_id"],
        "product": {
            "product_id": row["product_id"],
            "title": row["title"],
            "category": row["category"],
            "brand": row["brand"],
            "price": None,
            "source_platform": row["source_platform"],
            "avg_rating": row["avg_rating"],
        },
        "rank": row["rank"],
        "final_score": round(float(row["final_score"] or 0), 6),
        "explanation": row["explanation_text"],
    }
    if include_debug:
        payload["debug_scores"] = {
            "wishlist_similarity": round(float(row["wishlist_similarity"] or 0), 6),
            "community_preference": round(float(row["community_preference"] or 0), 6),
            "trending_score": round(float(row["trending_score"] or 0), 6),
            "browsing_history_score": round(float(row["browsing_history_score"] or 0), 6),
        }
    return payload


def normalize_recommendation_product(product: dict[str, Any]) -> dict[str, Any]:
    return {
        "product_id": product["product_id"],
        "title": product["title"],
        "category": product["category"],
        "brand": product.get("brand"),
        "price": None,
        "source_platform": product.get("source_platform"),
        "avg_rating": product.get("avg_rating"),
    }


@app.on_event("startup")
async def startup_event() -> None:
    global scheduler
    with get_db() as conn:
        ensure_schema(conn)
        seed_catalog_products(conn)
        seed_demo_users(conn)
        seed_users_and_wishlists(conn)
        conn.commit()
    scheduler = AsyncIOScheduler()
    scheduler.add_job(run_batch_graph_job, trigger="interval", hours=settings.community_graph_refresh_hours, id="community_graph_rebuild", replace_existing=True)
    scheduler.start()
    await run_batch_graph_job()


@app.on_event("shutdown")
async def shutdown_event() -> None:
    if scheduler:
        scheduler.shutdown(wait=False)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/auth/register")
def register(payload: RegisterRequest, conn=Depends(db)) -> dict[str, Any]:
    existing = fetch_one(conn, "select user_id from users where email = ?", (payload.email.lower(),))
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user_id = new_id()
    conn.execute(
        """
        insert into users (user_id, name, email, password_hash, is_synthetic, persona_tag, role, behavior_vector, onboarding_answers, created_at)
        values (?, ?, ?, ?, 0, null, ?, ?, ?, ?)
        """,
        (
            user_id,
            payload.name.strip(),
            payload.email.lower(),
            hash_password(payload.password),
            payload.role,
            json.dumps({category: 1 / len(CATEGORY_TAXONOMY) for category in CATEGORY_TAXONOMY}),
            json.dumps([]),
            iso_now(),
        ),
    )
    conn.commit()
    user = fetch_one(conn, "select * from users where user_id = ?", (user_id,))
    return {"user": user, "access_token": create_token(user)}


@app.post("/api/auth/login")
def login(payload: LoginRequest, conn=Depends(db)) -> dict[str, Any]:
    user = fetch_one(conn, "select * from users where email = ?", (payload.email.lower(),))
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return {"user": user, "access_token": create_token(user)}


@app.get("/api/auth/me")
def me(user=Depends(require_user)) -> dict[str, Any]:
    with get_db() as conn:
        membership = get_latest_membership(conn, user["user_id"])
        return {
            "user": user,
            "community_id": membership["community_id"] if membership else None,
            "wishlist_count": fetch_one(conn, "select count(*) as c from unified_wishlist_items where user_id = ?", (user["user_id"],))["c"],
        }


@app.delete("/api/auth/me/data")
def delete_my_data(user=Depends(require_user), conn=Depends(db)) -> dict[str, Any]:
    conn.execute("delete from users where user_id = ?", (user["user_id"],))
    conn.commit()
    return {"deleted": True}


@app.post("/api/onboarding/preferences")
def onboarding_preferences(payload: CategoryPreferencesRequest, user=Depends(require_user), conn=Depends(db)) -> dict[str, Any]:
    answers = [answer for answer in payload.answers if answer]
    conn.execute("delete from onboarding_preferences where user_id = ?", (user["user_id"],))
    conn.execute(
        "insert into onboarding_preferences (user_id, answers_json, created_at) values (?, ?, ?)",
        (user["user_id"], json.dumps(answers), iso_now()),
    )
    behavior = json_maybe_load(user.get("behavior_vector"), {})
    for category in answers:
        behavior[category] = round(float(behavior.get(category, 0.0)) + 0.10, 6)
    total = sum(float(v) for v in behavior.values()) or 1.0
    behavior = {key: round(float(value) / total, 6) for key, value in behavior.items()}
    conn.execute(
        "update users set onboarding_answers = ?, behavior_vector = ? where user_id = ?",
        (json.dumps(answers), json.dumps(behavior), user["user_id"]),
    )
    conn.commit()
    return {"answers": answers, "saved": True}


@app.post("/api/platforms/connect")
def connect_platform(payload: PlatformConnectRequest, user=Depends(require_user), conn=Depends(db)) -> dict[str, Any]:
    # Opening setup instructions must never make a store look connected. A
    # connection is created only by a successful extension sync below.
    return {"platform": payload.platform, "status": "ready_to_sync"}


def ensure_platform_connection(conn, user_id: str, platform: str) -> str:
    existing = fetch_one(conn, "select * from platform_connections where user_id = ? and platform = ?", (user_id, platform))
    if existing:
        return existing["connection_id"]
    connection_id = new_id()
    conn.execute(
        """
        insert into platform_connections (connection_id, user_id, platform, auth_token, connected_at, last_synced_at, sync_confirmed_at)
        values (?, ?, ?, null, ?, null, null)
        """,
        (connection_id, user_id, platform, iso_now()),
    )
    return connection_id


@app.get("/api/platforms")
def list_platforms(user=Depends(require_user), conn=Depends(db)) -> dict[str, Any]:
    connections = fetch_all(
        conn,
        """
        select connection_id, platform, connected_at, last_synced_at
        from platform_connections
        where user_id = ? and sync_confirmed_at is not null
        order by connected_at desc
        """,
        (user["user_id"],),
    )
    return {"connections": connections}


@app.delete("/api/platforms/{connection_id}")
def disconnect_platform(connection_id: str, user=Depends(require_user), conn=Depends(db)) -> dict[str, Any]:
    conn.execute("delete from platform_connections where connection_id = ? and user_id = ?", (connection_id, user["user_id"]))
    conn.commit()
    return {"deleted": True}


@app.post("/api/wishlist/sync")
def sync_wishlist(payload: dict[str, Any], user=Depends(require_user), conn=Depends(db)) -> dict[str, Any]:
    platform = (payload.get("platform") or "manual").lower()
    items = payload.get("items") or []
    if not isinstance(items, list):
        raise HTTPException(status_code=400, detail="items must be a list")
    if not items:
        raise HTTPException(status_code=400, detail="no wishlist items were found")
    connection_id = ensure_platform_connection(conn, user["user_id"], platform)
    result = add_raw_items(conn, user["user_id"], platform, items, connection_id=connection_id)
    now = iso_now()
    conn.execute(
        "update platform_connections set last_synced_at = ?, sync_confirmed_at = ? where connection_id = ?",
        (now, now, connection_id),
    )
    conn.commit()
    return result


@app.post("/api/wishlist/import-csv")
def import_wishlist_csv(file: UploadFile = File(...), user=Depends(require_user), conn=Depends(db)) -> dict[str, Any]:
    contents = file.file.read().decode("utf-8", errors="ignore")
    result = import_csv_items(conn, user["user_id"], contents)
    conn.commit()
    return result


@app.get("/api/wishlist")
def get_wishlist(user=Depends(require_user), conn=Depends(db)) -> dict[str, Any]:
    items = fetch_all(
        conn,
        """
        select u.*, u.source_url as url, p.source_platform, p.brand
        from unified_wishlist_items u
        left join products p on p.product_id = u.canonical_product_id
        where u.user_id = ?
        order by u.added_at desc
        """,
        (user["user_id"],),
    )
    return {"items": items, "count": len(items)}


@app.post("/api/wishlist/items")
def add_wishlist_item(payload: WishlistItemCreate, user=Depends(require_user), conn=Depends(db)) -> dict[str, Any]:
    platform = payload.platform or "manual"
    item = {
        "platform": platform,
        "title": payload.title,
        "price": payload.price,
        "category": payload.category,
        "platform_product_id": payload.platform_product_id,
        "raw_payload": payload.raw_payload or {},
    }
    result = add_raw_items(conn, user["user_id"], platform, [item])
    conn.commit()
    return result


@app.delete("/api/wishlist/items/{item_id}")
def delete_wishlist_item(item_id: str, user=Depends(require_user), conn=Depends(db)) -> dict[str, Any]:
    conn.execute("delete from unified_wishlist_items where unified_item_id = ? and user_id = ?", (item_id, user["user_id"]))
    conn.commit()
    return {"deleted": True}


@app.delete("/api/wishlist")
def clear_wishlist(platform: str | None = Query(default=None), user=Depends(require_user), conn=Depends(db)) -> dict[str, Any]:
    user_id = user["user_id"]
    plat_lower = (platform or "all").strip().lower()

    if plat_lower in ["all", "null", "undefined", ""]:
        conn.execute("delete from unified_wishlist_items where user_id = ?", (user_id,))
        conn.execute("delete from wishlist_items_raw where user_id = ?", (user_id,))
        conn.execute("delete from recommendations where user_id = ?", (user_id,))
        conn.execute("update users set behavior_vector = '{}' where user_id = ?", (user_id,))
    else:
        conn.execute("delete from wishlist_items_raw where user_id = ? and lower(platform) = ?", (user_id, plat_lower))
        conn.execute(
            """
            delete from unified_wishlist_items
            where user_id = ? and (
                lower(source_platforms) like ?
                or lower(source_platforms) = ?
                or lower(source_platforms) like ?
                or canonical_product_id in (select product_id from products where lower(source_platform) = ?)
            )
            """,
            (user_id, f'%"{plat_lower}"%', plat_lower, f'%{plat_lower}%', plat_lower),
        )

        all_remaining = fetch_all(conn, "select * from unified_wishlist_items where user_id = ?", (user_id,))
        for item in all_remaining:
            sp_str = str(item.get("source_platforms") or "").lower()
            if plat_lower in sp_str:
                conn.execute("delete from unified_wishlist_items where unified_item_id = ?", (item["unified_item_id"],))

    conn.commit()
    remaining = fetch_all(
        conn,
        """
        select u.*, u.source_url as url, p.source_platform, p.brand
        from unified_wishlist_items u
        left join products p on p.product_id = u.canonical_product_id
        where u.user_id = ?
        order by u.added_at desc
        """,
        (user_id,),
    )
    return {"deleted": True, "count": len(remaining), "items": remaining}


def recommendation_response(conn, user, top_n: int, query_text: str | None = None, refresh: bool = False) -> dict[str, Any]:
    try:
        if not refresh and not query_text:
            existing = latest_recommendations(conn, user["user_id"], top_n)
            if existing and len(existing) >= top_n:
                return {
                    "recommendations": [normalize_recommendation_row(row, include_debug=user["role"] == "admin") for row in existing[:top_n]],
                    "community_id": get_latest_membership(conn, user["user_id"])["community_id"] if get_latest_membership(conn, user["user_id"]) else None,
                    "generated_at": existing[0].get("generated_at") or iso_now(),
                }

        query_vector = build_query_vector(conn, user["user_id"], query_text)
        personalized, meta = score_products(conn, user["user_id"], query_vector, top_n, query_text=query_text, refresh=refresh)
        ranked = meta["ranked"]
        conn.execute("delete from recommendations where user_id = ?", (user["user_id"],))
        conn.commit()
        persisted = persist_recommendations(conn, user["user_id"], personalized, ranked, generated_by="search" if query_text else "recommendations")
        include_debug = user["role"] == "admin"
        recommendation_items = [
            {
                "recommendation_id": item["recommendation_id"],
                "product": normalize_recommendation_product(item["product"]),
                "rank": item["rank"],
                "final_score": item["final_score"],
                "explanation": item["explanation"],
                **({"debug_scores": {
                    "wishlist_similarity": item["wishlist_similarity"],
                    "community_preference": item["community_preference"],
                    "trending_score": item["trending_score"],
                    "browsing_history_score": item["browsing_history_score"],
                }} if include_debug else {}),
            }
            for item in persisted[:top_n]
        ]
        return {"recommendations": recommendation_items, "community_id": meta.get("community_id"), "generated_at": iso_now()}
    except Exception as exc:
        import traceback
        print("RECOMMENDATION RESPONSE ERROR:", exc)
        traceback.print_exc()
        fallback = latest_recommendations(conn, user["user_id"], top_n)
        if fallback:
            return {
                "recommendations": [normalize_recommendation_row(row, include_debug=user["role"] == "admin") for row in fallback[:top_n]],
                "community_id": get_latest_membership(conn, user["user_id"])["community_id"] if get_latest_membership(conn, user["user_id"]) else None,
                "generated_at": iso_now(),
            }
        products = paginated_products(conn, limit=top_n)
        recommendations = []
        for idx, product in enumerate(products, start=1):
            recommendations.append(
                {
                    "recommendation_id": new_id(),
                    "product": {
                        "product_id": product["product_id"],
                        "title": product["title"],
                        "category": product["category"],
                        "brand": product["brand"],
                        "price": product["price"],
                        "source_platform": product["source_platform"],
                        "avg_rating": product["avg_rating"],
                    },
                    "rank": idx,
                    "final_score": 0.0,
                    "explanation": f"{product['title']} is a broad match for your wishlist style.",
                }
            )
        return {"recommendations": recommendations, "community_id": None, "generated_at": iso_now()}


@app.get("/api/recommendations", response_model=RecommendationsResponse)
def get_recommendations(
    user=Depends(require_user),
    conn=Depends(db),
    n: int = Query(default=settings.top_n_default, ge=1, le=20),
    refresh: bool = Query(default=False),
) -> dict[str, Any]:
    return recommendation_response(conn, user, n, refresh=refresh)


@app.get("/api/recommendations/{recommendation_id}/explanation")
def recommendation_explanation(recommendation_id: str, user=Depends(require_user), conn=Depends(db)) -> dict[str, Any]:
    row = recommendation_by_id(conn, recommendation_id, user["user_id"])
    if not row:
        raise HTTPException(status_code=404, detail="Recommendation not found")
    return {
        "recommendation_id": row["recommendation_id"],
        "explanation": row["explanation_text"],
        "debug_scores": {
            "wishlist_similarity": row["wishlist_similarity"],
            "community_preference": row["community_preference"],
            "trending_score": row["trending_score"],
            "browsing_history_score": row["browsing_history_score"],
        } if user["role"] == "admin" else None,
    }


@app.post("/api/recommendations/{recommendation_id}/feedback")
def submit_feedback(recommendation_id: str, payload: RecommendationFeedbackRequest, user=Depends(require_user), conn=Depends(db)) -> dict[str, Any]:
    try:
        nudge_res = feedback_nudge(conn, user["user_id"], recommendation_id, payload.action, payload.rating_value)
        conn.commit()
        reco_res = recommendation_response(conn, user, 10, refresh=True)
        return {**nudge_res, **reco_res}
    except Exception as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@app.get("/api/search")
def search(
    q: str = Query(default=""),
    user=Depends(require_user),
    conn=Depends(db),
    n: int = Query(default=settings.top_n_default, ge=1, le=20),
) -> dict[str, Any]:
    query_str = q.strip().lower()
    if not query_str:
        raise HTTPException(status_code=400, detail="q is required")

    query_tokens = [w for w in re.split(r"[\s\-_]+", query_str) if w]
    accessory_keywords = {"case", "cover", "sleeve", "bag", "mouse", "keyboard", "charger", "cable", "adapter", "stand", "holder", "strap", "guard", "protector", "skin", "pouch"}
    has_accessory_term = any(w in accessory_keywords for w in query_tokens)

    all_products = fetch_all(conn, "select * from products")
    matching_products = []
    for product in all_products:
        if not is_valid_product(product.get("title"), product.get("price")):
            continue
        title = (product.get("title") or "").lower()
        category = (product.get("category") or "").lower()
        brand = (product.get("brand") or "").lower()
        full_text = f"{title} {category} {brand}"

        # If user searched for an accessory like "laptop case", product MUST contain at least one accessory keyword
        if has_accessory_term and not any(acc in full_text for acc in accessory_keywords):
            continue

        non_acc_tokens = [w for w in query_tokens if w not in accessory_keywords]
        if non_acc_tokens and not all(t in full_text for t in non_acc_tokens):
            continue

        token_matches = sum(1 for token in query_tokens if token in full_text)
        matching_products.append((token_matches, product))

    # If strict token match returned few results, try matching most tokens
    if not matching_products and len(query_tokens) > 1:
        for product in all_products:
            if not is_valid_product(product.get("title"), product.get("price")):
                continue
            title = (product.get("title") or "").lower()
            category = (product.get("category") or "").lower()
            brand = (product.get("brand") or "").lower()
            full_text = f"{title} {category} {brand}"

            if has_accessory_term and not any(acc in full_text for acc in accessory_keywords if acc in query_tokens or acc in query_str):
                continue

            matches = sum(1 for token in query_tokens if token in full_text)
            if matches >= len(query_tokens) - 1 and matches > 0:
                matching_products.append((matches, product))

    # Sort matching products by match score and rating
    matching_products.sort(
        key=lambda item: (
            0 if query_str in (item[1].get("title") or "").lower() else 1,
            -item[0],
            -(item[1].get("avg_rating") or 0),
        )
    )

    results = []
    for idx, (_, product) in enumerate(matching_products[:n], start=1):
        explanation = f"Matches your search query for '{q}' with verified availability on {product.get('source_platform', 'store').capitalize()}."
        results.append(
            {
                "recommendation_id": new_id(),
                "product": {
                    "product_id": product["product_id"],
                    "title": product["title"],
                    "category": product["category"],
                    "brand": product["brand"],
                    "price": product["price"],
                    "source_platform": product["source_platform"],
                    "avg_rating": product["avg_rating"],
                },
                "rank": idx,
                "final_score": round(product.get("avg_rating", 4.5) / 5.0, 3),
                "explanation": explanation,
            }
        )
    return {"recommendations": results, "community_id": None, "generated_at": iso_now()}


@app.get("/api/admin/users")
def admin_users(user=Depends(require_admin), conn=Depends(db)) -> dict[str, Any]:
    return {"users": paginated_users(conn, limit=200)}


@app.get("/api/admin/products")
def admin_products(user=Depends(require_admin), conn=Depends(db)) -> dict[str, Any]:
    return {"products": paginated_products(conn, limit=200)}


@app.put("/api/admin/products/{product_id}")
def update_product(product_id: str, payload: dict[str, Any], user=Depends(require_admin), conn=Depends(db)) -> dict[str, Any]:
    fields = []
    values: list[Any] = []
    for key in ["title", "category", "brand", "price", "description", "avg_rating", "review_count", "source_platform"]:
        if key in payload:
            fields.append(f"{key} = ?")
            values.append(payload[key])
    if not fields:
        raise HTTPException(status_code=400, detail="No editable fields provided")
    values.append(iso_now())
    values.append(product_id)
    conn.execute(f"update products set {', '.join(fields)}, last_updated = ? where product_id = ?", values)
    conn.commit()
    return {"updated": True}


@app.get("/api/admin/metrics")
def metrics(user=Depends(require_admin), conn=Depends(db)) -> dict[str, Any]:
    return admin_metrics(conn)


@app.get("/api/admin/reports")
def reports(user=Depends(require_admin), conn=Depends(db)) -> dict[str, Any]:
    return admin_reports(conn)


@app.get("/api/admin/agent-jobs")
def admin_agent_jobs(user=Depends(require_admin), conn=Depends(db)) -> dict[str, Any]:
    jobs = fetch_all(
        conn,
        """
        select stage, status, duration_ms, retry_count, error_message, created_at, user_id
        from agent_job_log
        order by created_at desc
        limit 100
        """,
    )
    return {"jobs": jobs}


@app.post("/internal/jobs/rebuild-community-graph", status_code=202)
async def rebuild_graph_now(user=Depends(require_admin)) -> dict[str, Any]:
    job_id = new_id()

    async def _job():
        await run_batch_graph_job()

    asyncio.create_task(_job())
    return {"job_id": job_id, "status": "RUNNING"}


@app.exception_handler(HTTPException)
def http_exception_handler(_, exc: HTTPException):
    return json_error("HTTP_ERROR", str(exc.detail), exc.status_code)
