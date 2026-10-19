FROM python:3.12-slim
WORKDIR /srv
# ffmpeg: arregla las grabaciones del navegador (sin duración ni barra de avance) copiando el video sin recodificarlo
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
CMD ["python", "-m", "app.main"]
