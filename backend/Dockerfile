FROM python:3.12-slim

WORKDIR /app

# Install dependencies first for better layer caching.
COPY pyproject.toml ./
COPY app ./app
RUN pip install --no-cache-dir .

# Fly / most PaaS inject $PORT; default to 8080 locally.
ENV PORT=8080
EXPOSE 8080

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
