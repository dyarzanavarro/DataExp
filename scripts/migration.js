const state = {
  rows: [],
  filtered: [],
  years: [],
  categories: {
    sex: [],
    origin: [],
    age: [],
    kreis: [],
    quar: []
  }
};

const els = {
  fileInput: document.getElementById("fileInput"),
  loadStatus: document.getElementById("loadStatus"),
  yearMin: document.getElementById("yearMin"),
  yearMax: document.getElementById("yearMax"),
  yearLabel: document.getElementById("yearLabel"),
  sexFilter: document.getElementById("sexFilter"),
  originFilter: document.getElementById("originFilter"),
  ageFilter: document.getElementById("ageFilter"),
  kreisSelect: document.getElementById("kreisSelect"),
  quarSelect: document.getElementById("quarSelect"),
  kpis: document.getElementById("kpis"),
  story: document.getElementById("story"),
  resetBtn: document.getElementById("resetBtn"),
  trendCanvas: document.getElementById("trendCanvas"),
  topQuartersCanvas: document.getElementById("topQuartersCanvas"),
  ageCanvas: document.getElementById("ageCanvas")
};

const filters = {
  yearMin: null,
  yearMax: null,
  sex: new Set(),
  origin: new Set(),
  age: new Set(),
  kreis: new Set(),
  quar: new Set()
};

init();

async function init() {
  wireGlobalEvents();
  try {
    const res = await fetch("../assets/csv/bev353od3530.csv");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    hydrateData(text, "Loaded bev353od3530.csv automatically.");
  } catch (_err) {
    els.loadStatus.innerHTML = "Auto-load failed (often due to <code>file://</code>). Use the button above or run a local server.";
  }
}

function wireGlobalEvents() {
  els.fileInput.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    hydrateData(text, `Loaded ${file.name}.`);
  });

  els.yearMin.addEventListener("input", () => {
    if (+els.yearMin.value > +els.yearMax.value) {
      els.yearMin.value = els.yearMax.value;
    }
    applyFiltersAndRender();
  });

  els.yearMax.addEventListener("input", () => {
    if (+els.yearMax.value < +els.yearMin.value) {
      els.yearMax.value = els.yearMin.value;
    }
    applyFiltersAndRender();
  });

  els.kreisSelect.addEventListener("change", applyFiltersAndRender);
  els.quarSelect.addEventListener("change", applyFiltersAndRender);
  els.resetBtn.addEventListener("click", resetFilters);
}

function hydrateData(csvText, statusMessage) {
  const rows = parseCsv(csvText).map((r) => ({
    year: +r.EreignisDatJahr,
    month: +r.EreignisDatMM,
    date: String(r.StichtagDat),
    sex: String(r.SexLang),
    age: String(r.AlterV20ueber80Kurz_noDM),
    origin: String(r.HerkunftLang),
    kreis: String(r.KreisLang),
    quarter: String(r.QuarLang),
    status: String(r.DatenstandLang),
    arrivals: +r.AnzZuzuWir || 0
  })).filter((r) => Number.isFinite(r.year) && Number.isFinite(r.month));

  state.rows = rows;
  state.years = [...new Set(rows.map((r) => r.year))].sort((a, b) => a - b);
  state.categories.sex = collect(rows, "sex");
  state.categories.origin = collect(rows, "origin");
  state.categories.age = collect(rows, "age");
  state.categories.kreis = collect(rows, "kreis");
  state.categories.quar = collect(rows, "quarter");

  configureFilterControls();
  els.loadStatus.textContent = statusMessage;
  applyFiltersAndRender();
}

function configureFilterControls() {
  const minYear = state.years[0];
  const maxYear = state.years[state.years.length - 1];
  els.yearMin.min = String(minYear);
  els.yearMin.max = String(maxYear);
  els.yearMax.min = String(minYear);
  els.yearMax.max = String(maxYear);
  els.yearMin.value = String(minYear);
  els.yearMax.value = String(maxYear);

  renderCheckboxGroup(els.sexFilter, "Sex", "sex", state.categories.sex);
  renderCheckboxGroup(els.originFilter, "Origin", "origin", state.categories.origin);
  renderCheckboxGroup(els.ageFilter, "Age Band", "age", state.categories.age);

  fillSelect(els.kreisSelect, state.categories.kreis);
  fillSelect(els.quarSelect, state.categories.quar);
}

