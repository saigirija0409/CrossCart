import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ComponentType, type ReactNode } from "react";
import { BRAND_LOGO_SLUGS } from "./brandLogos";
import { api, type AuthUser, type PlatformConnection, type Recommendation, type WishlistItem } from "./api";
import {
  IconAlert, IconBox, IconCheck, IconClose, IconExternal, IconEyeOff, IconGrid, IconHeart, IconInfo,
  IconLayers, IconLink, IconLogout, IconMenu, IconMoon, IconPlus, IconRefresh, IconSearch, IconShield,
  IconSparkles, IconStar, IconStore, IconSun, IconThumbUp, IconTrash, IconUpload, IconUsers,
} from "./icons";

/* ------------------------------------------------------------------ config */

type ViewName = "overview" | "wishlist" | "recommendations" | "search" | "admin";
type AuthMode = "login" | "register";
type Theme = "dark" | "light";

const VIEWS: { key: ViewName; label: string; icon: ComponentType<{ size?: number }>; title: string; subtitle: string; adminOnly?: boolean }[] = [
  { key: "overview", label: "Overview", icon: IconGrid, title: "Overview", subtitle: "Connected stores and wishlist health at a glance." },
  { key: "wishlist", label: "Wishlist", icon: IconHeart, title: "Unified wishlist", subtitle: "Everything you saved, merged across every store." },
  { key: "recommendations", label: "For you", icon: IconSparkles, title: "Your discovery mix", subtitle: "Relevant to your wishlist, balanced across categories, shaped by your feedback." },
  { key: "search", label: "Search", icon: IconSearch, title: "Personalized search", subtitle: "Search the catalog, ranked against your taste profile." },
  { key: "admin", label: "Admin", icon: IconShield, title: "Admin console", subtitle: "Platform metrics, catalog and account overview.", adminOnly: true },
];

const PLATFORM_OPTIONS = ["amazon", "flipkart", "myntra", "ajio", "tatacliq", "nykaa"] as const;

const CATEGORY_OPTIONS = [
  "Electronics", "Computers", "Audio", "Gaming", "Fashion", "Footwear", "Accessories",
  "Home & Kitchen", "Furniture", "Decor", "Appliances", "Fitness", "Sports", "Wellness",
  "Wearables", "Books", "Stationery", "Office Supplies", "Education", "Beauty",
  "Personal Care", "Groceries", "Kids",
];

const DEMO_EMAIL = "demo@wishlist.local";
const DEMO_PASSWORD = "Demo1234!";

type PlatformInfo = {
  key: string;
  name: string;
  url: string;
  icon: string;
  color: string;
  /* Builds an on-store search URL. The catalog has no per-product links, so a
     search on the product's own store is how we send people to buy it. */
  search: (query: string) => string;
};

const q = encodeURIComponent;

const PLATFORMS: Record<string, PlatformInfo> = {
  amazon: {
    key: "amazon", name: "Amazon", url: "https://www.amazon.in/hz/wishlist/ls", icon: "AZ", color: "#ff9900",
    search: (t) => `https://www.amazon.in/s?k=${q(t)}`,
  },
  flipkart: {
    key: "flipkart", name: "Flipkart", url: "https://www.flipkart.com/wishlist", icon: "FK", color: "#2874f0",
    search: (t) => `https://www.flipkart.com/search?q=${q(t)}`,
  },
  myntra: {
    key: "myntra", name: "Myntra", url: "https://www.myntra.com/wishlist", icon: "MY", color: "#ff3f6c",
    search: (t) => `https://www.myntra.com/${q(t.trim().replace(/\s+/g, "-").toLowerCase())}?rawQuery=${q(t)}`,
  },
  ajio: {
    key: "ajio", name: "Ajio", url: "https://www.ajio.com/wishlist", icon: "AJ", color: "#2d4a7a",
    search: (t) => `https://www.ajio.com/search/?text=${q(t)}`,
  },
  tatacliq: {
    key: "tatacliq", name: "Tata CLiQ", url: "https://www.tatacliq.com/wishlist", icon: "TC", color: "#e21936",
    search: (t) => `https://www.tatacliq.com/search/?searchCategory=all&text=${q(t)}`,
  },
  nykaa: {
    key: "nykaa", name: "Nykaa", url: "https://www.nykaa.com/wishlist", icon: "NY", color: "#fc2779",
    search: (t) => `https://www.nykaa.com/search/result/?q=${q(t)}`,
  },
};

function platformInfo(key: string): PlatformInfo {
  return PLATFORMS[key] ?? {
    key,
    name: key.charAt(0).toUpperCase() + key.slice(1),
    url: `https://www.${key}.com`,
    icon: key.slice(0, 2).toUpperCase(),
    color: "#8fa7c5",
    search: (t) => `https://www.${key}.com/search?q=${q(t)}`,
  };
}

/* Sync steps are identical everywhere except the store name, so build them. */
function syncSteps(name: string) {
  return [
    { title: `Open your ${name} wishlist`, desc: `Use the button below to open ${name} in a new tab.` },
    { title: "Sign in and view the wishlist page", desc: `Make sure you are logged into ${name} and looking at your saved items.` },
    { title: "Open the CrossCart extension", desc: "Click the CrossCart icon in your browser toolbar, usually top-right." },
    { title: "Click 'Sync Wishlist'", desc: "The extension reads the items on the page and sends them to CrossCart." },
    { title: "Come back here", desc: "Your unified wishlist and recommendations update automatically." },
  ];
}

/* ------------------------------------------------------------------ helpers */

const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

function formatPrice(value?: number | null) {
  return value == null ? null : `₹${inr.format(Math.round(value))}`;
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0] ?? "").join("").toUpperCase() || "U";
}

const BRANDED = new Set<string>(PLATFORM_OPTIONS);

/* Only the six stores ship a logo; "manual" and anything unknown fall back. */
function isBranded(key: string) {
  return BRANDED.has(key.trim().toLowerCase());
}

function itemPlatforms(item: WishlistItem): string[] {
  if (Array.isArray(item.source_platforms)) return item.source_platforms;
  const raw = item.source_platforms || item.platform || item.source_platform || "";
  return String(raw).split(/[,\s]+/).filter(Boolean);
}

function matchesPlatform(item: WishlistItem, platform: string) {
  return itemPlatforms(item).join(" ").toLowerCase().includes(platform.toLowerCase());
}

/* Pull the flat numeric/string leaves out of an admin payload for KV tiles. */
function summarize(payload: unknown, limit = 8): [string, string][] {
  if (!payload || typeof payload !== "object") return [];
  return Object.entries(payload as Record<string, unknown>)
    .filter(([, value]) => typeof value === "number" || typeof value === "string")
    .slice(0, limit)
    .map(([key, value]) => [
      key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      typeof value === "number" ? (Number.isInteger(value) ? String(value) : value.toFixed(3)) : String(value),
    ]);
}

