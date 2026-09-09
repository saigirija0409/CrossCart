# CrossCart — one wishlist for every store

CrossCart pulls your wishlists out of six Indian marketplaces (Amazon, Flipkart,
Myntra, Ajio, Tata CLiQ, Nykaa), merges duplicates into a single list, and
recommends what to buy next using your own wishlist, the wishlists of people in
your community, and what is trending.

- **FastAPI backend** — auth, wishlist import and merging, a four-signal
  recommender, feedback learning, admin metrics, and a scheduled Leiden
  community-detection job.
- **React + Vite frontend** — glassmorphic UI, light/dark, real brand logos.
- **Chrome extension** — reads your wishlist pages on each store and syncs them.
- **Self-seeding SQLite** — 1500 catalog products and 80 synthetic users are
  generated on first boot, so the recommender has a real graph to work with.

---

## Quick start

Everything below is one command. It installs dependencies, starts both servers,
seeds a demo wishlist across all six stores, and prints the URLs and logins.

```bash
git clone https://github.com/saigirija0409/CrossCart.git
cd CrossCart
./scripts/run.sh
```

Then open **http://localhost:5173** and sign in:

| Role  | Email                   | Password     |
| ----- | ----------------------- | ------------ |
| Demo  | `demo@wishlist.local`   | `Demo1234!`  |
| Admin | `admin@wishlist.local`  | `Admin1234!` |

`Ctrl-C` stops both servers.

**Requirements:** Python 3.11+ and Node 18+. Nothing else — no Docker, no
database server, no API keys.

**Options:**

```bash
./scripts/run.sh --seed     # re-seed the demo wishlist over an existing database
./scripts/run.sh --fresh    # delete the local database and rebuild from scratch
```

First run takes 2–4 minutes: `igraph` and `leidenalg` compile, and the backend
generates its catalog and synthetic user graph before serving. Later runs start
in seconds.

<details>
<summary>Windows (PowerShell)</summary>

```powershell
git clone https://github.com/saigirija0409/CrossCart.git
cd CrossCart
python -m venv .venv
.venv\Scripts\pip install -r apps\api\requirements.txt
.venv\Scripts\python -m uvicorn apps.api.app.main:app --port 8000 --app-dir .
```

Then, in a second terminal:

```powershell
.venv\Scripts\python scripts\demo_seed.py
npm --prefix apps\web install
npm --prefix apps\web run dev
```

</details>

---

## The Chrome extension

The extension ships in this repo — there is nothing to download from a store.
Chrome cannot be scripted into loading an unpacked extension, so this is the one
manual step:

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the `apps/extension` folder inside this repo

Then, with the app open and signed in:

1. Visit your wishlist page on any supported store (e.g. `myntra.com/wishlist`)
2. Click the CrossCart icon in the toolbar → **Sync this store**
3. The item count on the dashboard updates within a few seconds

The extension picks up your login from the web app automatically, so there is no
separate sign-in. It only reads the wishlist pages listed in `manifest.json`.

**You do not need the extension to present.** `./scripts/run.sh` seeds a
28-item wishlist spanning all six stores, including two products saved on two
stores each so the merge behaviour is visible.

---

## What to show in a demo

1. **Overview** — items, connected stores and wishlist value across six stores.
2. **Wishlist** — every row carries its real brand logo. The `+1` badges on the
   Samsung Galaxy Watch6 and the Nike Air Force 1 mark products that were saved
   on two different stores and merged into one row. Filter by store along the top.
3. **For you** — ranked recommendations, each with a *Why this?* panel breaking
   the score into its four signals. Every card links to a search on the store the
   product came from.
4. **Feedback** — *More like this* / *Hide* / star rating. Hit **Refresh** and the
   ranking shifts; the learning survives a reload.
5. **Admin** (`admin@wishlist.local`) — catalog and user tables, live metrics, and
   the community-detection job history.

---

## How recommendations work

Each candidate product gets a blended score:

| Signal              | Weight | Source                                                  |
| ------------------- | ------ | ------------------------------------------------------- |
| Wishlist similarity | 0.40   | cosine similarity against your wishlist's profile vector |
| Community preference| 0.30   | what your Leiden community saves that you have not       |
| Trending            | 0.20   | recent save velocity across all users                    |
| Browsing behaviour  | 0.10   | your category interaction vector                         |

Users are connected in a similarity graph and partitioned with the Leiden
algorithm; the job reruns every 24 hours and on demand via
`POST /internal/jobs/rebuild-community-graph`. The weights are environment
variables (`WEIGHT_WISHLIST_SIM`, `WEIGHT_COMMUNITY_PREF`, `WEIGHT_TRENDING`,
`WEIGHT_BROWSING`) — see `apps/api/app/config.py`.

If `ANTHROPIC_API_KEY` is set, a Claude pass re-ranks the shortlist for
diversity and writes the explanations. Without it the deterministic ranker runs,
which is what the demo uses.

---

## Layout

```
apps/api          FastAPI backend (app/main.py routes, app/core.py logic)
apps/web          React + Vite frontend
apps/web/public/brands   store and product-brand logos, served locally
apps/extension    Chrome MV3 extension (content scripts per store)
scripts/run.sh    one-command bootstrap
scripts/demo_seed.py     pushes the demo wishlist through the public sync API
data              personas.json and the local SQLite database
tests             backend tests
```

## Tests

```bash
PYTHONPATH=. .venv/bin/pytest -q
```

## Notes

- The database is `data/app.db` and is gitignored. Delete it (or use `--fresh`)
  to start over; the backend rebuilds and reseeds on the next boot.
- Ports are 8000 (API) and 5173 (web). Vite proxies `/api` to the backend, so the
  frontend has no environment configuration.
- Store and brand logos are served from this repo rather than a favicon service,
  so the UI has no runtime dependency on an outside host. They are trademarks of
  their owners and identify the stores and brands only.