function renderCheckboxGroup(host, label, key, values) {
  host.innerHTML = `
    <label>${label}</label>
    <div class="check-grid">
      ${values.map((value) => `<label><input type="checkbox" data-key="${key}" value="${escapeHtml(value)}" checked /> ${escapeHtml(value)}</label>`).join("")}
    </div>
  `;

  host.querySelectorAll("input[type='checkbox']").forEach((input) => {
    input.addEventListener("change", applyFiltersAndRender);
  });
}

function fillSelect(select, values) {
  select.innerHTML = values.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("");
}

function resetFilters() {
  els.yearMin.value = els.yearMin.min;
  els.yearMax.value = els.yearMax.max;

  document.querySelectorAll("input[type='checkbox']").forEach((cb) => {
    cb.checked = true;
  });

  [...els.kreisSelect.options].forEach((o) => { o.selected = false; });
  [...els.quarSelect.options].forEach((o) => { o.selected = false; });

  applyFiltersAndRender();
}

function applyFiltersAndRender() {
  if (!state.rows.length) return;

  filters.yearMin = +els.yearMin.value;
  filters.yearMax = +els.yearMax.value;
  filters.sex = checkedValues("sex");
  filters.origin = checkedValues("origin");
  filters.age = checkedValues("age");
  filters.kreis = selectedValues(els.kreisSelect);
  filters.quar = selectedValues(els.quarSelect);

  els.yearLabel.textContent = `${filters.yearMin} to ${filters.yearMax}`;

  state.filtered = state.rows.filter((r) => {
    if (r.year < filters.yearMin || r.year > filters.yearMax) return false;
    if (!filters.sex.has(r.sex) || !filters.origin.has(r.origin) || !filters.age.has(r.age)) return false;
    if (filters.kreis.size && !filters.kreis.has(r.kreis)) return false;
    if (filters.quar.size && !filters.quar.has(r.quarter)) return false;
    return true;
  });

  renderKpis();
  renderTrendChart();
  renderTopQuarters();
  renderAgeProfile();
  renderStory();
}

function renderKpis() {
  const total = sum(state.filtered.map((r) => r.arrivals));
  const uniqueQuarters = new Set(state.filtered.map((r) => r.quarter)).size;
  const foreign = sum(state.filtered.filter((r) => r.origin.toLowerCase().includes("ausl")).map((r) => r.arrivals));
  const foreignShare = total ? (foreign / total) * 100 : 0;

  const yearly = groupSum(state.filtered, (r) => r.year);
  let peakYear = "-";
  let peakValue = 0;
  for (const [year, value] of yearly.entries()) {
    if (value > peakValue) {
      peakValue = value;
      peakYear = String(year);
    }
  }

  els.kpis.innerHTML = [
    kpi("Total Arrivals", fmt(total)),
    kpi("Peak Year", `${peakYear} (${fmt(peakValue)})`),
    kpi("Foreign Share", `${foreignShare.toFixed(1)}%`),
    kpi("Active Quarters", fmt(uniqueQuarters))
  ].join("");
}

function renderTrendChart() {
  const allYears = range(filters.yearMin, filters.yearMax);
  const totalByYear = groupSum(state.filtered, (r) => r.year);
  const swissByYear = groupSum(state.filtered.filter((r) => r.origin.toLowerCase().includes("schweiz")), (r) => r.year);
  const foreignByYear = groupSum(state.filtered.filter((r) => r.origin.toLowerCase().includes("ausl")), (r) => r.year);

  const totalSeries = allYears.map((y) => totalByYear.get(y) || 0);
  const swissSeries = allYears.map((y) => swissByYear.get(y) || 0);
  const foreignSeries = allYears.map((y) => foreignByYear.get(y) || 0);

  const ctx = els.trendCanvas.getContext("2d");
  drawLineChart(ctx, els.trendCanvas.width, els.trendCanvas.height, {
    labels: allYears,
    series: [
      { name: "Total", values: totalSeries, color: "#152022", width: 3 },
      { name: "Swiss", values: swissSeries, color: "#0f7a6d", width: 2 },
      { name: "Foreign", values: foreignSeries, color: "#e26f2f", width: 2 }
    ]
  });
}

