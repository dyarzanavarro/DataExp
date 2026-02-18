const state = {
  rows: [],
  filtered: [],
  years: [],
  categories: {
    ownerSex: [],
    dogSex: [],
    ownerAge: [],
    dogType: [],
    kreis: [],
    quarter: []
  }
};

const filters = {
  yearMin: null,
  yearMax: null,
  ownerSex: new Set(),
  dogSex: new Set(),
  ownerAge: new Set(),
  dogType: new Set(),
  kreis: new Set(),
  quarter: new Set()
};

const els = {
  fileInput: document.getElementById("fileInput"),
  loadStatus: document.getElementById("loadStatus"),
  yearMin: document.getElementById("yearMin"),
  yearMax: document.getElementById("yearMax"),
  yearLabel: document.getElementById("yearLabel"),
  ownerSexFilter: document.getElementById("ownerSexFilter"),
  dogSexFilter: document.getElementById("dogSexFilter"),
  ownerAgeSelect: document.getElementById("ownerAgeSelect"),
  dogTypeSelect: document.getElementById("dogTypeSelect"),
  kreisSelect: document.getElementById("kreisSelect"),
  quarSelect: document.getElementById("quarSelect"),
  resetBtn: document.getElementById("resetBtn"),
  kpis: document.getElementById("kpis"),
  trendCanvas: document.getElementById("trendCanvas"),
  breedCanvas: document.getElementById("breedCanvas"),
  ownerAgeCanvas: document.getElementById("ownerAgeCanvas"),
  story: document.getElementById("story")
};

init();

