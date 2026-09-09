# Multi-Platform Wishlist Recommendation System

This repository implements the mini-project spec as a runnable full-stack app:

- FastAPI backend with auth, wishlist import, recommendations, feedback, admin metrics, and batch community detection.
- React + Vite frontend with a muted, smooth UI.
- Chrome extension scaffold for wishlist import.
- Seed scripts and tests for the core ranking and preprocessing logic.

## Layout

- `apps/api` - FastAPI backend
- `apps/web` - React frontend
- `apps/extension` - Chrome extension scaffold
- `data` - local seed data and the SQLite database
- `tests` - backend tests

## Run locally

Backend:

```powershell
cd apps/api
python -m uvicorn app.main:app --reload --port 8000
```

Frontend:

```powershell
cd apps/web
npm install
npm run dev
```

The backend seeds itself with demo data on first run.

