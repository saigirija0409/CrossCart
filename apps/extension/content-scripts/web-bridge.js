(() => {
  function getOriginApiBase() {
    return window.location.origin;
  }

  function syncTokenFromPage() {
    try {
      const token = localStorage.getItem("wishlist_token");
      const userRaw = localStorage.getItem("wishlist_user");
      let user = null;
      if (userRaw) {
        try { user = JSON.parse(userRaw); } catch (e) {}
      }
      if (token) {
        const apiBase = getOriginApiBase();
        chrome.runtime.sendMessage({ type: "SAVE_TOKEN", token, user, apiBase }).catch(() => {});
      }
    } catch (e) {}
  }

  // Sync token on initial load of CrossCart web app
  syncTokenFromPage();

  // Listen for login / token update messages sent by CrossCart web app
  window.addEventListener("message", (event) => {
    if (event.data?.type === "CROSSCART_SET_TOKEN") {
      const { token, user } = event.data;
      const apiBase = event.data.apiBase || getOriginApiBase();
      if (token) {
        chrome.runtime.sendMessage({ type: "SAVE_TOKEN", token, user, apiBase }).catch(() => {});
      }
    } else if (event.data?.type === "CROSSCART_CLEAR_TOKEN") {
      chrome.runtime.sendMessage({ type: "CLEAR_TOKEN" }).catch(() => {});
    }
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "WISHLIST_UPDATED") {
      window.postMessage({ type: "CROSSCART_WISHLIST_UPDATED" }, "*");
    }
  });

  // Re-check periodically or on visibility change
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      syncTokenFromPage();
      window.postMessage({ type: "CROSSCART_WISHLIST_UPDATED" }, "*");
    }
  });
})();
