# Castcut's voice engine as a container (docker/compose.yml, `--profile voice`): Castcut's own
# image is Alpine without Python, so the engine runs beside it. NVIDIA GPU; the model (~5 GB)
# downloads into the voice_models volume on the first line.
FROM python:3.12-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends libsndfile1 sox \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cu128 torch torchaudio \
  && pip install --no-cache-dir -r requirements.txt
COPY server.py VERSION ./
ENV HF_HOME=/models
EXPOSE 8191
CMD ["python", "server.py", "--host", "0.0.0.0", "--port", "8191"]
