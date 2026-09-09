(() => {
  // Container element selectors for primary wishlist containers on each platform
  const PLATFORM_CONTAINERS = {
    amazon: [
      "#g-items",
      "ul#g-items",
      "#wishlist-page",
      "#wishlist-item-list",
      ".g-items",
      "[id^='g-items']"
    ],
    flipkart: [
      "div._3bhnx",
      "div.wishlist-container",
      "div._1AtVbE",
      "div._13oc-S",
      "div[class*='wishlist']",
      "div[class*='FKCP']",
      "#container"
    ],
    myntra: [
      "ul.index-listGrid",
      "div.wishlist-container",
      "div.index-wishListContainer",
      "div[class*='wishlist']",
      "div[class*='listGrid']",
      "div[class*='wishListContainer']",
      "ul[class*='listGrid']"
    ],
    ajio: [
      "div.my-wishlist-item-grid",
      "div.wishlist-grid",
      "div.grid-container",
      "#wishlist"
    ],
    tatacliq: [
      "div.WishlistWeb-productCard",
      "div[class*='WishlistWeb']",
      "div[class*='ProductCard']",
      "div[class*='PlpComponentWeb']",
      "div[class*='grid']"
    ],
    nykaa: [
      "div[class*='wishlist']",
      "main"
    ],
  };

  // Specific item card selectors for each platform inside the wishlist container
  const PLATFORM_ITEM_SELECTORS = {
    amazon: [
      "li[id^='item_']",
      "div[id^='item_']",
      "li.g-item-sortable",
      "div[id^='itemMain_']",
      "li[data-itemid]",
      "div[data-itemid]",
      "li[data-item-id]"
    ],
    flipkart: [
      "div._3bhnx",
      "div.item-card",
      "div._1AtVbE[data-id]",
      "div[data-id]",
      "div[class*='_3Yg2L0']",
      "div[class*='_2kHMt3']",
      "div[class*='_13oc-S']",
      "div[class*='cPHuR3']",
      "div[class*='wishlist-row']"
    ],
    myntra: [
      "div.itemcard-itemCard",
      "div.product-base",
      "ul.index-listGrid > li",
      "div[class*='itemCard']",
      "li[class*='itemCard']",
      "div[class*='product-base']"
    ],
    ajio: [
      "div.item-card",
      "div.my-wishlist-item",
      "div.grid-item"
    ],
    tatacliq: [
      "div.WishlistWeb-productCard",
      "div[class*='WishlistWeb']",
      "div[class*='ProductCard']",
      "div[class*='product-card']"
    ],
    nykaa: [
      "div[class*='wishlist-card']",
      "div[class*='product-wrapper']",
      "div[class*='productCard']"
    ],
  };

  // Exclude elements that belong to recommendation / sponsored / carousel widgets outside the wishlist
  const EXCLUDE_SELECTORS = [
    "#rhf",
    "#desktop-dp-sims",
    "#sims-consolidated",
    ".a-carousel",
    ".p13n-sc-shoveler",
    "[id*='rhf']",
    "[id*='recommendations']",
    "[id*='similar']",
    "[id*='izooto']",
    "[class*='izooto']",
    "[class*='notification']",
    "[id*='notification']",
    "[class*='toast']",
    "[data-component-type='s-impression-logger']",
    "[aria-label*='Sponsored']",
    "[aria-label*='Recommended']",
    "[aria-label*='Browsing History']",
    "[aria-label*='Customers who']",
    ".similar-products",
    ".recommendations",
    ".sponsored"
  ];

  const TITLE_SELECTORS = [
    "[id^='itemName_']",
    ".itemcard-itemTitle",
    ".itemcard-itemBrand",
    ".itemcard-itemDetails",
    ".product-product",
    ".product-brand",
    "a[id^='itemName_']",
    "a[title]",
    ".a-link-normal[title]",
    "h2 a",
    "h3 a",
    "h4 a",
    "div[class*='title']",
    "div[class*='name']",
    "span[class*='title']",
    "span[class*='name']",
    "a[href*='/p/']",
    "a[href*='/dp/']",
    ".title",
    ".product-title",
    ".itemTitle",
    "img[alt]",
  ];

  const NAVBAR_CATEGORY_HEADERS = new Set([
    "beauty & grooming", "men", "women", "kids", "home & living", "studio",
    "grooming", "beauty", "footwear", "accessories", "offers", "coupons",
    "gift cards", "customer care", "myntra insider", "track orders", "contact us",
    "topwear", "bottomwear", "indian & festive wear", "innerwear & nightwear",
    "watches", "sunglasses & frames", "sports & active wear", "gadgets",
    "jewellery", "handbags", "bags & backpacks", "luggage & trolleys"
  ]);

  const BLACKLIST_PATTERNS = /^(sign in|log in|your account|returns & orders|returns and orders|subscribe & save|subscribe and save|your orders|business account|cart|help|customer service|wish list|wishlist|menu|search|home|filters|sort by|privacy notice|conditions of use|select all|delete item|add to cart|move to bag|add to bag|move to cart|select size|remove|done|see all buying options|end of list|next|previous|buy again|deliver to|amazon pay|gift cards|\d+%\s*off|flat\s*\d+%\s*off|assured|ratings?|reviews?|off|caps under|belts under|sunglasses under|items under|deals under|shirts under|tshirts under|pants under|jeans under|jackets under|shoes under|dresses under|kurtas under|you have no new updates.*|latest offers.*|.*izooto.*|.*notification.*)$/i;

  const PRICE_PATTERN = /(?:₹|Rs\.?|INR|\$)\s?[\d,]+(?:\.\d{1,2})?/;

  function cleanText(value) {
    return (value || "").replace(/\s+/g, " ").trim();
  }

  function isGarbageTitle(title) {
    if (!title || title.length < 4) return true;
    const t = title.toLowerCase().trim();
    if (NAVBAR_CATEGORY_HEADERS.has(t)) return true;
    if (BLACKLIST_PATTERNS.test(t)) return true;
    if (t.includes("no new updates") || t.includes("latest offers") || t.includes("izooto") || t.includes("notification")) return true;
    if (/\b(shirts?|tshirts?|pants?|jeans?|jackets?|caps?|belts?|sunglasses?|shoes?|dresses?|kurtas?|items?|deals?|products?|brands?)\s+under\b/i.test(t)) return true;
    if (/\bunder\s+(?:₹|Rs\.?|INR|\$)?\s?\d+\b/i.test(t)) return true;
    if (/^\s*.*under\s+\d+.*$/i.test(t)) return true;
    if (/\b\d{1,2}%\s*off\b/i.test(t) || /\bflat\s*\d{1,2}%\s*off\b/i.test(t)) return true;
    return false;
  }

  function cleanTitle(value) {
    if (!value) return "";
    let text = (value || "").replace(/\s+/g, " ").trim();
    // Remove appended prices
    text = text.replace(/(?:₹|Rs\.?|INR|\$)\s?[\d,]+(?:\.\d{1,2})?/gi, "");
    // Remove discount badges like 30% off, 37% off, flat 50% off
    text = text.replace(/\b\d{1,2}%\s*off\b/gi, "");
    text = text.replace(/\bflat\s*\d{1,2}%\s*off\b/gi, "");
    text = text.replace(/\bsave\s+(?:₹|Rs\.?|INR|\$)?\s?[\d,]+\b/gi, "");
    text = text.replace(/\bmrp\s*:?\s*(?:₹|Rs\.?|INR|\$)?\s?[\d,]+\b/gi, "");
    text = text.replace(/\b(move to bag|add to bag|move to cart|select size|remove|done|show similar)\b/gi, "");
    text = text.replace(/\b(assured|sponsored|free delivery|in stock|out of stock)\b/gi, "");
    text = text.replace(/\s+/g, " ").trim();
    return text;
  }

  function parsePrice(value) {
    if (!value) return "";
    const clean = cleanText(value);
    const symbolMatch = clean.match(/(?:₹|Rs\.?|INR|\$)\s?[\d,]+(?:\.\d{1,2})?/i);
    if (symbolMatch) {
      return symbolMatch[0]
        .replace(/(?:₹|Rs\.?|INR|\$)\s*/i, "")
        .replace(/,/g, "");
    }
    const numberMatch = clean.match(/[\d,]+(?:\.\d{1,2})?/);
    if (numberMatch) {
      const numStr = numberMatch[0].replace(/,/g, "");
      const val = parseFloat(numStr);
      if (val > 0 && val < 500000) {
        return val.toString();
      }
    }
    return "";
  }

  function getTitle(node) {
    // 1. Myntra specific combined brand + product details check
    const myntraBrand = node.querySelector(".itemcard-itemTitle, .itemcard-itemBrand, .product-brand");
    const myntraDetails = node.querySelector(".itemcard-itemDetails, .product-product, p.itemcard-itemDetails, a.itemcard-itemCardLink");
    if (myntraBrand || myntraDetails) {
      const bText = cleanTitle(myntraBrand?.textContent || "");
      const dText = cleanTitle(myntraDetails?.textContent || "");
      let combined = "";
      if (bText && dText && !dText.toLowerCase().includes(bText.toLowerCase())) {
        combined = `${bText} - ${dText}`;
      } else {
        combined = dText || bText;
      }
      if (combined && combined.length >= 4 && !isGarbageTitle(combined)) {
        return cleanTitle(combined);
      }
    }

    // 2. Dedicated title selectors
    for (const selector of TITLE_SELECTORS) {
      const el = node.querySelector(selector);
      if (!el) continue;
      
      const clone = el.cloneNode(true);
      // Remove child elements that represent prices, discounts, badges or buttons
      clone.querySelectorAll("span[class*='price'], div[class*='price'], [class*='discount'], [class*='off'], [class*='badge'], [class*='action'], [class*='button'], [class*='btn'], [class*='bag'], [class*='remove'], button, svg").forEach((e) => e.remove());
      
      const raw = clone.getAttribute("title") || clone.getAttribute("alt") || clone.textContent || "";
      const cleaned = cleanTitle(raw);
      if (cleaned && cleaned.length >= 4 && !isGarbageTitle(cleaned)) {
        return cleaned;
      }
    }

    // 3. Fallback: check product links inside container
    const links = node.querySelectorAll("a[href*='/p/'], a[href*='/dp/'], a[href*='/buy/'], a[title], a");
    for (const link of links) {
      const clone = link.cloneNode(true);
      clone.querySelectorAll("span[class*='price'], div[class*='price'], [class*='discount'], [class*='off'], [class*='badge'], [class*='action'], [class*='button'], [class*='btn'], [class*='bag'], [class*='remove'], button, svg").forEach((e) => e.remove());
      
      const raw = clone.getAttribute("title") || clone.textContent || "";
      const cleaned = cleanTitle(raw);
      if (cleaned && cleaned.length >= 5 && !isGarbageTitle(cleaned) && !PRICE_PATTERN.test(cleaned)) {
        return cleaned;
      }
    }
    return "";
  }

  function extractId(node) {
    const attrs = ["data-itemid", "data-item-id", "data-id", "data-product-id", "id"];
    for (const attr of attrs) {
      const value = node.getAttribute?.(attr);
      if (value && value !== "g-items" && value !== "wishlist-page") return cleanText(value);
    }
    const link = node.querySelector("a[href]");
    if (link?.href) {
      return cleanText(link.href.split("?")[0]).slice(0, 120);
    }
    return "";
  }

  function isExcludedNode(node) {
    if (node.closest("header, nav")) return true;
    for (const sel of EXCLUDE_SELECTORS) {
      if (node.closest(sel)) return true;
    }
    return false;
  }

  function extractCandidatesFromNodes(nodes, platform, globalSeen) {
    const items = [];
    for (const node of nodes) {
      if (!node || isExcludedNode(node)) continue;
      const title = getTitle(node);
      if (!title || isGarbageTitle(title)) continue;
      const text = cleanText(node.textContent || "");
      const rawPrice = parsePrice(text);
      const numericPrice = rawPrice ? parseFloat(rawPrice) : null;

      const productId = extractId(node);
      const url = node.querySelector("a[href]")?.href || window.location.href;
      
      const titleKey = title.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (globalSeen.has(titleKey)) continue;
      globalSeen.add(titleKey);
      if (productId) globalSeen.add(`id:${productId}`);

      items.push({
        platform,
        title,
        price: numericPrice,
        category: "",
        url,
        platform_product_id: productId || url,
        raw_payload: {
          platform,
          extracted_from: window.location.href,
          text: text.slice(0, 500),
        },
      });
    }
    return items;
  }

  function scrapePriceAnchoredFallback(platform, globalSeen) {
    const items = [];
    // Search elements containing currency symbols
    const candidates = Array.from(document.querySelectorAll("span, div, p, a, td, strong, b")).filter((el) => {
      if (el.children.length > 2) return false;
      const txt = cleanText(el.textContent || "");
      return PRICE_PATTERN.test(txt) && txt.length < 50;
    });

    for (const pEl of candidates) {
      let container = pEl;
      let depth = 0;
      let foundCard = null;

      while (container && container !== document.body && depth < 6) {
        container = container.parentElement;
        depth++;
        if (!container) break;

        const text = cleanText(container.textContent || "");
        if (text.length >= 15 && text.length <= 1200) {
          const title = getTitle(container);
          if (title && !isGarbageTitle(title)) {
            foundCard = container;
            break;
          }
        }
      }

      if (foundCard) {
        const extracted = extractCandidatesFromNodes([foundCard], platform, globalSeen);
        items.push(...extracted);
      }
    }
    return items;
  }

  // Myntra's current wishlist uses numeric product URLs (for example `/36427710`)
  // and does not consistently expose the older itemcard CSS class names. Find those
  // product links, then use the smallest price-containing ancestor as the card.
  function scrapeMyntraProductLinkFallback(globalSeen) {
    const items = [];
    const productLinks = Array.from(document.querySelectorAll("a[href]")).filter((link) => {
      try {
        return /^\/\d+\/?$/.test(new URL(link.href, window.location.href).pathname);
      } catch (_error) {
        return false;
      }
    });

    for (const link of productLinks) {
      if (link.closest("header, nav, footer, .desktop-footer, [class*='footer']")) continue;

      let card = link.parentElement;
      let depth = 0;
      while (card && card !== document.body && depth < 6) {
        const text = cleanText(card.textContent || "");
        if (PRICE_PATTERN.test(text) && text.length >= 15 && text.length <= 1200) break;
        card = card.parentElement;
        depth++;
      }
      if (!card || card === document.body) continue;

      const title = cleanTitle(card.textContent || "");
      if (!title || isGarbageTitle(title)) continue;

      const titleKey = title.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (globalSeen.has(titleKey)) continue;
      globalSeen.add(titleKey);
      globalSeen.add(`id:${link.href}`);

      const rawPrice = parsePrice(card.textContent || "");
      items.push({
        platform: "myntra",
        title,
        price: rawPrice ? parseFloat(rawPrice) : null,
        category: "",
        url: link.href,
        platform_product_id: link.href,
        raw_payload: {
          platform: "myntra",
          extracted_from: window.location.href,
          text: cleanText(card.textContent || "").slice(0, 500),
        },
      });
    }
    return items;
  }

  const WISHLIST_PATHS = {
    amazon: /\/(?:hz\/wishlist|gp\/registry\/wishlist)/i,
    flipkart: /\/wishlist(?:\/|$|\?)/i,
    myntra: /\/wishlist(?:\/|$|\?)/i,
    ajio: /\/wishlist(?:\/|$|\?)/i,
    tatacliq: /\/wishlist(?:\/|$|\?)/i,
    nykaa: /\/wishlist(?:\/|$|\?)/i,
  };

  function isWishlistPage(platform) {
    try {
      const location = new URL(window.location.href);
      return Boolean(WISHLIST_PATHS[platform]?.test(`${location.pathname}${location.search}`));
    } catch (_error) {
      return false;
    }
  }

  // Nykaa's generated CSS class names are shared by product grids throughout the
  // site. Wishlist cards do, however, have a stable "Move to bag" action and a
  // canonical `/p/<numeric id>` product link. Anchor extraction to both signals so
  // recommendations, category links, and footer content can never inflate counts.
  function scrapeNykaaWishlist(globalSeen) {
    const items = [];
    const productLinks = Array.from(document.querySelectorAll("a[href*='/p/']")).filter((link) => {
      try {
        return /\/p\/\d+\/?$/i.test(new URL(link.href, window.location.href).pathname);
      } catch (_error) {
        return false;
      }
    });

    for (const link of productLinks) {
      let card = link.parentElement;
      let depth = 0;
      while (card && card !== document.body && depth < 7) {
        const moveButton = card.querySelector("button[aria-label^='Move to bag'], button[aria-label*='Move to bag']");
        if (moveButton) break;
        card = card.parentElement;
        depth++;
      }
      if (!card || card === document.body || isExcludedNode(card)) continue;

      const rawLabel =
        link.getAttribute("aria-label") ||
        link.getAttribute("title") ||
        link.querySelector("img[alt]")?.getAttribute("alt") ||
        link.textContent || "";
      const title = cleanTitle(rawLabel.split(/\b(?:regular|discounted) price\b/i)[0]);
      if (!title || isGarbageTitle(title)) continue;

      const productId = link.href.split("?")[0];
      if (globalSeen.has(`id:${productId}`)) continue;
      globalSeen.add(`id:${productId}`);

      const priceText = cleanText(`${card.textContent || ""} ${rawLabel}`);
      const priceMatches = Array.from(priceText.matchAll(/(?:₹|Rs\.?|INR|\$)\s?([\d,]+(?:\.\d{1,2})?)/gi));
      const rawPrice = priceMatches.length
        ? priceMatches[priceMatches.length - 1][1].replace(/,/g, "")
        : parsePrice(priceText);
      items.push({
        platform: "nykaa",
        title,
        price: rawPrice ? parseFloat(rawPrice) : null,
        category: "",
        url: productId,
        platform_product_id: productId,
        raw_payload: {
          platform: "nykaa",
          extracted_from: window.location.href,
          text: cleanText(card.textContent || "").slice(0, 500),
        },
      });
    }
    return items;
  }

  function scrapeWishlistItems(platform) {
    if (!isWishlistPage(platform)) return [];

    const globalSeen = new Set();
    let items = [];

    if (platform === "nykaa") {
      return scrapeNykaaWishlist(globalSeen);
    }

    // Step 1: Find primary wishlist container if present on the page
    const containerSelectors = PLATFORM_CONTAINERS[platform] || [];
    let rootContainer = null;
    for (const sel of containerSelectors) {
      const el = document.querySelector(sel);
      if (el) {
        rootContainer = el;
        break;
      }
    }

    // Never scrape the entire storefront. If a provider's wishlist container is
    // not recognized, return no items instead of importing unrelated products.
    if (!rootContainer && platform !== "myntra") return [];

    const searchContext = rootContainer || document;
    const itemSelectors = PLATFORM_ITEM_SELECTORS[platform] || ["article", "li", "div"];

    // Step 2: Extract items matching platform item selectors within search context
    for (const selector of itemSelectors) {
      const nodes = Array.from(searchContext.querySelectorAll(selector));
      const extracted = extractCandidatesFromNodes(nodes, platform, globalSeen);
      items = items.concat(extracted);
    }

    // Myntra migrated its wishlist card markup but keeps stable numeric product URLs.
    if (items.length === 0 && platform === "myntra") {
      items = scrapeMyntraProductLinkFallback(globalSeen);
    }

    return items;
  }

  window.wishlistScraper = {
    scrapeWishlistItems,
  };
})();
