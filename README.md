# 📰 O Matinal

Jornal pessoal diário de Marco Furtado — jogos & indie, arte & ilustração & quadrinhos,
finanças & empreendedorismo, teologia reformada, CGI & IA & animação, e design avançado.

**Como funciona**

- `scripts/feeds.json` — as fontes (RSS) de cada seção. Edite aqui para adicionar/remover fontes.
- `scripts/fetch.mjs` — o robô que busca as notícias e gera `data/news.json`. Rode com `node scripts/fetch.mjs`.
- `.github/workflows/update.yml` — GitHub Action que roda o robô todo dia às 6h (Brasília) e publica a nova edição.
- `index.html` + `assets/` — o jornal em si, servido pelo GitHub Pages.

**Rodar localmente**

```bash
node scripts/fetch.mjs && python3 -m http.server 4173
```

Depois abra http://localhost:4173.
