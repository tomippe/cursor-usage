(function () {
  "use strict";

  const vscode = acquireVsCodeApi();
  const DAY_MS = 86_400_000;
  const L = window.__L10N__ || {};
  const LOCALE = window.__LOCALE__ || "en-US";

  function l10n(key) {
    return L[key] != null ? L[key] : key;
  }

  function l10nTemplate(key, ...args) {
    let s = l10n(key);
    args.forEach(function (a, i) {
      s = s.replace("{" + i + "}", String(a));
    });
    return s;
  }

  function translateKind(kind) {
    if (kind === "Included") return l10n("kindIncluded");
    if (kind === "On-Demand") return l10n("kindOnDemand");
    if (kind === "Errored") return l10n("kindErrored");
    if (kind === "Aborted") return l10n("kindAborted");
    return kind;
  }

  const ui = {
    summaryCards: document.getElementById("summary-cards"),
    rangeSelector: document.getElementById("range-selector"),
    usageFilter: document.getElementById("usage-filter"),
    metricFilter: document.getElementById("metric-filter"),
    canvas: document.getElementById("usage-chart"),
    chartNote: document.getElementById("chart-note"),
    tableBody: document.querySelector("#events-table tbody"),
    tableHead: document.querySelector("#events-table thead"),
    breakdownBody: document.querySelector("#breakdown-table tbody"),
    breakdownHead: document.querySelector("#breakdown-table thead"),
    breakdownRangeLabel: document.getElementById("breakdown-range-label"),
    pagination: document.getElementById("pagination"),
    refreshBtn: document.getElementById("refresh-btn"),
    exportBtn: document.getElementById("export-csv"),
    lastUpdated: document.getElementById("last-updated"),
    errorBanner: document.getElementById("error-banner"),
  };

  const persisted = vscode.getState() || {};
  const local = {
    range: persisted.range || "billingCycle",
    usageFilter: persisted.usageFilter || "all",
    metric: persisted.metric || "tokens",
    sortKey: persisted.sortKey || "timestamp",
    sortOrder: persisted.sortOrder || "desc",
    breakdownSortKey: persisted.breakdownSortKey || "totalTokens",
    breakdownSortOrder: persisted.breakdownSortOrder || "desc",
    sectionOpen: {
      usage: persisted.sectionOpen?.usage !== false,
      breakdown: persisted.sectionOpen?.breakdown !== false,
      events: persisted.sectionOpen?.events !== false,
    },
  };

  let state = null;
  let chart = null;

  // Soft pastel palette that pairs with the shadcn dark surface — gentle, low-saturation
  // hues with enough contrast against the card background. Ordered so adjacent series
  // never use neighboring hues.
  const PALETTE = [
    "#9ec5fe", // sky blue
    "#b6e3c1", // mint
    "#f7c5a0", // peach
    "#d3b9f2", // lavender
    "#f5b8c5", // rose
    "#a7e0e0", // aqua
    "#f0d99b", // butter
    "#c9d4f0", // periwinkle
  ];

  function persistLocal() {
    vscode.setState({
      range: local.range,
      usageFilter: local.usageFilter,
      metric: local.metric,
      sortKey: local.sortKey,
      sortOrder: local.sortOrder,
      breakdownSortKey: local.breakdownSortKey,
      breakdownSortOrder: local.breakdownSortOrder,
      sectionOpen: local.sectionOpen,
    });
  }

  function setSectionCollapsed(section, isOpen) {
    const sectionEl = document.querySelector('.collapsible-section[data-section="' + section + '"]');
    const bodyEl = document.getElementById("section-body-" + section);
    const toggleEl = document.querySelector('.section-toggle[data-toggle-section="' + section + '"]');
    if (!sectionEl || !bodyEl || !toggleEl) return;
    sectionEl.classList.toggle("collapsed", !isOpen);
    bodyEl.classList.toggle("hidden", !isOpen);
    toggleEl.setAttribute("aria-expanded", isOpen ? "true" : "false");
  }

  function applySectionState() {
    setSectionCollapsed("usage", local.sectionOpen.usage);
    setSectionCollapsed("breakdown", local.sectionOpen.breakdown);
    setSectionCollapsed("events", local.sectionOpen.events);
  }

  function startOfUtcDay(ts) {
    const d = new Date(ts);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }

  function getDurationCutoff(range, resetAtIso, now) {
    if (range === "billingCycle") {
      if (!resetAtIso) return now - 31 * DAY_MS;
      const reset = new Date(resetAtIso);
      if (Number.isNaN(reset.getTime())) return now - 31 * DAY_MS;
      reset.setMonth(reset.getMonth() - 1);
      return reset.getTime();
    }
    const map = { "1d": 1, "7d": 7, "30d": 30 };
    return now - (map[range] || 30) * DAY_MS;
  }

  function matchesUsageFilter(event, filter) {
    if (filter === "all") return true;
    if (filter === "included") return event.kind === "Included";
    return event.kind === "On-Demand";
  }

  function formatTokens(n) {
    const trim = (v) => {
      const s = v.toFixed(1);
      return s.endsWith(".0") ? s.slice(0, -2) : s;
    };
    if (n >= 1e9) return trim(n / 1e9) + "B";
    if (n >= 1e6) return trim(n / 1e6) + "M";
    if (n >= 1e3) return trim(n / 1e3) + "K";
    return String(Math.round(n));
  }

  function formatDollars(n) {
    return "$" + (n || 0).toFixed(2);
  }

  function toMillis(ts) {
    if (typeof ts === "number") return ts;
    if (typeof ts === "string" && ts !== "") {
      const n = Number(ts);
      return Number.isFinite(n) ? n : NaN;
    }
    return NaN;
  }

  function formatDateTime(ts) {
    const ms = toMillis(ts);
    if (!Number.isFinite(ms)) return "—";
    if (window.__formatDateTime) return window.__formatDateTime(ms);
    const d = new Date(ms);
    return d.toLocaleString(LOCALE, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function formatRequests(n) {
    if (!Number.isFinite(n)) return "0";
    if (Number.isInteger(n)) return n.toLocaleString();
    return n.toFixed(1);
  }

  function isOnDemandEvent(event) {
    return event.kind === "On-Demand";
  }

  function isIncludedEvent(event) {
    return event.kind === "Included";
  }

  function eventSpendDollars(event) {
    if (state && state.quotaAwareEventDisplay && !isOnDemandEvent(event)) return 0;
    return (event.spendCents || 0) / 100;
  }

  function eventRequestsText(event) {
    if (state && state.quotaAwareEventDisplay && !isIncludedEvent(event)) return "—";
    return formatRequests(event.requests || 0);
  }

  function eventSpendText(event) {
    if (state && state.quotaAwareEventDisplay && !isOnDemandEvent(event)) return "—";
    return formatDollars(eventSpendDollars(event));
  }

  function formatDayLabel(dayMs) {
    if (window.__formatChartDayLabel) return window.__formatChartDayLabel(dayMs);
    return new Date(dayMs).toLocaleDateString(LOCALE, {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  }

  function formatResetCountdown(iso) {
    if (!iso) return "";
    const reset = new Date(iso);
    const days = Math.max(0, Math.ceil((reset.getTime() - Date.now()) / DAY_MS));
    const formatted = window.__formatShortDate
      ? window.__formatShortDate(reset)
      : reset.toLocaleDateString(LOCALE, { month: "short", day: "numeric", year: "numeric" });
    const template = days === 1 ? l10n("resetsInDaysOnSingular") : l10n("resetsInDaysOn");
    return l10nTemplate(template, days, formatted);
  }

  function setActiveRangeButton() {
    ui.rangeSelector.querySelectorAll("button").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.range === local.range);
    });
  }

  function formatPlanPercent(percent) {
    const n = Number(percent) || 0;
    const rounded = Math.round(n);
    if (Math.abs(n - rounded) < 0.05) return rounded + "%";
    return n.toFixed(1) + "%";
  }

  function percentBarWidth(percent) {
    return Math.round(Math.min(1, Math.max(0, (Number(percent) || 0) / 100)) * 100);
  }

  function summaryCardHtml(label, value, barPct, footer) {
    return (
      '<div class="card">' +
        '<div class="card-label">' + label + "</div>" +
        '<div class="card-value">' + value + "</div>" +
        '<div class="progress"><div style="width:' + barPct + '%"></div></div>' +
        (footer ? '<div class="card-footer">' + footer + "</div>" : "") +
      "</div>"
    );
  }

  function renderOnDemandCard(onDemand) {
    if (onDemand.state === "disabled") return "";
    let valText, footerText, ratio;
    if (onDemand.state === "unlimited") {
      valText = formatDollars(onDemand.spendDollars);
      footerText = l10n("unlimited");
      ratio = 0;
    } else {
      valText = formatDollars(onDemand.spendDollars) + " / " + formatDollars(onDemand.limitDollars || 0);
      ratio = onDemand.limitDollars > 0 ? Math.min(1, onDemand.spendDollars / onDemand.limitDollars) : 0;
      footerText = l10n("payForExtraUsage");
    }
    return summaryCardHtml(l10n("onDemandUsage"), valText, Math.round(ratio * 100), footerText);
  }

  function renderSummaryCards() {
    if (!state || !state.data) {
      ui.summaryCards.innerHTML = '<div class="card"><div class="card-label">' + l10n("noDataYet") + "</div></div>";
      return;
    }
    const { includedRequests, onDemand, totalPercentUsed, autoPercentUsed, apiPercentUsed } = state.data;
    const parts = [];

    // Spend-based plans (Ultra / Pro): Total / First-party / API — same branch as status-bar tooltip
    if (totalPercentUsed !== null && totalPercentUsed !== undefined) {
      parts.push(
        summaryCardHtml(
          l10n("total"),
          formatPlanPercent(totalPercentUsed),
          percentBarWidth(totalPercentUsed),
          formatResetCountdown(state.resetsAt),
        ),
      );
      if (autoPercentUsed !== null && autoPercentUsed !== undefined) {
        parts.push(
          summaryCardHtml(
            l10n("firstPartyModels"),
            formatPlanPercent(autoPercentUsed),
            percentBarWidth(autoPercentUsed),
            "",
          ),
        );
      }
      if (apiPercentUsed !== null && apiPercentUsed !== undefined) {
        parts.push(
          summaryCardHtml(l10n("api"), formatPlanPercent(apiPercentUsed), percentBarWidth(apiPercentUsed), ""),
        );
      }
      const onDemandCard = renderOnDemandCard(onDemand);
      if (onDemandCard) parts.push(onDemandCard);
      ui.summaryCards.innerHTML = parts.join("");
      return;
    }

    // Legacy request-quota plans
    const reqRatio = includedRequests.limit > 0 ? Math.min(1, includedRequests.used / includedRequests.limit) : 0;
    parts.push(
      summaryCardHtml(
        l10n("includedRequestUsage"),
        includedRequests.used + " / " + includedRequests.limit,
        Math.round(reqRatio * 100),
        formatResetCountdown(state.resetsAt),
      ),
    );
    const onDemandCard = renderOnDemandCard(onDemand);
    if (onDemandCard) parts.push(onDemandCard);
    ui.summaryCards.innerHTML = parts.join("");
  }

  function buildChartSeries() {
    const cutoff = getDurationCutoff(local.range, state.resetsAt, state.generatedAt);
    const start = startOfUtcDay(cutoff);
    // For the billing cycle range, extend the x-axis to the end of the current cycle
    // (the day before the next reset) so empty future days are visible.
    let end = startOfUtcDay(state.generatedAt);
    if (local.range === "billingCycle" && state.resetsAt) {
      const reset = new Date(state.resetsAt);
      if (!Number.isNaN(reset.getTime())) {
        // Show through the last day of the cycle (day before reset).
        const cycleEnd = startOfUtcDay(reset.getTime() - DAY_MS);
        if (cycleEnd > end) end = cycleEnd;
      }
    }
    const days = [];
    for (let d = start; d <= end; d += DAY_MS) days.push(d);
    if (days.length === 0) days.push(end);
    const dayIndex = new Map(days.map((d, i) => [d, i]));

    const perModel = new Map();
    const perModelSpend = new Map();
    const ensureArr = (map, m) => {
      let arr = map.get(m);
      if (!arr) {
        arr = new Array(days.length).fill(0);
        map.set(m, arr);
      }
      return arr;
    };

    for (const e of state.events) {
      const ts = toMillis(e.timestamp);
      if (!Number.isFinite(ts) || ts < cutoff) continue;
      if (!matchesUsageFilter(e, local.usageFilter)) continue;
      const day = startOfUtcDay(ts);
      const idx = dayIndex.get(day);
      if (idx === undefined) continue;
      const value =
        local.metric === "tokens" ? (e.totalTokens || 0) :
        local.metric === "requests" ? (e.requests || 0) :
        eventSpendDollars(e);
      ensureArr(perModel, e.model)[idx] += value;
      ensureArr(perModelSpend, e.model)[idx] += eventSpendDollars(e);
    }

    const datasets = [];
    for (const [model, arr] of perModel.entries()) {
      datasets.push({
        model,
        data: arr.slice(),
        spendByDay: (perModelSpend.get(model) || new Array(days.length).fill(0)).slice(),
        total: arr.reduce((a, b) => a + b, 0),
      });
    }
    // Sort by total over the range, descending — biggest contributor first.
    datasets.sort((a, b) => b.total - a.total);

    return { labels: days.map(formatDayLabel), datasets };
  }

  // Shared model→color map. Built from the current chart series so the table
  // and the chart always agree on which color belongs to which model.
  let modelColorMap = new Map();

  function rebuildModelColorMap(series) {
    modelColorMap = new Map();
    series.datasets.forEach((d, i) => {
      modelColorMap.set(d.model, PALETTE[i % PALETTE.length]);
    });
  }

  function colorForModel(model) {
    return modelColorMap.get(model) || "rgba(255,255,255,0.4)";
  }

  function tintColor(color, alpha) {
    if (!color) return "rgba(255,255,255," + alpha + ")";
    if (color.startsWith("#")) {
      const hex = color.slice(1);
      const full = hex.length === 3
        ? hex.split("").map((c) => c + c).join("")
        : hex;
      const r = parseInt(full.slice(0, 2), 16);
      const g = parseInt(full.slice(2, 4), 16);
      const b = parseInt(full.slice(4, 6), 16);
      return "rgba(" + r + "," + g + "," + b + "," + alpha + ")";
    }
    if (color.startsWith("rgb(")) {
      return color.replace("rgb(", "rgba(").replace(")", "," + alpha + ")");
    }
    if (color.startsWith("rgba(")) {
      return color.replace(/rgba\(([^,]+),([^,]+),([^,]+),[^)]+\)/, "rgba($1,$2,$3," + alpha + ")");
    }
    return color;
  }

  function getOrCreateTooltipEl() {
    let el = document.getElementById("chart-tooltip");
    if (!el) {
      el = document.createElement("div");
      el.id = "chart-tooltip";
      el.className = "chart-tooltip";
      document.body.appendChild(el);
    }
    return el;
  }

  function renderExternalTooltip(context, opts) {
    const { chart, tooltip } = context;
    const el = getOrCreateTooltipEl();
    if (tooltip.opacity === 0) {
      el.style.opacity = "0";
      return;
    }

    const dataPoints = (tooltip.dataPoints || [])
      .filter((dp) => (dp.parsed.y || 0) > 0)
      .sort((a, b) => (b.parsed.y || 0) - (a.parsed.y || 0));

    const title = (tooltip.title && tooltip.title[0]) || "";
    const isSpend = opts.isSpend;
    const metricLabel = isSpend ? l10n("spend") : opts.metric === "tokens" ? l10n("tokens") : l10n("requests");

    const formatMetric = (v) =>
      isSpend ? formatDollars(v) : opts.metric === "tokens" ? formatTokens(v) : formatRequests(v);

    const rows = dataPoints.map((dp) => {
      const ds = dp.dataset;
      const v = dp.parsed.y || 0;
      const spend = isSpend ? v : (ds.spendByDay ? (ds.spendByDay[dp.dataIndex] || 0) : 0);
      const color = ds.backgroundColor || colorForModel(ds.label);
      return (
        '<tr>' +
          '<td><span class="t-dot" style="background:' + color + '"></span>' + escapeHtml(ds.label) + '</td>' +
          '<td class="num">' + formatMetric(v) + '</td>' +
          (isSpend ? "" : '<td class="num">' + formatDollars(spend) + '</td>') +
        '</tr>'
      );
    }).join("");

    const headerCols = isSpend
      ? "<th>" + l10n("model") + '</th><th class="num">' + metricLabel + "</th>"
      : "<th>" + l10n("model") + '</th><th class="num">' + metricLabel + '</th><th class="num">' + l10n("spend") + "</th>";

    el.innerHTML =
      '<div class="t-title">' + escapeHtml(title) + '</div>' +
      '<table class="t-table"><thead><tr>' + headerCols + '</tr></thead><tbody>' + rows + '</tbody></table>';

    // Position tooltip relative to the canvas, keeping it inside the chart bounds.
    const canvasRect = chart.canvas.getBoundingClientRect();
    const tooltipWidth = el.offsetWidth;
    const tooltipHeight = el.offsetHeight;
    const padding = 12;

    let left = canvasRect.left + window.scrollX + tooltip.caretX + padding;
    let top = canvasRect.top + window.scrollY + tooltip.caretY - tooltipHeight / 2;

    // Flip to the left of the cursor if it would overflow the right edge.
    if (left + tooltipWidth > canvasRect.right + window.scrollX) {
      left = canvasRect.left + window.scrollX + tooltip.caretX - tooltipWidth - padding;
    }
    // Clamp vertically.
    const minTop = canvasRect.top + window.scrollY + 4;
    const maxTop = canvasRect.bottom + window.scrollY - tooltipHeight - 4;
    if (top < minTop) top = minTop;
    if (top > maxTop) top = maxTop;

    el.style.left = left + "px";
    el.style.top = top + "px";
    el.style.opacity = "1";
  }

  function renderChart() {
    const series = buildChartSeries();
    rebuildModelColorMap(series);
    const isSpend = local.metric === "spend";
    const yLabel = isSpend ? l10n("spend") : local.metric === "tokens" ? l10n("tokens") : l10n("requests");

    // For each x (day), find the topmost non-zero dataset so we only round
    // that segment's top corners. Datasets stack in order, so the "top" is
    // the LAST non-zero dataset at that x.
    const numX = series.labels.length;
    const topDatasetForX = new Array(numX).fill(-1);
    for (let i = 0; i < series.datasets.length; i++) {
      const data = series.datasets[i].data;
      for (let x = 0; x < numX; x++) {
        if ((data[x] || 0) > 0) topDatasetForX[x] = i;
      }
    }

    const RADIUS = 4;
    const chartData = {
      labels: series.labels,
      datasets: series.datasets.map((d, i) => ({
        label: d.model,
        data: d.data,
        spendByDay: d.spendByDay,
        backgroundColor: PALETTE[i % PALETTE.length],
        borderColor: PALETTE[i % PALETTE.length],
        borderWidth: 0,
        borderSkipped: false,
        borderRadius: (ctx) => {
          const x = ctx.dataIndex;
          const v = ctx.parsed && typeof ctx.parsed.y === "number" ? ctx.parsed.y : 0;
          if (v <= 0) return 0;
          if (topDatasetForX[x] !== i) return 0;
          // Round only the top corners of the top segment.
          return { topLeft: RADIUS, topRight: RADIUS, bottomLeft: 0, bottomRight: 0 };
        },
        categoryPercentage: 0.7,
        barPercentage: 0.85,
      })),
    };

    const styles = getComputedStyle(document.body);
    const muted = styles.getPropertyValue("--muted").trim() || "rgba(255,255,255,0.55)";
    const grid = styles.getPropertyValue("--border").trim() || "rgba(255,255,255,0.06)";

    const opts = {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      layout: { padding: { top: 8, right: 4, bottom: 0, left: 0 } },
      plugins: {
        legend: {
          position: "bottom",
          align: "center",
          labels: {
            color: muted,
            boxWidth: 8,
            boxHeight: 8,
            usePointStyle: true,
            pointStyle: "circle",
            font: { size: 11 },
            padding: 12,
          },
        },
        tooltip: {
          enabled: false,
          external: (context) => renderExternalTooltip(context, { isSpend, metric: local.metric }),
        },
      },
      scales: {
        x: {
          stacked: true,
          ticks: { color: muted, font: { size: 10 }, maxRotation: 0, autoSkipPadding: 12 },
          grid: { display: false, drawBorder: false },
          border: { display: false },
        },
        y: {
          stacked: true,
          beginAtZero: true,
          ticks: {
            color: muted,
            font: { size: 10 },
            callback: (v) => isSpend ? formatDollars(v) : local.metric === "tokens" ? formatTokens(v) : v.toLocaleString(),
          },
          grid: { color: grid, drawBorder: false, drawTicks: false },
          border: { display: false },
          title: { display: false, text: yLabel },
        },
      },
    };

    // Recreate chart when switching type isn't supported in-place.
    if (chart) {
      chart.destroy();
      chart = null;
    }
    chart = new Chart(ui.canvas.getContext("2d"), { type: "bar", data: chartData, options: opts });

    ui.chartNote.textContent = "";
  }

  function getFilteredEvents() {
    if (!state) return [];
    const cutoff = getDurationCutoff(local.range, state.resetsAt, state.generatedAt);
    return state.events.filter((e) => {
      const ts = toMillis(e.timestamp);
      return Number.isFinite(ts) && ts >= cutoff && matchesUsageFilter(e, local.usageFilter);
    });
  }

  function getSortedEvents() {
    const events = getFilteredEvents();
    const dir = local.sortOrder === "asc" ? 1 : -1;
    const key = local.sortKey;
    return events.slice().sort((a, b) => {
      let av = a[key], bv = b[key];
      if (key === "timestamp") { av = toMillis(av); bv = toMillis(bv); }
      const an = typeof av === "number" ? av : Number(av);
      const bn = typeof bv === "number" ? bv : Number(bv);
      if (Number.isFinite(an) && Number.isFinite(bn)) return (an - bn) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }

  function renderTable() {
    const events = getSortedEvents();

    if (events.length === 0) {
      ui.tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:24px;" class="muted">' + l10n("noEventsInRange") + "</td></tr>";
    } else {
      ui.tableBody.innerHTML = events.map((e) => {
        const maxBadge = e.maxMode ? ' <span class="max-badge">MAX</span>' : "";
        const color = colorForModel(e.model);
        // Tint the row with a low-alpha derivative of the model color and add a
        // brighter left border for clearer association with the chart.
        const rowStyle = 'background:' + tintColor(color, 0.10) + ';box-shadow:inset 3px 0 0 ' + color + ';';
        return '<tr style="' + rowStyle + '">' +
          "<td>" + formatDateTime(e.timestamp) + "</td>" +
          '<td><span class="kind-badge kind-' + e.kind.replace(/[^A-Za-z]/g, "") + '">' + translateKind(e.kind) + "</span></td>" +
          "<td>" + escapeHtml(e.model) + maxBadge + "</td>" +
          '<td class="num">' + formatTokens(e.totalTokens || 0) + "</td>" +
          '<td class="num">' + eventRequestsText(e) + "</td>" +
          '<td class="num">' + eventSpendText(e) + "</td>" +
        "</tr>";
      }).join("");
    }

    ui.tableHead.querySelectorAll("th.sortable").forEach((th) => {
      th.classList.remove("sorted-asc", "sorted-desc");
      if (th.dataset.sort === local.sortKey) {
        th.classList.add(local.sortOrder === "asc" ? "sorted-asc" : "sorted-desc");
      }
    });

    if (events.length > 0) {
      const countLabel = events.length === 1 ? l10n("eventCountSingular") : l10n("eventCount");
      ui.pagination.innerHTML = '<span class="muted">' + l10nTemplate(countLabel, events.length) + "</span>";
    } else {
      ui.pagination.innerHTML = "";
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }

  function rangeLabel() {
    if (local.range === "1d") return l10n("last24Hours");
    if (local.range === "7d") return l10n("last7Days");
    if (local.range === "30d") return l10n("last30Days");
    return l10n("currentBillingCycle");
  }

  function aggregateModelBreakdown() {
    if (!state) return [];
    const cutoff = getDurationCutoff(local.range, state.resetsAt, state.generatedAt);
    const map = new Map();
    for (const e of state.events) {
      const ts = toMillis(e.timestamp);
      if (!Number.isFinite(ts) || ts < cutoff) continue;
      if (!matchesUsageFilter(e, local.usageFilter)) continue;
      const entry = map.get(e.model) || { model: e.model, requests: 0, totalTokens: 0, spendCents: 0 };
      entry.requests += e.requests || 0;
      entry.totalTokens += e.totalTokens || 0;
      entry.spendCents += Math.round(eventSpendDollars(e) * 100);
      map.set(e.model, entry);
    }
    const rows = Array.from(map.values());
    const dir = local.breakdownSortOrder === "asc" ? 1 : -1;
    const key = local.breakdownSortKey;
    rows.sort((a, b) => {
      const av = a[key], bv = b[key];
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
    return rows;
  }

  function renderBreakdown() {
    if (ui.breakdownRangeLabel) ui.breakdownRangeLabel.textContent = "(" + rangeLabel() + ")";
    const rows = aggregateModelBreakdown();

    if (ui.breakdownHead) {
      ui.breakdownHead.querySelectorAll("th.sortable").forEach((th) => {
        th.classList.remove("sorted-asc", "sorted-desc");
        if (th.dataset.sort === local.breakdownSortKey) {
          th.classList.add(local.breakdownSortOrder === "asc" ? "sorted-asc" : "sorted-desc");
        }
      });
    }

    if (rows.length === 0) {
      ui.breakdownBody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:24px;" class="muted">' + l10n("noUsageInRange") + "</td></tr>";
      return;
    }
    ui.breakdownBody.innerHTML = rows.map((r) => {
      const color = colorForModel(r.model);
      const rowStyle = 'background:' + tintColor(color, 0.10) + ';box-shadow:inset 3px 0 0 ' + color + ';';
      return '<tr style="' + rowStyle + '">' +
        '<td>' + escapeHtml(r.model) + '</td>' +
        '<td class="num">' + formatRequests(r.requests) + '</td>' +
        '<td class="num">' + formatTokens(r.totalTokens) + '</td>' +
        '<td class="num">' + formatDollars(r.spendCents / 100) + '</td>' +
      '</tr>';
    }).join("");
  }

  function exportCsv() {
    const events = getSortedEvents();
    const header = ["Date", "Type", "Model", "MaxMode", "Tokens", "Requests", "SpendUSD"];
    const lines = [header.join(",")];
    for (const e of events) {
      const ts = toMillis(e.timestamp);
      const dateStr = Number.isFinite(ts) ? new Date(ts).toISOString() : "";
      const row = [
        dateStr,
        e.kind,
        e.model,
        e.maxMode ? "true" : "false",
        e.totalTokens || 0,
        state && state.quotaAwareEventDisplay && !isIncludedEvent(e) ? "" : (e.requests || 0),
        state && state.quotaAwareEventDisplay && !isOnDemandEvent(e) ? "" : eventSpendDollars(e).toFixed(4),
      ].map(csvCell).join(",");
      lines.push(row);
    }
    const csv = lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cursor-usage-" + local.range + "-" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function csvCell(v) {
    const s = String(v);
    const safe = /^\s*[=+\-@]/.test(s) ? "'" + s : s;
    if (/[",\n]/.test(safe)) return '"' + safe.replace(/"/g, '""') + '"';
    return safe;
  }

  function applyTeamMemberConstraints() {
    // Spend now derives from per-event chargedCents and is available for both solo and team users.
    const spendOpt = ui.metricFilter.querySelector('option[value="spend"]');
    if (spendOpt) spendOpt.disabled = false;
  }

  function showError(msg) {
    if (msg) {
      ui.errorBanner.textContent = msg;
      ui.errorBanner.classList.remove("hidden");
    } else {
      ui.errorBanner.classList.add("hidden");
    }
  }

  function renderAll() {
    if (!state) return;
    applySectionState();
    setActiveRangeButton();
    ui.usageFilter.value = local.usageFilter;
    ui.metricFilter.value = local.metric;
    applyTeamMemberConstraints();
    renderSummaryCards();
    renderChart();
    renderBreakdown();
    renderTable();
    showError(state.error);
    ui.lastUpdated.textContent = l10nTemplate(
      l10n("updatedAt"),
      window.__formatTime ? window.__formatTime(state.generatedAt) : new Date(state.generatedAt).toLocaleTimeString(LOCALE),
    );
  }

  // Event wiring
  ui.rangeSelector.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-range]");
    if (!btn) return;
    local.range = btn.dataset.range;
    persistLocal();
    renderAll();
  });

  ui.usageFilter.addEventListener("change", () => {
    local.usageFilter = ui.usageFilter.value;
    persistLocal();
    renderChart();
    renderBreakdown();
    renderTable();
  });

  ui.metricFilter.addEventListener("change", () => {
    local.metric = ui.metricFilter.value;
    persistLocal();
    renderChart();
  });

  ui.tableHead.addEventListener("click", (e) => {
    const th = e.target.closest("th.sortable");
    if (!th) return;
    const key = th.dataset.sort;
    if (local.sortKey === key) {
      local.sortOrder = local.sortOrder === "asc" ? "desc" : "asc";
    } else {
      local.sortKey = key;
      local.sortOrder = key === "model" || key === "kind" ? "asc" : "desc";
    }
    persistLocal();
    renderTable();
  });

  if (ui.breakdownHead) {
    ui.breakdownHead.addEventListener("click", (e) => {
      const th = e.target.closest("th.sortable");
      if (!th) return;
      const key = th.dataset.sort;
      if (local.breakdownSortKey === key) {
        local.breakdownSortOrder = local.breakdownSortOrder === "asc" ? "desc" : "asc";
      } else {
        local.breakdownSortKey = key;
        local.breakdownSortOrder = key === "model" ? "asc" : "desc";
      }
      persistLocal();
      renderBreakdown();
    });
  }

  ui.refreshBtn.addEventListener("click", () => {
    vscode.postMessage({ type: "refresh" });
  });

  ui.exportBtn.addEventListener("click", exportCsv);

  document.querySelectorAll(".section-title-row[data-toggle-section]").forEach((row) => {
    row.addEventListener("click", () => {
      const section = row.dataset.toggleSection;
      if (!section || !Object.prototype.hasOwnProperty.call(local.sectionOpen, section)) return;
      local.sectionOpen[section] = !local.sectionOpen[section];
      persistLocal();
      applySectionState();
      // Chart.js needs a redraw when the canvas becomes visible again.
      if (section === "usage" && local.sectionOpen.usage && state) {
        renderChart();
      }
    });
  });

  window.addEventListener("message", (event) => {
    const msg = event.data;
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "state") {
      state = msg.state;
      renderAll();
    } else if (msg.type === "loading") {
      ui.refreshBtn.disabled = !!msg.on;
      ui.refreshBtn.textContent = msg.on ? l10n("refreshing") : l10n("refresh");
    }
  });

  applySectionState();
  // Tell host we're ready
  vscode.postMessage({ type: "ready" });
})();
