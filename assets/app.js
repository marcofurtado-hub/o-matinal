// O Matinal — monta o jornal a partir de data/news.json

const EPOCH = new Date("2026-07-31"); // edição nº 1

function fmtDate(d) {
  return d.toLocaleDateString("pt-BR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

function relTime(iso) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.round(diff / 3.6e6);
  if (h < 1) return "agora há pouco";
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? "ontem" : `há ${d} dias`;
}

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

const MONTHS = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];

function fmtEventRange(startIso, endIso) {
  const s = new Date(`${startIso}T12:00:00`);
  const e = endIso ? new Date(`${endIso}T12:00:00`) : s;
  if (s.getTime() === e.getTime()) return `${s.getDate()} ${MONTHS[s.getMonth()]}`;
  if (s.getMonth() === e.getMonth()) return `${s.getDate()}–${e.getDate()} ${MONTHS[s.getMonth()]}`;
  return `${s.getDate()} ${MONTHS[s.getMonth()]} – ${e.getDate()} ${MONTHS[e.getMonth()]}`;
}

async function main() {
  const today = new Date();
  document.getElementById("today-date").textContent = fmtDate(today);
  const edition = Math.max(1, Math.floor((today - EPOCH) / 8.64e7) + 1);
  document.getElementById("edition").textContent =
    `EDICAO #${String(edition).padStart(3, "0")}`;

  let data;
  try {
    const res = await fetch("data/news.json", { cache: "no-store" });
    data = await res.json();
  } catch {
    document.getElementById("agenda-list").innerHTML =
      '<li class="loading">ERRO DE LEITURA NO DRIVE A: — tente recarregar a página.</li>';
    return;
  }

  // navegação
  const nav = document.getElementById("section-nav");
  for (const s of data.sections) {
    const a = el("a", null, esc(s.name));
    a.href = `#${s.id}`;
    nav.appendChild(a);
  }

  // manchetes
  const hl = document.getElementById("highlights-list");
  hl.innerHTML = "";
  for (const h of data.highlights) {
    const li = el("li", null,
      `<span class="hl-section">${esc(h.sectionName)}</span>` +
      `<a href="${esc(h.link)}" target="_blank" rel="noopener">${esc(h.title)}</a>`);
    hl.appendChild(li);
  }

  // agenda de eventos
  const agenda = document.getElementById("agenda-list");
  agenda.innerHTML = "";
  if (data.events?.length) {
    for (const ev of data.events) {
      agenda.appendChild(el("li", null,
        `<span class="agenda-date">${esc(fmtEventRange(ev.start, ev.end))}</span>` +
        `<span class="agenda-body"><a href="${esc(ev.url)}" target="_blank" rel="noopener">${esc(ev.name)}</a>` +
        `<span class="agenda-tag">${esc(ev.tag ?? "")}</span>` +
        `<span class="agenda-where">${esc(ev.where ?? "")}</span></span>`));
    }
  } else {
    document.getElementById("agenda").style.display = "none";
  }

  // cursos e formação
  const courses = document.getElementById("courses-list");
  if (data.courses?.length) {
    for (const c of data.courses) {
      courses.appendChild(el("li", null,
        `<span class="agenda-date">${esc(c.tag ?? "")}</span>` +
        `<span class="agenda-body"><a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.label)}</a></span>`));
    }
  } else {
    document.getElementById("cursos").style.display = "none";
  }

  // seções
  const main = document.getElementById("sections");
  for (const s of data.sections) {
    const sec = el("section", "section");
    sec.id = s.id;

    const header = el("div", "section-header",
      `<h2>${esc(s.name)}</h2><span class="kicker">${esc(s.kicker)}</span>`);
    sec.appendChild(header);

    const [lead, ...rest] = s.items;
    if (lead) {
      const leadEl = el("article", "lead-story",
        `<h3><a href="${esc(lead.link)}" target="_blank" rel="noopener"${lead.titleOriginal ? ` title="${esc(lead.titleOriginal)}"` : ""}>${esc(lead.title)}</a></h3>` +
        (lead.snippet ? `<p>${esc(lead.snippet)}</p>` : "") +
        `<span class="byline"><span class="src">${esc(lead.source)}</span> — ${relTime(lead.date)}</span>`);
      sec.appendChild(leadEl);
    }

    const list = el("ul", "story-list");
    for (const item of rest) {
      list.appendChild(el("li", null,
        `<a href="${esc(item.link)}" target="_blank" rel="noopener"${item.titleOriginal ? ` title="${esc(item.titleOriginal)}"` : ""}>${esc(item.title)}</a>` +
        `<span class="byline"><span class="src">${esc(item.source)}</span> — ${relTime(item.date)}</span>`));
    }
    sec.appendChild(list);

    if (s.links?.length) {
      const links = s.links.map((l) =>
        `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a>`).join("");
      sec.appendChild(el("div", "deep-links", `<strong>Aprofunde-se:</strong> ${links}`));
    }

    main.appendChild(sec);
  }

  const gen = new Date(data.generatedAt);
  document.getElementById("generated-at").textContent =
    `Edição compilada em ${fmtDate(gen)} às ${gen.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.`;

  setupListen(data);
}

// ---- 🎧 Ouvir manchetes (voz do navegador, sem custo) ----
function setupListen(data) {
  const btn = document.getElementById("listen");
  if (!("speechSynthesis" in window)) { btn.style.display = "none"; return; }

  let playing = false;
  btn.addEventListener("click", () => {
    if (playing) {
      speechSynthesis.cancel();
      playing = false;
      btn.classList.remove("playing");
      btn.textContent = "🎧 Ouvir manchetes";
      return;
    }
    const parts = [
      `O Matinal. Manchetes de ${fmtDate(new Date())}.`,
      ...data.highlights.map((h) => `${h.sectionName}: ${h.title}.`),
      "Fim das manchetes. Bom dia e boa leitura.",
    ];
    const u = new SpeechSynthesisUtterance(parts.join(" \n"));
    u.lang = "pt-BR";
    u.rate = 0.95;
    u.onend = u.onerror = () => {
      playing = false;
      btn.classList.remove("playing");
      btn.textContent = "🎧 Ouvir manchetes";
    };
    speechSynthesis.speak(u);
    playing = true;
    btn.classList.add("playing");
    btn.textContent = "⏹ Parar";
  });
}

main();
