#!/bin/zsh
# O Matinal — atualização diária local (roda via launchd às 06:00).
# Busca as notícias, e se houver edição nova, publica no GitHub Pages.
set -e
export PATH="/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin"

cd "$(dirname "$0")/.."

echo "=== O Matinal — $(date '+%Y-%m-%d %H:%M') ==="
node scripts/fetch.mjs

git add data/news.json
if git diff --cached --quiet; then
  echo "Nada de novo hoje."
  exit 0
fi

git commit -m "Edição de $(date '+%Y-%m-%d')

Co-Authored-By: O Matinal (robô local)"
git push origin main
echo "Edição publicada."
