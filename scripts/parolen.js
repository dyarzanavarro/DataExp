const TOPIC_DEFS = [
  { key: "housing", label: "Housing", color: "#1856c9", words: ["wohn", "miete", "wohnungen", "siedlung", "areal", "quartier", "genossenschaft"] },
  { key: "mobility", label: "Mobility", color: "#0c8a72", words: ["verkehr", "tram", "bus", "velo", "strasse", "mobil", "park", "tunnel"] },
  { key: "climate", label: "Climate", color: "#2f9b46", words: ["klima", "energie", "solar", "co2", "oekolog", "umwelt", "heizung", "emission"] },
  { key: "finance", label: "Finance", color: "#c67718", words: ["kredit", "million", "franken", "steuer", "budget", "finanz", "investition", "beitrag"] },
  { key: "social", label: "Social", color: "#8b3cc5", words: ["schule", "kinder", "gesund", "pflege", "sozial", "famil", "jugend", "betreuung"] },
  { key: "governance", label: "Governance", color: "#cd4d6e", words: ["initiative", "gemeindeordnung", "stadtrat", "gemeinderat", "reform", "verfassung", "gesetz"] }
];

const STOPWORDS = new Set([
  "und","oder","der","die","das","den","dem","ein","eine","einer","eines","im","in","am","an","zu","mit","von","auf","fuer","für","zur","zum","des","ist","wird","als","bei","durch","aus","stadt","zuerich","zürich","objektkredit","millionen","franken"
]);

const PARTY_COLORS = ["#1856c9", "#0c8a72", "#8b3cc5", "#c67718", "#cd4d6e", "#2f9b46", "#4c5a6d", "#8f4a00"];

const state = {
  rows: [],
  filtered: [],
  years: [],
  parties: []
};

const filters = {
  yearMin: null,
  yearMax: null,
  parties: new Set(),
  stances: new Set()
};

const els = {
  fileInput: document.getElementById("fileInput"),
  loadStatus: document.getElementById("loadStatus"),
  yearMin: document.getElementById("yearMin"),
  yearMax: document.getElementById("yearMax"),
  yearLabel: document.getElementById("yearLabel"),
  partySelect: document.getElementById("partySelect"),
  stanceFilter: document.getElementById("stanceFilter"),
  resetBtn: document.getElementById("resetBtn"),
  kpis: document.getElementById("kpis"),
  representationCanvas: document.getElementById("representationCanvas"),
  topicCanvas: document.getElementById("topicCanvas"),
  keywordCanvas: document.getElementById("keywordCanvas"),
  wordCloud: document.getElementById("wordCloud"),
  exampleList: document.getElementById("exampleList"),
  story: document.getElementById("story")
};

init();

async function init() {
  wireEvents();
  try {
    const res = await fetch("../assets/csv/abstimmungsparolen.csv");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    hydrateData(text, "Loaded abstimmungsparolen.csv automatically.");
  } catch (_err) {
    els.loadStatus.innerHTML = "Auto-load failed (often due to <code>file://</code>). Use manual upload or a local server.";
  }
}

function wireEvents() {
  els.fileInput.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    hydrateData(await file.text(), `Loaded ${file.name}.`);
  });

  els.yearMin.addEventListener("input", () => {
    if (+els.yearMin.value > +els.yearMax.value) els.yearMin.value = els.yearMax.value;
    applyFiltersAndRender();
  });

  els.yearMax.addEventListener("input", () => {
    if (+els.yearMax.value < +els.yearMin.value) els.yearMax.value = els.yearMin.value;
    applyFiltersAndRender();
  });

  els.partySelect.addEventListener("change", applyFiltersAndRender);
  els.resetBtn.addEventListener("click", resetFilters);
}

function hydrateData(csvText, statusMessage) {
  const rows = parseCsv(csvText).map((r) => {
    const date = toDate(r.datum);
    const title = cleanText(r.titel || "");
    const abstText = cleanText(r.abstimmungstext || "");
    const party = normalizeParty(r.partei || "");
    const stance = normalizeStance(r.parole || "");
    const semantic = semanticTopic(`${title} ${abstText}`);

    return {
      date,
      year: date ? date.getUTCFullYear() : NaN,
      dateRaw: r.datum,
      title,
      text: abstText,
      issueId: `${r.datum}|${title}`,
      party,
      stance,
      semantic,
      fullText: `${title} ${abstText}`.trim()
    };
  }).filter((r) => Number.isFinite(r.year) && r.party !== "" && r.party !== "Unknown");

  state.rows = rows;
  state.years = unique(rows.map((r) => r.year)).sort((a, b) => a - b);
  state.parties = unique(rows.map((r) => r.party)).sort((a, b) => a.localeCompare(b));

  configureControls();
  els.loadStatus.textContent = statusMessage;
  applyFiltersAndRender();
}

