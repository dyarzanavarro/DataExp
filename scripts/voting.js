const state = {
  rows: [],
  filtered: [],
  years: [],
  voteDates: []
};

const filters = {
  yearMin: null,
  yearMax: null,
  voteDates: new Set(),
  phases: new Set()
};

const els = {
  fileInput: document.getElementById("fileInput"),
  loadStatus: document.getElementById("loadStatus"),
  yearMin: document.getElementById("yearMin"),
  yearMax: document.getElementById("yearMax"),
  yearLabel: document.getElementById("yearLabel"),
  voteDateSelect: document.getElementById("voteDateSelect"),
  phaseFilter: document.getElementById("phaseFilter"),
  resetBtn: document.getElementById("resetBtn"),
  kpis: document.getElementById("kpis"),
  finalTrendCanvas: document.getElementById("finalTrendCanvas"),
  buildUpCanvas: document.getElementById("buildUpCanvas"),
  topDatesCanvas: document.getElementById("topDatesCanvas"),
  story: document.getElementById("story")
};

init();

async function init() {
  wireEvents();
  try {
    const res = await fetch("../assets/csv/stimmbeteiligung.csv");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    hydrateData(text, "Loaded stimmbeteiligung.csv automatically.");
  } catch (_err) {
    els.loadStatus.innerHTML = "Auto-load failed (often due to <code>file://</code>). Use manual upload or a local server.";
  }
}

function wireEvents() {
  els.fileInput.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    hydrateData(text, `Loaded ${file.name}.`);
  });

  els.yearMin.addEventListener("input", () => {
    if (+els.yearMin.value > +els.yearMax.value) els.yearMin.value = els.yearMax.value;
    applyFiltersAndRender();
  });

  els.yearMax.addEventListener("input", () => {
    if (+els.yearMax.value < +els.yearMin.value) els.yearMax.value = els.yearMin.value;
    applyFiltersAndRender();
  });

  els.voteDateSelect.addEventListener("change", applyFiltersAndRender);
  els.resetBtn.addEventListener("click", resetFilters);
}

function hydrateData(csvText, statusMessage) {
  const rows = parseCsv(csvText).map((r) => {
    const voteDate = toDate(r.Abstimmungs_Datum);
    const updateDate = toDate(r.Aktualisierungs_Datum);
    const pct = +r.Stimmbeteiligung_Prozent;
    const daysBefore = voteDate && updateDate ? Math.round((voteDate - updateDate) / 86400000) : null;

    return {
      voteDateRaw: String(r.Abstimmungs_Datum),
      updateDateRaw: String(r.Aktualisierungs_Datum),
      voteDate,
      updateDate,
      year: voteDate ? voteDate.getUTCFullYear() : NaN,
      pct: Number.isFinite(pct) ? pct : NaN,
      daysBefore,
      phase: daysBefore === 0 ? "final" : "build-up"
    };
  }).filter((r) => Number.isFinite(r.year) && Number.isFinite(r.pct));

  const latestUpdateByVote = new Map();
  for (const row of rows) {
    const key = row.voteDateRaw;
    const existing = latestUpdateByVote.get(key);
    if (!existing || row.updateDate > existing.updateDate) latestUpdateByVote.set(key, row);
  }

  rows.forEach((row) => {
    row.isFinal = latestUpdateByVote.get(row.voteDateRaw) === row;
  });

  state.rows = rows;
  state.years = unique(rows.map((r) => r.year)).sort((a, b) => a - b);
  state.voteDates = unique(rows.map((r) => r.voteDateRaw)).sort();

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

  els.voteDateSelect.innerHTML = state.voteDates.map((d) => `<option value="${d}">${d}</option>`).join("");

  renderCheckboxGroup(els.phaseFilter, "Phase", "phase", ["final", "build-up"]);
}

function renderCheckboxGroup(host, label, key, values) {
  host.innerHTML = `
    <label>${label}</label>
    <div class="check-grid">
      ${values.map((value) => `<label><input type="checkbox" data-key="${key}" value="${value}" checked /> ${value}</label>`).join("")}
    </div>
  `;

  host.querySelectorAll("input[type='checkbox']").forEach((input) => {
    input.addEventListener("change", applyFiltersAndRender);
  });
}

function resetFilters() {
  els.yearMin.value = els.yearMin.min;
  els.yearMax.value = els.yearMax.max;
  [...els.voteDateSelect.options].forEach((o) => { o.selected = false; });
  document.querySelectorAll("input[type='checkbox']").forEach((cb) => { cb.checked = true; });
  applyFiltersAndRender();
}

