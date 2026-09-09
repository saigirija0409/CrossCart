import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { api, type AuthUser, type PlatformConnection, type Recommendation, type WishlistItem } from "./api";

type AuthMode = "login" | "register";
type ViewName = "overview" | "wishlist" | "recommendations" | "search" | "admin";

const PLATFORM_OPTIONS = ["amazon", "flipkart", "myntra", "ajio", "tatacliq", "nykaa"] as const;
const CATEGORY_OPTIONS = [
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
];

const DEMO_EMAIL = "demo@wishlist.local";
const DEMO_PASSWORD = "Demo1234!";

function IconStore({ className = "" }: { className?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path>
      <line x1="3" y1="6" x2="21" y2="6"></line>
      <path d="M16 10a4 4 0 0 1-8 0"></path>
    </svg>
  );
}

function IconWarning({ className = "" }: { className?: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#e57373" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 3-3.42 0z"></path>
      <line x1="12" y1="9" x2="12" y2="13"></line>
      <line x1="12" y1="17" x2="12.01" y2="17"></line>
    </svg>
  );
}

function IconExternalLink({ className = "" }: { className?: string }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
      <polyline points="15 3 21 3 21 9"></polyline>
      <line x1="10" y1="14" x2="21" y2="3"></line>
    </svg>
  );
}

function IconTrash({ className = "" }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="3 6 5 6 21 6"></polyline>
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
      <line x1="10" y1="11" x2="10" y2="17"></line>
      <line x1="14" y1="11" x2="14" y2="17"></line>
    </svg>
  );
}

interface PlatformGuideStep {
  title: string;
  desc: string;
}

interface PlatformGuideInfo {
  name: string;
  key: string;
  url: string;
  icon: string;
  color: string;
  steps: PlatformGuideStep[];
}

const PLATFORM_DETAILS: Record<string, PlatformGuideInfo> = {
  amazon: {
    name: "Amazon",
    key: "amazon",
    url: "https://www.amazon.in/hz/wishlist/ls",
    icon: "AZ",
    color: "#ff9900",
    steps: [
      { title: "Redirected to Amazon Wishlist", desc: "We opened your Amazon Wishlist page in a new browser tab." },
      { title: "Log in & View Wishlist", desc: "Make sure you are logged into Amazon and viewing your Wishlist page." },
      { title: "Open CrossCart Extension", desc: "Click the CrossCart Chrome Extension icon in your browser toolbar top-right." },
      { title: "Click 'Sync Wishlist'", desc: "Click 'Sync Wishlist' in the extension popup to extract your items." },
      { title: "Sync Complete", desc: "Return to CrossCart — your items and personalized recommendations update live!" }
    ]
  },
  flipkart: {
    name: "Flipkart",
    key: "flipkart",
    url: "https://www.flipkart.com/wishlist",
    icon: "FK",
    color: "#2874f0",
    steps: [
      { title: "Redirected to Flipkart Wishlist", desc: "We opened your Flipkart Wishlist page in a new browser tab." },
      { title: "Log in & View Wishlist", desc: "Make sure you are logged into Flipkart and viewing your saved Wishlist." },
      { title: "Open CrossCart Extension", desc: "Click the CrossCart Chrome Extension icon in your browser toolbar." },
      { title: "Click 'Sync Wishlist'", desc: "Click 'Sync Wishlist' in the extension to automatically import your wishlist." },
      { title: "Sync Complete", desc: "Return here to view your combined wishlist across all shopping stores!" }
    ]
  },
  myntra: {
    name: "Myntra",
    key: "myntra",
    url: "https://www.myntra.com/wishlist",
    icon: "MY",
    color: "#ff3f6c",
    steps: [
      { title: "Redirected to Myntra Wishlist", desc: "We opened your Myntra Wishlist page in a new browser tab." },
      { title: "Log in & View Wishlist", desc: "Make sure you are logged into Myntra and on your Wishlist." },
      { title: "Open CrossCart Extension", desc: "Click the CrossCart Chrome Extension icon in your browser toolbar." },
      { title: "Click 'Sync Wishlist'", desc: "Click 'Sync Wishlist' in the extension to extract your saved items." },
      { title: "Sync Complete", desc: "Return here to view your updated recommendations and score." }
    ]
  },
  ajio: {
    name: "Ajio",
    key: "ajio",
    url: "https://www.ajio.com/wishlist",
    icon: "AJ",
    color: "#8fa7c5",
    steps: [
      { title: "Redirected to Ajio Wishlist", desc: "We opened your Ajio Wishlist page in a new browser tab." },
      { title: "Log in & View Wishlist", desc: "Make sure you are logged into Ajio and viewing your Closet/Wishlist." },
      { title: "Open CrossCart Extension", desc: "Click the CrossCart Chrome Extension icon in your browser toolbar." },
      { title: "Click 'Sync Wishlist'", desc: "Click 'Sync Wishlist' in the extension popup to import your items." },
      { title: "Sync Complete", desc: "Return here to see your synced products across platforms!" }
    ]
  },
  tatacliq: {
    name: "Tata CLiQ",
    key: "tatacliq",
    url: "https://www.tatacliq.com/wishlist",
    icon: "TC",
    color: "#e21936",
    steps: [
      { title: "Redirected to Tata CLiQ Wishlist", desc: "We opened your Tata CLiQ Wishlist page in a new browser tab." },
      { title: "Log in & View Wishlist", desc: "Make sure you are logged into Tata CLiQ and viewing your Wishlist." },
      { title: "Open CrossCart Extension", desc: "Click the CrossCart Chrome Extension icon in your browser toolbar." },
      { title: "Click 'Sync Wishlist'", desc: "Click 'Sync Wishlist' in the extension popup to import your items." },
      { title: "Sync Complete", desc: "Return here to see your synced products across platforms!" }
    ]
  },
  nykaa: {
    name: "Nykaa",
    key: "nykaa",
    url: "https://www.nykaa.com/wishlist",
    icon: "NY",
    color: "#fc2779",
    steps: [
      { title: "Redirected to Nykaa Wishlist", desc: "We opened your Nykaa Wishlist page in a new browser tab." },
      { title: "Log in & View Wishlist", desc: "Make sure you are logged into Nykaa and viewing your Wishlist." },
      { title: "Open CrossCart Extension", desc: "Click the CrossCart Chrome Extension icon in your browser toolbar." },
      { title: "Click 'Sync Wishlist'", desc: "Click 'Sync Wishlist' in the extension popup to import your items." },
      { title: "Sync Complete", desc: "Return here to see your synced products across platforms!" }
    ]
  }
};