function configureControls() {
  const minYear = state.years[0];
  const maxYear = state.years[state.years.length - 1];

  els.yearMin.min = String(minYear);
  els.yearMin.max = String(maxYear);
  els.yearMax.min = String(minYear);
  els.yearMax.max = String(maxYear);
  els.yearMin.value = String(minYear);
  els.yearMax.value = String(maxYear);

  els.partySelect.innerHTML = state.parties.map((p) => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join("");
  renderCheckboxGroup(els.stanceFilter, "Slogan Stance", "stance", ["JA", "NEIN", "FREI", "OTHER"]);
}

function resetFilters() {
  els.yearMin.value = els.yearMin.min;
  els.yearMax.value = els.yearMax.max;
  [...els.partySelect.options].forEach((o) => { o.selected = false; });
  document.querySelectorAll("input[type='checkbox']").forEach((cb) => { cb.checked = true; });
  applyFiltersAndRender();
}

function applyFiltersAndRender() {
  if (!state.rows.length) return;

  filters.yearMin = +els.yearMin.value;
  filters.yearMax = +els.yearMax.value;
  filters.parties = selectedValues(els.partySelect);
  filters.stances = checkedValues("stance");

  els.yearLabel.textContent = `${filters.yearMin} to ${filters.yearMax}`;

  state.filtered = state.rows.filter((r) => {
    if (r.year < filters.yearMin || r.year > filters.yearMax) return false;
    if (filters.parties.size && !filters.parties.has(r.party)) return false;
    if (!filters.stances.has(r.stance)) return false;
    return true;
  });

  renderKpis();
  renderRepresentationHeatmap();
  renderTopicTrends();
  const keywordStats = computeKeywordStats();
  renderTopKeywords(keywordStats);
  renderWordCloud(keywordStats);
  renderExampleSlogans();
  renderStory();
}

function renderKpis() {
  const rows = state.filtered;
  const issueCount = unique(rows.map((r) => r.issueId)).length;
  const partyCount = unique(rows.map((r) => r.party)).length;
  const jaShare = share(rows.filter((r) => r.stance === "JA").length, rows.length);
  const neinShare = share(rows.filter((r) => r.stance === "NEIN").length, rows.length);

  const partyCounts = countBy(rows, (r) => r.party);
  const topParty = maxEntry(partyCounts);

  els.kpis.innerHTML = [
    kpi("Parole Rows", fmt(rows.length)),
    kpi("Distinct Issues", fmt(issueCount)),
    kpi("Active Parties", fmt(partyCount)),
    kpi("JA vs NEIN", `${jaShare.toFixed(1)}% / ${neinShare.toFixed(1)}%`),
    kpi("Most Present Party", topParty ? `${topParty[0]} (${fmt(topParty[1])})` : "-")
  ].join("");
}

function renderRepresentationHeatmap() {
  const rows = state.filtered;
  const years = range(filters.yearMin, filters.yearMax);
  const parties = state.parties.filter((p) => !filters.parties.size || filters.parties.has(p)).slice(0, 10);
  const matrix = parties.map((party) => years.map((year) => rows.filter((r) => r.party === party && r.year === year).length));
  drawHeatmap(els.representationCanvas.getContext("2d"), els.representationCanvas.width, els.representationCanvas.height, years, parties, matrix);
}

function renderTopicTrends() {
  const issues = dedupeByIssue(state.filtered);
  const byYearTopic = new Map();
  for (const issue of issues) {
    const key = issue.year;
    if (!byYearTopic.has(key)) byYearTopic.set(key, new Map());
    const tMap = byYearTopic.get(key);
    tMap.set(issue.semantic.label, (tMap.get(issue.semantic.label) || 0) + 1);
  }

  const years = range(filters.yearMin, filters.yearMax);
  const topicTotals = new Map();
  for (const issue of issues) topicTotals.set(issue.semantic.label, (topicTotals.get(issue.semantic.label) || 0) + 1);
  const topTopics = [...topicTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map((e) => e[0]);

  const series = topTopics.map((label) => {
    const def = TOPIC_DEFS.find((t) => t.label === label) || { color: "#4c5a6d" };
    return {
      name: label,
      color: def.color,
      values: years.map((y) => (byYearTopic.get(y)?.get(label) || 0))
    };
  });

  drawMultiLine(els.topicCanvas.getContext("2d"), els.topicCanvas.width, els.topicCanvas.height, years.map(String), series);
}

function computeKeywordStats() {
  const issues = dedupeByIssue(state.filtered);
  const freq = new Map();

  for (const issue of issues) {
    tokenize(issue.fullText).forEach((w) => {
      if (w.length < 4 || STOPWORDS.has(w)) return;
      freq.set(w, (freq.get(w) || 0) + 1);
    });
  }

  const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]);
  return {
    topBars: sorted.slice(0, 12),
    topCloud: sorted.slice(0, 45)
  };
}

