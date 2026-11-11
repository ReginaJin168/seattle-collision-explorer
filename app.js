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
};

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
  document.querySelector("#detail-time").textContent = `${String(record.hour).padStart(2, "0")}:00`;
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
  const counts = Array.from({ length: 24 }, (_, hour) => [String(hour), 0]);
  state.filtered.forEach((record) => {
    if (record.hour >= 0 && record.hour <= 23) counts[record.hour][1] += 1;
  });
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

function timeBucket(hour) {
  if (hour <= 5) return "Late night";
  if (hour <= 11) return "Morning";
  if (hour <= 17) return "Afternoon";
  return "Evening";
}

function featureValue(record, key) {
  return key === "time" ? timeBucket(record.hour) : record[key];
}

function overallInjuryRate() {
  return state.records.length
    ? state.records.filter((record) => record.injuries > 0).length / state.records.length
    : 0;
}

function smoothedGroupRate(key, value, baseRate) {
  const rows = state.records.filter((record) => featureValue(record, key) === value);
  const injured = rows.filter((record) => record.injuries > 0).length;
  const priorStrength = 40;
  return {
    count: rows.length,
    rate: (injured + priorStrength * baseRate) / (rows.length + priorStrength),
  };
}

function logit(value) {
  const bounded = Math.min(0.999, Math.max(0.001, value));
  return Math.log(bounded / (1 - bounded));
}

function logistic(value) {
  return 1 / (1 + Math.exp(-value));
}

function renderPrediction() {
  if (!state.records.length) return;
  const baseRate = overallInjuryRate();
  const labels = { time: "Time period", weather: "Weather", road: "Road", type: "Collision type" };
  const selected = Object.entries(predictionControls)
    .map(([key, select]) => ({ key, value: select.value }))
    .filter((item) => item.value !== "all")
    .map((item) => ({ ...item, ...smoothedGroupRate(item.key, item.value, baseRate) }));

  const averageLift = selected.length
    ? selected.reduce((sum, item) => sum + (logit(item.rate) - logit(baseRate)), 0) / selected.length
    : 0;
  const estimate = logistic(logit(baseRate) + averageLift);
  const support = selected.length ? Math.min(...selected.map((item) => item.count)) : state.records.length;

  document.querySelector("#risk-value").textContent = percent.format(estimate);
  document.querySelector("#base-risk").textContent = percent.format(baseRate);
  document.querySelector("#support-count").textContent = `${number.format(support)} records`;
  document.querySelector("#risk-gauge").style.setProperty("--risk-angle", `${Math.max(2, estimate * 360)}deg`);

  const band = document.querySelector("#risk-band");
  band.classList.remove("elevated", "lower");
  if (estimate >= baseRate + 0.04) {
    band.textContent = "Above baseline";
    band.classList.add("elevated");
  } else if (estimate <= baseRate - 0.04) {
    band.textContent = "Below baseline";
    band.classList.add("lower");
  } else {
    band.textContent = "Near baseline";
  }

  const driverTable = document.querySelector("#driver-table");
  driverTable.innerHTML = selected.length
    ? `<div class="driver-head"><span>Factor</span><span>Rate</span><span>Lift</span><span>Support</span></div>${selected.map((item) => {
      const lift = item.rate - baseRate;
      const liftText = `${lift >= 0 ? "+" : ""}${(lift * 100).toFixed(1)} pp`;
      return `<div class="driver-row"><strong>${escapeHtml(labels[item.key])}: ${escapeHtml(item.value)}</strong><span>${percent.format(item.rate)}</span><span class="${lift >= 0 ? "positive" : "negative"}">${liftText}</span><span>${number.format(item.count)}</span></div>`;
    }).join("")}`
    : '<div class="driver-empty">Choose one or more scenario inputs to compare their historical injury rates with the overall baseline.</div>';
}

function renderFeatureSignals() {
  const baseRate = overallInjuryRate();
  const features = [
    ["type", "Collision type"],
    ["time", "Time period"],
    ["weather", "Weather"],
    ["road", "Road condition"],
    ["season", "Season"],
  ].map(([key, label]) => {
    const groups = new Map();
    state.records.forEach((record) => {
      const value = featureValue(record, key);
      if (!groups.has(value)) groups.set(value, { count: 0, injured: 0 });
      const group = groups.get(value);
      group.count += 1;
      if (record.injuries > 0) group.injured += 1;
    });
    const signal = [...groups.values()].reduce((sum, group) => {
      const rate = group.injured / group.count;
      return sum + group.count * Math.abs(rate - baseRate);
    }, 0) / state.records.length;
    return { key, label, signal };
  });
  const maxSignal = Math.max(...features.map((item) => item.signal), 0.001);
  document.querySelector("#signal-chart").innerHTML = features
    .sort((a, b) => b.signal - a.signal)
    .map((item) => {
      const index = Math.round((item.signal / maxSignal) * 100);
      return `<div class="signal-row"><span>${escapeHtml(item.label)}</span><div class="signal-track"><div class="signal-fill" style="width:${index}%"></div></div><strong>${index}</strong></div>`;
    }).join("");
}

function initPredictionLab() {
  populateSelect(predictionControls.weather, uniqueValues("weather"));
  populateSelect(predictionControls.road, uniqueValues("road"));
  populateSelect(predictionControls.type, uniqueValues("type"));
  Object.values(predictionControls).forEach((select) => select.addEventListener("change", renderPrediction));
  renderFeatureSignals();
  renderPrediction();
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
    state.filtered = payload.records;

    document.querySelector("#date-range").textContent = `${payload.meta.dateMin} — ${payload.meta.dateMax} · ${number.format(payload.meta.recordCount)} records`;
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
  } catch (error) {
    console.error(error);
    document.querySelector("#date-range").textContent = "Dashboard unavailable — reload to try again.";
  }
}

initViewTabs();
init();
