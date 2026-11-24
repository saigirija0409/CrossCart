const statusEl = document.getElementById("status");
const siteEl = document.getElementById("site");
const userBadgeEl = document.getElementById("userBadge");
const syncBtn = document.getElementById("sync");

const PLATFORM_ICONS = {
  Amazon: "Amazon",
  Flipkart: "Flipkart",
  Myntra: "Myntra",
  Ajio: "Ajio",
  "Tata CLiQ": "Tata CLiQ",
  Nykaa: "Nykaa",
  "Google Search": "Google Search",
};

function detectPlatform(url) {
  if (!url) return { name: "No active tab", icon: "No active tab" };
  if (url.includes("amazon.in")) return { name: "amazon", icon: PLATFORM_ICONS.Amazon };
  if (url.includes("flipkart.com")) return { name: "flipkart", icon: PLATFORM_ICONS.Flipkart };
  if (url.includes("myntra.com")) return { name: "myntra", icon: PLATFORM_ICONS.Myntra };
  if (url.includes("ajio.com")) return { name: "ajio", icon: PLATFORM_ICONS.Ajio };
  if (url.includes("tatacliq.com")) return { name: "tatacliq", icon: PLATFORM_ICONS["Tata CLiQ"] };
  if (url.includes("nykaa.com")) return { name: "nykaa", icon: PLATFORM_ICONS.Nykaa };
  if (url.includes("google.com/search") || url.includes("google.co.in/search")) return { name: "google", icon: PLATFORM_ICONS["Google Search"] };
  return { name: "unsupported", icon: "Unsupported site" };
}

const APP_URL_PATTERNS = [
  "http://localhost:5173/*",
  "http://localhost:5174/*",
  "http://127.0.0.1:5173/*",
  "http://127.0.0.1:5174/*",
  "https://*.onrender.com/*",
  "https://*.render.com/*",
  "https://*.vercel.app/*"
];

function isCrossCartUrl(url) {
  if (!url) return false;
  return url.includes("localhost:517") ||
    url.includes("127.0.0.1:517") ||
    url.includes(".onrender.com") ||
    url.includes(".render.com") ||
    url.includes(".vercel.app");
}

async function getStoredAuth() {
  // Always query active open CrossCart web tabs first to get live user token & API base
  try {
    const allTabs = await chrome.tabs.query({}).catch(() => []);
    const appTabs = allTabs.filter(tab => isCrossCartUrl(tab.url));
    for (const tab of appTabs) {
      if (tab.id) {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => ({
            token: localStorage.getItem("wishlist_token"),
            user: localStorage.getItem("wishlist_user"),
            origin: window.location.origin,
          }),
        }).catch(() => null);

        const res = results?.[0]?.result;
        if (res?.token) {
          let userObj = null;
          if (res.user) {
            try { userObj = JSON.parse(res.user); } catch (e) {}
          }
          const storageUpdate = { authToken: res.token, user: userObj };
          if (res.origin) {
            storageUpdate.apiBase = res.origin;
          }
          await chrome.storage.local.set(storageUpdate);
          return { token: res.token, user: userObj, apiBase: res.origin };
        }
      }
    }
  } catch (e) {
    console.warn("Error querying CrossCart tab storage:", e);
  }

  // Fallback to stored token if no active tab found
  const data = await chrome.storage.local.get(["authToken", "user", "apiBase"]);
  if (data.authToken) {
    return { token: data.authToken, user: data.user, apiBase: data.apiBase };
  }

  return { token: null, user: null, apiBase: null };
}

async function init() {
  const { token, user } = await getStoredAuth();

  if (token) {
    userBadgeEl.textContent = `${user?.name || "Logged in"}`;
    userBadgeEl.style.background = "rgba(195, 142, 180, 0.2)";
    userBadgeEl.style.borderColor = "#C38EB4";
    statusEl.textContent = "Ready to sync wishlist items into CrossCart.";
    statusEl.className = "status success";
  } else {
    userBadgeEl.textContent = "Not logged in";
    userBadgeEl.style.background = "rgba(134, 168, 207, 0.15)";
    userBadgeEl.style.borderColor = "rgba(134, 168, 207, 0.35)";
    statusEl.textContent = "Please open your CrossCart website and log in.";
    statusEl.className = "status error";
  }

  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tabs[0]?.url || "";
  const platform = detectPlatform(url);
  siteEl.textContent = platform.icon;
}

syncBtn.addEventListener("click", async () => {
  syncBtn.disabled = true;
  statusEl.textContent = "Extracting wishlist items...";
  statusEl.className = "status";

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    statusEl.textContent = "No active browser tab found.";
    statusEl.className = "status error";
    syncBtn.disabled = false;
    return;
  }

  const { token } = await getStoredAuth();
  if (!token) {
    statusEl.textContent = "Please open the CrossCart web tab and log in first.";
    statusEl.className = "status error";
    syncBtn.disabled = false;
    return;
  }

  let response = await chrome.tabs.sendMessage(tab.id, { type: "SCRAPE_NOW" }).catch(() => null);

  if (!response?.items?.length) {
    const platform = detectPlatform(tab.url || "").name;

    // A newly installed or reloaded extension may not yet have its content script
    // in an already-open tab. Inject the canonical scraper once, then ask it again.
    if (!["unsupported", "No active tab", "google"].includes(platform)) {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content-scripts/shared.js", `content-scripts/${platform}.js`],
      }).catch(() => null);
      response = await chrome.tabs.sendMessage(tab.id, { type: "SCRAPE_NOW" }).catch(() => null);
    }
  }

  if (!response?.items?.length) {
    statusEl.textContent = "No wishlist items found on this page. Open your shopping wishlist page and try again.";
    statusEl.className = "status error";
    syncBtn.disabled = false;
    return;
  }

  statusEl.textContent = "Syncing items to CrossCart...";

  const syncResponse = await chrome.runtime.sendMessage({
    type: "SYNC_ITEMS",
    platform: response.platform,
    items: response.items,
    token,
  });

  if (!syncResponse?.ok) {
    statusEl.textContent = `Sync failed: ${syncResponse?.error || "Unknown server error"}`;
    statusEl.className = "status error";
    syncBtn.disabled = false;
    return;
  }

  statusEl.textContent = `All items synced from ${response.platform}. Return to CrossCart to view them.`;
  statusEl.className = "status success";
  syncBtn.disabled = false;
});

init().catch((err) => {
  statusEl.textContent = "Popup error: " + err.message;
  statusEl.className = "status error";
});
