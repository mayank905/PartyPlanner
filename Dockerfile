# Stage 1: Build the React + TypeScript Frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /build/frontend

COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# Stage 2: FastAPI Backend + Static SPA Server for Google Cloud Run
FROM python:3.11-slim
WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app/backend \
    PORT=8080 \
    DATABASE_URL=sqlite:////tmp/partyplanner.db \
    STATIC_DIR=/app/frontend/dist

COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend/app ./backend/app
COPY --from=frontend-builder /build/frontend/dist ./frontend/dist

EXPOSE 8080

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
