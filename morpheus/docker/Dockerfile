FROM python:3.11-slim

WORKDIR /app

# System deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Python deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# App code
COPY app/ ./app/
COPY scripts/ ./scripts/

# Data directory
RUN mkdir -p /data

ENV DATA_DIR=/data
ENV APP_HOST=0.0.0.0
ENV APP_PORT=7860

EXPOSE 7860

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
    CMD curl -f http://localhost:7860/api/system/info || exit 1

CMD ["sh", "-c", "python scripts/setup.py && uvicorn app.main:app --host 0.0.0.0 --port 7860 --workers 1"]
