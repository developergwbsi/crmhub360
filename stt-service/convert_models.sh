#!/usr/bin/env bash
# Descarga y convierte (una sola vez) los traductores locales es↔en (Helsinki-NLP/opus-mt → CTranslate2 int8) al volumen crmhub_stt_models.
# No hace falta repetirlo: el servicio de subtítulos los lee de /root/.cache/mt. Uso: stt-service/convert_models.sh
set -euo pipefail
docker run --rm -v crmhub_stt_models:/root/.cache python:3.12-slim bash -c '
  pip install -q torch --index-url https://download.pytorch.org/whl/cpu &&
  pip install -q "transformers<5" sentencepiece ctranslate2 sacremoses &&
  mkdir -p /root/.cache/mt &&
  for p in es-en en-es; do
    ct2-transformers-converter --model Helsinki-NLP/opus-mt-$p --output_dir /root/.cache/mt/${p/-/_} --quantization int8 --copy_files source.spm target.spm --force
  done && ls /root/.cache/mt/*'