async function init() {
  wireEvents();
  try {
    const res = await fetch("kul100od1001.csv");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    hydrateData(text, "Loaded kul100od1001.csv automatically.");
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

  [els.ownerAgeSelect, els.dogTypeSelect, els.kreisSelect, els.quarSelect].forEach((select) => {
    select.addEventListener("change", applyFiltersAndRender);
  });

  els.resetBtn.addEventListener("click", resetFilters);
}

function hydrateData(csvText, statusMessage) {
  const raw = parseCsv(csvText);
  const rows = raw.map((r) => ({
    year: +r.StichtagDatJahr,
    month: +r.StichtagDatMM,
    date: String(r.StichtagDat),
    hid: String(r.HID),
    ownerSex: normalize(String(r.SexLang)),
    ownerAgeCode: String(r.AlterV10Cd),
    ownerAgeLabel: normalize(String(r.AlterV10Lang)),
    kreis: normalize(String(r.KreisLang)),
    quarter: normalize(String(r.QuarLang)),
    breed1: normalize(String(r.Rasse1Text || "Unbekannt")),
    breed2: normalize(String(r.Rasse2Text || "")),
    dogType: normalize(String(r.Rassetyp1Lang || "Unbekannt")),
    dogBirthYear: +r.GebHundDatJahr,
    dogAgeCode: String(r.AlterVHundCd),
    dogAgeLabel: normalize(String(r.AlterVHundLang)),
    dogAgeNum: +r.AlterVHundNum,
    dogSex: normalize(String(r.SexHundLang)),
    color: normalize(String(r.HundefarbeText || "Unbekannt")),
    count: +r.AnzHunde || 0
  })).filter((r) => Number.isFinite(r.year));

  state.rows = rows;
  state.years = unique(rows.map((r) => r.year)).sort((a, b) => a - b);

  state.categories.ownerSex = unique(rows.map((r) => r.ownerSex));
  state.categories.dogSex = unique(rows.map((r) => r.dogSex));
  state.categories.ownerAge = unique(rows.map((r) => r.ownerAgeLabel)).sort((a, b) => ownerAgeSort(a) - ownerAgeSort(b));
  state.categories.dogType = unique(rows.map((r) => r.dogType));
  state.categories.kreis = unique(rows.map((r) => r.kreis));
  state.categories.quarter = unique(rows.map((r) => r.quarter));

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

  renderCheckboxGroup(els.ownerSexFilter, "Owner Sex", "ownerSex", state.categories.ownerSex);
  renderCheckboxGroup(els.dogSexFilter, "Dog Sex", "dogSex", state.categories.dogSex);

  fillSelect(els.ownerAgeSelect, state.categories.ownerAge);
  fillSelect(els.dogTypeSelect, state.categories.dogType);
  fillSelect(els.kreisSelect, state.categories.kreis);
  fillSelect(els.quarSelect, state.categories.quarter);
}

function renderCheckboxGroup(host, label, key, values) {
  host.innerHTML = `
    <label>${label}</label>
    <div class="check-grid">
      ${values.map((value) => `<label><input type="checkbox" data-key="${key}" value="${escapeHtml(value)}" checked /> ${escapeHtml(value)}</label>`).join("")}
    </div>
  `;
  host.querySelectorAll("input[type='checkbox']").forEach((input) => input.addEventListener("change", applyFiltersAndRender));
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

  [els.ownerAgeSelect, els.dogTypeSelect, els.kreisSelect, els.quarSelect].forEach((select) => {
    [...select.options].forEach((o) => { o.selected = false; });
  });

  applyFiltersAndRender();
}

function applyFiltersAndRender() {
  if (!state.rows.length) return;

  filters.yearMin = +els.yearMin.value;
  filters.yearMax = +els.yearMax.value;
  filters.ownerSex = checkedValues("ownerSex");
  filters.dogSex = checkedValues("dogSex");
  filters.ownerAge = selectedValues(els.ownerAgeSelect);
  filters.dogType = selectedValues(els.dogTypeSelect);
  filters.kreis = selectedValues(els.kreisSelect);
  filters.quarter = selectedValues(els.quarSelect);

  els.yearLabel.textContent = `${filters.yearMin} to ${filters.yearMax}`;

  state.filtered = state.rows.filter((r) => {
    if (r.year < filters.yearMin || r.year > filters.yearMax) return false;
    if (!filters.ownerSex.has(r.ownerSex) || !filters.dogSex.has(r.dogSex)) return false;
    if (filters.ownerAge.size && !filters.ownerAge.has(r.ownerAgeLabel)) return false;
    if (filters.dogType.size && !filters.dogType.has(r.dogType)) return false;
    if (filters.kreis.size && !filters.kreis.has(r.kreis)) return false;
    if (filters.quarter.size && !filters.quarter.has(r.quarter)) return false;
    return true;
  });

  renderKpis();
  renderTrend();
  renderTopBreeds();
  renderOwnerAge();
  renderStory();
}

function renderKpis() {
  const totalDogs = sum(state.filtered.map((r) => r.count));
  const uniqueDogs = new Set(state.filtered.map((r) => r.hid)).size;
  const avgDogAge = weightedAverage(state.filtered, (r) => Number.isFinite(r.dogAgeNum) ? r.dogAgeNum : null, (r) => r.count);
  const avgOwnerAge = weightedAverage(state.filtered, (r) => ownerAgeMid(r.ownerAgeLabel), (r) => r.count);

  const byYear = groupSum(state.filtered, (r) => r.year, (r) => r.count);
  let peakYear = "-";
  let peakCount = 0;
  for (const [y, v] of byYear.entries()) {
    if (v > peakCount) {
      peakYear = String(y);
      peakCount = v;
    }
  }

  els.kpis.innerHTML = [
    kpi("Dogs (Visible)", fmt(totalDogs)),
    kpi("Unique HIDs", fmt(uniqueDogs)),
    kpi("Avg Dog Age", Number.isFinite(avgDogAge) ? `${avgDogAge.toFixed(1)} yrs` : "-"),
    kpi("Avg Owner Age", Number.isFinite(avgOwnerAge) ? `${avgOwnerAge.toFixed(1)} yrs` : "-"),
    kpi("Peak Year", `${peakYear} (${fmt(peakCount)})`)
  ].join("");
}

function renderTrend() {
  const years = range(filters.yearMin, filters.yearMax);
  const byYear = groupSum(state.filtered, (r) => r.year, (r) => r.count);
  const values = years.map((y) => byYear.get(y) || 0);

  const ctx = els.trendCanvas.getContext("2d");
  drawLineChart(ctx, els.trendCanvas.width, els.trendCanvas.height, years, values, "#1956c8", "Dogs");
}

function renderTopBreeds() {
  const byBreed = groupSum(state.filtered, (r) => r.breed1, (r) => r.count);
  const top = [...byBreed.entries()]
    .sort((a, b) => b[1] - a[1])
    .filter((entry) => entry[0] && entry[0] !== "")
    .slice(0, 10);

  const ctx = els.breedCanvas.getContext("2d");
  drawHorizontalBars(ctx, els.breedCanvas.width, els.breedCanvas.height, top, "#14795a");
}

function renderOwnerAge() {
  const byAge = groupSum(state.filtered, (r) => r.ownerAgeLabel, (r) => r.count);
  const ordered = state.categories.ownerAge
    .filter((k) => byAge.has(k))
    .map((k) => [k, byAge.get(k)]);

  const ctx = els.ownerAgeCanvas.getContext("2d");
  drawVerticalBars(ctx, els.ownerAgeCanvas.width, els.ownerAgeCanvas.height, ordered, "#d97a12");
}

function renderStory() {
  if (!state.filtered.length) {
    els.story.innerHTML = "<h3>No records for this filter</h3><p>Try clearing district and neighborhood selections or widening the year range.</p>";
    return;
  }

  const totalDogs = sum(state.filtered.map((r) => r.count));
  const topDistrict = maxEntry(groupSum(state.filtered, (r) => r.kreis, (r) => r.count));
  const topQuarter = maxEntry(groupSum(state.filtered, (r) => r.quarter, (r) => r.count));
  const topBreed = maxEntry(groupSum(state.filtered, (r) => r.breed1, (r) => r.count));

  const nowYear = filters.yearMax;
  const currentRows = state.filtered.filter((r) => r.year === nowYear);
  const femaleDogs = sum(currentRows.filter((r) => r.dogSex === "weiblich").map((r) => r.count));
  const maleDogs = sum(currentRows.filter((r) => r.dogSex === "maennlich" || r.dogSex === "männlich").map((r) => r.count));
  const femaleShare = (femaleDogs + maleDogs) ? (femaleDogs / (femaleDogs + maleDogs)) * 100 : 0;

  els.story.innerHTML = `
    <h3>What this dog slice shows</h3>
    <ul>
      <li><strong>${fmt(totalDogs)}</strong> dog records are visible in this selection.</li>
      <li>Top district: <strong>${topDistrict ? topDistrict[0] : "-"}</strong> (${topDistrict ? fmt(topDistrict[1]) : "0"}).</li>
      <li>Top neighborhood: <strong>${topQuarter ? topQuarter[0] : "-"}</strong> (${topQuarter ? fmt(topQuarter[1]) : "0"}).</li>
      <li>Most common breed label: <strong>${topBreed ? topBreed[0] : "-"}</strong> (${topBreed ? fmt(topBreed[1]) : "0"}).</li>
      <li>In ${nowYear}, female dogs are about <strong>${femaleShare.toFixed(1)}%</strong> of male+female dog records.</li>
    </ul>
    <p class="hint">Tip: select one Kreis and compare owner age bands to see neighborhood lifestyle differences.</p>
  `;
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

function drawLineChart(ctx, width, height, labels, values, color, legendName) {
  clear(ctx, width, height);
  const pad = { t: 28, r: 14, b: 30, l: 46 };
  const plotW = width - pad.l - pad.r;
  const plotH = height - pad.t - pad.b;
  const maxY = Math.max(1, ...values);

  ctx.strokeStyle = "#d9e2ea";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.t + (plotH * i) / 4;
    ctx.beginPath();
    ctx.moveTo(pad.l, y);
    ctx.lineTo(width - pad.r, y);
    ctx.stroke();

    const val = Math.round(maxY * (1 - i / 4));
    ctx.fillStyle = "#5a6671";
    ctx.font = "12px Segoe UI";
    ctx.fillText(fmt(val), 6, y + 4);
  }

  const n = labels.length;
  const xFor = (i) => pad.l + (n <= 1 ? 0 : (i / (n - 1)) * plotW);
  const yFor = (v) => pad.t + plotH - (v / maxY) * plotH;

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

  ctx.fillStyle = color;
  ctx.fillRect(pad.l, 8, 14, 14);
  ctx.fillStyle = "#111f2a";
  ctx.fillText(legendName, pad.l + 20, 20);

  const ticks = Math.min(6, labels.length);
  ctx.fillStyle = "#5a6671";
  for (let i = 0; i < ticks; i++) {
    const idx = Math.round((i / (ticks - 1 || 1)) * (labels.length - 1));
    ctx.fillText(String(labels[idx]), xFor(idx) - 14, height - 8);
  }
}

function drawHorizontalBars(ctx, width, height, entries, color) {
  clear(ctx, width, height);
  if (!entries.length) {
    ctx.fillStyle = "#5a6671";
    ctx.fillText("No data", 12, 24);
    return;
  }

  const pad = { t: 16, r: 10, b: 12, l: 165 };
  const plotW = width - pad.l - pad.r;
  const barH = 17;
  const gap = 9;
  const max = entries[0][1] || 1;

  entries.forEach(([name, value], i) => {
    const y = pad.t + i * (barH + gap);
    const w = (value / max) * plotW;

    ctx.fillStyle = color;
    ctx.fillRect(pad.l, y, w, barH);

    ctx.fillStyle = "#111f2a";
    ctx.font = "12px Segoe UI";
    ctx.fillText(trim(name, 24), 8, y + 12);
    ctx.fillText(fmt(value), pad.l + w + 6, y + 12);
  });
}

function drawVerticalBars(ctx, width, height, entries, color) {
  clear(ctx, width, height);
  if (!entries.length) {
    ctx.fillStyle = "#5a6671";
    ctx.fillText("No data", 12, 24);
    return;
  }

  const pad = { t: 16, r: 8, b: 84, l: 24 };
  const plotW = width - pad.l - pad.r;
  const plotH = height - pad.t - pad.b;
  const max = Math.max(...entries.map((e) => e[1]), 1);
  const gap = 7;
  const barW = Math.max(6, plotW / entries.length - gap);

  entries.forEach(([name, value], i) => {
    const x = pad.l + i * (barW + gap);
    const h = (value / max) * plotH;
    const y = pad.t + plotH - h;

    ctx.fillStyle = color;
    ctx.fillRect(x, y, barW, h);

    ctx.save();
    ctx.translate(x + barW / 2, height - 12);
    ctx.rotate(-Math.PI / 5.5);
    ctx.fillStyle = "#111f2a";
    ctx.font = "11px Segoe UI";
    ctx.fillText(trim(name, 18), -24, 0);
    ctx.restore();
  });
}

function clear(ctx, width, height) {
  ctx.clearRect(0, 0, width, height);
}

function groupSum(rows, keyFn, valueFn) {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    const val = valueFn(row);
    map.set(key, (map.get(key) || 0) + val);
  }
  return map;
}

