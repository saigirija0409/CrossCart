(() => {
  const platform = "ajio";
  const items = window.wishlistScraper?.scrapeWishlistItems(platform) || [];
  chrome.runtime.sendMessage({ type: "SCRAPE_RESULT", platform, items });
  if (!items.length) {
    chrome.runtime.sendMessage({ type: "SCRAPE_EMPTY", platform });
  }
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "SCRAPE_NOW") {
      sendResponse({ platform, items: window.wishlistScraper?.scrapeWishlistItems(platform) || [] });
    }
  });
})();
