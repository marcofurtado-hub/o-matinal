#!/bin/zsh
# O Matinal — atualização diária local (roda via launchd às 06:00).
# Busca as notícias, e se houver edição nova, publica no GitHub Pages.
set -e
export PATH="/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin"

cd "$(dirname "$0")/.."

echo "=== O Matinal — $(date '+%Y-%m-%d %H:%M') ==="
node scripts/fetch.mjs

# episódio de áudio (não derruba a edição se falhar)
node scripts/podcast.mjs || echo "AVISO: podcast falhou; edição segue sem áudio."

git add data/news.json data/episodes.json podcast.xml 2>/dev/null || git add data/news.json
if git diff --cached --quiet; then
  echo "Nada de novo hoje."
  exit 0
fi

git commit -m "Edição de $(date '+%Y-%m-%d')

Co-Authored-By: O Matinal (robô local)"
git push origin main
echo "Edição publicada."
