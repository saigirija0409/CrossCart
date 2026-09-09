(() => {
  const platform = "amazon";
  function emit() {
    const items = window.wishlistScraper?.scrapeWishlistItems(platform) || [];
    chrome.runtime.sendMessage({ type: "SCRAPE_RESULT", platform, items });
    return items;
  }
  const items = emit();
  if (!items.length) {
    chrome.runtime.sendMessage({ type: "SCRAPE_EMPTY", platform });
  }
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "SCRAPE_NOW") {
      sendResponse({ platform, items: window.wishlistScraper?.scrapeWishlistItems(platform) || [] });
    }
  });
})();
