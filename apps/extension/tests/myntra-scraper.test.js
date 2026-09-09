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
    if (name === "href" && this.href) return this.href;
    return this.attributes[name] || null;
  }

  querySelector(selector) {
    if (selector === "a[href]" && this.productLink) return this.productLink;
    return null;
  }

  querySelectorAll() {
    return [];
  }

  closest() {
    return null;
  }
}

test("scrapes the current Myntra numeric product-link wishlist layout", () => {
  const body = new FakeElement();
  const card = new FakeElement({
    parent: body,
    text: "OUT OF STOCK Nike Air Force 1 '07 LV8 Men's Shoes Rs.10,795 SHOW SIMILAR",
  });
  const productLink = new FakeElement({ href: "https://www.myntra.com/38974798", parent: card });
  card.productLink = productLink;

  const document = {
    body,
    querySelector: () => null,
    querySelectorAll: (selector) => selector === "a[href]" ? [productLink] : [],
  };
  const window = { location: { href: "https://www.myntra.com/wishlist" } };
  const context = {
    URL,
    document,
    window,
    chrome: { runtime: { sendMessage() {}, onMessage: { addListener() {} } } },
  };
  vm.runInNewContext(fs.readFileSync("apps/extension/content-scripts/shared.js", "utf8"), context);

  const items = window.wishlistScraper.scrapeWishlistItems("myntra");
  assert.deepEqual(JSON.parse(JSON.stringify(items)), [{
    platform: "myntra",
    title: "Nike Air Force 1 '07 LV8 Men's Shoes",
    price: 10795,
    category: "",
    url: "https://www.myntra.com/38974798",
    platform_product_id: "https://www.myntra.com/38974798",
    raw_payload: {
      platform: "myntra",
      extracted_from: "https://www.myntra.com/wishlist",
      text: "OUT OF STOCK Nike Air Force 1 '07 LV8 Men's Shoes Rs.10,795 SHOW SIMILAR",
    },
  }]);
});
