const API_BASE = "http://localhost:8000";

async function getAuthToken() {
  const result = await chrome.storage.local.get(["authToken"]);
  return result.authToken || null;
}

async function postSync(platform, items, tokenOverride = null) {
  const token = tokenOverride || await getAuthToken();
  if (!token) {
    return { ok: false, error: "Please log into the CrossCart web application first." };
  }

  const cleanPlatform = (platform || "manual").toLowerCase();

  // 1. Sync the scraped wishlist items
  const response = await fetch(`${API_BASE}/api/wishlist/sync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ platform: cleanPlatform, items }),
  });

  if (!response.ok) {
    return { ok: false, error: await response.text() };
  }

  // 2. Register/update platform connection state in database
  try {
    await fetch(`${API_BASE}/api/platforms/connect`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ platform: cleanPlatform }),
    });
  } catch (err) {
    console.warn("Auto platform connection register warning:", err);
  }

  const appTabs = await chrome.tabs.query({ url: ["http://localhost:5173/*", "http://localhost:5174/*", "http://127.0.0.1:5173/*", "http://127.0.0.1:5174/*"] }).catch(() => []);
  for (const tab of appTabs) {
    if (tab.id) {
      chrome.tabs.sendMessage(tab.id, { type: "WISHLIST_UPDATED" }).catch(() => {});
    }
  }

  return { ok: true, data: await response.json() };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "SCRAPE_RESULT") {
    postSync(message.platform, message.items).then(sendResponse);
    return true;
  }
  if (message?.type === "SCRAPE_EMPTY") {
    sendResponse({ ok: false, error: `No wishlist items found on ${message.platform}.` });
  }
  if (message?.type === "SAVE_TOKEN") {
    chrome.storage.local.set({ authToken: message.token, user: message.user }).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message?.type === "CLEAR_TOKEN") {
    chrome.storage.local.remove(["authToken", "user"]).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message?.type === "SYNC_ITEMS") {
    postSync(message.platform, message.items, message.token).then(sendResponse);
    return true;
  }
});
