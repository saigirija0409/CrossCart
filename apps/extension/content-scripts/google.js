(() => {
  const platform = "google_search";

  function cleanText(value) {
    return (value || "").replace(/\s+/g, " ").trim();
  }

  function parsePrice(text) {
    const match = cleanText(text).match(/₹\s?[\d,]+(?:\.\d{1,2})?/);
    return match ? Number(match[0].replace(/[^\d.]/g, "")) : null;
  }

  function scrapeGoogleResults() {
    const cards = Array.from(document.querySelectorAll("div.g, div[data-snc], div[data-snc] div"));
    const seen = new Set();
    const items = [];

    for (const card of cards) {
      const heading = card.querySelector("h3");
      const link = card.querySelector("a[href]");
      if (!heading || !link) continue;
      const title = cleanText(heading.textContent);
      if (!title || seen.has(title)) continue;
      const text = cleanText(card.textContent);
      seen.add(title);
      items.push({
        platform,
        title,
        price: parsePrice(text),
        category: "Search Result",
        url: link.href,
        platform_product_id: link.href.split("?")[0],
        raw_payload: {
          platform,
          extracted_from: window.location.href,
          snippet: text.slice(0, 500),
        },
      });
    }

    return items.slice(0, 25);
  }

  const items = scrapeGoogleResults();
  chrome.runtime.sendMessage({ type: "SCRAPE_RESULT", platform, items });
  if (!items.length) {
    chrome.runtime.sendMessage({ type: "SCRAPE_EMPTY", platform });
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "SCRAPE_NOW") {
      sendResponse({ platform, items: scrapeGoogleResults() });
    }
  });
})();
