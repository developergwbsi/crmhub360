FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends poppler-utils fonts-dejavu-core fonts-liberation && rm -rf /var/lib/apt/lists/*
WORKDIR /srv
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
# voz local en español (Piper): sin claves ni envío de texto a terceros
RUN mkdir -p /voices && cd /voices && python -m piper.download_voices es_MX-claude-high
COPY app ./app
CMD ["python", "-m", "app.main"]
