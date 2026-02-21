const state = {
  rows: [],
  filtered: [],
  years: [],
  segments: [],
  weather: []
};

const filters = {
  yearMin: null,
  yearMax: null,
  segments: new Set(),
  weather: new Set(),
  dayTypes: new Set()
};

const els = {
  fileInput: document.getElementById("fileInput"),
  loadStatus: document.getElementById("loadStatus"),
  yearMin: document.getElementById("yearMin"),
  yearMax: document.getElementById("yearMax"),
  yearLabel: document.getElementById("yearLabel"),
  segmentSelect: document.getElementById("segmentSelect"),
  weatherSelect: document.getElementById("weatherSelect"),
  dayTypeFilter: document.getElementById("dayTypeFilter"),
  resetBtn: document.getElementById("resetBtn"),
  kpis: document.getElementById("kpis"),
  monthlyCanvas: document.getElementById("monthlyCanvas"),
  hourlyCanvas: document.getElementById("hourlyCanvas"),
  segmentCanvas: document.getElementById("segmentCanvas"),
  story: document.getElementById("story")
};

init();

async function init() {
  wireEvents();
  try {
    const res = await fetch("../assets/csv/hystreet_fussgaengerfrequenzen_seit2021.csv");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    hydrateData(text, "Loaded hystreet_fussgaengerfrequenzen_seit2021.csv automatically.");
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

  [els.segmentSelect, els.weatherSelect].forEach((s) => s.addEventListener("change", applyFiltersAndRender));
  els.resetBtn.addEventListener("click", resetFilters);
}

function hydrateData(csvText, statusMessage) {
  const rows = parseCsv(csvText).map((r) => {
    const ts = toDate(r.timestamp);
    const location = cleanText(r.location_name || "");
    const isBahnhof = normalize(location).includes("bahnhofstrasse");
    const pedestrians = +r.pedestrians_count;
    const temp = +r.temperature;
    const weather = normalizeWeather(r.weather_condition || "unknown");

    return {
      ts,
      year: ts ? ts.getUTCFullYear() : NaN,
      month: ts ? ts.getUTCMonth() + 1 : NaN,
      day: ts ? ts.getUTCDate() : NaN,
      hour: ts ? ts.getUTCHours() : NaN,
      weekday: ts ? ts.getUTCDay() : NaN,
      monthKey: ts ? `${ts.getUTCFullYear()}-${String(ts.getUTCMonth() + 1).padStart(2, "0")}` : "",
      location,
      weather,
      temp: Number.isFinite(temp) ? temp : null,
      count: Number.isFinite(pedestrians) ? pedestrians : 0,
      measured: normalize(r.collection_type || "") === "measured",
      unverified: String(r.unverified).toLowerCase() === "true",
      isBahnhof
    };
  }).filter((r) => r.ts && r.isBahnhof && Number.isFinite(r.count));

  state.rows = rows;
  state.years = unique(rows.map((r) => r.year)).sort((a, b) => a - b);
  state.segments = unique(rows.map((r) => r.location)).sort((a, b) => a.localeCompare(b));
  state.weather = unique(rows.map((r) => r.weather)).sort((a, b) => a.localeCompare(b));

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

  els.segmentSelect.innerHTML = state.segments.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("");
  els.weatherSelect.innerHTML = state.weather.map((w) => `<option value="${escapeHtml(w)}">${escapeHtml(w)}</option>`).join("");

  renderCheckboxGroup(els.dayTypeFilter, "Day Type", "daytype", ["Weekday", "Weekend"]);
}

function resetFilters() {
  els.yearMin.value = els.yearMin.min;
  els.yearMax.value = els.yearMax.max;
  [...els.segmentSelect.options].forEach((o) => { o.selected = false; });
  [...els.weatherSelect.options].forEach((o) => { o.selected = false; });
  document.querySelectorAll("input[type='checkbox']").forEach((cb) => { cb.checked = true; });
  applyFiltersAndRender();
}

function applyFiltersAndRender() {
  if (!state.rows.length) return;

  filters.yearMin = +els.yearMin.value;
  filters.yearMax = +els.yearMax.value;
  filters.segments = selectedValues(els.segmentSelect);
  filters.weather = selectedValues(els.weatherSelect);
  filters.dayTypes = checkedValues("daytype");

  els.yearLabel.textContent = `${filters.yearMin} to ${filters.yearMax}`;

  state.filtered = state.rows.filter((r) => {
    if (r.year < filters.yearMin || r.year > filters.yearMax) return false;
    if (filters.segments.size && !filters.segments.has(r.location)) return false;
    if (filters.weather.size && !filters.weather.has(r.weather)) return false;
    const isWeekend = r.weekday === 0 || r.weekday === 6;
    const bucket = isWeekend ? "Weekend" : "Weekday";
    if (!filters.dayTypes.has(bucket)) return false;
    return true;
  });

  renderKpis();
  renderMonthlyTrend();
  renderHourlyProfile();
  renderSegmentComparison();
  renderStory();
}

function renderKpis() {
  const rows = state.filtered;
  const total = sum(rows.map((r) => r.count));
  const hours = rows.length;
  const avgHour = hours ? total / hours : 0;
  const measuredShare = share(rows.filter((r) => r.measured).length, rows.length);

  const peak = maxBy(rows, (r) => r.count);
  const uniqueDays = unique(rows.map((r) => r.ts.toISOString().slice(0, 10))).length;

  els.kpis.innerHTML = [
    kpi("Total Pedestrians", fmt(total)),
    kpi("Avg per Hour", fmt(avgHour)),
    kpi("Observed Hours", fmt(hours)),
    kpi("Unique Days", fmt(uniqueDays)),
    kpi("Measured Rows", `${measuredShare.toFixed(1)}%`),
    kpi("Peak Hour", peak ? `${peak.ts.toISOString().slice(0, 13)}:00 (${fmt(peak.count)})` : "-")
  ].join("");
}

function renderMonthlyTrend() {
  const byMonth = groupSum(state.filtered, (r) => r.monthKey, (r) => r.count);
  const keys = [...byMonth.keys()].sort();
  const values = keys.map((k) => byMonth.get(k));
  drawLineChart(els.monthlyCanvas.getContext("2d"), els.monthlyCanvas.width, els.monthlyCanvas.height, keys, values, "#1d43c7");
}

function renderHourlyProfile() {
  const grouped = new Map();
  for (const r of state.filtered) {
    if (!grouped.has(r.hour)) grouped.set(r.hour, []);
    grouped.get(r.hour).push(r.count);
  }
  const labels = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0"));
  const values = labels.map((h) => average(grouped.get(+h) || []));
  drawLineChart(els.hourlyCanvas.getContext("2d"), els.hourlyCanvas.width, els.hourlyCanvas.height, labels, values, "#0e8b6f");
}

function renderSegmentComparison() {
  const bySegment = groupSum(state.filtered, (r) => r.location, (r) => r.count);
  const entries = [...bySegment.entries()].sort((a, b) => b[1] - a[1]);
  drawHorizontalBars(els.segmentCanvas.getContext("2d"), els.segmentCanvas.width, els.segmentCanvas.height, entries, "#0c6b8f");
}

function renderStory() {
  if (!state.filtered.length) {
    els.story.innerHTML = "<h3>No data for this filter.</h3><p>Try widening the year range or clearing segment/weather selections.</p>";
    return;
  }

  const bySegment = groupSum(state.filtered, (r) => r.location, (r) => r.count);
  const topSegment = maxEntry(bySegment);
  const byHour = groupSum(state.filtered, (r) => r.hour, (r) => r.count);
  const topHour = maxEntry(byHour);

  const warmRows = state.filtered.filter((r) => r.temp != null && r.temp >= 20);
  const coldRows = state.filtered.filter((r) => r.temp != null && r.temp < 10);
  const warmAvg = average(warmRows.map((r) => r.count));
  const coldAvg = average(coldRows.map((r) => r.count));

  els.story.innerHTML = `
    <h3>What this Bahnhofstrasse slice says</h3>
    <ul>
      <li>Most active segment: <strong>${topSegment ? escapeHtml(topSegment[0]) : "-"}</strong> (${topSegment ? fmt(topSegment[1]) : "0"} pedestrians).</li>
      <li>Busiest hour bucket: <strong>${topHour ? String(topHour[0]).padStart(2, "0") : "--"}:00</strong> (${topHour ? fmt(topHour[1]) : "0"}).</li>
      <li>Average hourly count in warm conditions (>=20C): <strong>${Number.isFinite(warmAvg) ? fmt(warmAvg) : "-"}</strong>.</li>
      <li>Average hourly count in cold conditions (<10C): <strong>${Number.isFinite(coldAvg) ? fmt(coldAvg) : "-"}</strong>.</li>
    </ul>
    <p class="hint">Data currently spans ${Math.min(...state.years)} to ${Math.max(...state.years)} with latest timestamp ${latestTimestamp()}.</p>
  `;
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

function drawLineChart(ctx, width, height, labels, values, color) {
  clear(ctx, width, height);
  if (!labels.length) {
    ctx.fillStyle = "#5a6670";
    ctx.fillText("No data", 12, 24);
    return;
  }

  const pad = { t: 24, r: 10, b: 36, l: 44 };
  const plotW = width - pad.l - pad.r;
  const plotH = height - pad.t - pad.b;
  const maxY = Math.max(1, ...values.map((v) => Number.isFinite(v) ? v : 0));

  ctx.strokeStyle = "#d8e2e9";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.t + (plotH * i) / 4;
    ctx.beginPath();
    ctx.moveTo(pad.l, y);
    ctx.lineTo(width - pad.r, y);
    ctx.stroke();

    ctx.fillStyle = "#5a6670";
    ctx.font = "11px Segoe UI";
    ctx.fillText(fmt(maxY * (1 - i / 4)), 6, y + 3);
  }

  const n = labels.length;
  const xFor = (i) => pad.l + (n <= 1 ? 0 : (i / (n - 1)) * plotW);
  const yFor = (v) => pad.t + plotH - ((Number.isFinite(v) ? v : 0) / maxY) * plotH;

  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  values.forEach((v, i) => {
    const x = xFor(i);
    const y = yFor(v);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  const ticks = Math.min(6, labels.length);
  ctx.fillStyle = "#5a6670";
  for (let i = 0; i < ticks; i++) {
    const idx = Math.round((i / (ticks - 1 || 1)) * (labels.length - 1));
    ctx.fillText(labels[idx], xFor(idx) - 14, height - 10);
  }
}

function drawHorizontalBars(ctx, width, height, entries, color) {
  clear(ctx, width, height);
  if (!entries.length) {
    ctx.fillStyle = "#5a6670";
    ctx.fillText("No data", 12, 24);
    return;
  }

  const pad = { t: 16, r: 70, b: 10, l: 160 };
  const plotW = width - pad.l - pad.r;
  const barH = 20;
  const gap = 11;
  const max = entries[0][1] || 1;

  entries.forEach(([name, value], i) => {
    const y = pad.t + i * (barH + gap);
    const w = (value / max) * plotW;

    ctx.fillStyle = color;
    ctx.fillRect(pad.l, y, w, barH);

    ctx.fillStyle = "#12212d";
    ctx.font = "12px Segoe UI";
    ctx.fillText(trim(name, 22), 8, y + 14);
    ctx.fillText(fmt(value), Math.min(width - 56, pad.l + w + 6), y + 14);
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

function toDate(iso) {
  const d = new Date(String(iso || ""));
  return Number.isNaN(d.getTime()) ? null : d;
}

function normalize(v) {
  return String(v || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeWeather(v) {
  return normalize(v).replaceAll("-", " ").trim() || "unknown";
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

function selectedValues(select) { return new Set([...select.selectedOptions].map((o) => o.value)); }
function checkedValues(key) { return new Set([...document.querySelectorAll(`input[data-key='${key}']`)].filter((b) => b.checked).map((b) => b.value)); }
function unique(values) { return [...new Set(values)]; }
function sum(values) { return values.reduce((a, b) => a + b, 0); }
function average(values) { const v = values.filter((n) => Number.isFinite(n)); return v.length ? sum(v) / v.length : NaN; }
function share(v, total) { return total ? (v / total) * 100 : 0; }
function groupSum(rows, keyFn, valueFn) { const m = new Map(); rows.forEach((r) => m.set(keyFn(r), (m.get(keyFn(r)) || 0) + valueFn(r))); return m; }
function maxBy(rows, f) { if (!rows.length) return null; let best = rows[0]; rows.forEach((r) => { if (f(r) > f(best)) best = r; }); return best; }
function maxEntry(map) { let best = null; for (const e of map.entries()) if (!best || e[1] > best[1]) best = e; return best; }
function trim(s, max) { return s.length > max ? `${s.slice(0, max - 1)}...` : s; }
function fmt(n) { return new Intl.NumberFormat("en-US").format(Math.round(n)); }
function kpi(label, value) { return `<div class="kpi"><div class="label">${label}</div><div class="value">${value}</div></div>`; }
function clear(ctx, width, height) { ctx.clearRect(0, 0, width, height); }
function latestTimestamp() { return state.rows.length ? [...state.rows].sort((a,b) => b.ts - a.ts)[0].ts.toISOString().slice(0, 16).replace("T", " ") + " UTC" : "-"; }
function escapeHtml(value) { return String(value).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;"); }
