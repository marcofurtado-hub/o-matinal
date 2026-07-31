#!/usr/bin/env node
// Busca os feeds RSS/Atom configurados em feeds.json e gera data/news.json.
// Sem dependências externas — roda com Node >= 18.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG = JSON.parse(readFileSync(join(ROOT, "scripts/feeds.json"), "utf8"));

const PER_FEED = 6;      // itens aproveitados de cada fonte
const PER_SECTION = 12;  // itens exibidos por seção
const TIMEOUT_MS = 20000;

const ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  hellip: "…", mdash: "—", ndash: "–", rsquo: "’", lsquo: "‘",
  rdquo: "”", ldquo: "“", eacute: "é", aacute: "á", atilde: "ã",
  ccedil: "ç", oacute: "ó", otilde: "õ", iacute: "í", uacute: "ú", agrave: "à",
};

function decode(str) {
  return str
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}

function cleanText(raw) {
  if (!raw) return "";
  let s = raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  s = s.replace(/<[^>]*>/g, " ");
  s = decode(s);
  return s.replace(/\s+/g, " ").trim();
}

function tag(xml, name) {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? m[1] : "";
}

function atomLink(xml) {
  // prefere rel="alternate", senão o primeiro <link href=...>
  const links = [...xml.matchAll(/<link\b([^>]*)\/?>(?:<\/link>)?/gi)].map((m) => m[1]);
  const pick =
    links.find((a) => /rel=["']alternate["']/i.test(a)) ??
    links.find((a) => !/rel=/i.test(a)) ??
    links[0];
  const href = pick?.match(/href=["']([^"']+)["']/i);
  return href ? href[1] : "";
}

function parseItems(xml, source) {
  const chunks = [...xml.matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/gi)].map((m) => m[0]);
  return chunks.map((c) => {
    const isAtom = /^<entry/i.test(c);
    const link = isAtom ? atomLink(c) : cleanText(tag(c, "link")) || atomLink(c);
    const dateRaw =
      tag(c, "pubDate") || tag(c, "published") || tag(c, "updated") || tag(c, "dc:date");
    const date = new Date(cleanText(dateRaw));
    const snippetRaw =
      tag(c, "description") || tag(c, "summary") || tag(c, "content:encoded") || tag(c, "content");
    let snippet = cleanText(snippetRaw);
    if (snippet.length > 240) snippet = snippet.slice(0, 237).trimEnd() + "…";
    return {
      title: cleanText(tag(c, "title")),
      link,
      source,
      date: isNaN(date) ? null : date.toISOString(),
      snippet,
    };
  }).filter((i) => i.title && i.link);
}

// Tradução gratuita via endpoint público do Google Tradutor.
// Se falhar, mantém o texto original — o jornal nunca deixa de sair por causa disso.
async function translate(text) {
  if (!text) return text;
  const params = new URLSearchParams({
    client: "gtx", sl: "auto", tl: "pt-BR", dt: "t", q: text,
  });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`https://translate.googleapis.com/translate_a/single?${params}`, {
      signal: ctrl.signal,
      headers: { "user-agent": "Mozilla/5.0 (compatible; PersonalHubBot/1.0)" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const out = (data[0] ?? []).map((seg) => seg[0]).join("");
    return out.trim() || text;
  } catch {
    return text;
  } finally {
    clearTimeout(timer);
  }
}

async function translateItems(items) {
  let failures = 0;
  for (const item of items) {
    const [title, snippet] = await Promise.all([
      translate(item.title),
      translate(item.snippet),
    ]);
    if (title === item.title) failures++;
    if (title !== item.title) item.titleOriginal = item.title;
    item.title = title;
    item.snippet = snippet;
  }
  return failures;
}

async function fetchFeed({ source, url, lang }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; PersonalHubBot/1.0)",
        accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    const items = parseItems(xml, source).slice(0, PER_FEED);
    for (const i of items) i.lang = lang ?? "en";
    console.log(`  ok   ${source} (${items.length} itens)`);
    return items;
  } catch (err) {
    console.warn(`  FALHOU ${source}: ${err.message}`);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

// Filtro de relevância: derruba manchetes com termos bloqueados
// (celebridades, futebol etc.) — configurável em feeds.json > "block".
function blockedBy(item, terms) {
  const text = `${item.title} ${item.snippet}`.toLowerCase();
  // termos curtos (ex.: "bbb", "fifa") só casam como palavra inteira
  return terms.find((t) =>
    t.length <= 6
      ? new RegExp(`(^|[^\\p{L}])${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\p{L}])`, "u").test(text)
      : text.includes(t));
}

const sections = [];
for (const section of CONFIG.sections) {
  console.log(`\n== ${section.name} ==`);
  const blockTerms = [
    ...(CONFIG.block?.global ?? []),
    ...(CONFIG.block?.[section.id] ?? []),
  ].map((t) => t.toLowerCase());
  const results = await Promise.all(section.feeds.map(fetchFeed));
  const items = results
    .flat()
    .filter((i) => {
      const hit = blockedBy(i, blockTerms);
      if (hit) console.log(`  bloqueado ("${hit}"): ${i.title.slice(0, 60)}`);
      return !hit;
    })
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
    .slice(0, PER_SECTION);
  const toTranslate = items.filter((i) => i.lang !== "pt");
  if (toTranslate.length) {
    const failures = await translateItems(toTranslate);
    console.log(`  traduzidos ${toTranslate.length - failures}/${toTranslate.length} itens para pt-BR`);
  }
  for (const i of items) delete i.lang;
  sections.push({
    id: section.id,
    name: section.name,
    kicker: section.kicker,
    links: section.links ?? [],
    items,
  });
}

// Manchete de capa: o item mais recente de cada seção
const highlights = sections
  .map((s) => s.items[0] && { ...s.items[0], sectionName: s.name, sectionId: s.id })
  .filter(Boolean);

// Agenda: só eventos que ainda não terminaram, em ordem de início
const today = new Date().toISOString().slice(0, 10);
const events = (CONFIG.events ?? [])
  .filter((e) => (e.end ?? e.start) >= today)
  .sort((a, b) => a.start.localeCompare(b.start));

const out = {
  generatedAt: new Date().toISOString(),
  highlights,
  events,
  courses: CONFIG.courses ?? [],
  sections,
};
mkdirSync(join(ROOT, "data"), { recursive: true });
writeFileSync(join(ROOT, "data/news.json"), JSON.stringify(out, null, 2));

const total = sections.reduce((n, s) => n + s.items.length, 0);
console.log(`\nGerado data/news.json com ${total} itens em ${sections.length} seções.`);
if (total === 0) process.exit(1);
