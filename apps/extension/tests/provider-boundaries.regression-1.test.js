const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");

class FakeElement {
  constructor({ text = "", href = "", parent = null, attributes = {} } = {}) {
    this.textContent = text;
    this.href = href;
    this.parentElement = parent;
    this.attributes = attributes;
  }
  getAttribute(name) {
    if (name === "href") return this.href || null;
    return this.attributes[name] || null;
  }
  querySelector(selector) {
    if (selector.includes("Move to bag")) return this.moveButton || null;
    if (selector === "img[alt]") return null;
    return null;
  }
  querySelectorAll() { return []; }
  closest() { return null; }
}

function loadScraper({ href, productLinks = [], roots = {} }) {
  const body = new FakeElement();
  const document = {
    body,
    querySelector: (selector) => roots[selector] || null,
    querySelectorAll: (selector) => selector === "a[href*='/p/']" ? productLinks : [],
  };
  const window = { location: { href } };
  vm.runInNewContext(
    fs.readFileSync("apps/extension/content-scripts/shared.js", "utf8"),
    { URL, document, window }
  );
  return { scraper: window.wishlistScraper, body };
}

// Regression: ISSUE-001 — Nykaa catalog/footer products inflated a one-item wishlist to 14
// Found by /qa on 2026-09-09
// Report: .gstack/qa-reports/qa-report-localhost-2026-09-09.md
test("Nykaa imports only canonical product links inside cards with a Move to bag action", () => {
  const body = new FakeElement();
  const wishlistCard = new FakeElement({ text: "Dot & Key Moisturizer ₹429", parent: body });
  wishlistCard.moveButton = new FakeElement();
  const wishlistLink = new FakeElement({
    href: "https://www.nykaa.com/dot-key-moisturizer/p/28813776",
    parent: wishlistCard,
    attributes: { "aria-label": "Dot & Key Moisturizer Regular price ₹499 Discounted price ₹429" },
  });
  const catalogCard = new FakeElement({ text: "Popular product ₹999", parent: body });
  const catalogLink = new FakeElement({
    href: "https://www.nykaa.com/popular-product/p/111111",
    parent: catalogCard,
    attributes: { "aria-label": "Popular product ₹999" },
  });
  const { scraper } = loadScraper({
    href: "https://www.nykaa.com/wishlist/",
    productLinks: [wishlistLink, catalogLink],
  });

  const items = JSON.parse(JSON.stringify(scraper.scrapeWishlistItems("nykaa")));
  assert.equal(items.length, 1);
  assert.equal(items[0].platform_product_id, "https://www.nykaa.com/dot-key-moisturizer/p/28813776");
  assert.equal(items[0].price, 429);
});

test("all providers refuse to scrape ordinary storefront pages", () => {
  const cases = {
    amazon: "https://www.amazon.in/s?k=shoes",
    flipkart: "https://www.flipkart.com/search?q=shoes",
    myntra: "https://www.myntra.com/shoes",
    ajio: "https://www.ajio.com/men-shoes/c/830207",
    tatacliq: "https://www.tatacliq.com/search/?searchCategory=all&text=shoes",
    nykaa: "https://www.nykaa.com/skin/c/8377",
  };
  for (const [platform, href] of Object.entries(cases)) {
    const { scraper } = loadScraper({ href });
    assert.deepEqual(JSON.parse(JSON.stringify(scraper.scrapeWishlistItems(platform))), []);
  }
});
