from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from pydantic import BaseModel, Field


class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str = Field(min_length=6)
    role: Literal["user", "admin"] = "user"


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class CategoryPreferencesRequest(BaseModel):
    answers: list[str]


class PlatformConnectRequest(BaseModel):
    platform: Literal["amazon", "flipkart", "myntra", "ajio"]
    auth_token: str | None = None


class WishlistItemCreate(BaseModel):
    title: str
    category: str | None = None
    price: float | None = None
    platform: str = "manual"
    platform_product_id: str | None = None
    raw_payload: dict[str, Any] | None = None


class CsvImportResponse(BaseModel):
    imported: int
    duplicates_merged: int
    unified_wishlist_size: int


class RecommendationFeedbackRequest(BaseModel):
    action: Literal["like", "dislike", "rating"]
    rating_value: int | None = Field(default=None, ge=1, le=5)


class RecommendationProduct(BaseModel):
    product_id: str
    title: str
    category: str
    brand: str | None = None
    price: float | None = None
    source_platform: str | None = None
    avg_rating: float | None = None


class RecommendationItem(BaseModel):
    recommendation_id: str
    product: RecommendationProduct
    rank: int
    final_score: float
    explanation: str
    debug_scores: dict[str, float] | None = None


class RecommendationsResponse(BaseModel):
    recommendations: list[RecommendationItem]
    community_id: str | None = None
    generated_at: datetime


class FeedbackResponse(BaseModel):
    feedback_id: str
    behavior_vector_updated: bool


RegisterRequest.model_rebuild()
LoginRequest.model_rebuild()
TokenResponse.model_rebuild()
CategoryPreferencesRequest.model_rebuild()
PlatformConnectRequest.model_rebuild()
WishlistItemCreate.model_rebuild()
CsvImportResponse.model_rebuild()
RecommendationFeedbackRequest.model_rebuild()
RecommendationProduct.model_rebuild()
RecommendationItem.model_rebuild()
RecommendationsResponse.model_rebuild()
FeedbackResponse.model_rebuild()