function renderTopKeywords(keywordStats) {
  const top = keywordStats.topBars;
  drawHorizontalBars(els.keywordCanvas.getContext("2d"), els.keywordCanvas.width, els.keywordCanvas.height, top, "#6a2ea6");
}

function renderWordCloud(keywordStats) {
  const words = keywordStats.topCloud;
  if (!words.length) {
    els.wordCloud.innerHTML = "<p class=\"hint\">No words for this filter.</p>";
    return;
  }

  const max = words[0][1] || 1;
  const min = words[words.length - 1][1] || 1;
  const spread = Math.max(1, max - min);

  els.wordCloud.innerHTML = words.map(([word, value], idx) => {
    const scale = (value - min) / spread;
    const size = 13 + Math.round(scale * 24);
    const hue = 205 + (idx % 9) * 16;
    const rot = (idx % 5 === 0) ? -8 : (idx % 7 === 0 ? 8 : 0);
    return `<span class="cloud-word" style="font-size:${size}px;color:hsl(${hue} 70% 40%);transform:rotate(${rot}deg)" title="${escapeHtml(word)}: ${value} mentions">${escapeHtml(word)}</span>`;
  }).join("");
}

function renderExampleSlogans() {
  const grouped = new Map();
  for (const row of state.filtered) {
    if (!grouped.has(row.issueId)) {
      grouped.set(row.issueId, {
        issueId: row.issueId,
        dateRaw: row.dateRaw,
        title: row.title,
        semantic: row.semantic.label,
        text: row.text,
        rows: []
      });
    }
    grouped.get(row.issueId).rows.push(row);
  }

  const ranked = [...grouped.values()]
    .sort((a, b) => b.rows.length - a.rows.length || b.dateRaw.localeCompare(a.dateRaw))
    .slice(0, 8);

  if (!ranked.length) {
    els.exampleList.innerHTML = "<p class=\"hint\">No examples for this filter.</p>";
    return;
  }

  els.exampleList.innerHTML = ranked.map((issue) => {
    const counts = countBy(issue.rows, (r) => r.stance);
    const ja = counts.get("JA") || 0;
    const nein = counts.get("NEIN") || 0;
    const frei = counts.get("FREI") || 0;
    const parties = unique(issue.rows.map((r) => r.party)).sort().slice(0, 6).join(", ");
    return `
      <article class="example-item">
        <h4>${escapeHtml(issue.title || "(Untitled)")}</h4>
        <p class="example-meta">${escapeHtml(issue.dateRaw)} · Topic: ${escapeHtml(issue.semantic)} · Parties: ${escapeHtml(parties)}</p>
        <p class="example-meta">JA ${ja} · NEIN ${nein} · FREI ${frei}</p>
        <p class="example-meta">${escapeHtml(trim(issue.text || "", 180))}</p>
      </article>
    `;
  }).join("");
}

function renderStory() {
  const issues = dedupeByIssue(state.filtered);
  if (!issues.length) {
    els.story.innerHTML = "<h3>No data for this filter.</h3><p>Try widening year range or clearing party selections.</p>";
    return;
  }

  const topicCounts = countBy(issues, (r) => r.semantic.label);
  const topTopic = maxEntry(topicCounts);
  const partyCounts = countBy(state.filtered, (r) => r.party);
  const topParty = maxEntry(partyCounts);

  const byYear = countBy(issues, (r) => r.year);
  const firstYear = Math.min(...issues.map((i) => i.year));
  const lastYear = Math.max(...issues.map((i) => i.year));
  const delta = (byYear.get(lastYear) || 0) - (byYear.get(firstYear) || 0);

  els.story.innerHTML = `
    <h3>What this political slice says</h3>
    <ul>
      <li><strong>${fmt(issues.length)}</strong> distinct local vote issues are visible.</li>
      <li>Most common semantic issue area: <strong>${topTopic ? topTopic[0] : "-"}</strong>.</li>
      <li>Most represented party: <strong>${topParty ? topParty[0] : "-"}</strong> (${topParty ? fmt(topParty[1]) : "0"} parolen).</li>
      <li>Issue volume changed by <strong>${delta >= 0 ? "+" : ""}${delta}</strong> between ${firstYear} and ${lastYear}.</li>
    </ul>
    <p class="hint">Semantic analysis here is dictionary-based (keyword matching), meant for exploration rather than strict NLP classification.</p>
  `;
}