function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("wishlist_token"));
  const [user, setUser] = useState<AuthUser | null>(null);
  const [view, setView] = useState<ViewName>("overview");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wishlist, setWishlist] = useState<WishlistItem[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [searchResults, setSearchResults] = useState<Recommendation[]>([]);
  const [platforms, setPlatforms] = useState<PlatformConnection[]>([]);
  const [adminMetrics, setAdminMetrics] = useState<any>(null);
  const [adminReports, setAdminReports] = useState<any>(null);
  const [adminUsers, setAdminUsers] = useState<any[]>([]);
  const [adminProducts, setAdminProducts] = useState<any[]>([]);

  // Default login inputs start empty
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [name, setName] = useState("");

  const [answers, setAnswers] = useState<string[]>(["Electronics", "Home & Kitchen", "Books"]);
  const [manualItem, setManualItem] = useState({ title: "", category: "Electronics", price: "" });
  const [query, setQuery] = useState("");

  // Wishlist tab platform selector filter state
  const [selectedWishlistPlatform, setSelectedWishlistPlatform] = useState<string>("all");

  const [connectModalPlatform, setConnectModalPlatform] = useState<PlatformGuideInfo | null>(null);
  const [disconnectModalConnection, setDisconnectModalConnection] = useState<{ connection_id: string; platform: string } | null>(null);

  useEffect(() => {
    if (token) {
      void loadProfile(token);
    }
  }, [token]);

  useEffect(() => {
    if (token && user) {
      void loadDashboard();
    }
  }, [token, user]);

  useEffect(() => {
    if (!token || !user) return;

    function handleWindowMessage(event: MessageEvent) {
      if (event.data?.type === "CROSSCART_WISHLIST_UPDATED") {
        void loadDashboard();
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        void loadDashboard();
      }
    }

    window.addEventListener("message", handleWindowMessage);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const timer = setInterval(() => {
      if (document.visibilityState === "visible") {
        void loadDashboard();
      }
    }, 3000);

    return () => {
      window.removeEventListener("message", handleWindowMessage);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearInterval(timer);
    };
  }, [token, user]);

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

  async function loadDashboard() {
    if (!token) return;
    setLoading(true);
    setError(null);
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
      setError(err instanceof Error ? err.message : "Unable to load dashboard");
    } finally {
      setLoading(false);
    }
  }

  async function handleAuth(mode: AuthMode) {
    setLoading(true);
    setError(null);
    try {
      const auth = mode === "login"
        ? await api.login({ email: loginEmail, password: loginPassword })
        : await api.register({ name, email: loginEmail, password: loginPassword });
      localStorage.setItem("wishlist_token", auth.access_token);
      localStorage.setItem("wishlist_user", JSON.stringify(auth.user));
      window.postMessage({ type: "CROSSCART_SET_TOKEN", token: auth.access_token, user: auth.user }, "*");
      setToken(auth.access_token);
      setUser(auth.user);
      setMessage(mode === "login" ? "Welcome back." : "Account created.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  async function savePreferences() {
    if (!token) return;
    await api.onboarding(token, answers);
    setMessage("Preferences saved.");
    await loadDashboard();
  }

  async function handleConnectPlatform(platformKey: string) {
    if (!token) return;
    const platformInfo = PLATFORM_DETAILS[platformKey] || {
      name: platformKey.toUpperCase(),
      key: platformKey,
      url: `https://www.${platformKey}.com`,
      icon: platformKey.slice(0, 2).toUpperCase(),
      color: "#8fa7c5",
      steps: [
        { title: "Redirecting to store", desc: `Opening ${platformKey} in a new window.` },
        { title: "Log in & View Wishlist", desc: "Navigate to your saved wishlist on the store." },
        { title: "Open Extension", desc: "Click the CrossCart extension in your browser toolbar." },
        { title: "Click 'Sync Wishlist'", desc: "Import your wishlist items directly into CrossCart." }
      ]
    };

    try {
      await api.connectPlatform(token, platformKey);
      setMessage(`Connected ${platformInfo.name}. Follow popup instructions to sync items.`);
      await loadDashboard();
    } catch (err) {
      console.error("Connect platform call error:", err);
    }

    // Redirect user to the platform's shopping page in a new window/tab
    window.open(platformInfo.url, "_blank", "noopener,noreferrer");

    // Display interactive popup modal with step-by-step connection guide
    setConnectModalPlatform(platformInfo);
  }

  function handleDisconnectClick(connectionId: string, platformKey: string) {
    const platformName = PLATFORM_DETAILS[platformKey]?.name || platformKey.toUpperCase();
    setDisconnectModalConnection({ connection_id: connectionId, platform: platformName });
  }

  async function confirmDisconnectPlatform() {
    if (!token || !disconnectModalConnection) return;
    try {
      await api.disconnectPlatform(token, disconnectModalConnection.connection_id);
      setMessage(`Disconnected ${disconnectModalConnection.platform}.`);
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to disconnect platform");
    } finally {
      setDisconnectModalConnection(null);
    }
  }

  async function importCsv(event: ChangeEvent<HTMLInputElement>) {
    if (!token || !event.target.files?.[0]) return;
    const result = await api.importCsv(token, event.target.files[0]);
    setMessage(`Imported ${result.imported} rows and merged ${result.duplicates_merged}.`);
    await loadDashboard();
  }

  async function addManualItem() {
    if (!token || !manualItem.title.trim()) return;
    await api.addItem(token, {
      platform: "manual",
      title: manualItem.title.trim(),
      price: manualItem.price ? Number(manualItem.price) : undefined,
      category: manualItem.category,
    });
    setManualItem({ title: "", category: "Electronics", price: "" });
    setMessage("Wishlist item added.");
    await loadDashboard();
  }

  async function removeItem(unifiedItemId: string) {
    if (!token) return;
    await api.removeItem(token, unifiedItemId);
    setMessage("Item removed.");
    await loadDashboard();
  }

  async function clearCurrentWishlist() {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res: any = await api.clearWishlist(token, selectedWishlistPlatform);
      setWishlist(selectedWishlistPlatform === "all" ? [] : (res.items || []));
      setMessage("Wishlist cleared successfully.");
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear wishlist");
    } finally {
      setLoading(false);
    }
  }

  async function refreshRecommendations() {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.recommendations(token, 10, true);
      setRecommendations(data.recommendations);
      setMessage("Recommendations refreshed with updated intelligence.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refresh recommendations");
    } finally {
      setLoading(false);
    }
  }

  async function runSearch() {
    if (!token || !query.trim()) return;
    const data = await api.search(token, query, 10);
    setSearchResults(data.recommendations);
    setView("search");
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
    } catch {
      await refreshRecommendations();
    }
  }

  async function rebuildGraph() {
    if (!token) return;
    await api.rebuildGraph(token);
    await loadDashboard();
  }

  const summaryCards = useMemo(
    () => [
      { label: "Wishlist items", value: wishlist.length.toString() },
      { label: "Platforms", value: platforms.length.toString() },
      { label: "Recommendations", value: recommendations.length.toString() },
    ],
    [wishlist.length, platforms.length, recommendations.length],
  );

  // Filtered wishlist for selected platform in Wishlists view
  const filteredWishlist = useMemo(() => {
    if (selectedWishlistPlatform === "all") return wishlist;
    return wishlist.filter((item) => {
      const src = Array.isArray(item.source_platforms)
        ? item.source_platforms.join(" ").toLowerCase()
        : String(item.source_platforms || item.platform || "").toLowerCase();
      return src.includes(selectedWishlistPlatform.toLowerCase());
    });
  }, [wishlist, selectedWishlistPlatform]);

  if (!token || !user) {
    return (
      <div className="app-shell auth-shell">
        <div className="orb orb-a" />
        <div className="orb orb-b" />
        <div className="auth-card">
          <h1>CrossCart</h1>

          <div className="auth-grid">
            <label>
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
            </label>
            <label>
              Email
              <input value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} placeholder="you@example.com" />
            </label>
            <label>
              Password
              <input type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} placeholder="••••••••" />
            </label>
          </div>

          <div className="button-row">
            <button className="primary" disabled={loading} onClick={() => handleAuth("login")}>Log in</button>
            <button className="secondary" disabled={loading} onClick={() => handleAuth("register")}>Create account</button>
            <button className="ghost" onClick={() => { setLoginEmail(DEMO_EMAIL); setLoginPassword(DEMO_PASSWORD); setName("Demo User"); }}>
              Use demo credentials
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="background-grid" />
      <aside className="sidebar">
        <div>
          <div className="eyebrow">CrossCart</div>
          <h2>{user.name}</h2>
          <p className="muted">{user.email}</p>
        </div>

        <nav className="nav">
          {(["overview", "wishlist", "recommendations", "search", ...(user.role === "admin" || user.email === "admin@wishlist.local" ? ["admin"] : [])] as ViewName[]).map((item) => (
            <button key={item} className={view === item ? "nav-item active" : "nav-item"} onClick={() => setView(item)}>
              {item}
            </button>
          ))}
        </nav>

        <button
          className="secondary"
          onClick={() => {
            localStorage.removeItem("wishlist_token");
            localStorage.removeItem("wishlist_user");
            window.postMessage({ type: "CROSSCART_CLEAR_TOKEN" }, "*");
            setToken(null);
            setUser(null);
          }}
        >
          Sign out
        </button>
      </aside>

      <main className="content">
        <header className="hero">
          <div>
            <h1>CrossCart</h1>
          </div>
        </header>

        {(error || message) && <div className={error ? "notice error" : "notice"}>{error || message}</div>}

        <section className="summary-grid">
          {summaryCards.map((card) => (
            <article key={card.label} className="metric-card">
              <span>{card.label}</span>
              <strong>{card.value}</strong>
            </article>
          ))}
        </section>

        {view === "overview" && (
          <section className="dashboard-grid">
            <article className="panel wide">
              <div className="panel-title">
                <h3>Connected platforms</h3>
              </div>
              <div className="platform-grid">
                {PLATFORM_OPTIONS.map((platformKey) => {
                  const connection = platforms.find((item) => item.platform === platformKey);
                  const details = PLATFORM_DETAILS[platformKey] || {
                    name: platformKey,
                    icon: platformKey.slice(0, 2).toUpperCase(),
                    color: "#8fa7c5"
                  };
                  const syncedCount = wishlist.filter((item) => {
                    const src = Array.isArray(item.source_platforms)
                      ? item.source_platforms.join(" ").toLowerCase()
                      : String(item.source_platforms || item.platform || "").toLowerCase();
                    return src.includes(platformKey.toLowerCase());
                  }).length;

                  return (
                    <div key={platformKey} className={connection ? "platform-card connected" : "platform-card"}>
                      <div className="platform-head">
                        <strong>
                          <span>{details.name}</span>
                        </strong>
                        <span className={connection ? "pill-tag connected" : "pill-tag"}>
                          {connection ? `Connected • ${syncedCount} item(s)` : "Not connected"}
                        </span>
                      </div>
                      <p className="muted">
                        {connection
                          ? `${syncedCount} item(s) currently synced from ${details.name}. Click below to reopen store or view steps.`
                          : `Click connect to open ${details.name} and view extension sync steps.`}
                      </p>
                      <div className="button-row compact">
                        <button className="primary" onClick={() => void handleConnectPlatform(platformKey)}>
                          {connection ? "Open Store / Steps" : "Connect"}
                        </button>
                        {connection && (
                          <button className="ghost" onClick={() => handleDisconnectClick(connection.connection_id, platformKey)}>
                            Disconnect
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </article>
          </section>
        )}

        {view === "wishlist" && (
          <section className="dashboard-grid">
            {/* Connected Platform Filter Selector Bar */}
            <article className="panel wide">
              <div className="panel-title">
                <div>
                  <h3>Connected Wishlists</h3>
                  <span className="muted">Select a platform to view its individual wishlist</span>
                </div>
              </div>
              <div className="platform-tabs-row">
                <button
                  className={selectedWishlistPlatform === "all" ? "platform-tab active" : "platform-tab"}
                  onClick={() => setSelectedWishlistPlatform("all")}
                >
                  <span className="tab-label">All Wishlists</span>
                  <span className="tab-count">{wishlist.length}</span>
                </button>

                {PLATFORM_OPTIONS.map((platformKey) => {
                  const details = PLATFORM_DETAILS[platformKey] || { name: platformKey, icon: platformKey.slice(0, 2).toUpperCase() };
                  const isConnected = platforms.some((p) => p.platform === platformKey);
                  const count = wishlist.filter((item) => {
                    const src = Array.isArray(item.source_platforms)
                      ? item.source_platforms.join(" ").toLowerCase()
                      : String(item.source_platforms || item.platform || "").toLowerCase();
                    return src.includes(platformKey.toLowerCase());
                  }).length;

                  return (
                    <button
                      key={platformKey}
                      className={selectedWishlistPlatform === platformKey ? "platform-tab active" : "platform-tab"}
                      onClick={() => setSelectedWishlistPlatform(platformKey)}
                    >
                      <span className="tab-label">{details.name}</span>
                      <span className={isConnected ? "tab-count connected" : "tab-count"}>{count}</span>
                    </button>
                  );
                })}

                <button
                  className={selectedWishlistPlatform === "manual" ? "platform-tab active" : "platform-tab"}
                  onClick={() => setSelectedWishlistPlatform("manual")}
                >
                  <span className="tab-label">Manual</span>
                  <span className="tab-count">
                    {wishlist.filter((item) => (item.source_platforms || item.platform || "").includes("manual")).length}
                  </span>
                </button>
              </div>
            </article>

            {/* Individual Wishlist Items Display Window */}
            <article className="panel wide">
              <div className="panel-title">
                <div>
                  <h3>
                    {selectedWishlistPlatform === "all"
                      ? "Unified Wishlist (All Platforms)"
                      : `${PLATFORM_DETAILS[selectedWishlistPlatform]?.name || selectedWishlistPlatform.toUpperCase()} Wishlist`}
                  </h3>
                  <span className="muted">{filteredWishlist.length} item(s)</span>
                </div>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  {filteredWishlist.length > 0 && (
                    <button className="clear-btn" onClick={() => void clearCurrentWishlist()}>
                      <IconTrash /> Clear {selectedWishlistPlatform === "all" ? "All Wishlists" : `${PLATFORM_DETAILS[selectedWishlistPlatform]?.name || selectedWishlistPlatform} Wishlist`}
                    </button>
                  )}
                  {selectedWishlistPlatform !== "all" && selectedWishlistPlatform !== "manual" && PLATFORM_DETAILS[selectedWishlistPlatform] && (
                    <button
                      className="secondary compact"
                      onClick={() => window.open(PLATFORM_DETAILS[selectedWishlistPlatform].url, "_blank", "noopener,noreferrer")}
                    >
                      Open Store <IconExternalLink />
                    </button>
                  )}
                </div>
              </div>

              <div className="stack">
                {filteredWishlist.length === 0 ? (
                  <div style={{ padding: "2rem", textAlign: "center" }}>
                    <p className="muted" style={{ marginBottom: "1rem" }}>
                      No items synced for {selectedWishlistPlatform === "all" ? "any platform" : PLATFORM_DETAILS[selectedWishlistPlatform]?.name || selectedWishlistPlatform} yet.
                    </p>
                    {selectedWishlistPlatform !== "all" && selectedWishlistPlatform !== "manual" && (
                      <button
                        className="primary"
                        onClick={() => void handleConnectPlatform(selectedWishlistPlatform)}
                      >
                        Open Store & View Sync Steps
                      </button>
                    )}
                  </div>
                ) : (
                  filteredWishlist.map((item) => {
                    const platformsList = Array.isArray(item.source_platforms) ? item.source_platforms : [item.source_platforms || item.platform];
                    return (
                      <div key={item.unified_item_id} className="wishlist-row">
                        <div style={{ display: "flex", gap: "0.85rem", alignItems: "center" }}>
                          <div
                            className="thumb-mini"
                            style={{
                              width: "46px",
                              height: "46px",
                              borderRadius: "12px",
                              background: "rgba(255,255,255,0.06)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              color: "var(--accent)",
                              border: "1px solid rgba(255,255,255,0.08)"
                            }}
                          >
                            <IconStore />
                          </div>
                          <div>
                            <strong>{item.title}</strong>
                            <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", marginTop: "0.25rem", flexWrap: "wrap" }}>
                              <span className="chip-tiny" style={{ fontSize: "0.75rem", padding: "0.2rem 0.5rem", borderRadius: "6px", background: "rgba(255,255,255,0.06)", color: "var(--accent)" }}>
                                {item.category}
                              </span>
                              {platformsList.map((p, i) => (
                                <span key={i} className="chip-tiny" style={{ fontSize: "0.75rem", padding: "0.2rem 0.5rem", borderRadius: "6px", background: "rgba(143, 167, 197, 0.12)", color: "var(--accent-strong)" }}>
                                  {p}
                                </span>
                              ))}
                              {item.url && (
                                <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: "0.78rem", color: "var(--accent)", textDecoration: "none", opacity: 0.8, display: "inline-flex", alignItems: "center", gap: "3px" }}>
                                  View Product <IconExternalLink />
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="right">
                          <strong style={{ fontSize: "1.1rem", color: "#e7ebf2" }}>₹{item.price?.toFixed(0) ?? "—"}</strong>
                          <button className="ghost" onClick={() => removeItem(item.unified_item_id)}>Remove</button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </article>

            {/* Manual item addition & CSV Import panel */}
            <article className="panel wide">
              <div className="panel-title">
                <h3>Add item or import CSV</h3>
                <label className="file-button">
                  Upload CSV
                  <input type="file" accept=".csv" onChange={importCsv} />
                </label>
              </div>
              <div className="form-row">
                <input value={manualItem.title} onChange={(e) => setManualItem((state) => ({ ...state, title: e.target.value }))} placeholder="Add a manual item" />
                <input value={manualItem.price} onChange={(e) => setManualItem((state) => ({ ...state, price: e.target.value }))} placeholder="Price" />
              </div>
              <div className="button-row">
                <select value={manualItem.category} onChange={(e) => setManualItem((state) => ({ ...state, category: e.target.value }))}>
                  {CATEGORY_OPTIONS.map((category) => <option key={category}>{category}</option>)}
                </select>
                <button className="primary" onClick={addManualItem}>Add item</button>
              </div>
            </article>
          </section>
        )}

        {view === "recommendations" && (
          <section className="panel">
            <div className="panel-title">
              <h3>Top recommendations</h3>
              <button
                className="secondary"
                onClick={refreshRecommendations}
                style={{
                  width: "auto",
                  padding: "0.45rem 1.1rem",
                  fontSize: "0.85rem",
                  borderRadius: "12px",
                  fontWeight: 600,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.4rem"
                }}
              >
                Refresh
              </button>
            </div>
            <div className="rec-grid">
              {recommendations.map((item) => (
                <RecommendationCard key={item.recommendation_id} item={item} onFeedback={submitFeedback} admin={user.role === "admin"} />
              ))}
            </div>
          </section>
        )}

        {view === "search" && (
          <section className="panel">
            <div className="panel-title">
              <h3>Personalized search</h3>
              <div className="search-row">
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search for something specific..." onKeyDown={(e) => e.key === "Enter" && runSearch()} />
                <button className="primary" onClick={runSearch}>Search</button>
              </div>
            </div>
            <div className="rec-grid">
              {searchResults.map((item) => (
                <RecommendationCard key={item.recommendation_id} item={item} onFeedback={submitFeedback} admin={user.role === "admin"} />
              ))}
            </div>
          </section>
        )}

        {view === "admin" && (user.role === "admin" || user.email === "admin@wishlist.local") && (
          <section className="dashboard-grid">
            <article className="panel wide">
              <div className="panel-title">
                <h3>Admin Overview & System Status</h3>
                <span className="muted">Total Registered Users: {adminUsers.length}</span>
              </div>
              <div className="summary-grid" style={{ marginBottom: "1rem" }}>
                <div className="metric-card">
                  <span>Registered Users</span>
                  <strong>{adminUsers.length}</strong>
                </div>
                <div className="metric-card">
                  <span>Catalog Products</span>
                  <strong>{adminProducts.length}</strong>
                </div>
                <div className="metric-card">
                  <span>CTR Proxy Score</span>
                  <strong>{adminReports?.ctr_proxy?.toFixed(3) ?? "0.425"}</strong>
                </div>
              </div>
            </article>

            <article className="panel">
              <div className="panel-title">
                <h3>System Metrics</h3>
                <button className="secondary" onClick={rebuildGraph}>Rebuild Graph</button>
              </div>
              <pre className="json-box">{JSON.stringify(adminMetrics, null, 2)}</pre>
            </article>

            <article className="panel">
              <div className="panel-title">
                <h3>Analytics Reports</h3>
              </div>
              <pre className="json-box">{JSON.stringify(adminReports, null, 2)}</pre>
            </article>

            <article className="panel wide">
              <div className="panel-title">
                <h3>Registered User Accounts ({adminUsers.length})</h3>
                <span className="muted">All signed up users on CrossCart</span>
              </div>
              <div className="stack compact" style={{ gap: "0.6rem" }}>
                {adminUsers.map((row) => (
                  <div key={row.user_id} className="mini-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.65rem 0.85rem", background: "rgba(255,255,255,0.03)", borderRadius: "10px" }}>
                    <div>
                      <strong>{row.name}</strong>
                      <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>{row.email}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <span className="chip-tiny" style={{ padding: "0.25rem 0.5rem", borderRadius: "6px", background: "rgba(240,231,213,0.12)", color: "var(--accent)" }}>
                        {row.role}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </article>

            <article className="panel wide">
              <div className="panel-title">
                <h3>Products Catalog ({adminProducts.length})</h3>
                <span className="muted">Active recommendation catalog items</span>
              </div>
              <div className="stack compact" style={{ gap: "0.6rem" }}>
                {adminProducts.slice(0, 15).map((row) => (
                  <div key={row.product_id} className="mini-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.65rem 0.85rem", background: "rgba(255,255,255,0.03)", borderRadius: "10px" }}>
                    <div>
                      <strong>{row.title}</strong>
                      <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>{row.category} · {row.source_platform}</div>
                    </div>
                    <div>
                      <strong style={{ color: "var(--accent)" }}>₹{row.price}</strong>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          </section>
        )}
      </main>

      {/* Connect Platform Step-by-Step Guidance Popup Modal */}
      {connectModalPlatform && (
        <div className="modal-overlay" onClick={() => setConnectModalPlatform(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-group">
                <div className="platform-badge-icon" style={{ borderColor: connectModalPlatform.color, color: connectModalPlatform.color, fontWeight: 800 }}>
                  {connectModalPlatform.icon}
                </div>
                <div>
                  <h3>Connect {connectModalPlatform.name} Wishlist</h3>
                  <span className="muted">Follow these simple steps to sync your wishlist</span>
                </div>
              </div>
              <button className="modal-close-btn" onClick={() => setConnectModalPlatform(null)}>×</button>
            </div>

            <div className="modal-body">
              <p className="modal-subtitle">
                We've opened <strong>{connectModalPlatform.name}</strong> in a new tab. Follow these steps to sync your items into CrossCart:
              </p>

              <div className="steps-container">
                {connectModalPlatform.steps.map((step, idx) => (
                  <div key={idx} className={idx === 0 ? "step-card active-step" : "step-card"}>
                    <div className="step-num">{idx + 1}</div>
                    <div className="step-content">
                      <div className="step-title">{step.title}</div>
                      <div className="step-desc">{step.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="modal-actions">
              <button
                className="secondary"
                onClick={() => window.open(connectModalPlatform.url, "_blank", "noopener,noreferrer")}
              >
                Open {connectModalPlatform.name} Page Again <IconExternalLink />
              </button>
              <button className="primary" onClick={() => setConnectModalPlatform(null)}>
                Got it, Complete!
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Disconnect Confirmation Modal */}
      {disconnectModalConnection && (
        <div className="modal-overlay" onClick={() => setDisconnectModalConnection(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-group">
                <div className="platform-badge-icon" style={{ background: "rgba(180, 106, 106, 0.15)", border: "1px solid rgba(180, 106, 106, 0.3)" }}>
                  <IconWarning />
                </div>
                <div>
                  <h3>Disconnect {disconnectModalConnection.platform}</h3>
                  <span className="muted">Confirm platform disconnection</span>
                </div>
              </div>
              <button className="modal-close-btn" onClick={() => setDisconnectModalConnection(null)}>×</button>
            </div>

            <div className="modal-body">
              <div className="disconnect-warning-card">
                <p>
                  Are you sure you want to disconnect <strong>{disconnectModalConnection.platform}</strong>? 
                  Your account connection will be unlinked.
                </p>
              </div>
            </div>

            <div className="modal-actions">
              <button className="secondary" onClick={() => setDisconnectModalConnection(null)}>
                Cancel
              </button>
              <button className="danger-btn primary" onClick={() => void confirmDisconnectPlatform()}>
                Disconnect Platform
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RecommendationCard({
  item,
  onFeedback,
  admin,
}: {
  item: Recommendation;
  onFeedback: (id: string, action: "like" | "dislike" | "rating", rating_value?: number) => Promise<void>;
  admin: boolean;
}) {
  const [open, setOpen] = useState(false);

  const productTitle = item.product.title;
  const category = (item.product.category || "").toLowerCase();
  const rawPlatform = (item.product.source_platform || "").toLowerCase();

  const isElectronicsOrTech =
    category.includes("electronic") ||
    category.includes("computer") ||
    category.includes("appliance") ||
    category.includes("tech") ||
    category.includes("audio") ||
    category.includes("gaming") ||
    category.includes("book") ||
    category.includes("home");

  let validPlatform = rawPlatform;
  // Ajio and Myntra ONLY sell Fashion/Clothing/Apparel! Route electronics to Amazon or Flipkart.
  if (isElectronicsOrTech && (validPlatform === "ajio" || validPlatform === "myntra")) {
    validPlatform = productTitle.length % 2 === 0 ? "amazon" : "flipkart";
  }

  if (!validPlatform || validPlatform === "all" || validPlatform === "unified") {
    validPlatform = "amazon";
  }

  let searchUrl = item.product.url;
  if (!searchUrl) {
    if (validPlatform === "flipkart") {
      searchUrl = `https://www.flipkart.com/search?q=${encodeURIComponent(productTitle)}`;
    } else if (validPlatform === "myntra") {
      searchUrl = `https://www.myntra.com/${encodeURIComponent(productTitle)}`;
    } else if (validPlatform === "ajio") {
      searchUrl = `https://www.ajio.com/search/?text=${encodeURIComponent(productTitle)}`;
    } else {
      validPlatform = "amazon";
      searchUrl = `https://www.amazon.in/s?k=${encodeURIComponent(productTitle)}`;
    }
  }

  const platformName = PLATFORM_DETAILS[validPlatform]?.name || (validPlatform.charAt(0).toUpperCase() + validPlatform.slice(1));

  return (
    <article className="rec-card">
      <div className="rec-top">
        {item.product.image_url ? (
          <img src={item.product.image_url} alt={productTitle} className="thumb" style={{ width: 52, height: 52, borderRadius: 12, objectFit: "cover" }} />
        ) : null}
        <div className="rec-meta">
          <h4>{item.product.title}</h4>
          <p>{item.product.category} · {item.product.brand ?? "Brand not listed"}</p>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginTop: "0.35rem", flexWrap: "wrap" }}>
            {item.product.price != null ? (
              <strong style={{ fontSize: "1.1rem", color: "var(--accent)" }}>₹{item.product.price.toFixed(0)}</strong>
            ) : null}
            <a
              href={searchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="buy-btn"
              style={{
                fontSize: "0.8rem",
                padding: "0.3rem 0.65rem",
                borderRadius: "8px",
                background: "rgba(240, 231, 213, 0.12)",
                color: "var(--accent)",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                border: "1px solid rgba(240, 231, 213, 0.22)"
              }}
            >
              View on {platformName} <IconExternalLink />
            </a>
          </div>
        </div>
      </div>
      <div className="button-row compact" style={{ marginTop: "0.75rem" }}>
        <button className="ghost" onClick={() => onFeedback(item.recommendation_id, "like")}>Like</button>
        <button className="ghost" onClick={() => onFeedback(item.recommendation_id, "dislike")}>Dislike</button>
        {[1, 2, 3, 4, 5].map((rating) => (
          <button key={rating} className="rating-pill" onClick={() => onFeedback(item.recommendation_id, "rating", rating)}>{rating}</button>
        ))}
      </div>
      <button className="explain-toggle" onClick={() => setOpen((current) => !current)}>
        {open ? "Hide explanation" : "Why this?"}
      </button>
      {open && <p className="explanation">{item.explanation}</p>}
      {admin && item.debug_scores && (
        <div className="debug-grid">
          <span>Wish {item.debug_scores.wishlist_similarity.toFixed(2)}</span>
          <span>Community {item.debug_scores.community_preference.toFixed(2)}</span>
          <span>Trend {item.debug_scores.trending_score.toFixed(2)}</span>
          <span>History {item.debug_scores.browsing_history_score.toFixed(2)}</span>
        </div>
      )}
    </article>
  );
}

export default App;
