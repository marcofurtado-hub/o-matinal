#!/usr/bin/env node
// O Matinal — gera o episódio de áudio do dia (voz neural via edge-tts),
// publica o MP3 como release no GitHub e atualiza o feed podcast.xml.
// Falha de forma graciosa: se algo faltar, o jornal sai sem áudio.

import { readFileSync, writeFileSync, existsSync, mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir, tmpdir } from "node:os";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = "marcofurtado-hub/o-matinal";
const SITE = "https://marcofurtado-hub.github.io/o-matinal/";
const VOICE = "pt-BR-AntonioNeural";
const EDGE_TTS = join(homedir(), ".local/share/omatinal/venv/bin/edge-tts");
const KEEP = 14; // episódios mantidos no feed

const hoje = new Date();
const dateIso = hoje.toISOString().slice(0, 10);
const dateBr = hoje.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

if (!existsSync(EDGE_TTS)) {
  console.log("(podcast desligado: edge-tts não encontrado)");
  process.exit(0);
}

const news = JSON.parse(readFileSync(join(ROOT, "data/news.json"), "utf8"));

// ---- roteiro ----
const partes = [`Bom dia. Isto é O Matinal, edição de ${dateBr}.`];

if (news.ticker?.length) {
  const cot = news.ticker.map((t) => `${t.label.toLowerCase()} a ${t.value.replace("R$", "").trim()}`).join(", ");
  partes.push(`Nos mercados: ${cot}.`);
}

if (news.editorial) partes.push(`Editorial do dia. ${news.editorial}`);

partes.push("As manchetes de hoje.");
for (const h of news.highlights ?? []) {
  partes.push(`${h.sectionName}: ${h.title}.`);
}

const proximos = (news.events ?? []).slice(0, 2);
if (proximos.length) {
  partes.push("Na agenda: " + proximos.map((e) => {
    const d = new Date(`${e.start}T12:00:00`);
    return `${e.name}, a partir de ${d.getDate()} de ${d.toLocaleDateString("pt-BR", { month: "long" })}`;
  }).join("; e ") + ".");
}

partes.push("Fim das manchetes. A edição completa está no site. Bom dia e boa leitura.");
const roteiro = partes.join("\n\n");

// ---- voz ----
const tmp = mkdtempSync(join(tmpdir(), "omatinal-"));
const mp3 = join(tmp, `matinal-${dateIso}.mp3`);
execFileSync(EDGE_TTS, ["--voice", VOICE, "--rate", "+8%", "--text", roteiro, "--write-media", mp3], {
  stdio: ["ignore", "ignore", "inherit"],
  timeout: 180000,
});
const bytes = execFileSync("/usr/bin/stat", ["-f", "%z", mp3]).toString().trim();
console.log(`Episódio gerado: ${(bytes / 1e6).toFixed(1)} MB`);

// ---- publica como release ----
const gh = (args, opts = {}) =>
  execFileSync("/opt/homebrew/bin/gh", args, { cwd: ROOT, timeout: 120000, ...opts });
const tag = `ep-${dateIso}`;
try { gh(["release", "delete", tag, "--yes", "-R", REPO], { stdio: "ignore" }); } catch {}
gh(["release", "create", tag, mp3, "-R", REPO, "--title", `Edição de ${dateIso}`, "--notes", "Episódio diário de O Matinal."]);
const url = `https://github.com/${REPO}/releases/download/${tag}/matinal-${dateIso}.mp3`;
console.log(`Publicado: ${url}`);

// ---- feed ----
const epFile = join(ROOT, "data/episodes.json");
let episodes = existsSync(epFile) ? JSON.parse(readFileSync(epFile, "utf8")) : [];
episodes = episodes.filter((e) => e.date !== dateIso);
episodes.unshift({ date: dateIso, title: `O Matinal — ${dateBr}`, url, bytes: Number(bytes) });

// remove releases antigos além do limite
for (const old of episodes.slice(KEEP)) {
  try { gh(["release", "delete", `ep-${old.date}`, "--yes", "--cleanup-tag", "-R", REPO], { stdio: "ignore" }); } catch {}
}
episodes = episodes.slice(0, KEEP);
writeFileSync(epFile, JSON.stringify(episodes, null, 2));

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const items = episodes.map((e) => `    <item>
      <title>${esc(e.title)}</title>
      <enclosure url="${esc(e.url)}" length="${e.bytes}" type="audio/mpeg"/>
      <guid isPermaLink="true">${esc(e.url)}</guid>
      <pubDate>${new Date(`${e.date}T09:00:00Z`).toUTCString()}</pubDate>
      <description>Manchetes e editorial do dia — jogos, arte, finanças, fé reformada, CGI e design.</description>
    </item>`).join("\n");

writeFileSync(join(ROOT, "podcast.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>O Matinal</title>
    <link>${SITE}</link>
    <language>pt-BR</language>
    <description>O café da manhã de Marco Furtado: manchetes diárias de jogos, arte, finanças, teologia reformada, CGI e design — lidas por voz neural.</description>
    <itunes:author>O Matinal</itunes:author>
    <itunes:explicit>false</itunes:explicit>
${items}
  </channel>
</rss>
`);
console.log(`Feed atualizado com ${episodes.length} episódio(s).`);
