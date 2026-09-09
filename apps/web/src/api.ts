export type AuthUser = {
  user_id: string;
  name: string;
  email: string;
  role: "user" | "admin";
  persona_tag?: string | null;
  behavior_vector?: Record<string, number>;
  onboarding_answers?: string[];
};

export type WishlistItem = {
  unified_item_id: string;
  title: string;
  category: string;
  price: number | null;
  source_platforms: string[] | string;
  added_at: string;
  source_platform?: string;
  platform?: string;
  url?: string;
  brand?: string | null;
};

export type PlatformConnection = {
  connection_id: string;
  platform: string;
  connected_at: string;
  last_synced_at: string | null;
};

export type AgentJob = {
  stage: string;
  status: "SUCCESS" | "FAILED" | "RUNNING";
  duration_ms: number | null;
  retry_count: number;
  error_message: string | null;
  created_at: string;
  user_id: string | null;
};

export type Recommendation = {
  recommendation_id: string;
  product: {
    product_id: string;
    title: string;
    category: string;
    brand?: string | null;
    price?: number | null;
    source_platform?: string | null;
    avg_rating?: number | null;
    url?: string | null;
    image_url?: string | null;
  };
  rank: number;
  final_score: number;
  explanation: string;
  debug_scores?: {
    wishlist_similarity: number;
    community_preference: number;
    trending_score: number;
    browsing_history_score: number;
  };
};

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

async function request<T>(path: string, options: RequestInit = {}, token?: string | null): Promise<T> {
  const headers = new Headers(options.headers ?? {});
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (!headers.has("Content-Type") && options.body && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!response.ok) {
    let message = response.statusText;
    try {
      const body = await response.json();
      message = body?.error?.message ?? body?.detail ?? message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export const api = {
  register: (payload: { name: string; email: string; password: string }) =>
    request<{ user: AuthUser; access_token: string }>("/api/auth/register", { method: "POST", body: JSON.stringify(payload) }),
  login: (payload: { email: string; password: string }) =>
    request<{ user: AuthUser; access_token: string }>("/api/auth/login", { method: "POST", body: JSON.stringify(payload) }),
  me: (token: string) => request<{ user: AuthUser; community_id: string | null; wishlist_count: number }>("/api/auth/me", {}, token),
  onboarding: (token: string, answers: string[]) =>
    request<{ answers: string[]; saved: boolean }>("/api/onboarding/preferences", { method: "POST", body: JSON.stringify({ answers }) }, token),
  wishlist: (token: string) => request<{ items: WishlistItem[]; count: number }>("/api/wishlist", {}, token),
  platforms: (token: string) => request<{ connections: PlatformConnection[] }>("/api/platforms", {}, token),
  importCsv: async (token: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<{ imported: number; duplicates_merged: number; unified_wishlist_size: number }>("/api/wishlist/import-csv", {
      method: "POST",
      body: form,
    }, token);
  },
  addWishlistItem: (token: string, payload: { title: string; category?: string; price?: number; platform?: string; platform_product_id?: string }) =>
    request("/api/wishlist/items", { method: "POST", body: JSON.stringify(payload) }, token),
  addItem: (token: string, payload: { title: string; category?: string; price?: number; platform?: string; platform_product_id?: string }) =>
    request("/api/wishlist/items", { method: "POST", body: JSON.stringify(payload) }, token),
  deleteWishlistItem: (token: string, itemId: string) => request(`/api/wishlist/items/${itemId}`, { method: "DELETE" }, token),
  removeItem: (token: string, itemId: string) => request(`/api/wishlist/items/${itemId}`, { method: "DELETE" }, token),
  clearWishlist: (token: string, platform?: string) =>
    request(`/api/wishlist${platform ? `?platform=${encodeURIComponent(platform)}` : ""}`, { method: "DELETE" }, token),
  connectPlatform: (token: string, platform: string) => request("/api/platforms/connect", { method: "POST", body: JSON.stringify({ platform }) }, token),
  disconnectPlatform: (token: string, connectionId: string) => request(`/api/platforms/${connectionId}`, { method: "DELETE" }, token),
  recommendations: (token: string, n = 10, refresh = false) =>
    request<{ recommendations: Recommendation[]; community_id: string | null; generated_at: string }>(`/api/recommendations?n=${n}${refresh ? "&refresh=true" : ""}`, {}, token),
  explanation: (token: string, recommendationId: string) =>
    request<{ recommendation_id: string; explanation: string; debug_scores?: Recommendation["debug_scores"] | null }>(`/api/recommendations/${recommendationId}/explanation`, {}, token),
  feedback: (token: string, recommendationId: string, payload: { action: "like" | "dislike" | "rating"; rating_value?: number }) =>
    request(`/api/recommendations/${recommendationId}/feedback`, { method: "POST", body: JSON.stringify(payload) }, token),
  search: (token: string, query: string, n = 10) => request<{ recommendations: Recommendation[]; community_id: string | null; generated_at: string }>(`/api/search?q=${encodeURIComponent(query)}&n=${n}`, {}, token),
  adminUsers: (token: string) => request<{ users: AuthUser[] }>("/api/admin/users", {}, token),
  adminProducts: (token: string) => request<{ products: any[] }>("/api/admin/products", {}, token),
  adminMetrics: (token: string) => request<any>("/api/admin/metrics", {}, token),
  adminReports: (token: string) => request<any>("/api/admin/reports", {}, token),
  adminJobs: (token: string) => request<{ jobs: AgentJob[] }>("/api/admin/agent-jobs", {}, token),
  updateProduct: (token: string, productId: string, payload: Record<string, unknown>) =>
    request(`/api/admin/products/${productId}`, { method: "PUT", body: JSON.stringify(payload) }, token),
  rebuildGraph: (token: string) => request("/internal/jobs/rebuild-community-graph", { method: "POST" }, token),
};
