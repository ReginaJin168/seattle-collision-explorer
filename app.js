const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const state = {
  records: [],
  filtered: [],
  map: null,
  pointLayer: null,
  pointRenderer: null,
  selectedId: null,
  basemapLayers: {},
  activeBasemap: null,
  basemapMode: "dark",
};

const controls = {
  year: document.querySelector("#year-filter"),
  severity: document.querySelector("#severity-filter"),
  weather: document.querySelector("#weather-filter"),
  road: document.querySelector("#road-filter"),
  type: document.querySelector("#type-filter"),
};

const predictionControls = {
  time: document.querySelector("#predict-time"),
  weather: document.querySelector("#predict-weather"),
  road: document.querySelector("#predict-road"),
  type: document.querySelector("#predict-type"),
  light: document.querySelector("#predict-light"),
};

const model = { data: null };
const questionC = { data: null };

const number = new Intl.NumberFormat("en-US");
const percent = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 });

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function uniqueValues(key) {
  return [...new Set(state.records.map((record) => record[key]).filter((value) => value !== null && value !== ""))]
    .sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
}

function populateSelect(select, values) {
  const current = select.value;
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.append(option);
  });
  if ([...select.options].some((option) => option.value === current)) select.value = current;
}

function initViewTabs() {
  const tabs = [...document.querySelectorAll(".view-tab")];
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const selectedView = tab.dataset.view;
      document.body.classList.toggle("historical-mode", selectedView === "historical");
      document.querySelector(".method-disclosure").open = false;
      tabs.forEach((item) => {
        const active = item === tab;
        item.classList.toggle("active", active);
        item.setAttribute("aria-selected", String(active));
      });
      document.querySelectorAll(".dashboard-view").forEach((view) => {
        const active = view.id === `${selectedView}-view`;
        view.classList.toggle("active", active);
        view.hidden = !active;
      });
      if (selectedView === "questionc") requestAnimationFrame(renderQuestionC);
      if (selectedView === "historical" && state.map) {
        requestAnimationFrame(() => {
          state.map.invalidateSize({ pan: false });
        });
      }
    });
  });
}

function initMap() {
  if (!window.L) {
    document.querySelector("#map").innerHTML =
      '<div style="padding:28px;color:#63716c">The map library could not load.</div>';
    return;
  }

  state.map = L.map("map", {
    zoomControl: true,
    minZoom: 3,
    maxZoom: 18,
    zoomSnap: 0.25,
    zoomDelta: 0.5,
  }).setView([47.6062, -122.3321], 11);
  const esriService = "https://services.arcgisonline.com/ArcGIS/rest/services";
  state.basemapLayers.street = L.tileLayer(
    `${esriService}/World_Street_Map/MapServer/tile/{z}/{y}/{x}`,
    { maxZoom: 18, attribution: 'Map tiles &copy; <a href="https://www.esri.com/">Esri</a>' },
  );
  state.basemapLayers.satellite = L.tileLayer(
    `${esriService}/World_Imagery/MapServer/tile/{z}/{y}/{x}`,
    { maxZoom: 18, attribution: 'Imagery &copy; <a href="https://www.esri.com/">Esri</a> and contributors' },
  );
  setBasemap("dark");
  state.pointRenderer = L.svg({ padding: 0.5 });
  state.pointLayer = L.layerGroup().addTo(state.map);
  document.querySelectorAll("[data-basemap]").forEach((button) => {
    button.addEventListener("click", () => setBasemap(button.dataset.basemap));
  });
  document.querySelector("#fit-map-button").addEventListener("click", fitFilteredData);
  requestAnimationFrame(() => state.map.invalidateSize());
  const mapResizeObserver = new ResizeObserver(() => state.map.invalidateSize({ pan: false }));
  mapResizeObserver.observe(document.querySelector("#map"));
  window.addEventListener("resize", () => state.map.invalidateSize());
}

