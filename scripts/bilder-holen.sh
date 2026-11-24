#!/usr/bin/env bash
# Lädt vorläufige Fotos von soeths-biokiste.de, verkleinert sie und speichert sie als WebP in assets/.
# Voraussetzung: curl und cwebp (macOS: brew install webp)
# Aufruf im Repo-Ordner: bash scripts/bilder-holen.sh
# TODO: Sobald eigene Fotos vom Kunden da sind, diese stattdessen nach assets/ legen (gleiche Dateinamen).
set -euo pipefail
cd "$(dirname "$0")/.."
BASE="https://soeths-biokiste.de/wp-content/uploads"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

hole () { # url ziel breite
  curl -fsSL "$1" -o "$TMP/src"
  cwebp -quiet -q 72 -resize "$3" 0 "$TMP/src" -o "assets/$2"
  echo "assets/$2: $(du -k "assets/$2" | cut -f1) KB"
}

hole "$BASE/2025/09/Schnupperkistenleckerlix800.jpg" regionalkiste.webp 640
hole "$BASE/2025/09/was-soll-ich-kochen.jpg"         mixkiste.webp      640
hole "$BASE/2025/08/team-2025.jpg"                    hof.webp           720
hole "$BASE/2025/07/logo.png"                         logo.webp          160
echo "Fertig. Bitte Bildausschnitte prüfen (Kisten-Karten sind 4:3)."
