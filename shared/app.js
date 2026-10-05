(function () {
  "use strict";

  const STORAGE_KEY = "wastewater-watch-settings-v2";
  const LEGACY_STORAGE_KEY = "wastewater-watch-settings-v1";
  const LIVE_DATA_KEY = "wastewater-watch-live-data-v1";
  const DATA_PATH = (document.currentScript && document.currentScript.dataset.dataPath) || "../data/wastewater.json";
  const CDC_ENDPOINT = "https://data.cdc.gov/resource/atcp-73re.json";
  const THEMES = [
    { id: "signal", label: "Signal", description: "Dark and calm." },
    { id: "daylight", label: "Daylight", description: "Light and crisp." },
    { id: "waterline", label: "Waterline", description: "Soft and warm." },
    { id: "contrast", label: "Contrast", description: "High contrast." },
  ];
  const BAY_COUNTIES = [
    "Alameda",
    "Contra Costa",
    "Marin",
    "Napa",
    "San Francisco",
    "San Mateo",
    "Santa Clara",
    "Solano",
    "Sonoma",
  ];
  const AREAS = [
    {
      id: "oakland-2571",
      label: "Oakland / Alameda site 2571",
      short: "Oakland",
      sites: ["ID:2571"],
      note: "WastewaterSCAN site ID:2571. CDC labels it Alameda County; Alameda County describes Oakland west/east sub-sewersheds.",
    },
    {
      id: "east-bay",
      label: "East Bay",
      short: "East Bay",
      counties: ["Alameda", "Contra Costa"],
      note: "Alameda and Contra Costa sites.",
    },
    {
      id: "alameda",
      label: "Alameda County",
      short: "Alameda",
      counties: ["Alameda"],
      note: "Includes participating Alameda County sewersheds in CDC NWSS.",
    },
    {
      id: "bay-area",
      label: "Bay Area",
      short: "Bay Area",
      counties: BAY_COUNTIES,
      note: "Nine-county Bay Area approximation.",
    },
    {
      id: "california",
      label: "California",
      short: "California",
      counties: null,
      note: "All California sites in the local data file.",
    },
  ];

  const PATHOGENS = {
    "SARS-CoV-2": {
      label: "COVID",
      long: "SARS-CoV-2",
      color: "#e85d4f",
      soft: "rgba(232, 93, 79, 0.14)",
    },
    "Influenza A virus": {
      label: "Flu A",
      long: "Influenza A",
      color: "#2d8f75",
      soft: "rgba(45, 143, 117, 0.14)",
    },
    RSV: {
      label: "RSV",
      long: "Respiratory syncytial virus",
      color: "#346fbd",
      soft: "rgba(52, 111, 189, 0.14)",
    },
  };

  const RANGES = [
    { id: "8w", label: "8 weeks", days: 56 },
    { id: "3m", label: "3 months", days: 92 },
    { id: "6m", label: "6 months", days: 183 },
    { id: "1y", label: "1 year", days: 366 },
  ];

  const CATEGORY_RANK = {
    "Very Low": 1,
    Low: 2,
    Moderate: 3,
    High: 4,
    "Very High": 5,
  };

  const DEFAULT_SETTINGS = {
    area: "oakland-2571",
    range: "6m",
    pathogens: ["SARS-CoV-2", "Influenza A virus", "RSV"],
    showSites: true,
    showSources: true,
    compact: false,
    reduceMotion: false,
    theme: "signal",
    cacheDays: "3",
  };

  const state = {
    bundled: null,
    data: null,
    settings: loadSettings(),
    activePoint: null,
    showChartDetail: false,
  };

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    document.body.classList.toggle("is-compact", state.settings.compact);
    document.body.classList.toggle("reduce-motion", state.settings.reduceMotion);
    document.body.dataset.theme = state.settings.theme || "signal";
    bindStaticEvents();
    renderShell();
    setStatus("Checking browser cache...");
    const cached = loadLiveData();
    if (isCacheFresh(cached)) {
      state.data = cached;
      render();
      setStatus(`Using cached CDC data. ${dataFreshnessText()}`);
      fetchBundledFallback();
      return;
    }
    try {
      setStatus("Fetching real CDC data in this browser...");
      state.data = await fetchCdcData();
      saveLiveData(state.data);
      render();
      setStatus(`Fetched real CDC data. ${dataFreshnessText()}`);
      fetchBundledFallback();
    } catch (error) {
      console.error(error);
      if (cached) {
        state.data = cached;
        render();
        setStatus(`Live refresh failed, using older cached CDC data. ${dataFreshnessText()}`, true);
        fetchBundledFallback();
      } else {
        await fetchBundledFallback(true);
      }
    }
  }

  function bindStaticEvents() {
    document.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const settingsButton = target.closest("[data-open-settings]");
      if (settingsButton) openSettings();

      const closeButton = target.closest("[data-close-settings]");
      if (closeButton) closeSettings();

      const backdrop = target.closest("[data-settings-backdrop]");
      if (backdrop) closeSettings();

      const refresh = target.closest("[data-refresh-now]");
      if (refresh) refreshFromApi();

      const clearLive = target.closest("[data-clear-live]");
      if (clearLive) {
        localStorage.removeItem(LIVE_DATA_KEY);
        state.data = state.bundled || state.data;
        render();
        setStatus("Back to the bundled CDC data file.");
      }

      const rangeButton = target.closest("[data-range]");
      if (rangeButton) {
        state.settings.range = rangeButton.getAttribute("data-range") || state.settings.range;
        saveSettings();
        render();
      }

      const pathogenButton = target.closest("[data-pathogen]");
      if (pathogenButton) {
        const pathogen = pathogenButton.getAttribute("data-pathogen");
        if (pathogen) togglePathogen(pathogen);
      }

      const themeButton = target.closest("[data-theme-option]");
      if (themeButton) {
        state.settings.theme = themeButton.getAttribute("data-theme-option") || "signal";
        document.body.dataset.theme = state.settings.theme;
        saveSettings();
        renderSettingsValues();
      }

      const point = target.closest("[data-point-index]");
      if (point) {
        state.activePoint = Number(point.getAttribute("data-point-index"));
        state.showChartDetail = true;
        renderChartTooltip();
      }
    });

    document.addEventListener("input", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;

      if (target.matches("[data-area-select]")) {
        state.settings.area = target.value;
        saveSettings();
        render();
      }

      if (target.matches("[data-setting]")) {
        const key = target.getAttribute("data-setting");
        if (!key) return;
        state.settings[key] = target.type === "checkbox" ? target.checked : target.value;
        saveSettings();
        document.body.classList.toggle("is-compact", state.settings.compact);
        document.body.classList.toggle("reduce-motion", state.settings.reduceMotion);
        document.body.dataset.theme = state.settings.theme || "signal";
        render();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeSettings();
    });
  }

  function renderShell() {
    const areaSelect = document.querySelector("[data-area-select]");
    if (areaSelect) {
      areaSelect.innerHTML = AREAS.map((area) => `<option value="${area.id}">${escapeHtml(area.label)}</option>`).join("");
      areaSelect.value = selectedArea().id;
    }

    const rangeWrap = document.querySelector("[data-range-controls]");
    if (rangeWrap) {
      rangeWrap.innerHTML = RANGES.map((range) => (
        `<button type="button" data-range="${range.id}">${escapeHtml(range.label)}</button>`
      )).join("");
    }

    const pathogenWrap = document.querySelector("[data-pathogen-controls]");
    if (pathogenWrap) {
      pathogenWrap.innerHTML = Object.entries(PATHOGENS).map(([id, info]) => (
        `<button type="button" data-pathogen="${escapeAttr(id)}"><span style="--dot:${info.color}"></span>${escapeHtml(info.label)}</button>`
      )).join("");
    }

    const settings = document.querySelector("[data-settings-fields]");
    if (settings) {
      settings.innerHTML = `
        <div class="theme-setting">
          <span>Color scheme</span>
          <div class="theme-options">
            ${THEMES.map((theme) => `
              <button type="button" class="theme-option theme-${theme.id}" data-theme-option="${theme.id}">
                <strong>${escapeHtml(theme.label)}</strong>
                <em>${escapeHtml(theme.description)}</em>
              </button>
            `).join("")}
          </div>
        </div>
        <label class="toggle-row"><span>Show site table</span><input type="checkbox" data-setting="showSites"></label>
        <label class="toggle-row"><span>Show source notes</span><input type="checkbox" data-setting="showSources"></label>
        <label class="toggle-row"><span>Compact view</span><input type="checkbox" data-setting="compact"></label>
        <label class="toggle-row"><span>Reduce motion</span><input type="checkbox" data-setting="reduceMotion"></label>
        <label class="stacked-setting"><span>Browser cache</span><select data-setting="cacheDays"><option value="1">Refresh if older than 1 day</option><option value="3">Refresh if older than 3 days</option><option value="7">Refresh if older than 7 days</option></select></label>
      `;
    }
  }

  function render() {
    if (!state.data) return;

    const area = selectedArea();
    const rows = filteredRowsByArea(area);
    const range = selectedRange();
    const rangedRows = filterRowsByRange(rows, range.days);
    const aggregate = aggregateRows(rangedRows);
    const latest = latestByPathogen(rows);

    updateControls();
    fillText("[data-area-name]", area.label);
    fillText("[data-area-note]", area.note);
    fillText("[data-updated]", dataFreshnessText());
    fillText("[data-source-line]", sourceLine());
    renderCards(latest, aggregate);
    renderChart(aggregate);
    renderSitesTable(rows);
    renderSourceNotes();
    renderSettingsValues();
  }

  function updateControls() {
    const areaSelect = document.querySelector("[data-area-select]");
    if (areaSelect) areaSelect.value = selectedArea().id;

    document.querySelectorAll("[data-range]").forEach((button) => {
      button.classList.toggle("is-active", button.getAttribute("data-range") === state.settings.range);
    });
    document.querySelectorAll("[data-pathogen]").forEach((button) => {
      const pathogen = button.getAttribute("data-pathogen");
      button.classList.toggle("is-active", Boolean(pathogen && state.settings.pathogens.includes(pathogen)));
    });
  }

  function renderCards(latest, aggregate) {
    const wrap = document.querySelector("[data-cards]");
    if (!wrap) return;
    wrap.innerHTML = Object.entries(PATHOGENS).filter(([pathogen]) => (
      state.settings.pathogens.includes(pathogen)
    )).map(([pathogen, info]) => {
      const point = latest.get(pathogen);
      const trend = trendFor(pathogen, aggregate);
      if (!point) {
        return `<article class="status-card is-empty"><p>${escapeHtml(info.label)}</p><strong>No data</strong><span>No matching sites in this view.</span></article>`;
      }
      return `
        <article class="status-card" style="--accent:${info.color}; --soft:${info.soft}">
          <p>${escapeHtml(info.label)}</p>
          <strong>${escapeHtml(point.category)}</strong>
          <span>${formatNumber(point.wval)} WVAL</span>
          <em class="${trend.className}">${escapeHtml(trend.text)}</em>
        </article>
      `;
    }).join("");
  }

  function renderChart(aggregate) {
    const wrap = document.querySelector("[data-chart]");
    const detail = document.querySelector("[data-chart-detail]");
    if (!wrap) return;
    if (detail) detail.hidden = true;
    state.showChartDetail = false;

    const series = Array.from(aggregate.entries())
      .filter(([pathogen]) => state.settings.pathogens.includes(pathogen))
      .map(([pathogen, points]) => ({ pathogen, points }));

    if (!series.length || series.every((item) => item.points.length === 0)) {
      wrap.innerHTML = `<div class="empty-state">No chart data for this selection.</div>`;
      return;
    }

    const allPoints = series.flatMap((item) => item.points.map((point) => ({ ...point, pathogen: item.pathogen })));
    const dates = allPoints.map((point) => new Date(point.weekEnd).getTime());
    const minDate = Math.min(...dates);
    const maxDate = Math.max(...dates);
    const maxValue = Math.max(12, Math.ceil(Math.max(...allPoints.map((point) => point.value)) + 1));
    const width = 880;
    const height = 360;
    const pad = { top: 18, right: 28, bottom: 48, left: 48 };
    const innerW = width - pad.left - pad.right;
    const innerH = height - pad.top - pad.bottom;
    const pointsForTooltip = [];

    const x = (time) => pad.left + ((time - minDate) / Math.max(1, maxDate - minDate)) * innerW;
    const y = (value) => pad.top + innerH - (value / maxValue) * innerH;
    const grid = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
      const value = maxValue * ratio;
      const yy = y(value);
      return `<line class="grid-line" x1="${pad.left}" y1="${yy}" x2="${width - pad.right}" y2="${yy}"></line><text class="axis-label" x="8" y="${yy + 4}">${formatNumber(value)}</text>`;
    }).join("");

    const lines = series.map(({ pathogen, points }) => {
      const info = PATHOGENS[pathogen];
      const sorted = points.slice().sort((a, b) => a.weekEnd.localeCompare(b.weekEnd));
      const path = sorted.map((point, index) => {
        const xx = x(new Date(point.weekEnd).getTime());
        const yy = y(point.value);
        pointsForTooltip.push({ ...point, pathogen, x: xx, y: yy });
        return `${index === 0 ? "M" : "L"} ${xx.toFixed(1)} ${yy.toFixed(1)}`;
      }).join(" ");
      const circles = sorted.map((point) => {
        const xx = x(new Date(point.weekEnd).getTime());
        const yy = y(point.value);
        const index = pointsForTooltip.findIndex((item) => item.pathogen === pathogen && item.weekEnd === point.weekEnd);
        return `<circle data-point-index="${index}" class="chart-point" cx="${xx.toFixed(1)}" cy="${yy.toFixed(1)}" r="4.2"></circle>`;
      }).join("");
      return `<g style="--line:${info.color}"><path class="series-line" d="${path}"></path>${circles}</g>`;
    }).join("");

    wrap.dataset.points = JSON.stringify(pointsForTooltip);
    wrap.innerHTML = `
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Wastewater viral activity chart">
        <rect class="plot-bg" x="${pad.left}" y="${pad.top}" width="${innerW}" height="${innerH}"></rect>
        ${grid}
        ${lines}
        <line class="axis-line" x1="${pad.left}" y1="${height - pad.bottom}" x2="${width - pad.right}" y2="${height - pad.bottom}"></line>
        <line class="axis-line" x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${height - pad.bottom}"></line>
        <text class="axis-title" x="${pad.left}" y="${height - 14}">${formatDate(new Date(minDate).toISOString().slice(0, 10))}</text>
        <text class="axis-title is-right" x="${width - pad.right}" y="${height - 14}">${formatDate(new Date(maxDate).toISOString().slice(0, 10))}</text>
      </svg>
      <div class="chart-tooltip" data-chart-tooltip hidden></div>
    `;
    wrap.onmousemove = (event) => handleChartMove(event, pointsForTooltip, wrap);
    wrap.onmouseleave = () => {
      state.activePoint = null;
      state.showChartDetail = false;
      renderChartTooltip();
    };
    wrap.onclick = (event) => handleChartMove(event, pointsForTooltip, wrap);
  }

  function handleChartMove(event, points, wrap) {
    if (!points.length) return;
    const svg = wrap.querySelector("svg");
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const scaleX = 880 / rect.width;
    const scaleY = 360 / rect.height;
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;
    let bestIndex = 0;
    let bestDistance = Infinity;
    points.forEach((point, index) => {
      const distance = Math.hypot(point.x - x, point.y - y);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });
    state.activePoint = bestIndex;
    state.showChartDetail = event.type !== "mousemove";
    renderChartTooltip();
  }

  function renderChartTooltip() {
    const wrap = document.querySelector("[data-chart]");
    const tooltip = document.querySelector("[data-chart-tooltip]");
    const detail = document.querySelector("[data-chart-detail]");
    if (!wrap || !tooltip) return;
    const points = safeJson(wrap.dataset.points || "[]", []);
    const point = points[state.activePoint];
    if (!point) {
      tooltip.hidden = true;
      if (detail) detail.hidden = true;
      return;
    }
    const info = PATHOGENS[point.pathogen] || { label: point.pathogen, color: "#333" };
    tooltip.hidden = false;
    tooltip.style.left = `${Math.min(82, Math.max(8, (point.x / 880) * 100))}%`;
    tooltip.style.top = `${Math.min(78, Math.max(10, (point.y / 360) * 100))}%`;
    tooltip.innerHTML = `
      <p>${escapeHtml(formatDate(point.weekEnd))}</p>
      <strong style="color:${info.color}">${escapeHtml(info.label)} ${formatNumber(point.value)} WVAL</strong>
      <span>${escapeHtml(point.category || "Category varies by site")}</span>
    `;
    if (detail && state.showChartDetail) {
      detail.hidden = false;
      detail.innerHTML = `
        <span>${escapeHtml(formatDate(point.weekEnd))}</span>
        <strong style="--detail-color:${info.color}">${escapeHtml(info.label)}</strong>
        <span>${formatNumber(point.value)} WVAL</span>
        <span class="level-chip level-${slug(point.category)}">${escapeHtml(point.category || "Category varies by site")}</span>
      `;
    } else if (detail) {
      detail.hidden = true;
    }
  }

  function renderSitesTable(rows) {
    const section = document.querySelector("[data-sites-section]");
    const table = document.querySelector("[data-sites-table]");
    if (!section || !table) return;
    section.hidden = !state.settings.showSites;
    if (!state.settings.showSites) return;

    const latestWeek = latestWeekIn(rows);
    const latestRows = rows.filter((row) => row.weekEnd === latestWeek);
    latestRows.sort((a, b) => {
      const rankDiff = (CATEGORY_RANK[b.category] || 0) - (CATEGORY_RANK[a.category] || 0);
      return rankDiff || b.wval - a.wval || a.site.localeCompare(b.site);
    });
    table.innerHTML = `
      <thead>
        <tr>
          <th class="col-county">County</th>
          <th class="col-pathogen">Pathogen</th>
          <th class="col-level">Level</th>
          <th class="col-site">Site</th>
          <th class="col-wval">WVAL</th>
          <th class="col-source">Source</th>
        </tr>
      </thead>
      <tbody>
        ${latestRows.slice(0, 48).map((row) => `
          <tr>
            <td class="col-county">${escapeHtml(row.countiesServed)}</td>
            <td class="col-pathogen">${escapeHtml(pathogenLabel(row.pathogen))}</td>
            <td class="col-level"><span class="level-chip level-${slug(row.category)}">${escapeHtml(row.category)}</span></td>
            <td class="col-site">${escapeHtml(formatSite(row.site))}</td>
            <td class="col-wval">${formatNumber(row.wval)}</td>
            <td class="col-source">${escapeHtml(row.source)}</td>
          </tr>
        `).join("")}
      </tbody>
    `;
  }

  function renderSourceNotes() {
    const source = document.querySelector("[data-source-notes]");
    if (source) {
      source.hidden = !state.settings.showSources;
      source.innerHTML = `
        <p>This site uses real CDC NWSS site-level wastewater viral activity level data for California. Area lines are population-weighted averages of matching sites. CDC WVAL is designed for SARS-CoV-2, Influenza A, and RSV and is categorized as Very Low, Low, Moderate, High, or Very High.</p>
        <p>The page fetches and processes the CDC rows in your browser, then caches the result locally for the selected cache window. If live fetching fails, it falls back to the checked-in data file.</p>
        <p>Wastewater cannot tell you the exact number of sick people. It is best read as a trend signal alongside clinical testing, hospitalizations, and local public health guidance.</p>
        <div class="glossary-grid">
          <article><strong>CDC</strong><span>Centers for Disease Control and Prevention.</span></article>
          <article><strong>NWSS</strong><span>National Wastewater Surveillance System.</span></article>
          <article><strong>WVAL</strong><span>Wastewater Viral Activity Level, a CDC normalized activity score.</span></article>
          <article><strong>RSV</strong><span>Respiratory syncytial virus.</span></article>
          <article><strong>SARS-CoV-2</strong><span>The virus that causes COVID.</span></article>
          <article><strong>Sewershed</strong><span>The area draining into a wastewater sampling site.</span></article>
        </div>
      `;
    }
  }

  function renderSettingsValues() {
    document.querySelectorAll("[data-setting]").forEach((input) => {
      const key = input.getAttribute("data-setting");
      if (!key) return;
      if (input instanceof HTMLInputElement && input.type === "checkbox") {
        input.checked = Boolean(state.settings[key]);
      } else if (input instanceof HTMLInputElement || input instanceof HTMLSelectElement) {
        input.value = state.settings[key] || "";
      }
    });
    document.querySelectorAll("[data-theme-option]").forEach((button) => {
      button.classList.toggle("is-active", button.getAttribute("data-theme-option") === state.settings.theme);
    });
  }

  function aggregateRows(rows) {
    const grouped = new Map();
    for (const row of rows) {
      if (!state.settings.pathogens.includes(row.pathogen)) continue;
      const pathogenMap = grouped.get(row.pathogen) || new Map();
      const bucket = pathogenMap.get(row.weekEnd) || { weekEnd: row.weekEnd, total: 0, weight: 0, categories: [] };
      const weight = row.populationServed || 1;
      bucket.total += row.wval * weight;
      bucket.weight += weight;
      bucket.categories.push(row.category);
      pathogenMap.set(row.weekEnd, bucket);
      grouped.set(row.pathogen, pathogenMap);
    }
    const result = new Map();
    for (const [pathogen, dateMap] of grouped.entries()) {
      result.set(pathogen, Array.from(dateMap.values()).map((bucket) => ({
        weekEnd: bucket.weekEnd,
        value: bucket.total / Math.max(1, bucket.weight),
        category: categoryFromValue(bucket.total / Math.max(1, bucket.weight), pathogen),
      })).sort((a, b) => a.weekEnd.localeCompare(b.weekEnd)));
    }
    return result;
  }

  function latestByPathogen(rows) {
    const latestWeek = latestWeekIn(rows);
    const aggregate = aggregateRows(rows.filter((row) => row.weekEnd === latestWeek));
    const result = new Map();
    for (const [pathogen, points] of aggregate.entries()) {
      const point = points[points.length - 1];
      if (point) result.set(pathogen, { ...point, wval: point.value });
    }
    return result;
  }

  function trendFor(pathogen, aggregate) {
    const points = aggregate.get(pathogen) || [];
    if (points.length < 2) return { text: "Not enough history", className: "trend-flat" };
    const latest = points[points.length - 1];
    const comparison = points[Math.max(0, points.length - 4)];
    const diff = latest.value - comparison.value;
    if (Math.abs(diff) < 0.4) return { text: "About flat vs 3 weeks ago", className: "trend-flat" };
    if (diff > 0) return { text: `Up ${formatNumber(diff)} vs 3 weeks ago`, className: "trend-up" };
    return { text: `Down ${formatNumber(Math.abs(diff))} vs 3 weeks ago`, className: "trend-down" };
  }

  function filterRowsByRange(rows, days) {
    const latest = latestWeekIn(rows);
    if (!latest) return [];
    const cutoff = new Date(latest);
    cutoff.setDate(cutoff.getDate() - days);
    return rows.filter((row) => new Date(row.weekEnd) >= cutoff);
  }

  function filteredRowsByArea(area) {
    if (!state.data || !Array.isArray(state.data.rows)) return [];
    return state.data.rows.filter((row) => areaMatches(row, area));
  }

  function areaMatches(row, area) {
    if (Array.isArray(area.sites) && area.sites.length) return area.sites.includes(row.site);
    if (!area.counties) return true;
    const rowCounties = String(row.countiesServed || "").split(",").map((item) => item.trim());
    return area.counties.some((county) => rowCounties.includes(county));
  }

  function categoryFromValue(value, pathogen) {
    const thresholds = {
      "Influenza A virus": [2.4, 5.5, 10.2, 15.6],
      "SARS-CoV-2": [2.6, 4.9, 7.9, 11.6],
      RSV: [1.7, 3.4, 5.4, 8.1],
    }[pathogen] || [2.6, 4.9, 7.9, 11.6];
    const names = ["Very Low", "Low", "Moderate", "High", "Very High"];
    for (let index = 0; index < thresholds.length; index += 1) {
      if (value <= thresholds[index]) return names[index];
    }
    return "Very High";
  }

  async function refreshFromApi() {
    setStatus("Refreshing from CDC...");
    try {
      const payload = await fetchCdcData();
      saveLiveData(payload);
      state.data = payload;
      render();
      setStatus(dataFreshnessText());
    } catch (error) {
      console.error(error);
      setStatus("Refresh failed. Keeping the current real CDC data file.", true);
    }
  }

  async function fetchCdcData() {
    const fromWeek = fromWeekDate();
    const params = new URLSearchParams({
      "$select": "state_territory,counties_served,site,population_served,source,site_wval,site_wval_category,date_included_in_wval,week_end,pathogen_target,date_updated",
      "$where": `state_territory='California' AND week_end >= '${fromWeek}'`,
      "$limit": "50000",
      "$order": "week_end,site,pathogen_target",
    });
    const rows = await fetchJson(`${CDC_ENDPOINT}?${params.toString()}`);
    return normalizeLiveRows(rows, fromWeek);
  }

  async function fetchBundledFallback(showErrors) {
    try {
      const bundled = await fetchJson(DATA_PATH);
      state.bundled = bundled;
      if (!state.data) {
        state.data = bundled;
        render();
        setStatus(`Using bundled CDC data fallback. ${dataFreshnessText()}`);
      }
    } catch (error) {
      console.error(error);
      if (showErrors) {
        setStatus("Could not load live CDC data or the bundled CDC data file.", true);
      }
    }
  }

  function normalizeLiveRows(rows, fromWeek) {
    const cleaned = rows.map((row) => ({
      state: row.state_territory || "California",
      countiesServed: row.counties_served || "",
      site: row.site || "",
      populationServed: Number(row.population_served) || null,
      source: row.source || "",
      wval: Number(row.site_wval),
      category: row.site_wval_category || "Unknown",
      dateIncluded: row.date_included_in_wval || "",
      weekEnd: row.week_end || "",
      pathogen: row.pathogen_target || "",
      dateUpdated: row.date_updated || "",
    })).filter((row) => Number.isFinite(row.wval));
    const weeks = cleaned.map((row) => row.weekEnd).filter(Boolean).sort();
    const pathogens = Array.from(new Set(cleaned.map((row) => row.pathogen).filter(Boolean))).sort();
    return {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      source: {
        name: "CDC Wastewater Viral Activity Level for SARS-CoV-2, Influenza A and RSV",
        datasetId: "atcp-73re",
        url: "https://data.cdc.gov/Public-Health-Surveillance/CDC-Wastewater-Viral-Activity-Level-for-SARS-CoV-2/atcp-73re",
        api: CDC_ENDPOINT,
      },
      filters: { state: "California", fromWeek, pathogens },
      summary: {
        rowCount: cleaned.length,
        latestWeekEnd: weeks[weeks.length - 1] || null,
        earliestWeekEnd: weeks[0] || null,
      },
      rows: cleaned,
    };
  }

  function fromWeekDate() {
    const date = new Date();
    date.setDate(date.getDate() - 400);
    return date.toISOString().slice(0, 10);
  }

  function selectedArea() {
    return AREAS.find((area) => area.id === state.settings.area) || AREAS[0];
  }

  function selectedRange() {
    return RANGES.find((range) => range.id === state.settings.range) || RANGES[2];
  }

  function latestWeekIn(rows) {
    return rows.map((row) => row.weekEnd).filter(Boolean).sort().pop() || "";
  }

  function sourceLine() {
    if (!state.data) return "";
    const summary = state.data.summary || {};
    return `${Number(summary.rowCount || 0).toLocaleString()} real CDC rows, ${formatDate(summary.earliestWeekEnd)} to ${formatDate(summary.latestWeekEnd)}`;
  }

  function dataFreshnessText() {
    if (!state.data) return "";
    const generated = state.data.generatedAt ? formatDateTime(state.data.generatedAt) : "unknown";
    const latest = state.data.summary && state.data.summary.latestWeekEnd ? formatDate(state.data.summary.latestWeekEnd) : "unknown";
    return `Latest CDC week: ${latest}. Data file refreshed: ${generated}.`;
  }

  function togglePathogen(pathogen) {
    const current = new Set(state.settings.pathogens);
    if (current.has(pathogen) && current.size > 1) current.delete(pathogen);
    else current.add(pathogen);
    state.settings.pathogens = Array.from(current);
    saveSettings();
    render();
  }

  function openSettings() {
    const modal = document.querySelector("[data-settings-modal]");
    const backdrop = document.querySelector("[data-settings-backdrop]");
    if (!modal || !backdrop) return;
    modal.hidden = false;
    backdrop.hidden = false;
    document.body.classList.add("is-modal-open");
    renderSettingsValues();
  }

  function closeSettings() {
    const modal = document.querySelector("[data-settings-modal]");
    const backdrop = document.querySelector("[data-settings-backdrop]");
    if (modal) modal.hidden = true;
    if (backdrop) backdrop.hidden = true;
    document.body.classList.remove("is-modal-open");
  }

  function setStatus(text, isError) {
    fillText("[data-status]", text);
    document.querySelectorAll("[data-status]").forEach((el) => el.classList.toggle("is-error", Boolean(isError)));
  }

  function loadSettings() {
    const saved = safeJson(localStorage.getItem(STORAGE_KEY) || "null", null);
    if (saved) return normalizeSettings({ ...DEFAULT_SETTINGS, ...saved });

    const legacy = safeJson(localStorage.getItem(LEGACY_STORAGE_KEY) || "null", null);
    if (legacy) {
      const migrated = normalizeSettings({ ...DEFAULT_SETTINGS, ...legacy, area: DEFAULT_SETTINGS.area });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      return migrated;
    }

    return normalizeSettings({ ...DEFAULT_SETTINGS });
  }

  function normalizeSettings(settings) {
    const normalized = { ...settings };
    if (!AREAS.some((area) => area.id === normalized.area)) {
      normalized.area = DEFAULT_SETTINGS.area;
    }
    if (!RANGES.some((range) => range.id === normalized.range)) {
      normalized.range = DEFAULT_SETTINGS.range;
    }
    const knownPathogens = new Set(Object.keys(PATHOGENS));
    const pathogens = Array.isArray(normalized.pathogens) ? normalized.pathogens.filter((pathogen) => knownPathogens.has(pathogen)) : [];
    normalized.pathogens = pathogens.length ? pathogens : DEFAULT_SETTINGS.pathogens.slice();
    return normalized;
  }

  function saveSettings() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.settings));
  }

  function loadLiveData() {
    const payload = safeJson(localStorage.getItem(LIVE_DATA_KEY) || "null", null);
    return payload && Array.isArray(payload.rows) ? payload : null;
  }

  function saveLiveData(payload) {
    try {
      localStorage.setItem(LIVE_DATA_KEY, JSON.stringify(payload));
      return true;
    } catch (error) {
      console.warn("Could not cache live CDC data in this browser.", error);
      return false;
    }
  }

  function isCacheFresh(payload) {
    if (!payload || !payload.generatedAt || !Array.isArray(payload.rows)) return false;
    const cacheDays = Number(state.settings.cacheDays || 3);
    const ageMs = Date.now() - new Date(payload.generatedAt).getTime();
    return Number.isFinite(ageMs) && ageMs >= 0 && ageMs < cacheDays * 24 * 60 * 60 * 1000;
  }

  async function fetchJson(url) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
    return response.json();
  }

  function fillText(selector, text) {
    document.querySelectorAll(selector).forEach((element) => {
      element.textContent = text || "";
    });
  }

  function pathogenLabel(pathogen) {
    return PATHOGENS[pathogen] ? PATHOGENS[pathogen].label : pathogen;
  }

  function formatNumber(value) {
    if (!Number.isFinite(Number(value))) return "--";
    const number = Number(value);
    return number >= 10 ? number.toFixed(1) : number.toFixed(2).replace(/0$/, "").replace(/\.0$/, "");
  }

  function formatDate(value) {
    if (!value) return "--";
    const date = parseDate(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  function formatDateTime(value) {
    if (!value) return "--";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }

  function formatSite(site) {
    return String(site || "").replace(/^ID:/, "");
  }

  function parseDate(value) {
    const text = String(value);
    const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
      return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    }
    return new Date(value);
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    }[char]));
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }

  function safeJson(text, fallback) {
    try {
      return JSON.parse(text);
    } catch {
      return fallback;
    }
  }

  function slug(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }
})();