function applyFiltersAndRender() {
  if (!state.rows.length) return;

  filters.yearMin = +els.yearMin.value;
  filters.yearMax = +els.yearMax.value;
  filters.voteDates = selectedValues(els.voteDateSelect);
  filters.phases = checkedValues("phase");

  els.yearLabel.textContent = `${filters.yearMin} to ${filters.yearMax}`;

  state.filtered = state.rows.filter((r) => {
    if (r.year < filters.yearMin || r.year > filters.yearMax) return false;
    if (filters.voteDates.size && !filters.voteDates.has(r.voteDateRaw)) return false;
    if (!filters.phases.has(r.phase)) return false;
    return true;
  });

  renderKpis();
  renderFinalTrend();
  renderBuildUp();
  renderTopDates();
  renderStory();
}

function renderKpis() {
  const finalRows = state.filtered.filter((r) => r.isFinal);
  const voteDates = unique(finalRows.map((r) => r.voteDateRaw)).length;
  const avgFinal = average(finalRows.map((r) => r.pct));
  const highest = maxBy(finalRows, (r) => r.pct);
  const latest = [...finalRows].sort((a, b) => a.voteDate - b.voteDate).pop();

  els.kpis.innerHTML = [
    kpi("Rows in View", fmt(state.filtered.length)),
    kpi("Vote Dates", fmt(voteDates)),
    kpi("Avg Final Turnout", Number.isFinite(avgFinal) ? `${avgFinal.toFixed(1)}%` : "-"),
    kpi("Highest Final", highest ? `${highest.voteDateRaw} (${highest.pct.toFixed(1)}%)` : "-"),
    kpi("Latest Vote", latest ? `${latest.voteDateRaw} (${latest.pct.toFixed(1)}%)` : "-")
  ].join("");
}

function renderFinalTrend() {
  const finalRows = state.filtered.filter((r) => r.isFinal).sort((a, b) => a.voteDate - b.voteDate);
  const labels = finalRows.map((r) => shortDate(r.voteDateRaw));
  const values = finalRows.map((r) => r.pct);

  const ctx = els.finalTrendCanvas.getContext("2d");
  drawLineChart(ctx, els.finalTrendCanvas.width, els.finalTrendCanvas.height, labels, values, "#1948bb", 100, "%");
}

function renderBuildUp() {
  const grouped = new Map();
  for (const row of state.filtered) {
    if (!Number.isFinite(row.daysBefore) || row.daysBefore < 0) continue;
    if (row.isFinal) continue;
    const key = row.daysBefore;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row.pct);
  }

  const entries = [...grouped.entries()]
    .map(([daysBefore, pcts]) => [daysBefore, average(pcts)])
    .sort((a, b) => b[0] - a[0])
    .slice(0, 20)
    .sort((a, b) => a[0] - b[0]);

  const labels = entries.map((e) => `-${e[0]}d`);
  const values = entries.map((e) => e[1]);

  const ctx = els.buildUpCanvas.getContext("2d");
  drawLineChart(ctx, els.buildUpCanvas.width, els.buildUpCanvas.height, labels, values, "#0e6c7d", 100, "%");
}

function renderTopDates() {
  const finalRows = state.filtered.filter((r) => r.isFinal);
  const top = [...finalRows]
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 8)
    .map((r) => [r.voteDateRaw, r.pct]);

  const ctx = els.topDatesCanvas.getContext("2d");
  drawHorizontalBars(ctx, els.topDatesCanvas.width, els.topDatesCanvas.height, top, "#d2721e", "%");
}

function renderStory() {
  const finalRows = state.filtered.filter((r) => r.isFinal);
  if (!finalRows.length) {
    els.story.innerHTML = "<h3>No final turnout rows in this filter.</h3><p>Enable the final phase or widen your selection.</p>";
    return;
  }

  const sorted = [...finalRows].sort((a, b) => a.voteDate - b.voteDate);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const delta = first ? (last.pct - first.pct) : 0;
  const highest = maxBy(finalRows, (r) => r.pct);
  const lowest = minBy(finalRows, (r) => r.pct);

  els.story.innerHTML = `
    <h3>What this voting slice says</h3>
    <ul>
      <li>Final turnout changed by <strong>${delta.toFixed(1)} pp</strong> from ${first.voteDateRaw} to ${last.voteDateRaw}.</li>
      <li>Highest final turnout: <strong>${highest.voteDateRaw}</strong> (${highest.pct.toFixed(1)}%).</li>
      <li>Lowest final turnout: <strong>${lowest.voteDateRaw}</strong> (${lowest.pct.toFixed(1)}%).</li>
      <li>Average final turnout in view: <strong>${average(finalRows.map((r) => r.pct)).toFixed(1)}%</strong>.</li>
    </ul>
    <p class="hint">Tip: select one vote date and include build-up to inspect how participation ramps up day by day.</p>
  `;
}

