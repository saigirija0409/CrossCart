"""Fill the demo account with a presentable cross-store wishlist.

A fresh database gives the demo user an empty wishlist, which makes for a
poor first screen. This pushes a curated set through the same
/api/wishlist/sync endpoint the Chrome extension uses, so nothing here is a
special case — it is exactly what a real sync produces.

Titles are chosen from brands that ship a logo in apps/web/public/brands/products,
and a few products appear on two stores so the merged "+N" badge is visible.

Usage: python scripts/demo_seed.py [API_BASE]
"""

from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request

API = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000").rstrip("/")
EMAIL = "demo@wishlist.local"
PASSWORD = "Demo1234!"

WISHLISTS: dict[str, list[dict[str, object]]] = {
    "amazon": [
        {"title": "Sony WH-1000XM5 Wireless Noise Cancelling Headphones", "price": 29990, "category": "Audio"},
        {"title": "Samsung Galaxy Watch6 Bluetooth Smartwatch", "price": 27999, "category": "Wearables"},
        {"title": "Apple iPad 10th Gen 64GB WiFi", "price": 34900, "category": "Electronics"},
        {"title": "JBL Flip 6 Portable Bluetooth Speaker", "price": 9499, "category": "Audio"},
        {"title": "Philips Air Fryer HD9252 4.1L", "price": 8995, "category": "Appliances"},
        {"title": "Lego Classic Creative Bricks Box", "price": 3499, "category": "Kids"},
        {"title": "Nike Air Force 1 '07 LV8 Men's Shoes", "price": 9295, "category": "Footwear"},
    ],
    "flipkart": [
        {"title": "boAt Airdopes 141 Wireless Earbuds", "price": 1299, "category": "Audio"},
        {"title": "Samsung Galaxy Watch6 Bluetooth Smartwatch", "price": 26499, "category": "Wearables"},
        {"title": "Xiaomi Redmi Note 13 Pro 5G", "price": 25999, "category": "Electronics"},
        {"title": "Prestige Induction Cooktop 1900W", "price": 2799, "category": "Appliances"},
        {"title": "Titan Neo Analog Watch for Men", "price": 4995, "category": "Wearables"},
    ],
    "myntra": [
        {"title": "Tommy Hilfiger Men Black Patterned Dial Analogue Watch", "price": 15000, "category": "Wearables"},
        {"title": "Levis Men Slim Fit Mid Rise Jeans", "price": 3499, "category": "Fashion"},
        {"title": "Puma Softride Running Shoes", "price": 4499, "category": "Footwear"},
        {"title": "New Balance Unisex WRPD Suede Everyday Sneakers", "price": 8999, "category": "Footwear"},
        {"title": "Nike Air Force 1 '07 LV8 Men's Shoes", "price": 9295, "category": "Footwear"},
        {"title": "Lacoste Men White Analogue Watch", "price": 7950, "category": "Wearables"},
    ],
    "ajio": [
        {"title": "Adidas Men Ultraboost Light Running Shoes", "price": 15999, "category": "Footwear"},
        {"title": "Zara Oversized Cotton Poplin Shirt", "price": 2990, "category": "Fashion"},
        {"title": "Diesel Men Red Patterned Analogue Watch", "price": 18995, "category": "Wearables"},
        {"title": "Skechers Go Walk Everyday Slides", "price": 2799, "category": "Footwear"},
    ],
    "tatacliq": [
        {"title": "Fossil Machine Chronograph Men Watch", "price": 12995, "category": "Wearables"},
        {"title": "Casio G-Shock GX-56BB Digital Watch", "price": 10995, "category": "Wearables"},
        {"title": "Ikea Malm Bedside Table", "price": 6990, "category": "Furniture"},
    ],
    "nykaa": [
        {"title": "Dot & Key Dragon Fruit Bounce Jelly Moisturizer", "price": 429, "category": "Beauty"},
        {"title": "Lakme Absolute Skin Dew Satin Serum Foundation", "price": 1250, "category": "Beauty"},
        {"title": "Mamaearth Vitamin C Face Wash", "price": 249, "category": "Personal Care"},
        {"title": "Nivea Soft Light Moisturising Cream", "price": 325, "category": "Personal Care"},
        {"title": "The Body Shop Tea Tree Skin Clearing Toner", "price": 1095, "category": "Beauty"},
    ],
}


def call(path: str, payload: dict | None = None, token: str | None = None) -> dict:
    body = json.dumps(payload).encode() if payload is not None else None
    request = urllib.request.Request(f"{API}{path}", data=body, method="POST" if body else "GET")
    request.add_header("Content-Type", "application/json")
    if token:
        request.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode())


def main() -> int:
    try:
        token = call("/api/auth/login", {"email": EMAIL, "password": PASSWORD})["access_token"]
    except urllib.error.URLError as exc:
        print(f"could not reach the API at {API} ({exc}) — start the backend first")
        return 1

    total = 0
    for platform, items in WISHLISTS.items():
        payload = [dict(item, platform=platform, platform_product_id=f"{platform}-{index}") for index, item in enumerate(items)]
        result = call("/api/wishlist/sync", {"platform": platform, "items": payload}, token)
        merged = result.get("unified") or result.get("normalized") or len(payload)
        total += len(payload)
        print(f"  {platform:<9} {len(payload):>2} items synced (unified: {merged})")

    wishlist = call("/api/wishlist", token=token)
    print(f"\ndemo wishlist ready: {total} raw items -> {len(wishlist.get('items', []))} unified across {len(WISHLISTS)} stores")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