function renderTopQuarters() {
  const byQuarter = groupSum(state.filtered, (r) => r.quarter);
  const top = [...byQuarter.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);

  const ctx = els.topQuartersCanvas.getContext("2d");
  drawHorizontalBars(ctx, els.topQuartersCanvas.width, els.topQuartersCanvas.height, top, "#2f5be2");
}

function renderAgeProfile() {
  const byYear = groupSum(state.filtered, (r) => r.year);
  const entries = [...byYear.entries()];
  const peakYear = entries.length ? entries.sort((a, b) => b[1] - a[1])[0][0] : null;

  const ageRows = peakYear == null ? [] : state.filtered.filter((r) => r.year === peakYear);
  const byAge = groupSum(ageRows, (r) => r.age);
  const ageOrder = state.categories.age.filter((a) => byAge.has(a));
  const points = ageOrder.map((a) => [a, byAge.get(a)]);

  const ctx = els.ageCanvas.getContext("2d");
  drawVerticalBars(ctx, els.ageCanvas.width, els.ageCanvas.height, points, "#0f7a6d");
}

function renderStory() {
  const rows = state.filtered;
  if (!rows.length) {
    els.story.innerHTML = "<h3>No data for this filter.</h3><p>Try widening year range or clearing district/neighborhood selections.</p>";
    return;
  }

  const total = sum(rows.map((r) => r.arrivals));
  const byYear = groupSum(rows, (r) => r.year);
  const sortedYears = [...byYear.entries()].sort((a, b) => a[0] - b[0]);
  const first = sortedYears[0];
  const last = sortedYears[sortedYears.length - 1];
  const growth = first && first[1] ? (((last[1] - first[1]) / first[1]) * 100) : 0;

  const bySex = groupSum(rows, (r) => r.sex);
  const topSex = [...bySex.entries()].sort((a, b) => b[1] - a[1])[0];

  const byKreis = groupSum(rows, (r) => r.kreis);
  const topDistrict = [...byKreis.entries()].sort((a, b) => b[1] - a[1])[0];

  els.story.innerHTML = `
    <h3>What this slice says</h3>
    <ul>
      <li><strong>${fmt(total)}</strong> people moved in across your selected years.</li>
      <li>Annual flow changed by <strong>${growth.toFixed(1)}%</strong> from ${first ? first[0] : "-"} to ${last ? last[0] : "-"}.</li>
      <li>Most represented gender label: <strong>${topSex ? topSex[0] : "-"}</strong> (${topSex ? fmt(topSex[1]) : "0"}).</li>
      <li>Most active district: <strong>${topDistrict ? topDistrict[0] : "-"}</strong> (${topDistrict ? fmt(topDistrict[1]) : "0"} arrivals).</li>
    </ul>
    <p class="hint">Tip: lock one neighborhood and drag the year range to watch local demographic shifts.</p>
  `;
}