function semanticTopic(text) {
  const norm = normalizeForMatch(text);
  let best = { label: "Other", score: 0, color: "#4c5a6d" };

  for (const t of TOPIC_DEFS) {
    let score = 0;
    for (const w of t.words) {
      if (norm.includes(w)) score += 1;
    }
    if (score > best.score) best = { label: t.label, score, color: t.color };
  }

  return best;
}

function normalizeParty(value) {
  const raw = cleanText(value).trim();
  if (!raw) return "";
  const lower = raw.toLowerCase();
  if (lower === "glp") return "GLP";
  if (lower === "grune" || lower === "gruene") return "Gruene";
  if (lower === "ja") return "";
  if (lower === "") return "";
  return raw.toUpperCase() === raw ? raw : raw.replace(/\b\w/g, (m) => m.toUpperCase());
}

function normalizeStance(value) {
  const v = normalizeForMatch(cleanText(value));
  if (v.includes("ja")) return "JA";
  if (v.includes("nein")) return "NEIN";
  if (v.includes("stimmfreigabe") || v.includes("leer")) return "FREI";
  return "OTHER";
}

function cleanText(value) {
  const s = String(value || "").trim();
  if (!/[ÃÂ]/.test(s)) return s;
  try {
    const bytes = Uint8Array.from([...s].map((ch) => ch.charCodeAt(0) & 0xff));
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch (_err) {
    return s;
  }
}

function normalizeForMatch(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value) {
  return normalizeForMatch(value).split(" ").filter(Boolean);
}

function dedupeByIssue(rows) {
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    if (seen.has(row.issueId)) continue;
    seen.add(row.issueId);
    out.push(row);
  }
  return out;
}

function parseCsv(text) {
  const rows = [];
  let current = "";
  let row = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === "," && !inQuotes) {
      row.push(current);
      current = "";
      continue;
    }

    if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && next === "\n") i++;
      row.push(current);
      rows.push(row);
      row = [];
      current = "";
      continue;
    }

    current += ch;
  }

  if (current.length || row.length) {
    row.push(current);
    rows.push(row);
  }

  if (!rows.length) return [];

  const headers = rows[0].map((h, i) => (i === 0 ? h.replace(/^\uFEFF/, "") : h));
  return rows.slice(1)
    .filter((r) => r.length && r.some((c) => c !== ""))
    .map((r) => {
      const obj = {};
      for (let i = 0; i < headers.length; i++) obj[headers[i]] = r[i] ?? "";
      return obj;
    });
}

function renderCheckboxGroup(host, label, key, values) {
  host.innerHTML = `
    <label>${label}</label>
    <div class="check-grid">
      ${values.map((value) => `<label><input type="checkbox" data-key="${key}" value="${value}" checked /> ${value}</label>`).join("")}
    </div>
  `;
  host.querySelectorAll("input[type='checkbox']").forEach((input) => input.addEventListener("change", applyFiltersAndRender));
}

function drawHeatmap(ctx, width, height, years, parties, matrix) {
  clear(ctx, width, height);
  if (!years.length || !parties.length) {
    ctx.fillStyle = "#5e6880";
    ctx.fillText("No data", 12, 24);
    return;
  }

  const pad = { t: 28, r: 10, b: 38, l: 110 };
  const plotW = width - pad.l - pad.r;
  const plotH = height - pad.t - pad.b;
  const cellW = plotW / years.length;
  const cellH = plotH / parties.length;

  const maxVal = Math.max(1, ...matrix.flat());
  for (let r = 0; r < parties.length; r++) {
    for (let c = 0; c < years.length; c++) {
      const v = matrix[r][c] || 0;
      const alpha = v / maxVal;
      ctx.fillStyle = `rgba(24,86,201,${0.12 + alpha * 0.78})`;
      ctx.fillRect(pad.l + c * cellW, pad.t + r * cellH, Math.max(1, cellW - 1), Math.max(1, cellH - 1));
    }
  }

  ctx.fillStyle = "#182035";
  ctx.font = "12px Segoe UI";
  parties.forEach((p, i) => ctx.fillText(p, 8, pad.t + i * cellH + 14));

  const ticks = Math.min(6, years.length);
  for (let i = 0; i < ticks; i++) {
    const idx = Math.round((i / (ticks - 1 || 1)) * (years.length - 1));
    ctx.fillText(String(years[idx]), pad.l + idx * cellW - 12, height - 10);
  }

  ctx.fillStyle = "#5e6880";
  ctx.fillText("Darker cells = more party positions", width - 220, 16);
}