/* -------------------------------------------------------------- primitives */

function Backdrop() {
  return (
    <div className="backdrop" aria-hidden="true">
      <div className="blob blob-1" />
      <div className="blob blob-2" />
      <div className="blob blob-3" />
    </div>
  );
}

/* Brand marks are the stores' own app icons, self-hosted under public/brands.
   If one is missing the tile falls back to a lettered chip in the brand colour. */
function PlatformLogo({ info, size = 40 }: { info: PlatformInfo; size?: number }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        className="platform-logo platform-logo-fallback"
        style={{
          width: size,
          height: size,
          background: `linear-gradient(135deg, ${info.color}, ${info.color}99)`,
          fontSize: size < 34 ? "0.7rem" : undefined,
        }}
        aria-hidden="true"
      >
        {info.icon}
      </div>
    );
  }

  return (
    <div
      className="platform-logo"
      style={{ width: size, height: size, padding: Math.max(1, Math.round(size * 0.1)), borderRadius: size <= 20 ? 4 : undefined }}
    >
      <img src={`/brands/${info.key}.png`} alt={`${info.name} logo`} onError={() => setFailed(true)} />
    </div>
  );
}

/* Product-brand marks live in public/brands/products, keyed by this slug.
   Keep in sync with the fetch script's slug() if brands are ever re-pulled. */
function brandSlug(brand: string) {
  return brand.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

/* Titles often already carry the brand ("H&M Everyday Tee"), so only prepend it
   when it is missing — otherwise the store search gets a doubled brand name. */
function searchQuery(brand: string | null | undefined, title: string) {
  const t = title.trim();
  const b = (brand ?? "").trim();
  if (!b) return t;
  return t.toLowerCase().includes(b.toLowerCase()) ? t : `${b} ${t}`;
}

/* Most catalog rows carry no brand column, but the title almost always opens
   with it ("Tommy Hilfiger Men Black…"). Match the longest brand we actually
   hold a logo for against the start of the title — anchoring to the prefix
   keeps short slugs like "gap" or "deli" from matching a stray word later on. */
const SLUG_TOKENS: Array<[string, string[]]> = BRAND_LOGO_SLUGS
  .map((slug) => [slug, slug.split("-")] as [string, string[]])
  .sort((a, b) => b[1].length - a[1].length);

function titleTokens(title: string) {
  return title.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function brandFromTitle(title: string): string | null {
  const words = title.split(/[^A-Za-z0-9]+/).filter(Boolean);
  const tokens = words.map((w) => w.toLowerCase());
  if (!tokens.length) return null;
  for (const [, parts] of SLUG_TOKENS) {
    if (parts.length > tokens.length) continue;
    /* Return the words as the title spelled them, so the tooltip and the
       lettered fallback read "Tommy Hilfiger", not "tommy-hilfiger". */
    if (parts.every((part, i) => tokens[i] === part)) return words.slice(0, parts.length).join(" ");
  }
  return null;
}

/* The brand to badge an item with: its own column when the catalog has one,
   otherwise whatever the title opens with. */
function resolveBrand(brand: string | null | undefined, title?: string | null): string | null {
  const explicit = (brand ?? "").trim();
  if (explicit) return explicit;
  return title ? brandFromTitle(title) : null;
}

function brandInitials(brand: string) {
  const words = brand.trim().split(/[^A-Za-z0-9]+/).filter(Boolean);
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).toUpperCase() || "?";
}

/* The product brand's own logo (Nike, Fossil, Samsung…). Not every brand has
   one — house brands and a few Indian labels publish nothing usable — so this
   falls back to a lettered plate rather than showing the wrong company. */
function BrandLogo({ brand, size = 46 }: { brand: string; size?: number }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => { setFailed(false); }, [brand]);

  if (failed) {
    return (
      <div
        className="platform-logo brand-logo-fallback"
        style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.32)) }}
        title={brand}
      >
        {brandInitials(brand)}
      </div>
    );
  }

  return (
    <div
      className="platform-logo"
      style={{ width: size, height: size, padding: Math.max(2, Math.round(size * 0.12)) }}
      title={brand}
    >
      <img src={`/brands/products/${brandSlug(brand)}.png`} alt={`${brand} logo`} onError={() => setFailed(true)} />
    </div>
  );
}

/* A store name with its mark — used in chips, tabs and item rows. */
function BrandChip({ platformKey, accent = false }: { platformKey: string; accent?: boolean }) {
  const label = isBranded(platformKey) ? platformInfo(platformKey).name : platformKey;
  return (
    <span className={accent ? "chip chip-accent brand-chip" : "chip brand-chip"}>
      {isBranded(platformKey) && <PlatformLogo info={platformInfo(platformKey)} size={14} />}
      {label}
    </span>
  );
}

/* Wishlist thumbnail: the product's brand mark, with a +N badge when the item
   was merged from more than one store. Falls back to the store, then a glyph. */
function ItemThumb({ brand, title, platforms }: { brand?: string | null; title?: string | null; platforms: string[] }) {
  const stores = platforms.filter(isBranded);
  const extra = stores.length - 1;
  const mark = resolveBrand(brand, title);

  return (
    <div className="store-thumb">
      {mark
        ? <BrandLogo brand={mark} size={46} />
        : stores.length
          ? <PlatformLogo info={platformInfo(stores[0])} size={46} />
          : <div className="item-thumb"><IconStore size={20} /></div>}
      {extra > 0 && <span className="thumb-badge" title={`Also saved on ${stores.slice(1).join(", ")}`}>+{extra}</span>}
    </div>
  );
}

function Stat({ icon: Icon, label, value, hint }: { icon: ComponentType<{ size?: number }>; label: string; value: string; hint?: string }) {
  return (
    <article className="glass stat">
      <div className="stat-icon"><Icon size={20} /></div>
      <div className="stat-body">
        <span className="stat-label">{label}</span>
        <span className="stat-value">{value}</span>
        {hint && <span className="stat-hint">{hint}</span>}
      </div>
    </article>
  );
}

function EmptyState({ icon: Icon, title, body, action }: { icon: ComponentType<{ size?: number }>; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon"><Icon size={24} /></div>
      <strong>{title}</strong>
      <p>{body}</p>
      {action}
    </div>
  );
}

function Skeletons({ count, className }: { count: number; className: string }) {
  return <>{Array.from({ length: count }, (_, i) => <div key={i} className={`skeleton ${className}`} />)}</>;
}

