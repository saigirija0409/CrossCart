from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import os


ROOT_DIR = Path(__file__).resolve().parents[3]
DATA_DIR = ROOT_DIR / "data"
DB_PATH = DATA_DIR / "app.db"
PERSONAS_PATH = DATA_DIR / "personas.json"


@dataclass(frozen=True)
class Settings:
    secret_key: str = os.getenv("SECRET_KEY", "dev-secret-key")
    frontend_url: str = os.getenv("FRONTEND_URL", "http://localhost:5173")
    community_graph_refresh_hours: int = int(os.getenv("COMMUNITY_GRAPH_REFRESH_HOURS", "24"))
    top_n_default: int = int(os.getenv("TOP_N_DEFAULT", "10"))
    community_similarity_threshold: float = float(os.getenv("COMMUNITY_SIMILARITY_THRESHOLD", "0.15"))
    weight_wishlist_sim: float = float(os.getenv("WEIGHT_WISHLIST_SIM", "0.40"))
    weight_community_pref: float = float(os.getenv("WEIGHT_COMMUNITY_PREF", "0.30"))
    weight_trending: float = float(os.getenv("WEIGHT_TRENDING", "0.20"))
    weight_browsing: float = float(os.getenv("WEIGHT_BROWSING", "0.10"))


settings = Settings()

