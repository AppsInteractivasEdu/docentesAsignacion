#!/bin/bash
# Abre la aplicación con un servidor local (recomendado: almacenamiento más estable que abrir el archivo directamente).
cd "$(dirname "$0")"
PORT=8765
( sleep 1; open "http://localhost:$PORT/index.html" ) &
python3 -m http.server $PORT --bind 127.0.0.1
