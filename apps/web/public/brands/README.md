# Store brand marks

Each file is the store's own app icon, served from this app rather than a
third-party favicon service, so the UI has no runtime dependency on an outside
host and works offline.

| File           | Source                              | Native size |
| -------------- | ----------------------------------- | ----------- |
| `amazon.png`   | amazon.in app icon                  | 48×48       |
| `flipkart.png` | flipkart.com app icon               | 256×256     |
| `myntra.png`   | myntra.com app icon                 | 180×180     |
| `ajio.png`     | ajio.com favicon                    | 24×24       |
| `tatacliq.png` | tatacliq.com app icon               | 144×144     |
| `nykaa.png`    | nykaa.com app icon                  | 230×230     |

`ajio.png` (and, on high-DPI screens, `amazon.png`) is below the 40 px tile size
the UI renders at — Ajio publishes nothing larger than 32×32. To sharpen either,
drop a bigger square PNG in with the same filename; no code change is needed.
`PlatformLogo` in `src/App.tsx` resolves `/brands/<platform key>.png` and falls
back to a lettered chip if a file is missing.

These logos are trademarks of their respective owners and appear here only to
identify the stores CrossCart integrates with.

## Product brand marks — `products/`

76 PNGs for the *product* brands that appear in the wishlist and in the
recommendation feed (Nike, Fossil, Samsung, Zara, …), named by slug:
lowercased, non-alphanumerics collapsed to `-` (`Dot & Key` → `dot-key.png`,
`H&M` → `h-m.png`). `BrandLogo` in `src/App.tsx` resolves
`/brands/products/<slug>.png` and falls back to a lettered plate on a 404, so
adding a brand is just dropping in a correctly named file.

Ten brands are deliberately absent — the icon services returned a placeholder or
the wrong company's mark for them (e.g. Fitbit resolved to Google's "G",
Roadster to Myntra's "M" since it is a Myntra house brand). Those render the
lettered fallback rather than a wrong logo: `classmate`, `cosco`, `fortune`,
`navneet`, `nilkamal`, `aashirvaad`, `fitbit`, `roadster`, `l-oreal`,
`urban-ladder`.

Same trademark note as above: these marks identify the brands only.

Brands are matched to a file two ways: the catalog's `brand` column when it has
one, and otherwise the opening words of the product title (`brandFromTitle` in
`src/App.tsx`), since most rows arrive with `brand = NULL`. That matcher reads
`src/brandLogos.ts`, a generated list of the slugs in this folder — regenerate it
after adding files:

    ls apps/web/public/brands/products | sed 's/\.png$//' | sort

Woodland and Highlander publish no usable icon at any source tried, so items
from those brands still show their store's mark.
