(() => {
  const platform = "myntra";

  const GARBAGE_EXPRESSIONS = new Set([
    "beauty & grooming", "men", "women", "kids", "home & living", "studio", "genz",
    "grooming", "beauty", "footwear", "accessories", "offers", "coupons",
    "gift cards", "customer care", "myntra insider", "track orders", "contact us",
    "move to bag", "add to bag", "select size", "remove", "done", "you have no new updates",
    "latest offers", "latest offers powered by izooto", "izooto", "notification",
    "blog", "careers", "press", "corporate information", "whitehat", "cleartrip",
    "terms of use", "privacy policy", "security", "sitemap", "erc compliance", "about us",
    "help", "faq", "t&c"
  ]);

  function isGarbage(t) {
    if (!t || t.length < 4) return true;
    const clean = t.toLowerCase().trim();
    if (GARBAGE_EXPRESSIONS.has(clean)) return true;
    if (clean.includes("no new updates") || clean.includes("latest offers") || clean.includes("izooto") || clean.includes("notification") || clean.includes("powered by")) return true;
    if (/\b(shirts?|tshirts?|pants?|jeans?|jackets?|caps?|belts?|sunglasses?|shoes?|dresses?|kurtas?|items?|deals?|products?|brands?)\s+under\b/i.test(clean)) return true;
    return false;
  }

  function cleanMyntraTitle(val) {
    if (!val) return "";
    let text = (val || "").replace(/\s+/g, " ").trim();
    text = text.replace(/(?:₹|Rs\.?|INR|\$)\s?(?:[\d,]+|NaN)/gi, "");
    text = text.replace(/\b\d{1,2}%\s*off\b/gi, "");
    text = text.replace(/\bflat\s*\d{1,2}%\s*off\b/gi, "");
    text = text.replace(/\b(out of stock|show similar|move to bag|add to bag|select size|remove|done)\s*/gi, "");
    text = text.replace(/\(\s*\)/g, "");
    return text.replace(/\s+/g, " ").trim();
  }

  function directMyntraScrape() {
    const scraped = [];
    const seen = new Set();

    // Strategy 1: Search top-level product card elements inside wishlist area
    const cardSelectors = [
      "ul.index-listGrid > li",
      "div.itemcard-itemCard",
      "div[class*='itemCard-itemCard']",
      "div.product-base",
      "div[class*='wishlist-container'] div[class*='card']"
    ];

    const cards = Array.from(document.querySelectorAll(cardSelectors.join(",")));

    for (const card of cards) {
      if (card.closest("header, nav, footer, .desktop-footer, [class*='footer']")) continue;

      const brandEl = card.querySelector(".itemcard-itemTitle, .itemcard-itemBrand, .product-brand, div[class*='brand']");
      const titleEl = card.querySelector(".itemcard-itemDetails, .product-product, p.itemcard-itemDetails, a.itemcard-itemCardLink, div[class*='title'], h4, h3");

      const brand = cleanMyntraTitle(brandEl?.textContent || "");
      const details = cleanMyntraTitle(titleEl?.textContent || "");

      let title = "";
      if (brand && details) {
        if (details.toLowerCase().includes(brand.toLowerCase())) {
          title = details;
        } else {
          title = `${brand} - ${details}`;
        }
      } else {
        title = details || brand || card.getAttribute("title") || "";
      }

      title = cleanMyntraTitle(title);
      if (isGarbage(title)) continue;

      const key = title.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (seen.has(key)) continue;
      seen.add(key);

      const priceText = card.textContent || "";
      const priceMatch = priceText.match(/(?:₹|Rs\.?|INR|\$)\s?([\d,]+)/i) || priceText.match(/[\d,]+/);
      let price = null;
      if (priceMatch) {
        const parsed = parseFloat(priceMatch[1] ? priceMatch[1].replace(/,/g, "") : priceMatch[0].replace(/,/g, ""));
        if (parsed > 0 && parsed < 500000) price = parsed;
      }

      const linkEl = card.querySelector("a[href]") || card.closest("a[href]");
      const url = linkEl?.href || window.location.href;

      scraped.push({
        platform,
        title,
        price,
        category: "",
        url,
        platform_product_id: url,
        raw_payload: { platform, extracted_from: window.location.href }
      });
    }

    // Strategy 2: Fallback strictly to product links (/buy or /p/) if Strategy 1 found nothing
    if (!scraped.length) {
      const links = Array.from(document.querySelectorAll("a[href*='/buy'], a[href*='/p/']"));
      for (const link of links) {
        if (link.closest("header, nav, footer, .desktop-footer, [class*='footer']")) continue;

        const img = link.querySelector("img[alt]");
        const altText = img ? img.getAttribute("alt") : "";
        const linkText = link.textContent || "";
        const rawTitle = cleanMyntraTitle(altText || linkText || link.getAttribute("title") || "");

        if (isGarbage(rawTitle)) continue;

        const key = rawTitle.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (seen.has(key)) continue;
        seen.add(key);

        scraped.push({
          platform,
          title: rawTitle,
        price: null,
          category: "",
          url: link.href || window.location.href,
          platform_product_id: link.href || window.location.href,
          raw_payload: { platform, extracted_from: window.location.href }
        });
      }
    }

    return scraped;
  }

  function getMyntraItems() {
    let items = window.wishlistScraper?.scrapeWishlistItems ? window.wishlistScraper.scrapeWishlistItems(platform) : [];
    if (!items.length) {
      items = directMyntraScrape();
    }
    return items;
  }

  const items = getMyntraItems();
  chrome.runtime.sendMessage({ type: "SCRAPE_RESULT", platform, items });
  if (!items.length) {
    chrome.runtime.sendMessage({ type: "SCRAPE_EMPTY", platform });
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "SCRAPE_NOW") {
      sendResponse({ platform, items: getMyntraItems() });
    }
  });
})();