function drawMultiLine(ctx, width, height, labels, series) {
  clear(ctx, width, height);
  if (!labels.length || !series.length) {
    ctx.fillStyle = "#5e6880";
    ctx.fillText("No data", 12, 24);
    return;
  }

  const pad = { t: 28, r: 10, b: 34, l: 40 };
  const plotW = width - pad.l - pad.r;
  const plotH = height - pad.t - pad.b;
  const maxY = Math.max(1, ...series.flatMap((s) => s.values));

  ctx.strokeStyle = "#d8dfed";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.t + (plotH * i) / 4;
    ctx.beginPath();
    ctx.moveTo(pad.l, y);
    ctx.lineTo(width - pad.r, y);
    ctx.stroke();
    ctx.fillStyle = "#5e6880";
    ctx.font = "11px Segoe UI";
    ctx.fillText(String(Math.round(maxY * (1 - i / 4))), 6, y + 3);
  }

  const n = labels.length;
  const xFor = (i) => pad.l + (n <= 1 ? 0 : (i / (n - 1)) * plotW);
  const yFor = (v) => pad.t + plotH - (v / maxY) * plotH;

  series.forEach((s, idx) => {
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    s.values.forEach((v, i) => {
      const x = xFor(i);
      const y = yFor(v);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    ctx.fillStyle = s.color;
    ctx.fillRect(pad.l + idx * 120, 8, 12, 12);
    ctx.fillStyle = "#182035";
    ctx.fillText(s.name, pad.l + idx * 120 + 16, 18);
  });

  const ticks = Math.min(5, labels.length);
  ctx.fillStyle = "#5e6880";
  for (let i = 0; i < ticks; i++) {
    const idx = Math.round((i / (ticks - 1 || 1)) * (labels.length - 1));
    ctx.fillText(labels[idx], xFor(idx) - 12, height - 10);
  }
}

function drawHorizontalBars(ctx, width, height, entries, color) {
  clear(ctx, width, height);
  if (!entries.length) {
    ctx.fillStyle = "#5e6880";
    ctx.fillText("No data", 12, 24);
    return;
  }

  const pad = { t: 16, r: 56, b: 10, l: 130 };
  const plotW = width - pad.l - pad.r;
  const barH = 14;
  const gap = 8;
  const max = entries[0][1] || 1;

  entries.forEach(([label, value], i) => {
    const y = pad.t + i * (barH + gap);
    const w = (value / max) * plotW;

    ctx.fillStyle = color;
    ctx.fillRect(pad.l, y, w, barH);

    ctx.fillStyle = "#182035";
    ctx.font = "12px Segoe UI";
    ctx.fillText(trim(label, 18), 8, y + 11);
    ctx.fillText(String(value), Math.min(width - 34, pad.l + w + 5), y + 11);
  });
}

function clear(ctx, width, height) { ctx.clearRect(0, 0, width, height); }

function toDate(s) {
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function range(start, end) { const out = []; for (let i = start; i <= end; i++) out.push(i); return out; }
function selectedValues(select) { return new Set([...select.selectedOptions].map((o) => o.value)); }
function checkedValues(key) { return new Set([...document.querySelectorAll(`input[data-key='${key}']`)].filter((b) => b.checked).map((b) => b.value)); }
function unique(values) { return [...new Set(values)]; }
function countBy(rows, keyFn) { const m = new Map(); rows.forEach((r) => m.set(keyFn(r), (m.get(keyFn(r)) || 0) + 1)); return m; }
function maxEntry(map) { let best = null; for (const e of map.entries()) if (!best || e[1] > best[1]) best = e; return best; }
function share(v, total) { return total ? (v / total) * 100 : 0; }
function fmt(n) { return new Intl.NumberFormat("en-US").format(Math.round(n)); }
function trim(s, max) { return s.length > max ? `${s.slice(0, max - 1)}...` : s; }
function kpi(label, value) { return `<div class="kpi"><div class="label">${label}</div><div class="value">${value}</div></div>`; }
function escapeHtml(value) { return String(value).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;"); }