function weightedAverage(rows, valueFn, weightFn) {
  let numerator = 0;
  let denominator = 0;
  for (const row of rows) {
    const v = valueFn(row);
    const w = weightFn(row);
    if (!Number.isFinite(v) || !Number.isFinite(w)) continue;
    numerator += v * w;
    denominator += w;
  }
  return denominator ? numerator / denominator : NaN;
}

function ownerAgeMid(label) {
  const txt = String(label).toLowerCase();
  if (txt.includes("unbek")) return NaN;
  const nums = txt.match(/\d+/g);
  if (!nums || !nums.length) return NaN;
  if (nums.length >= 2) return (Number(nums[0]) + Number(nums[1])) / 2;
  const n = Number(nums[0]);
  if (txt.includes("unter")) return n / 2;
  if (txt.includes("80") || txt.includes("90") || txt.includes("100")) return n + 5;
  return n;
}

function ownerAgeSort(label) {
  const nums = String(label).match(/\d+/);
  return nums ? Number(nums[0]) : 999;
}

function checkedValues(key) {
  const boxes = document.querySelectorAll(`input[type='checkbox'][data-key='${key}']`);
  return new Set([...boxes].filter((b) => b.checked).map((b) => b.value));
}

function selectedValues(select) {
  return new Set([...select.selectedOptions].map((o) => o.value));
}

function range(start, end) {
  const out = [];
  for (let n = start; n <= end; n++) out.push(n);
  return out;
}

function normalize(s) {
  return s.trim();
}

function unique(values) {
  return [...new Set(values)].filter((v) => v !== "");
}

function maxEntry(map) {
  let best = null;
  for (const entry of map.entries()) {
    if (!best || entry[1] > best[1]) best = entry;
  }
  return best;
}

function sum(nums) {
  return nums.reduce((acc, n) => acc + n, 0);
}

function fmt(n) {
  return new Intl.NumberFormat("en-US").format(Math.round(n));
}

function trim(text, max) {
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
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
