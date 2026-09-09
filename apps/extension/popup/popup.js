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

async function getStoredAuth() {
  // Always query active open CrossCart web tabs first to get live user token
  try {
    const appTabs = await chrome.tabs.query({ url: ["http://localhost:5173/*", "http://localhost:5174/*", "http://127.0.0.1:5173/*", "http://127.0.0.1:5174/*"] });
    for (const tab of appTabs) {
      if (tab.id) {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => ({
            token: localStorage.getItem("wishlist_token"),
            user: localStorage.getItem("wishlist_user"),
          }),
        }).catch(() => null);

        const res = results?.[0]?.result;
        if (res?.token) {
          let userObj = null;
          if (res.user) {
            try { userObj = JSON.parse(res.user); } catch (e) {}
          }
          await chrome.storage.local.set({ authToken: res.token, user: userObj });
          return { token: res.token, user: userObj };
        }
      }
    }
  } catch (e) {
    console.warn("Error querying CrossCart tab storage:", e);
  }

  // Fallback to stored token if no active tab found
  const data = await chrome.storage.local.get(["authToken", "user"]);
  if (data.authToken) {
    return { token: data.authToken, user: data.user };
  }

  return { token: null, user: null };
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
    statusEl.textContent = "Please open CrossCart at http://localhost:5173 and log in.";
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
    statusEl.textContent = "Please open the CrossCart web tab (http://localhost:5173) and log in first.";
    statusEl.className = "status error";
    syncBtn.disabled = false;
    return;
  }

  let response = await chrome.tabs.sendMessage(tab.id, { type: "SCRAPE_NOW" }).catch(() => null);

  if (!response?.items?.length) {
    const url = tab.url || "";
    let platform = "unknown";
    if (url.includes("amazon")) platform = "amazon";
    else if (url.includes("flipkart")) platform = "flipkart";
    else if (url.includes("myntra")) platform = "myntra";
    else if (url.includes("ajio")) platform = "ajio";
    else if (url.includes("tatacliq")) platform = "tatacliq";
    else if (url.includes("nykaa")) platform = "nykaa";

    // Force-inject shared.js & platform content script into active tab context
    if (platform !== "unknown") {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content-scripts/shared.js", `content-scripts/${platform}.js`],
      }).catch(() => null);
    } else {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content-scripts/shared.js"],
      }).catch(() => null);
    }

    const evalResults = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (plat) => {
        const scraperItems = window.wishlistScraper?.scrapeWishlistItems ? window.wishlistScraper.scrapeWishlistItems(plat) : [];
        if (scraperItems.length) return { platform: plat, items: scraperItems };

        // Fallback 2-tier DOM extraction for Myntra & others
        const cardSelectors = [
          "ul.index-listGrid > li", "div.itemcard-itemCard", "div[class*='itemCard-itemCard']",
          "div.product-base", "div[class*='wishlist-container'] div[class*='card']"
        ];
        const cards = Array.from(document.querySelectorAll(cardSelectors.join(",")));
        const items = [];
        const seen = new Set();

        const badWords = [
          "no new updates", "latest offers", "izooto", "notification", "powered by",
          "beauty & grooming", "men", "women", "kids", "studio", "home & living", "genz",
          "blog", "careers", "press", "corporate information", "whitehat", "cleartrip",
          "terms of use", "privacy policy", "security", "sitemap", "erc compliance", "about us", "help", "faq"
        ];

        for (const card of cards) {
          if (card.closest("header, nav, footer, .desktop-footer, [class*='footer']")) continue;
          const brandEl = card.querySelector(".itemcard-itemTitle, .itemcard-itemBrand, .product-brand, div[class*='brand']");
          const titleEl = card.querySelector(".itemcard-itemDetails, .product-product, p.itemcard-itemDetails, a.itemcard-itemCardLink, div[class*='title'], h4, h3");
          
          const bText = (brandEl?.textContent || "").replace(/\s+/g, " ").trim();
          const dText = (titleEl?.textContent || "").replace(/\s+/g, " ").trim();
          let title = bText && dText ? (dText.toLowerCase().includes(bText.toLowerCase()) ? dText : `${bText} - ${dText}`) : (dText || bText);
          title = title.replace(/(?:₹|Rs\.?|INR|\$)\s?[\d,]+/gi, "").replace(/\b\d{1,2}%\s*off\b/gi, "").trim();

          const tLower = title.toLowerCase();
          if (title && title.length >= 4 && !badWords.some(w => tLower.includes(w))) {
            const key = title.toLowerCase().replace(/[^a-z0-9]/g, "");
            if (!seen.has(key)) {
              seen.add(key);
              items.push({ platform: plat, title, price: 499.0, category: "", url: window.location.href, platform_product_id: window.location.href, raw_payload: { platform: plat, extracted_from: window.location.href } });
            }
          }
        }

        if (!items.length) {
          const links = Array.from(document.querySelectorAll("a[href*='/buy'], a[href*='/p/']"));
          for (const link of links) {
            if (link.closest("header, nav, footer, .desktop-footer, [class*='footer']")) continue;
            const img = link.querySelector("img[alt]");
            const altText = img ? img.getAttribute("alt") : "";
            const linkText = link.textContent || "";
            let title = (altText || linkText || link.getAttribute("title") || "").replace(/\s+/g, " ").trim();
            title = title.replace(/(?:₹|Rs\.?|INR|\$)\s?[\d,]+/gi, "").replace(/\b\d{1,2}%\s*off\b/gi, "").trim();
            const tLower = title.toLowerCase();
            if (title && title.length >= 4 && !badWords.some(w => tLower.includes(w))) {
              const key = title.toLowerCase().replace(/[^a-z0-9]/g, "");
              if (!seen.has(key)) {
                seen.add(key);
                items.push({ platform: plat, title, price: 499.0, category: "", url: link.href || window.location.href, platform_product_id: link.href || window.location.href, raw_payload: { platform: plat, extracted_from: window.location.href } });
              }
            }
          }
        }

        return { platform: plat, items };
      },
      args: [platform],
    }).catch(() => null);

    if (evalResults?.[0]?.result?.items?.length) {
      response = evalResults[0].result;
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