function drawLineChart(ctx, width, height, labels, values, color, maxY = null, suffix = "") {
  clear(ctx, width, height);
  if (!labels.length || !values.length) {
    ctx.fillStyle = "#596773";
    ctx.fillText("No data", 12, 24);
    return;
  }

  const pad = { t: 24, r: 12, b: 36, l: 42 };
  const plotW = width - pad.l - pad.r;
  const plotH = height - pad.t - pad.b;
  const yMax = maxY ?? Math.max(1, ...values);

  ctx.strokeStyle = "#d7e1e8";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.t + (plotH * i) / 4;
    ctx.beginPath();
    ctx.moveTo(pad.l, y);
    ctx.lineTo(width - pad.r, y);
    ctx.stroke();

    ctx.fillStyle = "#596773";
    ctx.font = "12px Segoe UI";
    const val = (yMax * (1 - i / 4)).toFixed(0);
    ctx.fillText(`${val}${suffix}`, 6, y + 4);
  }

  const n = labels.length;
  const xFor = (i) => pad.l + (n <= 1 ? 0 : (i / (n - 1)) * plotW);
  const yFor = (v) => pad.t + plotH - (v / yMax) * plotH;

  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  values.forEach((v, i) => {
    const x = xFor(i);
    const y = yFor(v);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  const ticks = Math.min(6, n);
  ctx.fillStyle = "#596773";
  ctx.font = "11px Segoe UI";
  for (let i = 0; i < ticks; i++) {
    const idx = Math.round((i / (ticks - 1 || 1)) * (n - 1));
    ctx.fillText(labels[idx], xFor(idx) - 16, height - 10);
  }
}

function drawHorizontalBars(ctx, width, height, entries, color, suffix = "") {
  clear(ctx, width, height);
  if (!entries.length) {
    ctx.fillStyle = "#596773";
    ctx.fillText("No data", 12, 24);
    return;
  }

  const pad = { t: 16, r: 64, b: 10, l: 100 };
  const plotW = width - pad.l - pad.r;
  const barH = 20;
  const gap = 10;
  const max = Math.max(...entries.map((e) => e[1]), 1);

  entries.forEach(([name, value], i) => {
    const y = pad.t + i * (barH + gap);
    const w = (value / max) * plotW;

    ctx.fillStyle = color;
    ctx.fillRect(pad.l, y, w, barH);

    ctx.fillStyle = "#132130";
    ctx.font = "12px Segoe UI";
    ctx.fillText(shortDate(name), 8, y + 14);
    ctx.fillText(`${value.toFixed(1)}${suffix}`, Math.min(width - 52, pad.l + w + 6), y + 14);
  });
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

function toDate(s) {
  if (!s) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function shortDate(iso) {
  return String(iso).slice(2);
}

function clear(ctx, width, height) {
  ctx.clearRect(0, 0, width, height);
}

function selectedValues(select) {
  return new Set([...select.selectedOptions].map((o) => o.value));
}

function checkedValues(key) {
  const boxes = document.querySelectorAll(`input[type='checkbox'][data-key='${key}']`);
  return new Set([...boxes].filter((b) => b.checked).map((b) => b.value));
}

function unique(values) {
  return [...new Set(values)];
}

function maxBy(items, selector) {
  if (!items.length) return null;
  let best = items[0];
  for (const item of items) if (selector(item) > selector(best)) best = item;
  return best;
}

function minBy(items, selector) {
  if (!items.length) return null;
  let best = items[0];
  for (const item of items) if (selector(item) < selector(best)) best = item;
  return best;
}

function average(values) {
  const valid = values.filter((v) => Number.isFinite(v));
  if (!valid.length) return NaN;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

function fmt(n) {
  return new Intl.NumberFormat("en-US").format(Math.round(n));
}

function kpi(label, value) {
  return `<div class="kpi"><div class="label">${label}</div><div class="value">${value}</div></div>`;
}