function setBasemap(mode) {
  if (!state.map) return;
  const nextLayer = mode === "satellite" ? state.basemapLayers.satellite : state.basemapLayers.street;
  if (state.activeBasemap !== nextLayer) {
    if (state.activeBasemap) state.map.removeLayer(state.activeBasemap);
    nextLayer.addTo(state.map);
    state.activeBasemap = nextLayer;
  }
  document.querySelector("#map").classList.toggle("basemap-dark", mode === "dark");
  state.basemapMode = mode;
  const workspace = document.querySelector(".map-workspace");
  workspace.classList.remove("map-style-dark", "map-style-street", "map-style-satellite");
  workspace.classList.add(`map-style-${mode}`);
  if (state.pointLayer) {
    state.pointLayer.eachLayer((point) => point.setStyle(pointStyle(point.collisionRecord, mode)));
  }
  document.querySelectorAll("[data-basemap]").forEach((button) => {
    const active = button.dataset.basemap === mode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function fitFilteredData() {
  if (!state.map) return;
  const points = state.filtered.filter((record) => record.lat !== null && record.lon !== null);
  if (!points.length) {
    state.map.setView([47.6062, -122.3321], 11);
    return;
  }
  const bounds = L.latLngBounds(points.map((record) => [record.lat, record.lon]));
  state.map.fitBounds(bounds.pad(0.08), { padding: [24, 24], maxZoom: 14 });
}

function severityColor(severity) {
  if (severity.includes("Fatality") || severity.includes("Serious")) return "#ffb0b3";
  if (severity.includes("Injury")) return "#ffe4b3";
  if (severity.includes("Property")) return "#b2f1e8";
  return "#8da5a6";
}

function pointStyle(record, mode = state.basemapMode) {
  const serious = record.fatalities > 0 || record.seriousInjuries > 0;
  const severity = record.severity;
  let fillColor = severityColor(severity);
  if (mode === "street") {
    fillColor = severity.includes("Fatality") || severity.includes("Serious") ? "#d93656"
      : severity.includes("Injury") ? "#c56a0c"
        : severity.includes("Property") ? "#008a83" : "#586571";
  }
  return {
    renderer: state.pointRenderer,
    radius: serious ? 4.8 : 3.2,
    color: mode === "street" ? "#fffdf5" : "#10252b",
    weight: mode === "street" ? 1.15 : 0.9,
    opacity: 1,
    fillColor,
    fillOpacity: 0.96,
    bubblingMouseEvents: false,
  };
}

function severityShort(severity) {
  return severity
    .replace("Property Damage Only Collision", "Damage only")
    .replace("Serious Injury Collision", "Serious injury")
    .replace("Injury Collision", "Injury")
    .replace("Fatality Collision", "Fatality");
}

function filterRecords() {
  const filters = Object.fromEntries(Object.entries(controls).map(([key, select]) => [key, select.value]));
  state.filtered = state.records.filter((record) => {
    return (
      (filters.year === "all" || String(record.year) === filters.year) &&
      (filters.severity === "all" || record.severity === filters.severity) &&
      (filters.weather === "all" || record.weather === filters.weather) &&
      (filters.road === "all" || record.road === filters.road) &&
      (filters.type === "all" || record.type === filters.type)
    );
  });
  updateDashboard(filters);
}

function updateDashboard(filters) {
  updateSummary(filters);
  updateKpis();
  updateMap();
  renderMonthlyChart();
  renderSeverityChart();
  renderWeatherTable();
  renderHourChart();

  if (state.selectedId && !state.filtered.some((record) => record.id === state.selectedId)) {
    clearDetail();
  }
}

function updateSummary(filters) {
  const active = Object.entries(filters)
    .filter(([, value]) => value !== "all")
    .map(([key, value]) => `${key}: ${value}`);
  document.querySelector("#filter-summary").textContent = active.length
    ? active.join(" · ")
    : "Showing all records";
  document.querySelector("#record-summary").textContent = `${number.format(state.filtered.length)} records`;
}

function updateKpis() {
  const total = state.filtered.length;
  const injuries = state.filtered.reduce((sum, record) => sum + record.injuries, 0);
  const serious = state.filtered.reduce((sum, record) => sum + record.seriousInjuries, 0);
  const fatalities = state.filtered.reduce((sum, record) => sum + record.fatalities, 0);
  const injuryCollisions = state.filtered.filter((record) => record.injuries > 0).length;

  document.querySelector("#kpi-collisions").textContent = number.format(total);
  document.querySelector("#kpi-injuries").textContent = number.format(injuries);
  document.querySelector("#kpi-serious").textContent = number.format(serious);
  document.querySelector("#kpi-fatalities").textContent = number.format(fatalities);
  document.querySelector("#kpi-injury-rate").textContent = total
    ? `${percent.format(injuryCollisions / total)} of collisions involved injury`
    : "No records in selection";
  document.querySelector("#kpi-fatal-rate").textContent = total
    ? `${percent.format(fatalities / total)} fatalities per reported collision`
    : "No records in selection";
}

function sampledRecords(records, limit = 1600) {
  if (records.length <= limit) return records;
  const step = records.length / limit;
  return Array.from({ length: limit }, (_, index) => records[Math.floor(index * step)]);
}

function updateMapCount() {
  const geocoded = state.filtered.filter((record) => record.lat !== null && record.lon !== null);
  const displayedCount = Math.min(1600, geocoded.length);
  document.querySelector("#map-count").textContent = displayedCount === geocoded.length
      ? `${number.format(geocoded.length)} mapped records`
      : `Up to ${number.format(displayedCount)} of ${number.format(geocoded.length)} mapped records shown`;
}

function updateMap() {
  const geocoded = state.filtered.filter((record) => record.lat !== null && record.lon !== null);
  updateMapCount();
  if (!state.pointLayer) return;
  state.pointLayer.clearLayers();
  sampledRecords(geocoded).forEach((record) => {
    const point = L.circleMarker([record.lat, record.lon], pointStyle(record));
    point.collisionRecord = record;
    point
      .bindTooltip(`${escapeHtml(severityShort(record.severity))} — ${escapeHtml(record.location)}`)
      .on("click", () => showDetail(record))
      .addTo(state.pointLayer);
  });
}

function showDetail(record) {
  state.selectedId = record.id;
  document.querySelector("#detail-empty").classList.add("hidden");
  document.querySelector("#detail-content").classList.remove("hidden");
  document.querySelector("#detail-severity").textContent = severityShort(record.severity);
  document.querySelector("#detail-location").textContent = record.location;
  document.querySelector("#detail-date").textContent = record.date || "Unknown";
  document.querySelector("#detail-time").textContent = record.hour === null
    ? "Not recorded"
    : `${String(record.hour).padStart(2, "0")}:00`;
  document.querySelector("#detail-weather").textContent = record.weather;
  document.querySelector("#detail-road").textContent = record.road;
  document.querySelector("#detail-type").textContent = record.type;
  document.querySelector("#detail-injuries").textContent = `${record.injuries} injured · ${record.fatalities} fatalities`;
}

function clearDetail() {
  state.selectedId = null;
  document.querySelector("#detail-empty").classList.remove("hidden");
  document.querySelector("#detail-content").classList.add("hidden");
}

function renderMonthlyChart() {
  const counts = new Map();
  state.filtered.forEach((record) => {
    if (!record.year || !MONTHS.includes(record.month)) return;
    const monthIndex = MONTHS.indexOf(record.month) + 1;
    const key = `${record.year}-${String(monthIndex).padStart(2, "0")}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  const series = [...counts.entries()].sort(([a], [b]) => a.localeCompare(b));
  renderColumnChart(document.querySelector("#monthly-chart"), series, (key) => {
    const [year, month] = key.split("-");
    return `${MONTHS[Number(month) - 1].slice(0, 3)} ${year.slice(2)}`;
  });
}

function renderHourChart() {
  // Reports with no recorded time have hour = null; leave them out of this chart.
  const counts = Array.from({ length: 24 }, (_, hour) => [String(hour), 0]);
  let notRecorded = 0;
  state.filtered.forEach((record) => {
    if (record.hour === null) notRecorded += 1;
    else counts[record.hour][1] += 1;
  });
  document.querySelector("#hour-note").textContent = `Local hour · ${number.format(notRecorded)} without a recorded time left out`;
  renderColumnChart(document.querySelector("#hour-chart"), counts, (hour) => `${String(hour).padStart(2, "0")}:00`);
}

function renderColumnChart(container, series, labelFormatter) {
  if (!series.length) {
    container.innerHTML = '<div class="empty-state" style="min-height:220px">No data for this selection.</div>';
    return;
  }
  // Match SVG coordinates to its displayed size so labels stay readable in narrow panels.
  const { width: chartWidth, height: chartHeight } = container.getBoundingClientRect();
  const width = Math.max(280, Math.round(chartWidth));
  const height = Math.max(120, Math.round(chartHeight));
  const margin = { top: 12, right: 8, bottom: 27, left: 34 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const max = Math.max(...series.map(([, value]) => value), 1);
  const step = innerWidth / series.length;
  const barWidth = Math.max(2, Math.min(24, step * 0.62));
  const labelEvery = Math.max(1, Math.ceil(series.length / Math.max(4, Math.floor(innerWidth / 50))));
  const gridValues = [0, Math.ceil(max / 2), max];

  const grid = gridValues.map((value) => {
    const y = margin.top + innerHeight - (value / max) * innerHeight;
    return `<line class="grid-line" x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}" />
      <text class="axis-label" x="${margin.left - 8}" y="${y + 3}" text-anchor="end">${number.format(value)}</text>`;
  }).join("");

  const bars = series.map(([key, value], index) => {
    const x = margin.left + index * step + (step - barWidth) / 2;
    const barHeight = (value / max) * innerHeight;
    const y = margin.top + innerHeight - barHeight;
    const label = index % labelEvery === 0
      ? `<text class="axis-label" x="${x + barWidth / 2}" y="${height - 12}" text-anchor="middle">${escapeHtml(labelFormatter(key))}</text>`
      : "";
    return `<rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="3" fill="url(#barGradient)">
      <title>${escapeHtml(labelFormatter(key))}: ${number.format(value)}</title>
    </rect>${label}`;
  }).join("");

  container.innerHTML = `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="barGradient" x1="0" y1="1" x2="0" y2="0"><stop offset="0%" stop-color="#9fd5c9"/><stop offset="100%" stop-color="#f1f9e9"/></linearGradient></defs>${grid}${bars}</svg>`;
}

function renderSeverityChart() {
  const counts = groupCount(state.filtered, "severity");
  const sorted = [...counts.entries()].sort(([, a], [, b]) => b - a);
  const max = Math.max(...sorted.map(([, value]) => value), 1);
  const total = state.filtered.length || 1;
  document.querySelector("#severity-chart").innerHTML = sorted.length
    ? sorted.map(([label, value]) => `
      <div class="bar-row">
        <span class="bar-label">${escapeHtml(severityShort(label))}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${(value / max) * 100}%;background:${severityColor(label)}"></div></div>
        <span class="bar-value">${percent.format(value / total)}</span>
      </div>`).join("")
    : '<div class="empty-state" style="min-height:220px">No data for this selection.</div>';
}

function renderWeatherTable() {
  const grouped = new Map();
  state.filtered.forEach((record) => {
    if (!grouped.has(record.weather)) grouped.set(record.weather, { count: 0, injuryCollisions: 0 });
    const item = grouped.get(record.weather);
    item.count += 1;
    if (record.injuries > 0) item.injuryCollisions += 1;
  });
  const rows = [...grouped.entries()]
    .sort(([, a], [, b]) => b.count - a.count)
    .slice(0, 7);
  document.querySelector("#weather-chart").innerHTML = rows.length
    ? `<div class="comparison-head"><span>Weather</span><span>Collisions</span><span>Injury share</span></div>${rows.map(([label, values]) => `
      <div class="comparison-row">
        <strong>${escapeHtml(label)}</strong>
        <span>${number.format(values.count)}</span>
        <strong>${percent.format(values.injuryCollisions / values.count)}</strong>
      </div>`).join("")}`
    : '<div class="empty-state" style="min-height:220px">No data for this selection.</div>';
}

function groupCount(records, key) {
  const result = new Map();
  records.forEach((record) => result.set(record[key], (result.get(record[key]) || 0) + 1));
  return result;
}

// ---------------------------------------------------------------------------
// Prediction Lab: logistic regression trained in prepare_dashboard_data.py.
// probability = 1 / (1 + exp(-(intercept + sum of the chosen categories' coefficients)))
// ---------------------------------------------------------------------------
const TIME_LABELS = {
  "Late night": "Late night · 00–05",
  Morning: "Morning · 06–11",
  Afternoon: "Afternoon · 12–17",
  Evening: "Evening · 18–23",
};

function logistic(value) {
  return 1 / (1 + Math.exp(-value));
}

// "Any" = the average coefficient of that input, weighted by how common each category is.
function averageCoef(feature) {
  return feature.levels.reduce((sum, level) => sum + level.coef * level.share, 0);
}

function chosenCoef(key, value) {
  const feature = model.data.features[key];
  if (value === "all") return averageCoef(feature);
  return feature.levels.find((level) => level.value === value).coef;
}

function averageLogit() {
  return Object.keys(model.data.features)
    .reduce((sum, key) => sum + chosenCoef(key, "all"), model.data.intercept);
}

function oddsText(ratio) {
  return `×${ratio >= 10 ? ratio.toFixed(0) : ratio.toFixed(2)}`;
}

function renderPrediction() {
  const choices = Object.entries(predictionControls).map(([key, select]) => ({ key, value: select.value }));
  const logit = choices.reduce((sum, item) => sum + chosenCoef(item.key, item.value), model.data.intercept);
  const estimate = logistic(logit);
  const average = logistic(averageLogit());

  document.querySelector("#risk-value").textContent = percent.format(estimate);
  document.querySelector("#base-risk").textContent = percent.format(model.data.overallRate);
  document.querySelector("#support-count").textContent = model.data.metrics.auc.toFixed(2);
  document.querySelector("#risk-gauge").style.setProperty("--risk-angle", `${Math.max(2, estimate * 360)}deg`);

  const band = document.querySelector("#risk-band");
  band.classList.remove("elevated", "lower");
  if (estimate >= average + 0.05) {
    band.textContent = "Above average";
    band.classList.add("elevated");
  } else if (estimate <= average - 0.05) {
    band.textContent = "Below average";
    band.classList.add("lower");
  } else {
    band.textContent = "Near average";
  }

  const selected = choices.filter((item) => item.value !== "all");
  document.querySelector("#driver-table").innerHTML = selected.length
    ? `<div class="driver-head"><span>Input</span><span>Odds</span><span>Effect</span><span>Share of data</span></div>${selected.map((item) => {
      const feature = model.data.features[item.key];
      const level = feature.levels.find((l) => l.value === item.value);
      const ratio = Math.exp(level.coef - averageCoef(feature));
      const label = item.key === "time" ? TIME_LABELS[item.value] || item.value : item.value;
      return `<div class="driver-row"><strong>${escapeHtml(feature.label)}: ${escapeHtml(label)}</strong><span>${oddsText(ratio)}</span><span class="${ratio >= 1 ? "positive" : "negative"}">${ratio >= 1 ? "raises" : "lowers"}</span><span>${percent.format(level.share)}</span></div>`;
    }).join("")}`
    : `<div class="driver-empty">Average collision: ${percent.format(average)} chance of injury.<br />Choose inputs to see how each one changes the odds.</div>`;
}

function renderModelEffects() {
  // Every named category (not "Unknown"/"Other"), ranked by how far it moves the odds.
  const effects = [];
  Object.values(model.data.features).forEach((feature) => {
    const mean = averageCoef(feature);
    feature.levels
      .filter((level) => level.value !== "Unknown" && level.value !== "Other" && level.share >= 0.005)
      .forEach((level) => effects.push({ label: `${feature.label}: ${level.value}`, logOdds: level.coef - mean }));
  });
  effects.sort((a, b) => Math.abs(b.logOdds) - Math.abs(a.logOdds));
  const top = effects.slice(0, 8);
  const maxAbs = Math.max(...top.map((item) => Math.abs(item.logOdds)));
  document.querySelector("#signal-chart").innerHTML = top.map((item) => {
    const width = Math.round((Math.abs(item.logOdds) / maxAbs) * 100);
    const color = item.logOdds > 0 ? "var(--red)" : "var(--cyan)";
    return `<div class="signal-row"><span>${escapeHtml(item.label)}</span><div class="signal-track"><div class="signal-fill" style="width:${width}%;background:${color}"></div></div><strong>${oddsText(Math.exp(item.logOdds))}</strong></div>`;
  }).join("");
}

function renderModelMetrics() {
  const m = model.data.metrics;
  document.querySelector("#eval-period").textContent = `Test: ${m.testPeriod}`;
  document.querySelector("#metric-auc").textContent = m.auc.toFixed(2);
  document.querySelector("#metric-accuracy").textContent = percent.format(m.accuracy);
  document.querySelector("#metric-baseline").textContent = `Always "no injury": ${percent.format(m.baselineAccuracy)}`;
  document.querySelector("#metric-recall").textContent = `${m.recall.toFixed(2)} / ${m.f1.toFixed(2)}`;
  document.querySelector("#metric-calibration").textContent = `${percent.format(m.meanPredicted)} vs ${percent.format(m.observedRate)}`;
}

function initPredictionLab() {
  Object.entries(predictionControls).forEach(([key, select]) => {
    let values = model.data.features[key].levels.map((level) => level.value);
    if (key === "time") values = Object.keys(TIME_LABELS).filter((value) => values.includes(value));
    values.forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = key === "time" ? TIME_LABELS[value] : value;
      select.append(option);
    });
    select.addEventListener("change", renderPrediction);
  });
  renderModelEffects();
  renderModelMetrics();
  renderPrediction();
}

// ---------------------------------------------------------------------------
// Question C: results exported from visualization/question_c.py and question_c_part2.py
// ---------------------------------------------------------------------------
function statCard(label, value, note) {
  return `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(note)}</small></div>`;
}

function pText(p) {
  return p < 0.001 ? "p < 0.001" : `p = ${p.toFixed(p < 0.01 ? 3 : 2)}`;
}

// Same rule as the laptop block in dashboard.css: shorter charts so the tab fits on one screen.
const laptopScreen = window.matchMedia("(min-width: 1280px) and (min-height: 640px) and (max-height: 899px)");

function chartSize(container) {
  const width = Math.max(320, Math.round(container.getBoundingClientRect().width));
  const height = laptopScreen.matches ? Math.max(180, window.innerHeight - 470) : 300;
  return { width, height };
}

function renderQuestionCPart1() {
  const rows = questionC.data.part1;
  const container = document.querySelector("#qc-part1-chart");
  const { width, height } = chartSize(container);
  const margin = { top: 22, right: 12, bottom: 48, left: 44 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;
  const bands = ["Lower", "Middle", "Higher"];
  const colors = { Dry: "#9fd5c9", Wet: "#ffc670" };
  const maxY = Math.max(...rows.map((r) => r.ci_high)) * 1.15;
  const y = (v) => margin.top + innerH - (v / maxY) * innerH;
  const groupW = innerW / bands.length;
  const barW = Math.min(46, groupW * 0.3);

  let svg = [0, 0.2, 0.4, 0.6, 0.8].filter((v) => v <= maxY).map((v) =>
    `<line class="grid-line" x1="${margin.left}" x2="${width - margin.right}" y1="${y(v)}" y2="${y(v)}" /><text x="${margin.left - 8}" y="${y(v) + 3}" text-anchor="end">${v.toFixed(1)}</text>`).join("");
  bands.forEach((band, i) => {
    const center = margin.left + groupW * (i + 0.5);
    ["Dry", "Wet"].forEach((weather, j) => {
      const r = rows.find((row) => row.traffic_band === band && row.weather === weather);
      const x = center + (j === 0 ? -barW - 3 : 3);
      svg += `<rect x="${x}" y="${y(r.adjusted_collisions_per_hour)}" width="${barW}" height="${y(0) - y(r.adjusted_collisions_per_hour)}" rx="3" fill="${colors[weather]}"><title>${weather}, ${band} traffic: ${r.adjusted_collisions_per_hour.toFixed(2)} per hour (${number.format(r.observed_hours)} hours)</title></rect>`;
      svg += `<line x1="${x + barW / 2}" x2="${x + barW / 2}" y1="${y(r.ci_low)}" y2="${y(r.ci_high)}" stroke="#fbfdfb" stroke-width="1.2" />`;
      svg += `<text class="value-label" x="${x + barW / 2}" y="${y(r.ci_high) - 5}" text-anchor="middle">${r.adjusted_collisions_per_hour.toFixed(2)}</text>`;
    });
    svg += `<text x="${center}" y="${height - 28}" text-anchor="middle">${band} traffic</text>`;
  });
  svg += `<text x="${margin.left}" y="12">Collisions per hour (citywide)</text>`;
  container.innerHTML = `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" style="height:${height}px">${svg}</svg>
    <div class="qc-legend"><span><i style="background:${colors.Dry}"></i>Dry hour</span><span><i style="background:${colors.Wet}"></i>Rain in the hour</span></div>`;

  const glm = questionC.data.glm;
  document.querySelector("#qc-hours").textContent = number.format(questionC.data.hours);
  const traffic10 = (Math.exp(glm.traffic_centered.coef * 0.1) - 1) * 100;
  const wetHours = rows.filter((r) => r.weather === "Wet").reduce((sum, r) => sum + r.observed_hours, 0);
  document.querySelector("#qc-part1-stats").innerHTML = [
    statCard("Rain", `+${glm.wet.pctChange.toFixed(0)}%`, `more collisions per hour · ${pText(glm.wet.p)}`),
    statCard("Traffic +10%", `+${traffic10.toFixed(1)}%`, `collisions · ${pText(glm.traffic_centered.p)}`),
    statCard("Rain × traffic", "No evidence", `rain is not worse in heavy traffic · ${pText(glm["wet:traffic_centered"].p)}`),
    statCard("Wet hours", number.format(wetHours), "hours with rain in the sample"),
  ].join("");
}

function renderQuestionCPart2() {
  const rows = questionC.data.part2;
  const container = document.querySelector("#qc-part2-chart");
  const { width, height } = chartSize(container);
  const margin = { top: 22, right: 16, bottom: 48, left: 44 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;
  const hours = rows.map((r) => r.hours_from_collision);
  const minY = Math.min(...rows.map((r) => Math.min(r.event_ci_low, r.ordinary_p25))) - 0.02;
  const maxY = Math.max(...rows.map((r) => Math.max(r.event_ci_high, r.ordinary_p75))) + 0.02;
  const x = (h) => margin.left + ((h - hours[0]) / (hours[hours.length - 1] - hours[0])) * innerW;
  const y = (v) => margin.top + innerH - ((v - minY) / (maxY - minY)) * innerH;
  const area = (low, high) => rows.map((r) => `${x(r.hours_from_collision)},${y(r[high])}`).join(" ") + " " +
    [...rows].reverse().map((r) => `${x(r.hours_from_collision)},${y(r[low])}`).join(" ");

  let svg = [0.9, 1.0, 1.1].filter((v) => v > minY && v < maxY).map((v) =>
    `<line class="grid-line" x1="${margin.left}" x2="${width - margin.right}" y1="${y(v)}" y2="${y(v)}" /><text x="${margin.left - 8}" y="${y(v) + 3}" text-anchor="end">${v.toFixed(1)}</text>`).join("");
  svg += `<polygon points="${area("ordinary_p25", "ordinary_p75")}" fill="rgba(210,232,228,.12)" />`;
  svg += `<polygon points="${area("event_ci_low", "event_ci_high")}" fill="rgba(255,198,112,.22)" />`;
  svg += `<line x1="${margin.left}" x2="${width - margin.right}" y1="${y(1)}" y2="${y(1)}" stroke="#d5e2df" stroke-dasharray="4 4" />`;
  svg += `<line x1="${x(0)}" x2="${x(0)}" y1="${margin.top}" y2="${margin.top + innerH}" stroke="#ffb0b3" stroke-dasharray="3 3" />`;
  svg += `<text x="${x(0) + 4}" y="${margin.top + 10}" fill="#ffb0b3">collision</text>`;
  svg += `<polyline points="${rows.map((r) => `${x(r.hours_from_collision)},${y(r.event_median_ratio)}`).join(" ")}" fill="none" stroke="#ffc670" stroke-width="2.2" />`;
  rows.forEach((r) => {
    svg += `<circle cx="${x(r.hours_from_collision)}" cy="${y(r.event_median_ratio)}" r="3.5" fill="#ffc670"><title>${r.hours_from_collision >= 0 ? "+" : ""}${r.hours_from_collision} h: median ${r.event_median_ratio.toFixed(3)} (${r.events} collisions)</title></circle>`;
    svg += `<text x="${x(r.hours_from_collision)}" y="${height - 28}" text-anchor="middle">${r.hours_from_collision > 0 ? "+" : ""}${r.hours_from_collision} h</text>`;
  });
  svg += `<text x="${margin.left}" y="12">Traffic ÷ normal (1.0 = usual)</text>`;
  container.innerHTML = `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" style="height:${height}px">${svg}</svg>
    <div class="qc-legend"><span><i style="background:#ffc670"></i>Hours around a collision (median, 95% CI)</span><span><i style="background:rgba(210,232,228,.3)"></i>Ordinary hours (middle 50%)</span></div>`;

  const s = questionC.data.part2Summary;
  const plus1 = rows.find((r) => r.hours_from_collision === 1);
  document.querySelector("#qc-part2-stats").innerHTML = [
    statCard("Collisions studied", number.format(s.events), "with traffic counts before and after"),
    statCard("1 hour after", `${((plus1.event_median_ratio - 1) * 100).toFixed(1)}%`, "median traffic vs normal"),
    statCard("Lower after", percent.format(s.shareLowerAfter), "of collisions (ordinary hours: about 50%)"),
    statCard("Sign test", pText(s.signTestP), "the drop is unlikely to be chance"),
  ].join("");
}

function renderQuestionC() {
  if (!questionC.data || document.querySelector("#questionc-view").hidden) return;
  renderQuestionCPart1();
  renderQuestionCPart2();
}

function resetFilters() {
  Object.values(controls).forEach((select) => { select.value = "all"; });
  clearDetail();
  filterRecords();
}

async function init() {
  try {
    let payload = window.COLLISION_DATA;
    if (!payload) {
      const response = await fetch("data/collisions.json?v=2");
      if (!response.ok) throw new Error(`Data request failed: ${response.status}`);
      payload = await response.json();
    }
    state.records = payload.records;
    model.data = payload.injuryModel;
    questionC.data = payload.questionC;
    state.filtered = payload.records;

    document.querySelector("#date-range").textContent = `${payload.meta.dateMin} — ${payload.meta.dateMax} · ${number.format(payload.meta.recordCount)} cleaned records`;
    populateSelect(controls.year, uniqueValues("year"));
    populateSelect(controls.severity, uniqueValues("severity"));
    populateSelect(controls.weather, uniqueValues("weather"));
    populateSelect(controls.road, uniqueValues("road"));
    populateSelect(controls.type, uniqueValues("type"));
    initPredictionLab();

    initMap();
    Object.values(controls).forEach((select) => select.addEventListener("change", filterRecords));
    document.querySelector("#reset-filters").addEventListener("click", resetFilters);
    filterRecords();
    const chartResizeObserver = new ResizeObserver(() => {
      renderMonthlyChart();
      renderHourChart();
    });
    chartResizeObserver.observe(document.querySelector("#monthly-chart"));
    chartResizeObserver.observe(document.querySelector("#hour-chart"));
    window.addEventListener("resize", renderQuestionC);
  } catch (error) {
    console.error(error);
    document.querySelector("#date-range").textContent = "Dashboard unavailable — reload to try again.";
  }
}

initViewTabs();
init();
