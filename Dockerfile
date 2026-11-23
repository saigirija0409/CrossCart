# -------------------------------------------------------------
# Stage 1: Build the React frontend
# -------------------------------------------------------------
FROM node:20-slim AS frontend-builder
WORKDIR /app/apps/web

COPY apps/web/package*.json ./
RUN npm ci

COPY apps/web/ ./
RUN npm run build

# -------------------------------------------------------------
# Stage 2: Runtime environment with Python
# -------------------------------------------------------------
FROM python:3.11-slim

WORKDIR /app

# Install curl for healthchecks and build-essential for any compiled wheels
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY apps/api/requirements.txt ./apps/api/requirements.txt
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r apps/api/requirements.txt

# Copy application files
COPY apps/ ./apps/
COPY data/ ./data/
COPY scripts/ ./scripts/
COPY entrypoint.sh ./entrypoint.sh

# Copy built frontend assets from Stage 1
COPY --from=frontend-builder /app/apps/web/dist ./apps/web/dist

# Ensure entrypoint script has LF line endings and is executable
RUN sed -i 's/\r$//' ./entrypoint.sh && chmod +x ./entrypoint.sh

# Environment variables
ENV PYTHONUNBUFFERED=1 \
    PORT=8000 \
    WEB_DIST_DIR=/app/apps/web/dist

EXPOSE 8000

ENTRYPOINT ["./entrypoint.sh"]