function drawLineChart(ctx, width, height, config) {
  clear(ctx, width, height);
  const pad = { t: 28, r: 16, b: 30, l: 44 };
  const plotW = width - pad.l - pad.r;
  const plotH = height - pad.t - pad.b;

  const maxY = Math.max(1, ...config.series.flatMap((s) => s.values));

  ctx.strokeStyle = "#d5ddd9";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.t + (plotH * i) / 4;
    ctx.beginPath();
    ctx.moveTo(pad.l, y);
    ctx.lineTo(width - pad.r, y);
    ctx.stroke();

    const val = Math.round(maxY * (1 - i / 4));
    ctx.fillStyle = "#5f6b6d";
    ctx.font = "12px Segoe UI";
    ctx.fillText(fmt(val), 6, y + 4);
  }

  const n = config.labels.length;
  const xFor = (i) => pad.l + (n <= 1 ? 0 : (i / (n - 1)) * plotW);
  const yFor = (v) => pad.t + plotH - (v / maxY) * plotH;

  for (const s of config.series) {
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.width;
    ctx.beginPath();
    s.values.forEach((v, i) => {
      const x = xFor(i);
      const y = yFor(v);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  ctx.fillStyle = "#5f6b6d";
  ctx.font = "12px Segoe UI";
  const ticks = 6;
  for (let i = 0; i < ticks; i++) {
    const idx = Math.round((i / (ticks - 1)) * (n - 1));
    const label = String(config.labels[idx]);
    const x = xFor(idx);
    ctx.fillText(label, x - 14, height - 8);
  }

  const legend = config.series;
  legend.forEach((item, i) => {
    const x = pad.l + i * 120;
    ctx.fillStyle = item.color;
    ctx.fillRect(x, 8, 14, 14);
    ctx.fillStyle = "#152022";
    ctx.fillText(item.name, x + 20, 20);
  });
}

function drawHorizontalBars(ctx, width, height, entries, color) {
  clear(ctx, width, height);
  const pad = { t: 18, r: 88, b: 16, l: 150 };
  const plotW = width - pad.l - pad.r;
  const barH = 18;
  const gap = 9;

  if (!entries.length) {
    ctx.fillStyle = "#5f6b6d";
    ctx.fillText("No data", 12, 24);
    return;
  }

  const max = entries[0][1];
  entries.forEach(([name, value], i) => {
    const y = pad.t + i * (barH + gap);
    const w = (value / max) * plotW;
    ctx.font = "12px Segoe UI";
    const valueText = fmt(value);
    const valueWidth = ctx.measureText(valueText).width;
    ctx.fillStyle = color;
    ctx.fillRect(pad.l, y, w, barH);
    ctx.fillStyle = "#152022";
    ctx.fillText(trim(name, 22), 8, y + 13);

    const outsideX = pad.l + w + 6;
    const outsideFits = outsideX + valueWidth <= width - 6;
    if (outsideFits) {
      ctx.fillText(valueText, outsideX, y + 13);
    } else {
      ctx.fillStyle = "#ffffff";
      ctx.fillText(valueText, Math.max(pad.l + 4, pad.l + w - valueWidth - 6), y + 13);
      ctx.fillStyle = "#152022";
    }
  });
}

function drawVerticalBars(ctx, width, height, entries, color) {
  clear(ctx, width, height);
  const pad = { t: 18, r: 12, b: 70, l: 30 };
  const plotW = width - pad.l - pad.r;
  const plotH = height - pad.t - pad.b;

  if (!entries.length) {
    ctx.fillStyle = "#5f6b6d";
    ctx.fillText("No data", 12, 24);
    return;
  }

  const max = Math.max(...entries.map((e) => e[1]), 1);
  const barW = plotW / entries.length - 8;

  entries.forEach(([name, value], i) => {
    const x = pad.l + i * (barW + 8);
    const h = (value / max) * plotH;
    const y = pad.t + plotH - h;

    ctx.fillStyle = color;
    ctx.fillRect(x, y, barW, h);

    ctx.save();
    ctx.translate(x + barW / 2, height - 10);
    ctx.rotate(-Math.PI / 5);
    ctx.fillStyle = "#152022";
    ctx.font = "12px Segoe UI";
    ctx.fillText(trim(name, 14), -22, 0);
    ctx.restore();

    ctx.fillStyle = "#152022";
    ctx.font = "11px Segoe UI";
    ctx.fillText(fmt(value), x + 2, y - 4);
  });
}

function clear(ctx, width, height) {
  ctx.clearRect(0, 0, width, height);
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
      for (let i = 0; i < headers.length; i++) {
        obj[headers[i]] = r[i] ?? "";
      }
      return obj;
    });
}

function checkedValues(key) {
  const boxes = document.querySelectorAll(`input[type='checkbox'][data-key='${key}']`);
  return new Set([...boxes].filter((b) => b.checked).map((b) => b.value));
}

function selectedValues(select) {
  return new Set([...select.selectedOptions].map((o) => o.value));
}

function collect(rows, key) {
  return [...new Set(rows.map((r) => r[key]))].sort((a, b) => String(a).localeCompare(String(b)));
}

function groupSum(rows, keyFn) {
  const m = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    m.set(k, (m.get(k) || 0) + r.arrivals);
  }
  return m;
}

function range(start, end) {
  const out = [];
  for (let y = start; y <= end; y++) out.push(y);
  return out;
}

function sum(nums) {
  return nums.reduce((acc, n) => acc + n, 0);
}

function fmt(n) {
  return new Intl.NumberFormat("en-US").format(Math.round(n));
}

function trim(s, max) {
  return s.length > max ? `${s.slice(0, max - 1)}...` : s;
}

function kpi(label, value) {
  return `<div class="kpi"><div class="label">${label}</div><div class="value">${value}</div></div>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