function Modal({ title, subtitle, badge, onClose, children, footer }: {
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div className="glass modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          {badge}
          <div className="spacer">
            <h3>{title}</h3>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close dialog"><IconClose size={16} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- app */

function App() {
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem("crosscart_theme") as Theme) || "dark");
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("wishlist_token"));
  const [user, setUser] = useState<AuthUser | null>(null);
  const [view, setView] = useState<ViewName>("overview");
  const [busy, setBusy] = useState(false);
  const [booted, setBooted] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

  const [toasts, setToasts] = useState<{ id: number; kind: "ok" | "error"; text: string }[]>([]);
  const toastSeq = useRef(0);

  const [wishlist, setWishlist] = useState<WishlistItem[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [searchResults, setSearchResults] = useState<Recommendation[]>([]);
  const [searched, setSearched] = useState(false);
  const [platforms, setPlatforms] = useState<PlatformConnection[]>([]);
  const [adminMetrics, setAdminMetrics] = useState<any>(null);
  const [adminReports, setAdminReports] = useState<any>(null);
  const [adminUsers, setAdminUsers] = useState<any[]>([]);
  const [adminProducts, setAdminProducts] = useState<any[]>([]);

  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authError, setAuthError] = useState<string | null>(null);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [name, setName] = useState("");

  const [answers, setAnswers] = useState<string[]>(["Electronics", "Home & Kitchen", "Books"]);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [manualItem, setManualItem] = useState({ title: "", category: "Electronics", price: "" });
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [platformFilter, setPlatformFilter] = useState<string>("all");

  const [connectModal, setConnectModal] = useState<PlatformInfo | null>(null);
  const [disconnectModal, setDisconnectModal] = useState<{ connection_id: string; platform: string } | null>(null);
  const [clearModal, setClearModal] = useState(false);

  /* ---------------------------------------------------------------- theme */

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("crosscart_theme", theme);
  }, [theme]);

  /* --------------------------------------------------------------- toasts */

  const toast = useCallback((kind: "ok" | "error", text: string) => {
    const id = ++toastSeq.current;
    setToasts((current) => [...current, { id, kind, text }]);
    window.setTimeout(() => setToasts((current) => current.filter((entry) => entry.id !== id)), 5000);
  }, []);

  const fail = useCallback((err: unknown, fallback: string) => {
    toast("error", err instanceof Error ? err.message : fallback);
  }, [toast]);

  /* ----------------------------------------------------------- data loads */

  async function loadProfile(authToken: string) {
    try {
      const data = await api.me(authToken);
      setUser(data.user);
      localStorage.setItem("wishlist_token", authToken);
      localStorage.setItem("wishlist_user", JSON.stringify(data.user));
      window.postMessage({ type: "CROSSCART_SET_TOKEN", token: authToken, user: data.user }, "*");
    } catch {
      localStorage.removeItem("wishlist_token");
      localStorage.removeItem("wishlist_user");
      window.postMessage({ type: "CROSSCART_CLEAR_TOKEN" }, "*");
      setToken(null);
      setUser(null);
    }
  }

  /* `silent` keeps the background poll from flashing the progress bar. */
  const loadDashboard = useCallback(async (silent = false) => {
    if (!token) return;
    if (!silent) setBusy(true);
    try {
      const [wishlistData, recoData, platformData] = await Promise.all([
        api.wishlist(token),
        api.recommendations(token, 10),
        api.platforms(token),
      ]);
      setWishlist(wishlistData.items);
      setRecommendations(recoData.recommendations);
      setPlatforms(platformData.connections);

      if (user?.role === "admin") {
        const [metrics, reports, users, products] = await Promise.all([
          api.adminMetrics(token),
          api.adminReports(token),
          api.adminUsers(token),
          api.adminProducts(token),
        ]);
        setAdminMetrics(metrics);
        setAdminReports(reports);
        setAdminUsers(users.users);
        setAdminProducts(products.products);
      }
    } catch (err) {
      if (!silent) fail(err, "Unable to load dashboard");
    } finally {
      if (!silent) setBusy(false);
      setBooted(true);
    }
  }, [token, user, fail]);

  useEffect(() => {
    if (token) void loadProfile(token);
  }, [token]);

  useEffect(() => {
    if (token && user) void loadDashboard();
  }, [token, user]);

  useEffect(() => {
    if (!token || !user) return;

    function handleWindowMessage(event: MessageEvent) {
      if (event.data?.type === "CROSSCART_WISHLIST_UPDATED") void loadDashboard(true);
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") void loadDashboard(true);
    }

    window.addEventListener("message", handleWindowMessage);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadDashboard(true);
    }, 3000);

    return () => {
      window.removeEventListener("message", handleWindowMessage);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.clearInterval(timer);
    };
  }, [token, user, loadDashboard]);

  useEffect(() => {
    setNavOpen(false);
  }, [view]);

  /* -------------------------------------------------------------- actions */

  async function handleAuth(mode: AuthMode) {
    if (!loginEmail.trim() || !loginPassword) {
      setAuthError("Email and password are required.");
      return;
    }
    if (mode === "register" && !name.trim()) {
      setAuthError("Please tell us your name.");
      return;
    }
    setBusy(true);
    setAuthError(null);
    try {
      const auth = mode === "login"
        ? await api.login({ email: loginEmail, password: loginPassword })
        : await api.register({ name, email: loginEmail, password: loginPassword });
      localStorage.setItem("wishlist_token", auth.access_token);
      localStorage.setItem("wishlist_user", JSON.stringify(auth.user));
      window.postMessage({ type: "CROSSCART_SET_TOKEN", token: auth.access_token, user: auth.user }, "*");
      setToken(auth.access_token);
      setUser(auth.user);
      toast("ok", mode === "login" ? "Welcome back." : "Account created.");
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  }

  function signOut() {
    localStorage.removeItem("wishlist_token");
    localStorage.removeItem("wishlist_user");
    window.postMessage({ type: "CROSSCART_CLEAR_TOKEN" }, "*");
    setToken(null);
    setUser(null);
    setWishlist([]);
    setRecommendations([]);
    setPlatforms([]);
    setView("overview");
  }

  async function savePreferences() {
    if (!token) return;
    setSavingPrefs(true);
    try {
      await api.onboarding(token, answers);
      toast("ok", "Preferences saved — recommendations will follow your picks.");
      await loadDashboard(true);
    } catch (err) {
      fail(err, "Could not save preferences");
    } finally {
      setSavingPrefs(false);
    }
  }

  function toggleAnswer(category: string) {
    setAnswers((current) => current.includes(category) ? current.filter((entry) => entry !== category) : [...current, category]);
  }

  async function confirmDisconnect() {
    if (!token || !disconnectModal) return;
    try {
      await api.disconnectPlatform(token, disconnectModal.connection_id);
      toast("ok", `Disconnected ${disconnectModal.platform}.`);
      await loadDashboard(true);
    } catch (err) {
      fail(err, "Failed to disconnect platform");
    } finally {
      setDisconnectModal(null);
    }
  }

  async function importCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!token || !file) return;
    setBusy(true);
    try {
      const result = await api.importCsv(token, file);
      toast("ok", `Imported ${result.imported} rows and merged ${result.duplicates_merged} duplicates.`);
      await loadDashboard(true);
    } catch (err) {
      fail(err, "CSV import failed");
    } finally {
      event.target.value = "";
      setBusy(false);
    }
  }

  async function addManualItem() {
    if (!token || !manualItem.title.trim()) return;
    setBusy(true);
    try {
      await api.addItem(token, {
        platform: "manual",
        title: manualItem.title.trim(),
        price: manualItem.price ? Number(manualItem.price) : undefined,
        category: manualItem.category,
      });
      setManualItem({ title: "", category: manualItem.category, price: "" });
      toast("ok", "Wishlist item added.");
      await loadDashboard(true);
    } catch (err) {
      fail(err, "Could not add item");
    } finally {
      setBusy(false);
    }
  }

  async function removeItem(unifiedItemId: string) {
    if (!token) return;
    setWishlist((current) => current.filter((item) => item.unified_item_id !== unifiedItemId));
    try {
      await api.removeItem(token, unifiedItemId);
      toast("ok", "Item removed.");
      await loadDashboard(true);
    } catch (err) {
      fail(err, "Could not remove item");
      await loadDashboard(true);
    }
  }

  async function clearCurrentWishlist() {
    if (!token) return;
    setClearModal(false);
    setBusy(true);
    try {
      const res: any = await api.clearWishlist(token, platformFilter);
      setWishlist(platformFilter === "all" ? [] : (res.items || []));
      toast("ok", "Wishlist cleared.");
      await loadDashboard(true);
    } catch (err) {
      fail(err, "Failed to clear wishlist");
    } finally {
      setBusy(false);
    }
  }

  async function refreshRecommendations() {
    if (!token) return;
    setRefreshing(true);
    try {
      const data = await api.recommendations(token, 10, true);
      setRecommendations(data.recommendations);
      toast("ok", "Recommendations refreshed.");
    } catch (err) {
      fail(err, "Failed to refresh recommendations");
    } finally {
      setRefreshing(false);
    }
  }

  async function runSearch() {
    if (!token || !query.trim()) return;
    setSearching(true);
    try {
      const data = await api.search(token, query, 10);
      setSearchResults(data.recommendations);
      setSearched(true);
      setView("search");
    } catch (err) {
      fail(err, "Search failed");
    } finally {
      setSearching(false);
    }
  }

  async function submitFeedback(recommendationId: string, action: "like" | "dislike" | "rating", rating_value?: number) {
    if (!token) return;
    try {
      const data: any = await api.feedback(token, recommendationId, { action, rating_value });
      if (data && Array.isArray(data.recommendations) && data.recommendations.length > 0) {
        setRecommendations(data.recommendations);
      } else {
        await refreshRecommendations();
      }
      if (action === "dislike") toast("ok", "Got it — we'll show fewer like that.");
    } catch {
      await refreshRecommendations();
    }
  }

  async function rebuildGraph() {
    if (!token) return;
    setBusy(true);
    try {
      await api.rebuildGraph(token);
      toast("ok", "Community graph rebuilt.");
      await loadDashboard(true);
    } catch (err) {
      fail(err, "Rebuild failed");
    } finally {
      setBusy(false);
    }
  }

  /* ------------------------------------------------------------- derived */

  const isAdmin = user?.role === "admin" || user?.email === "admin@wishlist.local";

  const platformCounts = useMemo(() => {
    const counts: Record<string, number> = { all: wishlist.length, manual: 0 };
    for (const key of PLATFORM_OPTIONS) counts[key] = 0;
    for (const item of wishlist) {
      const joined = itemPlatforms(item).join(" ").toLowerCase();
      for (const key of PLATFORM_OPTIONS) if (joined.includes(key)) counts[key] += 1;
      if (joined.includes("manual")) counts.manual += 1;
    }
    return counts;
  }, [wishlist]);

  const filteredWishlist = useMemo(
    () => platformFilter === "all" ? wishlist : wishlist.filter((item) => matchesPlatform(item, platformFilter)),
    [wishlist, platformFilter],
  );

  const wishlistValue = useMemo(
    () => wishlist.reduce((total, item) => total + (item.price ?? 0), 0),
    [wishlist],
  );

  const topCategory = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of wishlist) counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
  }, [wishlist]);

  const activeView = VIEWS.find((entry) => entry.key === view) ?? VIEWS[0];
  const filterLabel = platformFilter === "all" ? "all stores" : platformInfo(platformFilter).name;

  /* ---------------------------------------------------------- auth screen */

  if (!token || !user) {
    return (
      <>
        <Backdrop />
        {busy && <div className="progress"><i /></div>}
        <div className="auth-shell">
          <aside className="auth-aside">
            <div className="brand">
              <div className="brand-mark"><IconLayers size={20} /></div>
              <div>
                <div className="brand-name">CrossCart</div>
                <span className="brand-tag">Wishlist intelligence</span>
              </div>
            </div>

            <div>
              <h1 className="auth-headline">One wishlist for <span className="gradient-text">every store</span>.</h1>
              <p className="auth-sub">
                CrossCart merges the things you saved on Amazon, Flipkart, Myntra and more into a single list —
                then recommends what you're actually likely to want next.
              </p>
              <div className="auth-features">
                {[
                  "Sync six stores with one browser extension",
                  "Duplicates merged automatically across platforms",
                  "Recommendations that explain themselves",
                ].map((line) => (
                  <div key={line} className="auth-feature">
                    <span className="tick"><IconCheck size={14} /></span>
                    <span>{line}</span>
                  </div>
                ))}
              </div>
            </div>

            <p className="faint" style={{ fontSize: "0.8rem" }}>Your credentials never leave your browser session.</p>
          </aside>

          <main className="auth-main">
            <div className="glass auth-card">
              <div className="brand" style={{ padding: 0 }}>
                <div className="brand-mark"><IconLayers size={20} /></div>
                <div>
                  <div className="brand-name">CrossCart</div>
                  <span className="brand-tag">Wishlist intelligence</span>
                </div>
                <span className="spacer" />
                <button
                  className="icon-btn"
                  onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                  aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
                >
                  {theme === "dark" ? <IconSun size={16} /> : <IconMoon size={16} />}
                </button>
              </div>

              <div className="auth-switch" role="tablist">
                <button role="tab" aria-selected={authMode === "login"} className={authMode === "login" ? "active" : ""} onClick={() => { setAuthMode("login"); setAuthError(null); }}>Log in</button>
                <button role="tab" aria-selected={authMode === "register"} className={authMode === "register" ? "active" : ""} onClick={() => { setAuthMode("register"); setAuthError(null); }}>Create account</button>
              </div>

              <form
                className="stack"
                onSubmit={(event) => { event.preventDefault(); void handleAuth(authMode); }}
              >
                {authMode === "register" && (
                  <label className="field">
                    <span>Name</span>
                    <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" autoComplete="name" />
                  </label>
                )}
                <label className="field">
                  <span>Email</span>
                  <input type="email" value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" />
                </label>
                <label className="field">
                  <span>Password</span>
                  <input type="password" value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} placeholder="••••••••" autoComplete={authMode === "login" ? "current-password" : "new-password"} />
                </label>

                {authError && (
                  <div className="auth-error"><IconAlert size={16} /><span>{authError}</span></div>
                )}

                <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={busy}>
                  {busy ? <span className="spinner" /> : null}
                  {authMode === "login" ? "Log in" : "Create account"}
                </button>
              </form>

              <div className="divider">or</div>

              <button
                className="btn btn-ghost btn-block"
                onClick={() => { setLoginEmail(DEMO_EMAIL); setLoginPassword(DEMO_PASSWORD); setName("Demo User"); setAuthError(null); }}
              >
                Fill demo credentials
              </button>
            </div>
          </main>
        </div>
        <ToastStack toasts={toasts} onDismiss={(id) => setToasts((current) => current.filter((entry) => entry.id !== id))} />
      </>
    );
  }

  /* ------------------------------------------------------------ app shell */

  const navItems = VIEWS.filter((entry) => !entry.adminOnly || isAdmin);

  return (
    <>
      <Backdrop />
      {busy && <div className="progress"><i /></div>}

      <div className="app-shell">
        {navOpen && <div className="scrim" onClick={() => setNavOpen(false)} />}

        <aside className={navOpen ? "sidebar open" : "sidebar"}>
          <div className="brand">
            <div className="brand-mark"><IconLayers size={20} /></div>
            <div>
              <div className="brand-name">CrossCart</div>
              <span className="brand-tag">Wishlist intelligence</span>
            </div>
          </div>

          <nav className="nav" aria-label="Primary">
            <div className="nav-label">Workspace</div>
            {navItems.map((entry) => {
              const Icon = entry.icon;
              const count = entry.key === "wishlist" ? wishlist.length : entry.key === "recommendations" ? recommendations.length : null;
              return (
                <button
                  key={entry.key}
                  className={view === entry.key ? "nav-item active" : "nav-item"}
                  onClick={() => setView(entry.key)}
                  aria-current={view === entry.key ? "page" : undefined}
                >
                  <Icon size={17} />
                  {entry.label}
                  {count ? <span className="nav-count">{count}</span> : null}
                </button>
              );
            })}
          </nav>

          <div className="sidebar-footer">
            <div className="user-card">
              <div className="avatar">{initials(user.name)}</div>
              <div className="user-card-text">
                <strong>{user.name}</strong>
                <span>{user.email}</span>
              </div>
            </div>
            <button className="btn btn-ghost btn-block" onClick={signOut}>
              <IconLogout size={16} /> Sign out
            </button>
          </div>
        </aside>

        <div className="content">
          <header className="topbar">
            <button className="icon-btn menu-toggle" onClick={() => setNavOpen((open) => !open)} aria-label="Toggle navigation">
              <IconMenu size={18} />
            </button>
            <div className="topbar-heading">
              <h1>{activeView.title}</h1>
              <p>{activeView.subtitle}</p>
            </div>
            <div className="topbar-actions">
              <button
                className="icon-btn"
                onClick={() => void loadDashboard()}
                aria-label="Reload data"
                title="Reload data"
              >
                <IconRefresh size={17} />
              </button>
              <button
                className="icon-btn"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
                title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
              >
                {theme === "dark" ? <IconSun size={17} /> : <IconMoon size={17} />}
              </button>
            </div>
          </header>

          <main className="page">
            <section className="grid grid-stats">
              <Stat icon={IconHeart} label="Wishlist items" value={String(wishlist.length)} hint={`Top category · ${topCategory}`} />
              <Stat icon={IconLink} label="Connected stores" value={String(platforms.length)} hint={`${PLATFORM_OPTIONS.length} supported`} />
              <Stat icon={IconSparkles} label="Recommendations" value={String(recommendations.length)} hint="Refreshed from your latest activity" />
              <Stat icon={IconBox} label="Wishlist value" value={formatPrice(wishlistValue) ?? "₹0"} hint="Sum of items with a listed price" />
            </section>

            {/* ------------------------------------------------- overview -- */}
            {view === "overview" && (
              <>
                <section className="glass panel">
                  <div className="section-head">
                    <div>
                      <h2>Connected platforms</h2>
                      <p>Sync each store once with the browser extension — CrossCart keeps the merged list up to date.</p>
                    </div>
                  </div>
                  <div className="grid grid-cards">
                    {PLATFORM_OPTIONS.map((key) => {
                      const info = platformInfo(key);
                      const connection = platforms.find((entry) => entry.platform === key);
                      const synced = platformCounts[key] ?? 0;
                      return (
                        <div key={key} className={connection ? "glass platform-card connected" : "glass platform-card"}>
                          <div className="platform-head">
                            <PlatformLogo info={info} />
                            <div className="spacer">
                              <div className="platform-name">{info.name}</div>
                              <span className={connection ? "chip chip-ok" : "chip"}>
                                <i className="status-dot" />
                                {connection ? `Connected · ${synced} item${synced === 1 ? "" : "s"}` : "Not connected"}
                              </span>
                            </div>
                          </div>
                          <p>
                            {connection
                              ? `${synced} item${synced === 1 ? "" : "s"} currently synced from ${info.name}.`
                              : `Open your ${info.name} wishlist, then sync it with the extension.`}
                          </p>
                          <div className="row">
                            <button className="btn btn-secondary btn-sm" onClick={() => setConnectModal(info)}>
                              {connection ? "Sync steps" : "How to sync"}
                            </button>
                            {connection && (
                              <button
                                className="btn btn-ghost btn-sm"
                                onClick={() => setDisconnectModal({ connection_id: connection.connection_id, platform: info.name })}
                              >
                                Disconnect
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>

                <section className="glass panel">
                  <div className="section-head">
                    <div>
                      <h2>Interest profile</h2>
                      <p>Pick the categories you shop most. These seed your recommendations before any wishlist is synced.</p>
                    </div>
                    <button className="btn btn-primary btn-sm" onClick={() => void savePreferences()} disabled={savingPrefs}>
                      {savingPrefs ? <span className="spinner" /> : <IconCheck size={15} />} Save preferences
                    </button>
                  </div>
                  <div className="row" style={{ gap: "0.4rem" }}>
                    {CATEGORY_OPTIONS.map((category) => {
                      const active = answers.includes(category);
                      return (
                        <button
                          key={category}
                          className={active ? "tab active" : "tab"}
                          onClick={() => toggleAnswer(category)}
                          aria-pressed={active}
                        >
                          {active && <IconCheck size={13} />}
                          {category}
                        </button>
                      );
                    })}
                  </div>
                </section>
              </>
            )}

            {/* ------------------------------------------------- wishlist -- */}
            {view === "wishlist" && (
              <>
                <section className="glass panel">
                  <div className="section-head">
                    <div>
                      <h2>Filter by store</h2>
                      <p>Showing {filteredWishlist.length} of {wishlist.length} items from {filterLabel}.</p>
                    </div>
                  </div>
                  <div className="tabs" role="tablist">
                    <button
                      role="tab"
                      aria-selected={platformFilter === "all"}
                      className={platformFilter === "all" ? "tab active" : "tab"}
                      onClick={() => setPlatformFilter("all")}
                    >
                      All stores <span className="tab-count">{platformCounts.all}</span>
                    </button>
                    {PLATFORM_OPTIONS.map((key) => {
                      const info = platformInfo(key);
                      const connected = platforms.some((entry) => entry.platform === key);
                      return (
                        <button
                          key={key}
                          role="tab"
                          aria-selected={platformFilter === key}
                          className={platformFilter === key ? "tab active" : "tab"}
                          onClick={() => setPlatformFilter(key)}
                        >
                          <PlatformLogo info={info} size={16} />
                          {info.name}
                          <span className={connected ? "tab-count live" : "tab-count"}>{platformCounts[key] ?? 0}</span>
                        </button>
                      );
                    })}
                    <button
                      role="tab"
                      aria-selected={platformFilter === "manual"}
                      className={platformFilter === "manual" ? "tab active" : "tab"}
                      onClick={() => setPlatformFilter("manual")}
                    >
                      Manual <span className="tab-count">{platformCounts.manual}</span>
                    </button>
                  </div>
                </section>

                <section className="glass panel">
                  <div className="section-head">
                    <div>
                      <h2>{platformFilter === "all" ? "Unified wishlist" : `${filterLabel} wishlist`}</h2>
                      <p>{filteredWishlist.length} item{filteredWishlist.length === 1 ? "" : "s"}</p>
                    </div>
                    <div className="row">
                      {platformFilter !== "all" && platformFilter !== "manual" && (
                        <a className="btn btn-ghost btn-sm" href={platformInfo(platformFilter).url} target="_blank" rel="noopener noreferrer">
                          Open store <IconExternal />
                        </a>
                      )}
                      {filteredWishlist.length > 0 && (
                        <button className="btn btn-danger btn-sm" onClick={() => setClearModal(true)}>
                          <IconTrash size={15} /> Clear {platformFilter === "all" ? "all" : filterLabel}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="stack">
                    {!booted ? (
                      <Skeletons count={4} className="skeleton-row" />
                    ) : filteredWishlist.length === 0 ? (
                      <EmptyState
                        icon={IconHeart}
                        title={`Nothing synced from ${filterLabel} yet`}
                        body="Sync a store with the CrossCart extension, import a CSV, or add an item by hand below."
                        action={platformFilter !== "all" && platformFilter !== "manual" ? (
                          <button className="btn btn-primary btn-sm" onClick={() => setConnectModal(platformInfo(platformFilter))}>
                            Show sync steps
                          </button>
                        ) : undefined}
                      />
                    ) : (
                      filteredWishlist.map((item) => (
                        <div key={item.unified_item_id} className="item-row">
                          <ItemThumb brand={item.brand} title={item.title} platforms={itemPlatforms(item)} />
                          <div className="item-body">
                            <span className="item-title" title={item.title}>{item.title}</span>
                            <div className="item-meta">
                              <span className="chip chip-accent">{item.category}</span>
                              {itemPlatforms(item).map((source, index) => (
                                <BrandChip key={`${source}-${index}`} platformKey={source} />
                              ))}
                              {item.url && (
                                <a className="link-inline" href={item.url} target="_blank" rel="noopener noreferrer">
                                  View product <IconExternal />
                                </a>
                              )}
                            </div>
                          </div>
                          <div className="item-side">
                            {item.price != null && <span className="price">{formatPrice(item.price)}</span>}
                            <button className="icon-btn" onClick={() => void removeItem(item.unified_item_id)} aria-label={`Remove ${item.title}`} title="Remove item">
                              <IconTrash size={16} />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </section>

                <section className="glass panel">
                  <div className="section-head">
                    <div>
                      <h2>Add items manually</h2>
                      <p>Add a one-off product, or bulk import a CSV exported from any store.</p>
                    </div>
                    <label className="btn btn-secondary btn-sm file-btn">
                      <IconUpload size={15} /> Upload CSV
                      <input type="file" accept=".csv" onChange={importCsv} />
                    </label>
                  </div>
                  <div className="row" style={{ alignItems: "flex-end" }}>
                    <label className="field" style={{ flex: "2 1 260px" }}>
                      <span>Product</span>
                      <input
                        value={manualItem.title}
                        onChange={(event) => setManualItem((state) => ({ ...state, title: event.target.value }))}
                        placeholder="e.g. Noise cancelling headphones"
                        onKeyDown={(event) => event.key === "Enter" && void addManualItem()}
                      />
                    </label>
                    <label className="field" style={{ flex: "1 1 130px" }}>
                      <span>Price (₹)</span>
                      <input
                        value={manualItem.price}
                        inputMode="numeric"
                        onChange={(event) => setManualItem((state) => ({ ...state, price: event.target.value }))}
                        placeholder="0"
                      />
                    </label>
                    <label className="field" style={{ flex: "1 1 170px" }}>
                      <span>Category</span>
                      <select value={manualItem.category} onChange={(event) => setManualItem((state) => ({ ...state, category: event.target.value }))}>
                        {CATEGORY_OPTIONS.map((category) => <option key={category}>{category}</option>)}
                      </select>
                    </label>
                    <button className="btn btn-primary" onClick={() => void addManualItem()} disabled={!manualItem.title.trim()}>
                      <IconPlus size={16} /> Add item
                    </button>
                  </div>
                </section>
              </>
            )}

            {/* ------------------------------------------ recommendations -- */}
            {view === "recommendations" && (
              <section className="glass panel">
                <div className="section-head">
                  <div>
                    <h2>Picked for you</h2>
                    <p>Ranked against your wishlist, your community and what you've rated.</p>
                  </div>
                  <button className="btn btn-secondary btn-sm" onClick={() => void refreshRecommendations()} disabled={refreshing}>
                    <IconRefresh size={15} className={refreshing ? "spin-slow" : undefined} /> Refresh
                  </button>
                </div>
                <div className="grid grid-recs">
                  {!booted ? (
                    <Skeletons count={6} className="skeleton-card" />
                  ) : recommendations.length ? (
                    recommendations.map((item) => (
                      <RecommendationCard key={item.recommendation_id} item={item} onFeedback={submitFeedback} admin={isAdmin} />
                    ))
                  ) : (
                    <EmptyState
                      icon={IconSparkles}
                      title="Your discovery mix is warming up"
                      body="Sync a wishlist or add a few products, then refresh to get tailored picks."
                      action={<button className="btn btn-primary btn-sm" onClick={() => setView("wishlist")}>Add wishlist items</button>}
                    />
                  )}
                </div>
              </section>
            )}

            {/* --------------------------------------------------- search -- */}
            {view === "search" && (
              <section className="glass panel">
                <div className="section-head">
                  <div>
                    <h2>Search the catalog</h2>
                    <p>Results are re-ranked using your taste profile, not just keyword match.</p>
                  </div>
                </div>
                <form
                  className="row"
                  onSubmit={(event) => { event.preventDefault(); void runSearch(); }}
                >
                  <div className="input-icon" style={{ flex: "1 1 260px" }}>
                    <IconSearch size={16} />
                    <input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void runSearch(); } }}
                      placeholder="Search for something specific…"
                      aria-label="Search products"
                    />
                  </div>
                  <button className="btn btn-primary" type="submit" disabled={searching || !query.trim()}>
                    {searching ? <span className="spinner" /> : <IconSearch size={16} />} Search
                  </button>
                </form>
                <div className="grid grid-recs">
                  {searching ? (
                    <Skeletons count={3} className="skeleton-card" />
                  ) : searchResults.length ? (
                    searchResults.map((item) => (
                      <RecommendationCard key={item.recommendation_id} item={item} onFeedback={submitFeedback} admin={isAdmin} />
                    ))
                  ) : (
                    <EmptyState
                      icon={IconSearch}
                      title={searched ? "No matches for that search" : "Search your catalog"}
                      body={searched ? "Try a broader term, or a category name like “audio” or “fitness”." : "Type a product, brand or category above to see personalized results."}
                    />
                  )}
                </div>
              </section>
            )}

            {/* ---------------------------------------------------- admin -- */}
            {view === "admin" && isAdmin && (
              <>
                <section className="grid grid-stats">
                  <Stat icon={IconUsers} label="Registered users" value={String(adminUsers.length)} />
                  <Stat icon={IconBox} label="Catalog products" value={String(adminProducts.length)} />
                  <Stat icon={IconSparkles} label="CTR proxy" value={adminReports?.ctr_proxy != null ? Number(adminReports.ctr_proxy).toFixed(3) : "—"} />
                </section>

                <section className="glass panel">
                  <div className="section-head">
                    <div>
                      <h2>System metrics</h2>
                      <p>Live counters from the recommendation service.</p>
                    </div>
                    <button className="btn btn-secondary btn-sm" onClick={() => void rebuildGraph()}>
                      <IconRefresh size={15} /> Rebuild community graph
                    </button>
                  </div>
                  <div className="kv-grid">
                    {summarize(adminMetrics).map(([label, value]) => (
                      <div key={label} className="kv"><span>{label}</span><strong>{value}</strong></div>
                    ))}
                  </div>
                  <details className="raw">
                    <summary>Raw metrics payload</summary>
                    <pre className="json-box">{JSON.stringify(adminMetrics, null, 2)}</pre>
                  </details>
                  <details className="raw">
                    <summary>Raw analytics report</summary>
                    <pre className="json-box">{JSON.stringify(adminReports, null, 2)}</pre>
                  </details>
                </section>

                <section className="glass panel">
                  <div className="section-head">
                    <div>
                      <h2>Accounts</h2>
                      <p>{adminUsers.length} registered user{adminUsers.length === 1 ? "" : "s"}.</p>
                    </div>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr><th>Name</th><th>Email</th><th>Role</th></tr>
                      </thead>
                      <tbody>
                        {adminUsers.map((row) => (
                          <tr key={row.user_id}>
                            <td><strong>{row.name}</strong></td>
                            <td className="muted">{row.email}</td>
                            <td><span className={row.role === "admin" ? "chip chip-accent" : "chip"}>{row.role}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="glass panel">
                  <div className="section-head">
                    <div>
                      <h2>Catalog</h2>
                      <p>Showing {Math.min(adminProducts.length, 25)} of {adminProducts.length} products.</p>
                    </div>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr><th>Product</th><th>Category</th><th>Source</th><th className="num">Price</th></tr>
                      </thead>
                      <tbody>
                        {adminProducts.slice(0, 25).map((row) => (
                          <tr key={row.product_id}>
                            <td><strong>{row.title}</strong></td>
                            <td className="muted">{row.category}</td>
                            <td className="muted">{row.source_platform}</td>
                            <td className="num price">{formatPrice(row.price) ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </>
            )}
          </main>
        </div>
      </div>

      {/* ------------------------------------------------------------ modals */}

      {connectModal && (
        <Modal
          title={`Sync your ${connectModal.name} wishlist`}
          subtitle="Four steps, about a minute"
          badge={<PlatformLogo info={connectModal} size={44} />}
          onClose={() => setConnectModal(null)}
          footer={
            <>
              <a className="btn btn-secondary" href={connectModal.url} target="_blank" rel="noopener noreferrer">
                Open {connectModal.name} <IconExternal />
              </a>
              <button className="btn btn-primary" onClick={() => setConnectModal(null)}>Done</button>
            </>
          }
        >
          <div className="steps">
            {syncSteps(connectModal.name).map((step, index) => (
              <div key={step.title} className={index === 0 ? "step first" : "step"}>
                <div className="step-num">{index + 1}</div>
                <div>
                  <div className="step-title">{step.title}</div>
                  <div className="step-desc">{step.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {disconnectModal && (
        <Modal
          title={`Disconnect ${disconnectModal.platform}?`}
          subtitle="You can reconnect at any time"
          badge={<div className="empty-icon" style={{ width: 44, height: 44, color: "var(--danger)" }}><IconAlert size={20} /></div>}
          onClose={() => setDisconnectModal(null)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setDisconnectModal(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={() => void confirmDisconnect()}>Disconnect</button>
            </>
          }
        >
          <div className="callout">
            <IconAlert size={18} />
            <span>
              This unlinks your <strong>{disconnectModal.platform}</strong> connection. Items already imported stay in your
              unified wishlist until you remove them.
            </span>
          </div>
        </Modal>
      )}

      {clearModal && (
        <Modal
          title={`Clear ${platformFilter === "all" ? "the entire wishlist" : `your ${filterLabel} wishlist`}?`}
          subtitle="This cannot be undone"
          badge={<div className="empty-icon" style={{ width: 44, height: 44, color: "var(--danger)" }}><IconTrash size={20} /></div>}
          onClose={() => setClearModal(false)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setClearModal(false)}>Cancel</button>
              <button className="btn btn-danger" onClick={() => void clearCurrentWishlist()}>
                <IconTrash size={15} /> Clear {filteredWishlist.length} item{filteredWishlist.length === 1 ? "" : "s"}
              </button>
            </>
          }
        >
          <div className="callout">
            <IconAlert size={18} />
            <span>
              {filteredWishlist.length} item{filteredWishlist.length === 1 ? "" : "s"} will be removed from CrossCart.
              Your wishlist on the store itself is not touched.
            </span>
          </div>
        </Modal>
      )}

      <ToastStack toasts={toasts} onDismiss={(id) => setToasts((current) => current.filter((entry) => entry.id !== id))} />
    </>
  );
}

/* ----------------------------------------------------------------- toasts */

function ToastStack({ toasts, onDismiss }: { toasts: { id: number; kind: "ok" | "error"; text: string }[]; onDismiss: (id: number) => void }) {
  if (!toasts.length) return null;
  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map((entry) => (
        <div key={entry.id} className={`glass toast ${entry.kind}`}>
          <span className="toast-icon">{entry.kind === "ok" ? <IconCheck size={17} /> : <IconAlert size={17} />}</span>
          <p>{entry.text}</p>
          <button className="toast-close" onClick={() => onDismiss(entry.id)} aria-label="Dismiss notification">
            <IconClose size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------ recommendation card */

function RecommendationCard({ item, onFeedback, admin }: {
  item: Recommendation;
  onFeedback: (id: string, action: "like" | "dislike" | "rating", rating_value?: number) => Promise<void>;
  admin: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [imageFailed, setImageFailed] = useState(false);

  const source = item.product.source_platform && isBranded(item.product.source_platform)
    ? item.product.source_platform.toLowerCase()
    : null;
  const title = item.product.title;
  const store = source ? platformInfo(source) : null;
  const mark = resolveBrand(item.product.brand, title);
  /* Catalog rows carry no product URL, so fall back to a search on the store
     the product came from — never an off-platform shopping aggregator. */
  const url = item.product.url || (store ? store.search(searchQuery(item.product.brand, title)) : null);
  const linkLabel = item.product.url ? "View product" : store ? `Find on ${store.name}` : null;
  const score = Math.max(0, Math.min(1, item.final_score ?? 0));

  return (
    <article className="glass rec-card">
      <div className="rec-kicker">
        <span className={item.rank <= 3 ? "rank-badge top" : "rank-badge"}>#{item.rank}</span>
        {source
          ? <BrandChip platformKey={source} />
          : <span className="chip">{item.rank <= 3 ? "Top match" : "Recommended"}</span>}
      </div>

      <div className="rec-top">
        <div className="rec-thumb">
          {item.product.image_url && !imageFailed
            ? <img src={item.product.image_url} alt="" loading="lazy" onError={() => setImageFailed(true)} />
            : mark
              ? <BrandLogo brand={mark} size={62} />
              : source
                ? <PlatformLogo info={platformInfo(source)} size={62} />
                : <IconStore size={22} />}
        </div>
        <div className="rec-meta">
          <h4 title={title}>{title}</h4>
          <p className="sub">
            {item.product.category} · {item.product.brand ?? "Brand not listed"}
            {item.product.avg_rating != null && <> · ★ {item.product.avg_rating.toFixed(1)}</>}
          </p>
          <div className="row" style={{ gap: "0.5rem", marginTop: "0.4rem" }}>
            {item.product.price != null && <span className="price">{formatPrice(item.product.price)}</span>}
            {url && (
              <a className="btn btn-ghost btn-sm" href={url} target="_blank" rel="noopener noreferrer">
                {linkLabel} <IconExternal />
              </a>
            )}
          </div>
        </div>
      </div>

      <div className="score-bar" title={`Match score ${(score * 100).toFixed(0)}%`} aria-label={`Match score ${(score * 100).toFixed(0)} percent`}>
        <i style={{ width: `${Math.max(6, score * 100)}%` }} />
      </div>

      <div className="rec-actions">
        <button className="btn btn-ghost btn-sm" onClick={() => void onFeedback(item.recommendation_id, "like")}>
          <IconThumbUp size={14} /> More like this
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => void onFeedback(item.recommendation_id, "dislike")}>
          <IconEyeOff size={14} /> Hide
        </button>
        <div className="stars" onMouseLeave={() => setHoverRating(0)}>
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              className={(hoverRating || rating) >= value ? "star-btn lit" : "star-btn"}
              aria-label={`Rate ${value} out of 5`}
              onMouseEnter={() => setHoverRating(value)}
              onClick={() => { setRating(value); void onFeedback(item.recommendation_id, "rating", value); }}
            >
              <IconStar filled={(hoverRating || rating) >= value} />
            </button>
          ))}
        </div>
      </div>

      <button className="explain-toggle" onClick={() => setOpen((current) => !current)} aria-expanded={open}>
        <IconInfo size={14} /> {open ? "Hide explanation" : "Why this?"}
      </button>
      {open && <p className="explanation">{item.explanation}</p>}

      {admin && item.debug_scores && (
        <div className="debug-grid">
          <span>wishlist {item.debug_scores.wishlist_similarity.toFixed(2)}</span>
          <span>community {item.debug_scores.community_preference.toFixed(2)}</span>
          <span>trending {item.debug_scores.trending_score.toFixed(2)}</span>
          <span>history {item.debug_scores.browsing_history_score.toFixed(2)}</span>
        </div>
      )}
    </article>
  );
}

export default App;
