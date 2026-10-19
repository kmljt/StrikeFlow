const UPSTOX_TOKEN_KEY = "strikeflow-upstox-token";
const LAST_TRADING_DAY_KEY = "pnl-last-trading-day";
const nativeFetch = window.fetch.bind(window);
window.fetch = (input, init = {}) => {
  const raw = typeof input === "string" ? input : input.url;
  if (raw.startsWith("/api/")) {
    const headers = new Headers(
        init.headers || (input instanceof Request ? input.headers : undefined),
      ),
      token = localStorage.getItem(UPSTOX_TOKEN_KEY);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    init = { ...init, headers };
  }
  return nativeFetch(input, init);
};
const $ = (id) => document.getElementById(id),
  now = new Date(),
  dateField = $("date");
const nseFoHolidays2026 = new Set([
  "2026-01-26",
  "2026-03-03",
  "2026-03-26",
  "2026-03-31",
  "2026-04-03",
  "2026-04-14",
  "2026-05-01",
  "2026-05-28",
  "2026-06-26",
  "2026-09-14",
  "2026-10-02",
  "2026-10-20",
  "2026-11-10",
  "2026-11-24",
  "2026-12-25",
]);
function isMarketClosed(day) {
  if (nseFoHolidays2026.has(day)) return true;
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  return (weekday === 0 || weekday === 6) && day !== "2026-11-08";
}
const todayLocal = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
  .toISOString()
  .slice(0, 10);
dateField.max = todayLocal;
let lastDay = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
  .toISOString()
  .slice(0, 10);
lastDay = addDays(lastDay, -1);
while (isMarketClosed(lastDay)) lastDay = addDays(lastDay, -1);
const savedTradingDay = localStorage.getItem(LAST_TRADING_DAY_KEY),
  savedTradingDate = /^\d{4}-\d{2}-\d{2}$/.test(savedTradingDay || "")
    ? new Date(`${savedTradingDay}T00:00:00Z`)
    : null;
if (
  savedTradingDate &&
  Number.isFinite(savedTradingDate.getTime()) &&
  savedTradingDay <= todayLocal &&
  savedTradingDate.toISOString().slice(0, 10) === savedTradingDay
) lastDay = savedTradingDay;
dateField.value = lastDay;
$("date-label").textContent = formatDate(dateField.value);
function applySiteAccent(color) {
  const rgb = [1, 3, 5]
      .map((i) => parseInt(color.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)),
    luminance = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2],
    root = document.documentElement;
  root.style.setProperty("--site-accent", color);
  root.style.setProperty(
    "--site-accent-ink",
    luminance > 0.38 ? "#101113" : "#f7f8fa",
  );
  $("site-accent-swatch").style.color = color;
}
function basketLineColor(index, accentColor = null) {
  if (accentColor && /^#[0-9a-f]{6}$/i.test(accentColor)) return accentColor;
  const hue = (28 + index * 137.508) % 360;
  return `hsl(${hue} 92% 64%)`;
}
function basketColor(index, ending = 0, accentColor = null) {
  const hue = (28 + index * 137.508) % 360;
  if (accentColor && /^#[0-9a-f]{6}$/i.test(accentColor)) {
    if (ending >= 0) return accentColor;
    const [r, g, b] = [1, 3, 5].map(
        (i) => parseInt(accentColor.slice(i, i + 2), 16) / 255,
      ),
      max = Math.max(r, g, b),
      min = Math.min(r, g, b),
      d = max - min;
    let h = 0;
    if (d) {
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    return `hsl(${h} 68% 38%)`;
  }
  return ending < 0 ? `hsl(${hue} 72% 40%)` : `hsl(${hue} 92% 64%)`;
}
function randomBrightHex() {
  const h = Math.random() * 360,
    s = 0.9,
    l = 0.62,
    k = (n) => (n + h / 30) % 12,
    a = s * Math.min(l, 1 - l),
    f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return `#${[f(0), f(8), f(4)]
    .map((x) =>
      Math.round(x * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}
function basketAccentHex(index) {
  const hue = (28 + index * 137.508) % 360,
    s = 0.92,
    l = 0.64,
    k = (n) => (n + hue / 30) % 12,
    a = s * Math.min(l, 1 - l),
    f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return `#${[f(0), f(8), f(4)]
    .map((x) =>
      Math.round(x * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}
function refreshBasketColors() {
  if (window.chartData) {
    window.chartData.baskets.forEach((b) => {
      const basket = state.baskets.find((x) => x.id === b.id),
        index = state.baskets.indexOf(basket);
      b.color = basketLineColor(index, basket?.accentColor);
    });
    renderLegend(window.chartData.baskets);
    draw(window.chartData);
  }
  if (window.miniChartData) {
    window.miniChartData.percent.series.forEach((series) => {
      const basket = state.baskets.find((x) => x.id === series.id),
        index = state.baskets.indexOf(basket);
      series.color = basketLineColor(index, basket?.accentColor);
    });
    drawMiniPlots(window.miniChartData);
  }
}
let state = loadState(),
  refreshTimer = null,
  requestGeneration = 0,
  siteAccentColor = "#ff9f43";
try {
  const savedSiteAccent = localStorage.getItem("pnl-site-accent-color");
  if (savedSiteAccent && /^#[0-9a-f]{6}$/i.test(savedSiteAccent))
    siteAccentColor = savedSiteAccent;
} catch {}
$("site-accent").value = siteAccentColor;
applySiteAccent(siteAccentColor);
$("site-accent").addEventListener("input", () => {
  siteAccentColor = $("site-accent").value;
  applySiteAccent(siteAccentColor);
  try {
    localStorage.setItem("pnl-site-accent-color", siteAccentColor);
  } catch {}
  if (window.miniChartData) drawMiniPlots(window.miniChartData);
});
window.hoverIndex = null;
window.miniHover = null;
window.basketPnlResults = {};
window.activeScenarioBasketId = null;
window.scenarioChartRefs = [];
window.optionEntryMode = "manual";
window.smartPickResult = null;
let smartPickRequest = 0;
let smartPickDebounce = null;
let smartStrangleRequest = 0;
let smartStrangleDebounce = null;
let simpleStrangleRequest = 0;
let simpleStrangleDebounce = null;
window.strangleMode = "smart";
let optionContractsRequest = 0;
let manualOptionPreviewRequest = 0;
let manualOptionPreviewDebounce = null;
window.smartStrangleResult = null;
$("new-basket").addEventListener("click", addBasket);
$("new-strangle").addEventListener("click", openSmartStrangle);
$("strangle-cancel").addEventListener("click", () => $("strangle-dialog").close());
$("strangle-add").addEventListener("click", () => {
  if (window.strangleMode === "simple") addSimpleStrangle();
  else addSmartStrangle();
});
$("strangle-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (window.strangleMode === "simple") findSimpleStrangle();
  else findSmartStrangle();
});
document.querySelectorAll("[data-strangle-mode]").forEach((button) =>
  button.addEventListener("click", () => setStrangleMode(button.dataset.strangleMode)),
);
for (const id of ["strangle-otm", "strangle-budget"])
  $(id).addEventListener("input", scheduleSmartStrangle);
for (const id of ["simple-strangle-otm", "simple-strangle-lots"])
  $(id).addEventListener("input", scheduleSimpleStrangle);
$("expiry").addEventListener("change", scheduleSmartStrangle);
$("expiry").addEventListener("change", scheduleSimpleStrangle);
dateField.addEventListener("change", scheduleSmartStrangle);
dateField.addEventListener("change", scheduleSimpleStrangle);
$("basket-dialog").addEventListener("close", finishBasketDialog);
$("option-cancel").addEventListener("click", () => $("option-dialog").close());
$("option-dialog-form").addEventListener("submit", (e) => {
  e.preventDefault();
  if (window.optionEntryMode === "smart") findSmartOption();
  else addPosition();
});
document.querySelectorAll("[data-option-mode]").forEach((button) =>
  button.addEventListener("click", () => setOptionMode(button.dataset.optionMode)),
);
$("smart-add").addEventListener("click", () => addSmartPosition());
$("option-type-select").addEventListener("change", () => {
  const current = Number($("strike-input").value);
  setManualStrike(Number.isFinite(current) ? current : null);
  scheduleManualOptionPreview();
});
$("strike-input").addEventListener("input", scheduleManualOptionPreview);
$("lots").addEventListener("input", scheduleManualOptionPreview);
$("strike-input").addEventListener("change", () => {
  const value = Number($("strike-input").value);
  if (Number.isFinite(value)) setManualStrike(Math.round(value / 50) * 50);
  scheduleManualOptionPreview();
});
$("expiry").addEventListener("change", scheduleManualOptionPreview);
$("expiry").addEventListener("change", loadOptionContracts);
dateField.addEventListener("change", () => {
  localStorage.setItem(LAST_TRADING_DAY_KEY, dateField.value);
  $("date-label").textContent = formatDate(dateField.value);
  invalidateResults();
  renderExpiries();
  if ($("expiry").value) loadOptionContracts();
  else {
    $("option-type-select").disabled = true;
    $("strike-input").disabled = true;
    window.expiryOptions = [];
  }
  $("error").hidden = true;
});
let calendarMonth = new Date(`${dateField.value.slice(0, 7)}-01T00:00:00Z`);
$("date-open").addEventListener("click", () => {
  const picker = $("date-picker");
  if (picker.hidden) {
    calendarMonth = new Date(`${dateField.value.slice(0, 7)}-01T00:00:00Z`);
    renderCalendar();
    picker.hidden = false;
    $("date-open").setAttribute("aria-expanded", "true");
  } else {
    picker.hidden = true;
    $("date-open").setAttribute("aria-expanded", "false");
  }
});
$("month-prev").addEventListener("click", () => {
  calendarMonth.setUTCMonth(calendarMonth.getUTCMonth() - 1);
  renderCalendar();
});
$("month-next").addEventListener("click", () => {
  calendarMonth.setUTCMonth(calendarMonth.getUTCMonth() + 1);
  renderCalendar();
});
document.addEventListener("click", (e) => {
  if (!e.target.closest(".date-field")) {
    $("date-picker").hidden = true;
    $("date-open").setAttribute("aria-expanded", "false");
  }
});
try {
  const savedInterval = localStorage.getItem("pnl-price-interval");
  if (
    [...$("interval").options].some((option) => option.value === savedInterval)
  )
    $("interval").value = savedInterval;
} catch {}
$("interval").addEventListener("change", () => {
  try {
    localStorage.setItem("pnl-price-interval", $("interval").value);
  } catch {}
  invalidateResults();
});
const chartCanvas = $("chart");
chartCanvas.addEventListener("pointermove", showChartHover);
chartCanvas.addEventListener("pointerleave", clearChartHover);
for (const id of ["nifty-chart", "percent-chart"]) {
  $(id).addEventListener("pointermove", showMiniHover);
  $(id).addEventListener("pointerleave", clearMiniHover);
}
window.addEventListener("resize", () => {
  if (window.chartData) draw(window.chartData);
  if (window.miniChartData) drawMiniPlots(window.miniChartData);
  (window.scenarioChartRefs || []).forEach((ref) =>
    drawScenarioChart(
      ref.canvas,
      ref.scenario,
      ref.color,
      ref.actualSpot,
      ref.hoverPoint,
      ref.view,
    ),
  );
});
const IST_OFFSET = 19800;
function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem("pnl-baskets") || "null");
    if (Array.isArray(s?.baskets)) return s;
  } catch {}
  return {
    activeId: "basket-1",
    baskets: [{ id: "basket-1", name: "Basket 1", items: [] }],
  };
}
function saveState() {
  localStorage.setItem("pnl-baskets", JSON.stringify(state));
}
function formatDate(day) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${day}T00:00:00Z`));
}
function renderCalendar() {
  const year = calendarMonth.getUTCFullYear(),
    month = calendarMonth.getUTCMonth(),
    first = new Date(Date.UTC(year, month, 1)),
    days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate(),
    offset = (first.getUTCDay() + 6) % 7;
  $("month-label").textContent = new Intl.DateTimeFormat("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(first);
  const cells = [];
  for (let i = 0; i < offset; i++) {
    const blank = document.createElement("span");
    blank.setAttribute("aria-hidden", "true");
    cells.push(blank);
  }
  for (let day = 1; day <= days; day++) {
    const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      closed = isMarketClosed(key),
      future = key > todayLocal,
      button = document.createElement("button");
    button.type = "button";
    button.textContent = String(day);
    button.setAttribute(
      "aria-label",
      `${day} ${formatDate(key)}${closed ? ", market closed" : ""}`,
    );
    if (key === dateField.value) {
      button.classList.add("selected");
      button.setAttribute("aria-pressed", "true");
    }
    if (closed) button.classList.add("closed-day");
    button.disabled = closed || future;
    button.title = closed ? "Market closed" : future ? "Future date" : "";
    button.addEventListener("click", () => {
      dateField.value = key;
      dateField.dispatchEvent(new Event("change", { bubbles: true }));
      $("date-picker").hidden = true;
      $("date-open").setAttribute("aria-expanded", "false");
    });
    cells.push(button);
  }
  $("calendar-days").replaceChildren(...cells);
}
function scheduleRefresh() {
  clearTimeout(refreshTimer);
  const generation = ++requestGeneration;
  refreshTimer = setTimeout(() => loadTrade(generation), 250);
}
function percentChange(from, to) {
  return from
    ? `${to >= from ? "+" : ""}${(((to - from) / from) * 100).toFixed(2)}%`
    : "—";
}
function intradayStats(points) {
  let maxProfit = { value: 0, t: null },
    maxLoss = { value: 0, t: null },
    peak = 0,
    peakTime = null,
    maxDrawdown = { value: 0, from: null, to: null };
  for (const point of points) {
    if (point.pnl > maxProfit.value)
      maxProfit = { value: point.pnl, t: point.t };
    if (point.pnl < maxLoss.value) maxLoss = { value: point.pnl, t: point.t };
    if (point.pnl > peak) {
      peak = point.pnl;
      peakTime = point.t;
    }
    const drawdown = peak - point.pnl;
    if (drawdown > maxDrawdown.value)
      maxDrawdown = { value: drawdown, from: peakTime, to: point.t };
  }
  return { maxProfit, maxLoss, maxDrawdown };
}
function renderBaskets() {
  const host = $("baskets");
  host.replaceChildren();
  window.scenarioChartRefs = [];
  state.baskets.forEach((b, index) => {
    const result = window.basketPnlResults[b.id],
      valid = result?.day === dateField.value,
      displayName = basketDisplayName(b);
    const toggleScenario = () => {
      window.activeScenarioBasketId =
        window.activeScenarioBasketId === b.id ? null : b.id;
      renderBaskets();
    };
    const card = document.createElement("section");
    card.className = "card basket";
    card.style.setProperty(
      "--basket-color",
      basketColor(index, valid ? result.ending : 0, b.accentColor),
    );
    card.style.borderLeftColor = "var(--basket-color)";
    card.style.borderLeftWidth = "3px";
    if (window.activeScenarioBasketId === b.id)
      card.classList.add("scenario-active");
    card.addEventListener("click", (e) => {
      if (e.target.closest(".basket-head,button,input,label,select,canvas"))
        return;
      toggleScenario();
    });
    const head = document.createElement("div");
    head.className = "basket-head";
    head.addEventListener("click", (e) => {
      if (e.target.closest("button,input,label,select")) return;
      toggleScenario();
    });
    const basketToggle = document.createElement("input");
    basketToggle.type = "checkbox";
    basketToggle.className = "selection-check";
    basketToggle.checked = b.enabled !== false;
    basketToggle.setAttribute(
      "aria-label",
      `Include ${displayName} in comparison`,
    );
    basketToggle.addEventListener("change", () => {
      b.enabled = basketToggle.checked;
      saveState();
      invalidateResults();
    });
    const title = document.createElement("h2");
    title.textContent = displayName;
    const count = document.createElement("span");
    count.className = "tag";
    count.textContent = `${b.items.length} option${b.items.length === 1 ? "" : "s"}`;
    const pnlLabel = document.createElement("span");
    pnlLabel.textContent = "P&L";
    pnlLabel.style.cssText = "font-size:11px;color:#89958e;margin-left:8px";
    const pnl = document.createElement("strong");
    pnl.style.cssText = "font-size:14px;white-space:nowrap";
    pnl.textContent = valid ? signed(result.ending) : "—";
    if (valid && result.ending !== 0)
      pnl.classList.add(result.ending > 0 ? "green" : "red");
    const plus = document.createElement("button");
    plus.className = "button secondary add-option-button";
    plus.type = "button";
    plus.textContent = "＋ Add option";
    plus.setAttribute("aria-label", `Add option to ${displayName}`);
    plus.addEventListener("click", () => openOptionDialog(b.id));
    const colorPicker = document.createElement("label");
    colorPicker.className = "basket-color-picker";
    colorPicker.title = `Choose ${displayName} accent color`;
    const colorSwatch = document.createElement("span");
    colorSwatch.style.background = basketColor(
      index,
      valid ? result.ending : 0,
      b.accentColor,
    );
    const colorInput = document.createElement("input");
    colorInput.type = "color";
    colorInput.value = b.accentColor || basketAccentHex(index);
    colorInput.setAttribute("aria-label", `Choose ${displayName} accent color`);
    colorInput.addEventListener("input", () => {
      b.accentColor = colorInput.value;
      saveState();
      colorSwatch.style.background = basketColor(
        index,
        valid ? result.ending : 0,
        b.accentColor,
      );
      card.style.setProperty(
        "--basket-color",
        basketColor(index, valid ? result.ending : 0, b.accentColor),
      );
      refreshBasketColors();
    });
    colorPicker.append(colorSwatch, colorInput);
    const randomColor = document.createElement("button");
    randomColor.type = "button";
    randomColor.className = "basket-random-color";
    randomColor.textContent = "↻";
    randomColor.title = "Random bright color";
    randomColor.setAttribute(
      "aria-label",
      `Random bright color for ${displayName}`,
    );
    randomColor.addEventListener("click", () => {
      b.accentColor = randomBrightHex();
      colorInput.value = b.accentColor;
      saveState();
      colorSwatch.style.background = basketColor(
        index,
        valid ? result.ending : 0,
        b.accentColor,
      );
      card.style.setProperty(
        "--basket-color",
        basketColor(index, valid ? result.ending : 0, b.accentColor),
      );
      refreshBasketColors();
    });
    const rename = document.createElement("button");
    rename.className = "tiny-button";
    rename.type = "button";
    rename.textContent = "Rename";
    rename.addEventListener("click", () => openBasketDialog(b.id));
    const del = document.createElement("button");
    del.className = "tiny-button remove-basket-button";
    del.style.color = "var(--red)";
    del.type = "button";
    del.textContent = "Remove basket";
    del.addEventListener("click", () => {
      state.baskets = state.baskets.filter((x) => x.id !== b.id);
      invalidateResults();
      saveState();
      renderBaskets();
    });
    const actions = document.createElement("div");
    actions.className = "basket-head-actions";
    actions.append(colorPicker, randomColor, rename, del, plus);
    const spacer = document.createElement("span");
    spacer.className = "spacer";
    head.append(basketToggle, title, count, pnlLabel, pnl, spacer, actions);
    const metrics = document.createElement("div");
    metrics.className = "basket-metrics";
    for (const [label, value] of [
      ["Cost", valid ? money(result.buyValue) : "—"],
      ["Value", valid ? money(result.closeValue) : "—"],
      [
        "Change",
        valid ? percentChange(result.buyValue, result.closeValue) : "—",
      ],
    ]) {
      const item = document.createElement("div");
      const caption = document.createElement("span");
      caption.textContent = label;
      const val = document.createElement("strong");
      val.textContent = value;
      if (label === "Change" && valid && result.percent !== 0)
        val.className = result.percent > 0 ? "green" : "red";
      item.append(caption, val);
      metrics.append(item);
    }
    const performance = document.createElement("div");
    performance.className = "basket-performance";
    const stats = valid ? intradayStats(result.points) : null,
      kept =
        stats && stats.maxProfit.value > 0
          ? Math.max(0, (result.ending / stats.maxProfit.value) * 100)
          : null;
    const performanceItems = [
      [
        "Max profit",
        stats ? signed(stats.maxProfit.value) : "—",
        stats && stats.maxProfit.t ? time(stats.maxProfit.t) : "",
        stats && stats.maxProfit.value > 0 ? "green" : "",
      ],
      [
        "Max loss",
        stats
          ? stats.maxLoss.value < 0
            ? signed(stats.maxLoss.value)
            : `−${money(0)}`
          : "—",
        stats && stats.maxLoss.t ? time(stats.maxLoss.t) : "",
        stats && stats.maxLoss.value < 0 ? "red" : "",
      ],
      [
        "Drawdown",
        stats ? `−${money(stats.maxDrawdown.value)}` : "—",
        stats && stats.maxDrawdown.to
          ? `${stats.maxDrawdown.from ? time(stats.maxDrawdown.from) : "Open"}–${time(stats.maxDrawdown.to)}`
          : "",
        stats && stats.maxDrawdown.value > 0 ? "red" : "",
      ],
      [
        "Kept",
        kept === null ? "—" : `${kept.toFixed(1)}%`,
        "",
        kept === null ? "" : kept > 0 ? "green" : "red",
      ],
    ];
    for (const [label, value, note, color] of performanceItems) {
      const item = document.createElement("div");
      item.className = "performance-stat";
      const caption = document.createElement("span");
      caption.textContent = label;
      const val = document.createElement("strong");
      val.textContent = value;
      if (color) val.className = color;
      const detail = document.createElement("small");
      detail.textContent = note;
      item.append(caption, val, detail);
      performance.append(item);
    }
    const list = document.createElement("div");
    list.className = "basket-list";
    if (!b.items.length) {
      const empty = document.createElement("div");
      empty.className = "basket-empty";
      empty.textContent = "No options yet";
      list.append(empty);
    }
    b.items.forEach((position, i) => {
      const row = document.createElement("div");
      row.className = "basket-item";
      const optionToggle = document.createElement("input");
      optionToggle.type = "checkbox";
      optionToggle.className = "selection-check";
      optionToggle.checked = position.enabled !== false;
      optionToggle.setAttribute(
        "aria-label",
        `Include ${positionName(position)} in comparison`,
      );
      optionToggle.addEventListener("change", () => {
        position.enabled = optionToggle.checked;
        saveState();
        invalidateResults();
      });
      const info = document.createElement("div");
      info.className = "instrument-info";
      const label = document.createElement("span");
      label.textContent = `${positionName(position)} · ${position.lots} lot${position.lots === 1 ? "" : "s"} × 65`;
      info.append(label);
      const instrumentResult = valid
        ? result.positions.find((x) => x.index === i)
        : null;
      let positionTotals = null;
      if (instrumentResult) {
        const detail = document.createElement("small");
        detail.className = "instrument-detail";
        detail.style.cssText =
          "display:flex;gap:8px;align-items:center;flex-wrap:wrap";
        const prices = document.createElement("span");
        prices.textContent = `${money(instrumentResult.buy)} → ${money(instrumentResult.close)}`;
        prices.setAttribute(
          "aria-label",
          `Previous close ${money(instrumentResult.buy)}; today close ${money(instrumentResult.close)}`,
        );
        prices.title = `Previous close ${money(instrumentResult.buy)} · Today close ${money(instrumentResult.close)}`;
        const change = document.createElement("strong");
        change.textContent = percentChange(
          instrumentResult.buy,
          instrumentResult.close,
        );
        change.className =
          instrumentResult.ending > 0
            ? "green"
            : instrumentResult.ending < 0
              ? "red"
              : "";
        positionTotals = document.createElement("div");
        positionTotals.className = "position-totals";
        for (const [name, value, color] of [
          [
            "Cost",
            money(instrumentResult.buy * instrumentResult.multiplier),
            "",
          ],
          [
            "Value",
            money(instrumentResult.close * instrumentResult.multiplier),
            "",
          ],
          ["P&L", signed(instrumentResult.ending), change.className],
        ]) {
          const metric = document.createElement("div");
          metric.className = "position-total";
          const caption = document.createElement("span");
          caption.textContent = name;
          const amount = document.createElement("strong");
          amount.textContent = value;
          if (color) amount.className = color;
          metric.append(caption, amount);
          positionTotals.append(metric);
        }
        detail.append(prices, change);
        info.append(detail);
      }
      const edit = document.createElement("button");
      edit.className = "remove-item edit-item";
      edit.type = "button";
      edit.textContent = "Edit";
      edit.setAttribute("aria-label", `Edit ${positionName(position)}`);
      edit.addEventListener("click", () => openOptionDialog(b.id, i));
      const remove = document.createElement("button");
      remove.className = "remove-item";
      remove.type = "button";
      remove.textContent = "Remove";
      remove.addEventListener("click", () => {
        invalidateResults();
        b.items.splice(i, 1);
        saveState();
        renderBaskets();
      });
      row.append(optionToggle, info);
      if (positionTotals) row.append(positionTotals);
      row.append(edit, remove);
      list.append(row);
    });
    const scenarioPanel = document.createElement("section");
    scenarioPanel.className = "scenario-panel";
    scenarioPanel.hidden = window.activeScenarioBasketId !== b.id;
    if (!scenarioPanel.hidden) {
      const scenarioTitle = document.createElement("div");
      scenarioTitle.className = "scenario-title";
      const label = document.createElement("strong");
      label.textContent = "Scenario P&L";
      const note = document.createElement("span");
      note.textContent = "NIFTY close vs estimated basket value";
      scenarioTitle.append(label, note);
      const controls = document.createElement("div");
      controls.className = "scenario-controls";
      scenarioTitle.append(controls);
      scenarioPanel.append(scenarioTitle);
      if (!valid) {
        const message = document.createElement("p");
        message.className = "scenario-note";
        message.textContent =
          "Enable this basket and its options to load prices.";
        scenarioPanel.append(message);
      } else if (!result.scenario?.points?.length) {
        const message = document.createElement("p");
        message.className = "scenario-note";
        message.textContent =
          result.scenario?.error || "Scenario prices are unavailable.";
        scenarioPanel.append(message);
      } else {
        const assumptions = document.createElement("p");
        assumptions.className = "scenario-note";
        const expiryModel = result.scenario.legs.every((leg) => leg.T === 0),
          ivNote = expiryModel
            ? "expiry legs use intrinsic value"
            : result.scenario.fallbackCount
              ? `${result.scenario.fallbackCount} leg${result.scenario.fallbackCount === 1 ? "" : "s"} use ${Math.round(result.scenario.fallbackVol * 100)}% proxy IV`
              : "market implied volatility held constant";
        assumptions.textContent = `Black–Scholes anchored to today’s close · ${ivNote} · Risk-free proxy 5.73% · Dividend yield 0% · NIFTY close ${Math.round(result.scenario.actualSpot).toLocaleString("en-IN")}`;
        const wrap = document.createElement("div");
        wrap.className = "scenario-chart-wrap";
        const canvas = document.createElement("canvas");
        canvas.className = "scenario-chart";
        canvas.setAttribute(
          "aria-label",
          `Estimated ${displayName} profit and loss by NIFTY closing price`,
        );
        const tooltip = document.createElement("div");
        tooltip.className = "scenario-chart-tooltip";
        tooltip.hidden = true;
        wrap.append(canvas, tooltip);
        scenarioPanel.append(assumptions, wrap);
        const ref = {
          canvas,
          tooltip,
          scenario: result.scenario,
          color: basketLineColor(index, b.accentColor),
          actualSpot: result.scenario.actualSpot,
          hoverPoint: null,
          view: defaultScenarioView(result.scenario),
          drag: null,
        };
        window.scenarioChartRefs.push(ref);
        addScenarioControls(controls, ref);
        canvas.addEventListener("pointerdown", (e) => {
          if (e.button !== 0) return;
          ref.drag = { x: e.clientX, view: ref.view.slice() };
          canvas.setPointerCapture(e.pointerId);
          canvas.classList.add("is-panning");
        });
        canvas.addEventListener("pointermove", (e) => {
          if (ref.drag) {
            const width = canvas.getBoundingClientRect().width - 94,
              span = ref.drag.view[1] - ref.drag.view[0],
              delta = (-(e.clientX - ref.drag.x) / Math.max(1, width)) * span;
            setScenarioView(
              ref,
              ref.drag.view[0] + delta,
              ref.drag.view[1] + delta,
            );
            return;
          }
          showScenarioHover(e, ref);
        });
        canvas.addEventListener("pointerup", () => {
          ref.drag = null;
          canvas.classList.remove("is-panning");
        });
        canvas.addEventListener("pointercancel", () => {
          ref.drag = null;
          canvas.classList.remove("is-panning");
        });
        canvas.addEventListener(
          "wheel",
          (e) => {
            e.preventDefault();
            const rect = canvas.getBoundingClientRect(),
              ratio =
                (e.clientX - rect.left - 80) / Math.max(1, rect.width - 94),
              [lo, hi] = ref.view,
              center = lo + Math.max(0, Math.min(1, ratio)) * (hi - lo),
              factor = e.deltaY > 0 ? 1.18 : 0.84;
            zoomScenario(ref, factor, center);
          },
          { passive: false },
        );
        canvas.addEventListener("pointerleave", () => {
          if (ref.drag) return;
          ref.hoverPoint = null;
          tooltip.hidden = true;
          drawScenarioChart(
            canvas,
            ref.scenario,
            ref.color,
            ref.actualSpot,
            null,
            ref.view,
          );
        });
      }
    }
    card.append(head, metrics, performance, list, scenarioPanel);
    host.append(card);
    const scenarioRef = window.scenarioChartRefs.at(-1);
    if (scenarioRef?.canvas.closest(".basket") === card)
      drawScenarioChart(
        scenarioRef.canvas,
        scenarioRef.scenario,
        scenarioRef.color,
        scenarioRef.actualSpot,
        null,
        scenarioRef.view,
      );
  });
}
function invalidateResults() {
  window.basketPnlResults = {};
  window.chartData = null;
  window.miniChartData = null;
  $("output").hidden = true;
  renderBaskets();
  scheduleRefresh();
}
function addBasket() {
  invalidateResults();
  const n =
    state.baskets.reduce((max, b) => {
      const m = b.name.match(/^Basket\s+(\d+)$/i);
      return m ? Math.max(max, Number(m[1])) : max;
    }, 0) + 1;
  state.baskets.push({
    id: `basket-${Date.now()}`,
    name: `Basket ${n}`,
    items: [],
  });
  saveState();
  renderBaskets();
}
function nextBasketNumber() {
  return state.baskets.reduce((max, b) => {
    const m = b.name.match(/^Basket\s+(\d+)$/i);
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0) + 1;
}
function openSmartStrangle() {
  window.strangleMode = "smart";
  setStrangleMode("smart", false);
  window.smartStrangleResult = null;
  window.simpleStrangleResult = null;
  $("strangle-result").hidden = true;
  $("simple-strangle-result").hidden = true;
  $("strangle-error").hidden = true;
  $("strangle-add").disabled = true;
  $("strangle-add").textContent = "Finding picks…";
  $("strangle-dialog").showModal();
  scheduleSmartStrangle();
  $("strangle-otm").focus();
}
function setStrangleMode(mode, refresh = true) {
  window.strangleMode = mode === "simple" ? "simple" : "smart";
  document.querySelectorAll("[data-strangle-mode]").forEach((button) =>
    button.setAttribute("aria-pressed", String(button.dataset.strangleMode === window.strangleMode)),
  );
  $("strangle-smart-fields").hidden = window.strangleMode !== "smart";
  $("strangle-simple-fields").hidden = window.strangleMode !== "simple";
  $("strangle-error").hidden = true;
  if (refresh && $("strangle-dialog").open) {
    if (window.strangleMode === "simple") scheduleSimpleStrangle();
    else scheduleSmartStrangle();
  }
}
function normalizeStrangleOffset(value) {
  if (!Number.isFinite(value)) return null;
  return Math.max(-10000, Math.min(10000, Math.round(value / 50) * 50));
}
function scheduleSmartStrangle() {
  clearTimeout(smartStrangleDebounce);
  if (window.strangleMode !== "smart") return;
  const requestId = ++smartStrangleRequest;
  window.smartStrangleResult = null;
  $("strangle-add").disabled = true;
  $("strangle-add").textContent = "Finding picks…";
  $("strangle-result").hidden = true;
  $("strangle-error").hidden = true;
  if (!$("strangle-dialog").open) return;
  const expiry = $("expiry").value,
    day = dateField.value,
    input = $("strangle-otm"),
    offset = Number(input.value),
    budget = Number($("strangle-budget").value);
  if (input.value.trim() !== "" && Number.isFinite(offset))
    input.value = String(normalizeStrangleOffset(offset));
  if (
    !expiry || expiry < day || input.value.trim() === "" ||
    !Number.isFinite(offset) || offset < -10000 || offset > 10000 ||
    !Number.isFinite(budget) || budget < 2 || budget > 10000000
  ) {
    if (!expiry || expiry < day) {
      $("strangle-error").textContent = "Choose an option expiry on or after the trading day.";
      $("strangle-error").hidden = false;
    }
    $("strangle-add").textContent = "Add strangle";
    return;
  }
  smartStrangleDebounce = setTimeout(() => findSmartStrangle(requestId), 400);
}
async function findSmartStrangle(requestId = ++smartStrangleRequest) {
  if (window.strangleMode !== "smart") return;
  clearTimeout(smartStrangleDebounce);
  smartStrangleDebounce = null;
  const expiry = $("expiry").value,
    day = dateField.value,
    otmInput = $("strangle-otm"),
    rawOffset = Number(otmInput.value),
    offset = normalizeStrangleOffset(rawOffset),
    budget = Number($("strangle-budget").value),
    error = $("strangle-error");
  if (!expiry || expiry < day) {
    error.textContent = "Choose an option expiry on or after the trading day.";
    error.hidden = false;
    $("strangle-add").textContent = "Add strangle";
    return;
  }
  if (
    otmInput.value.trim() === "" || offset === null ||
    !Number.isFinite(budget) || budget < 2 || budget > 10000000
  ) {
    error.textContent = "Enter a valid strike offset and a total budget of at least ₹2.";
    error.hidden = false;
    $("strangle-add").textContent = "Add strangle";
    return;
  }
  otmInput.value = String(offset);
  $("strangle-add").disabled = true;
  $("strangle-add").textContent = "Finding picks…";
  try {
    const pickLeg = async (type) => {
      const query = new URLSearchParams({
        expiry,
        day,
        type,
        otmPoints: String(offset),
        budget: String(budget / 2),
      });
      const response = await fetch(`/api/upstox/nifty-smart-pick?${query}`),
        result = await response.json();
      if (!response.ok) throw Error(result.error || `Could not find the ${type} leg.`);
      return { ...result, expiry };
    };
    const [call, put] = await Promise.all([pickLeg("CE"), pickLeg("PE")]);
    if (requestId !== smartStrangleRequest) return;
    const spent = call.estimatedCost + put.estimatedCost,
      remainder = budget - spent;
    window.smartStrangleResult = { call, put, expiry, day, offset, budget };
    $("strangle-call-title").textContent = `${call.strike} CE · ${call.lots} lot${call.lots === 1 ? "" : "s"}`;
    $("strangle-call-detail").textContent = `${Math.abs(call.actualOTM)} points ${call.actualOTM < 0 ? "ITM" : call.actualOTM === 0 ? "ATM" : "OTM"} · ${formatSmartMoney(call.estimatedCost)} total`;
    $("strangle-put-title").textContent = `${put.strike} PE · ${put.lots} lot${put.lots === 1 ? "" : "s"}`;
    $("strangle-put-detail").textContent = `${Math.abs(put.actualOTM)} points ${put.actualOTM < 0 ? "ITM" : put.actualOTM === 0 ? "ATM" : "OTM"} · ${formatSmartMoney(put.estimatedCost)} total`;
    $("strangle-total-label").textContent = `Total · budget ${formatSmartMoney(budget)}`;
    const total = $("strangle-total-value");
    total.textContent = `${formatSmartMoney(spent)} · ${formatSmartMoney(Math.abs(remainder))} ${remainder >= 0 ? "under" : "over"}`;
    total.classList.toggle("over", remainder < 0);
    $("strangle-result").hidden = false;
    error.hidden = true;
    $("strangle-add").disabled = false;
    $("strangle-add").textContent = `Add strangle · ${formatSmartMoney(spent)}`;
  } catch (exception) {
    if (requestId !== smartStrangleRequest) return;
    error.textContent = exception.message || "Could not find a call and put for that budget.";
    error.hidden = false;
    $("strangle-add").textContent = "Add strangle";
  }
}
function addSmartStrangle() {
  const pick = window.smartStrangleResult;
  if (!pick || window.strangleMode !== "smart" || !$("strangle-dialog").open) return;
  const items = [pick.call, pick.put].map((leg) => ({
    expiry: pick.expiry,
    strike: Number(leg.strike),
    optionType: leg.type,
    lots: Number(leg.lots),
  }));
  if (items.some((item) =>
    !Number.isInteger(item.strike) ||
    !["CE", "PE"].includes(item.optionType) ||
    !Number.isInteger(item.lots) || item.lots < 1
  )) {
    $("strangle-error").textContent = "This strangle pick is no longer valid. Refresh the inputs and try again.";
    $("strangle-error").hidden = false;
    return;
  }
  const basketNumber = nextBasketNumber();
  invalidateResults();
  state.baskets.push({
    id: `basket-${Date.now()}`,
    name: `Basket ${basketNumber}`,
    customName: false,
    enabled: true,
    items,
  });
  saveState();
  renderBaskets();
  $("strangle-dialog").close();
  window.smartStrangleResult = null;
}
function scheduleSimpleStrangle() {
  clearTimeout(simpleStrangleDebounce);
  const requestId = ++simpleStrangleRequest;
  window.simpleStrangleResult = null;
  $("strangle-add").disabled = true;
  $("strangle-add").textContent = "Finding strikes…";
  $("simple-strangle-result").hidden = true;
  $("strangle-error").hidden = true;
  if (!$("strangle-dialog").open || window.strangleMode !== "simple") return;
  const expiry = $("expiry").value,
    day = dateField.value,
    input = $("simple-strangle-otm"),
    offset = Number(input.value),
    lots = Number($("simple-strangle-lots").value);
  if (input.value.trim() !== "" && Number.isFinite(offset) && offset >= 0)
    input.value = String(Math.min(10000, Math.round(offset / 50) * 50));
  if (!expiry || expiry < day || input.value.trim() === "" || !Number.isFinite(offset) || offset < 0 || offset > 10000 || !Number.isInteger(lots) || lots < 1 || lots > 10000) {
    if (!expiry || expiry < day) {
      $("strangle-error").textContent = "Choose an option expiry on or after the trading day.";
      $("strangle-error").hidden = false;
    }
    $("strangle-add").textContent = "Add strangle";
    return;
  }
  simpleStrangleDebounce = setTimeout(() => findSimpleStrangle(requestId), 250);
}
async function findSimpleStrangle(requestId = ++simpleStrangleRequest) {
  clearTimeout(simpleStrangleDebounce);
  simpleStrangleDebounce = null;
  if (window.strangleMode !== "simple") return;
  const expiry = $("expiry").value,
    day = dateField.value,
    input = $("simple-strangle-otm"),
    rawOffset = Number(input.value),
    lots = Number($("simple-strangle-lots").value),
    offset = Number.isFinite(rawOffset) && rawOffset >= 0
      ? Math.min(10000, Math.round(rawOffset / 50) * 50)
      : null;
  if (!expiry || expiry < day || offset === null || input.value.trim() === "" || !Number.isInteger(lots) || lots < 1 || lots > 10000) {
    $("strangle-add").disabled = true;
    $("strangle-add").textContent = "Add strangle";
    return;
  }
  input.value = String(offset);
  $("strangle-add").disabled = true;
  $("strangle-add").textContent = "Finding strikes…";
  try {
    const query = new URLSearchParams({ expiry, day, otmPoints: String(offset), lots: String(lots) }),
      response = await fetch(`/api/upstox/nifty-simple-strangle?${query}`),
      result = await response.json();
    if (requestId !== simpleStrangleRequest || window.strangleMode !== "simple") return;
    if (!response.ok) throw Error(result.error || "Could not find the matching call and put.");
    window.simpleStrangleResult = result;
    const renderLeg = (prefix, leg) => {
      $(`simple-${prefix}-title`).textContent = `${leg.strike} ${leg.type} · ${leg.lots} lot${leg.lots === 1 ? "" : "s"}`;
      $(`simple-${prefix}-detail`).textContent = `${Math.abs(leg.actualOTM)} points OTM · ${leg.estimatedCost === null ? "previous close unavailable" : `${formatSmartMoney(leg.estimatedCost)} total`}`;
    };
    renderLeg("call", result.call);
    renderLeg("put", result.put);
    $("simple-total-value").textContent = result.estimatedCost === null
      ? "Unavailable"
      : formatSmartMoney(result.estimatedCost);
    $("simple-strangle-result").hidden = false;
    $("strangle-error").hidden = true;
    $("strangle-add").disabled = false;
    $("strangle-add").textContent = result.estimatedCost === null
      ? "Add strangle"
      : `Add strangle · ${formatSmartMoney(result.estimatedCost)}`;
  } catch (error) {
    if (requestId !== simpleStrangleRequest || window.strangleMode !== "simple") return;
    $("strangle-error").textContent = error.message || "Could not find the matching call and put.";
    $("strangle-error").hidden = false;
    $("strangle-add").textContent = "Add strangle";
  }
}
function addSimpleStrangle() {
  const pick = window.simpleStrangleResult;
  if (!pick || window.strangleMode !== "simple" || !$("strangle-dialog").open) return;
  const items = [pick.call, pick.put].map((leg) => ({
    expiry: pick.expiry,
    strike: Number(leg.strike),
    optionType: leg.type,
    lots: Number(leg.lots),
  }));
  if (items.some((item) => !Number.isInteger(item.strike) || !["CE", "PE"].includes(item.optionType))) {
    $("strangle-error").textContent = "This strangle selection is no longer valid. Refresh the distance and try again.";
    $("strangle-error").hidden = false;
    return;
  }
  const basketNumber = nextBasketNumber();
  invalidateResults();
  state.baskets.push({
    id: `basket-${Date.now()}`,
    name: `Basket ${basketNumber}`,
    customName: false,
    enabled: true,
    items,
  });
  saveState();
  renderBaskets();
  $("strangle-dialog").close();
  window.simpleStrangleResult = null;
}
function openBasketDialog(id) {
  window.renameBasketId = id;
  const basket = state.baskets.find((b) => b.id === id);
  $("basket-dialog-title").textContent = "Rename basket";
  $("basket-name").value = basketDisplayName(basket);
  $("basket-dialog").showModal();
  $("basket-name").focus();
}
function finishBasketDialog() {
  if ($("basket-dialog").returnValue !== "save") return;
  const name = $("basket-name").value.trim(),
    b = state.baskets.find((x) => x.id === window.renameBasketId);
  if (!name || !b) return;
  invalidateResults();
  b.name = name;
  b.customName = true;
  saveState();
  renderBaskets();
}
function openOptionDialog(id, index = null) {
  window.targetBasketId = id;
  window.editPositionIndex = index;
  const basket = state.baskets.find((b) => b.id === id),
    position = index === null ? null : basket?.items[index];
  $("option-basket-name").textContent = basket ? basketDisplayName(basket) : "";
  $("option-dialog-title").textContent = position
    ? "Edit option"
    : "Add option";
  setOptionMode("manual");
  $("option-mode-tabs").hidden = Boolean(position);
  $("smart-result").hidden = true;
  $("manual-option-preview").hidden = true;
  manualOptionPreviewRequest++;
  window.smartPickResult = null;
  $("option-submit").textContent = position ? "Save changes" : "Add option";
  window.manualOptionSeed = position;
  $("option-type-select").value = position?.optionType || "CE";
  $("lots").value = position?.lots || "1";
  $("option-error").hidden = true;
  if (position && $("expiry").value !== position.expiry) {
    $("expiry").value = position.expiry;
    loadOptionContracts();
  } else configureManualOptionFields(position);
  if (!$("expiry").value) {
    $("option-error").textContent = "Choose an option expiry above first.";
    $("option-error").hidden = false;
  }
  $("option-dialog").showModal();
  scheduleManualOptionPreview();
  $("option-type-select").focus();
}
function setOptionMode(mode) {
  clearTimeout(smartPickDebounce);
  smartPickRequest++;
  window.optionEntryMode = mode === "smart" ? "smart" : "manual";
  $("manual-option-fields").hidden = window.optionEntryMode === "smart";
  $("smart-option-fields").hidden = window.optionEntryMode !== "smart";
  document.querySelectorAll("[data-option-mode]").forEach((button) => {
    const active = button.dataset.optionMode === window.optionEntryMode;
    button.setAttribute("aria-pressed", String(active));
  });
  $("smart-result").hidden = true;
  $("manual-option-preview").hidden = true;
  manualOptionPreviewRequest++;
  window.smartPickResult = null;
  $("option-error").hidden = true;
  $("option-submit").textContent =
    window.optionEntryMode === "smart"
      ? "Refresh pick"
      : window.editPositionIndex === null || window.editPositionIndex === undefined
        ? "Add option"
        : "Save changes";
  if (window.optionEntryMode === "smart") scheduleSmartPick();
  else scheduleManualOptionPreview();
}
function formatSmartMoney(value) {
  return `₹${Number(value).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
function formatSmartDate(day) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${day}T00:00:00Z`));
}
function normalizeSmartOffset(value) {
  if (!Number.isFinite(value)) return null;
  return Math.max(-10000, Math.min(10000, Math.round(value / 50) * 50));
}
function formatMoneyness(points) {
  const distance = Math.abs(points);
  const state = points < 0 ? "ITM" : points > 0 ? "OTM" : "ATM";
  return `${distance} ${state}`;
}
async function findSmartOption() {
  clearTimeout(smartPickDebounce);
  smartPickDebounce = null;
  const otmInput = $("smart-otm-points");
  const enteredOffset = Number(otmInput.value);
  if (otmInput.value.trim() !== "" && Number.isFinite(enteredOffset)) {
    otmInput.value = String(normalizeSmartOffset(enteredOffset));
  }
  const expiry = $("expiry").value,
    day = dateField.value,
    type = $("smart-type").value,
    otmPoints = Number(otmInput.value),
    budget = Number($("smart-budget").value),
    submit = $("option-submit"),
    error = $("option-error");
  if (!expiry || expiry < day) {
    error.textContent = "Choose an option expiry on or after the trading day.";
    error.hidden = false;
    return;
  }
  if (
    otmInput.value.trim() === "" ||
    !Number.isInteger(otmPoints) ||
    otmPoints < -10000 ||
    otmPoints > 10000 ||
    !Number.isFinite(budget) ||
    budget < 1
  ) {
    error.textContent = "Enter a strike offset from −10,000 to 10,000 points and a premium budget.";
    error.hidden = false;
    return;
  }
  const requestId = ++smartPickRequest;
  window.smartPickResult = null;
  $("smart-result").hidden = true;
  error.hidden = true;
  submit.disabled = true;
  submit.textContent = "Finding a fit…";
  try {
    const query = new URLSearchParams({
        expiry,
        day,
        type,
        otmPoints: String(otmPoints),
        budget: String(budget),
      }),
      response = await fetch(`/api/upstox/nifty-smart-pick?${query}`),
      result = await response.json();
    if (requestId !== smartPickRequest) return;
    if (!response.ok) throw Error(result.error || "Could not find an option.");
    error.hidden = true;
    window.smartPickResult = {
      ...result,
      expiry,
      alternatives: (result.alternatives || []).map((option) => ({ ...option, expiry })),
    };
    const budgetDifference = result.remainingBudget >= 0
      ? `${formatSmartMoney(result.remainingBudget)} under ${formatSmartMoney(result.budget)}`
      : `${formatSmartMoney(-result.remainingBudget)} over ${formatSmartMoney(result.budget)}`;
    $("smart-result-title").textContent = `${result.strike} ${result.type} · ${result.lots} lot${result.lots === 1 ? "" : "s"}`;
    const detailRows = [
      ["Strike", `${formatMoneyness(result.requestedOTM)} target · ${formatMoneyness(result.actualOTM)} actual`],
      ["NIFTY", `${formatSmartMoney(result.underlyingClose)} · ${formatSmartDate(result.underlyingDate)}`],
      ["Option", `${formatSmartMoney(result.premiumClose)} × 65 = ${formatSmartMoney(result.premiumClose * 65)}/lot`],
      ["Budget", budgetDifference, result.remainingBudget >= 0 ? "smart-profit" : "smart-loss"],
    ];
    $("smart-result-details").replaceChildren(...detailRows.map(([label, value, tone]) => {
      const row = document.createElement("div");
      row.className = "smart-result-row";
      const name = document.createElement("span");
      name.textContent = label;
      const detail = document.createElement("span");
      detail.textContent = value;
      if (tone) detail.classList.add(tone);
      row.append(name, detail);
      return row;
    }));
    $("smart-add").textContent = `Add ${result.lots} lot${result.lots === 1 ? "" : "s"} · ${formatSmartMoney(result.estimatedCost)}`;
    const alternativeList = $("smart-alternative-list");
    alternativeList.replaceChildren(...(result.alternatives || []).map((option, index) => {
      const row = document.createElement("div");
      row.className = "smart-alternative-row";
      const copy = document.createElement("div");
      copy.className = "smart-alternative-copy";
      const title = document.createElement("strong");
      title.textContent = `${option.strike} ${option.type} · ${option.lots} lot${option.lots === 1 ? "" : "s"}`;
      const detail = document.createElement("span");
      detail.textContent = `${formatMoneyness(option.actualOTM)} · ${formatSmartMoney(option.premiumClose * 65)}/lot · ${formatSmartMoney(option.estimatedCost)} total`;
      const budget = document.createElement("span");
      budget.className = option.remainingBudget >= 0 ? "smart-profit" : "smart-loss";
      budget.textContent = `${formatSmartMoney(Math.abs(option.remainingBudget))} ${option.remainingBudget >= 0 ? "under" : "over"} budget`;
      copy.append(title, detail, budget);
      const add = document.createElement("button");
      add.type = "button";
      add.className = "smart-alternative-add";
      add.dataset.alternativeIndex = String(index);
      add.textContent = "Add";
      row.append(copy, add);
      return row;
    }));
    $("smart-alternatives").hidden = alternativeList.childElementCount === 0;
    $("smart-result").hidden = false;
  } catch (e) {
    if (requestId !== smartPickRequest) return;
    error.textContent = e.message;
    error.hidden = false;
  } finally {
    if (requestId === smartPickRequest) {
      submit.disabled = false;
      submit.textContent = "Refresh pick";
    }
  }
}
$("smart-otm-points").addEventListener("change", (event) => {
  const input = event.currentTarget;
  const value = Number(input.value);
  if (input.value.trim() === "" || !Number.isFinite(value)) return;
  input.value = String(normalizeSmartOffset(value));
});
function scheduleSmartPick() {
  clearTimeout(smartPickDebounce);
  smartPickRequest++;
  window.smartPickResult = null;
  $("smart-result").hidden = true;
  $("option-error").hidden = true;
  if (window.optionEntryMode === "smart") {
    $("option-submit").disabled = false;
    $("option-submit").textContent = "Refresh pick";
  }
  if (window.optionEntryMode !== "smart") return;
  const expiry = $("expiry").value;
  const day = dateField.value;
  const otmPoints = Number($("smart-otm-points").value);
  const budget = Number($("smart-budget").value);
  if (
    !expiry ||
    expiry < day ||
    $("smart-otm-points").value.trim() === "" ||
    !Number.isFinite(otmPoints) ||
    otmPoints < -10000 ||
    otmPoints > 10000 ||
    !Number.isFinite(budget) ||
    budget < 1
  ) return;
  smartPickDebounce = setTimeout(() => findSmartOption(), 400);
}
$("smart-otm-points").addEventListener("input", scheduleSmartPick);
$("smart-otm-points").addEventListener("change", scheduleSmartPick);
$("smart-budget").addEventListener("input", scheduleSmartPick);
$("smart-type").addEventListener("change", scheduleSmartPick);
$("expiry").addEventListener("change", scheduleSmartPick);
dateField.addEventListener("change", scheduleSmartPick);
function addSmartPosition(suggestion = window.smartPickResult) {
  if (suggestion instanceof Event) suggestion = window.smartPickResult;
  if (!suggestion) return;
  const position = {
    expiry: suggestion.expiry || window.smartPickResult?.expiry || $("expiry").value,
    strike: Number(suggestion.strike),
    optionType: String(suggestion.type || "").toUpperCase(),
    lots: Number(suggestion.lots),
  };
  if (
    !position.expiry ||
    position.expiry < dateField.value ||
    !Number.isInteger(position.strike) ||
    !["CE", "PE"].includes(position.optionType) ||
    !Number.isInteger(position.lots) ||
    position.lots < 1
  ) {
    showError("This smart pick is no longer valid. Refresh it and try again.");
    return;
  }
  addPosition(position);
}
$("smart-alternative-list").addEventListener("click", (event) => {
  const button = event.target.closest("[data-alternative-index]");
  if (!button) return;
  const index = Number(button.dataset.alternativeIndex);
  const option = window.smartPickResult?.alternatives?.[index];
  if (option) addSmartPosition(option);
});
function epoch(day) {
  return Math.floor(new Date(`${day}T00:00:00Z`).getTime() / 1000);
}
function addDays(day, n) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function istDay(ts) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(new Date(ts * 1000));
}
function money(v) {
  return (
    "₹" +
    Math.abs(v).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}
function signed(v) {
  return `${v >= 0 ? "+" : "−"}${money(v)}`;
}
function time(ts) {
  return new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Kolkata",
  }).format(new Date(ts * 1000));
}
function positionName(p) {
  return `NIFTY ${p.strike} ${p.optionType} · ${p.expiry}`;
}
function basketDisplayName(b) {
  if (
    b.customName === true ||
    (b.customName !== false && b.name && !/^Basket\s+\d+$/i.test(b.name))
  )
    return b.name;
  const items = b.items || [];
  if (!items.length) return b.name || "Basket";
  const expiries = [...new Set(items.map((p) => p.expiry))],
    expiryLabel =
      expiries.length === 1
        ? new Intl.DateTimeFormat("en-IN", {
            day: "numeric",
            month: "short",
            timeZone: "UTC",
          }).format(new Date(`${expiries[0]}T00:00:00Z`))
        : "";
  if (items.length === 1)
    return `${items[0].strike} ${items[0].optionType}${expiryLabel ? ` · ${expiryLabel}` : ""}`;
  if (items.length === 2 && expiries.length === 1) {
    const call = items.find((p) => p.optionType === "CE"),
      put = items.find((p) => p.optionType === "PE");
    if (call && put) {
      if (call.strike === put.strike)
        return `Long Straddle · ${call.strike}${expiryLabel ? ` · ${expiryLabel}` : ""}`;
      if (call.strike > put.strike)
        return `Long Strangle · ${put.strike}/${call.strike}${expiryLabel ? ` · ${expiryLabel}` : ""}`;
      return `Reverse Strangle · ${call.strike}/${put.strike}${expiryLabel ? ` · ${expiryLabel}` : ""}`;
    }
    if (items.every((p) => p.optionType === items[0].optionType)) {
      const side = items[0].optionType === "CE" ? "Call" : "Put",
        strikes = items
          .map((p) => p.strike)
          .sort((a, b) => a - b)
          .join("/");
      return `${side} pair · ${strikes}${expiryLabel ? ` · ${expiryLabel}` : ""}`;
    }
  }
  return expiries.length === 1
    ? `${items.length}-leg combo${expiryLabel ? ` · ${expiryLabel}` : ""}`
    : `Multi-expiry · ${items.length} legs`;
}
function updateUpstoxStatus(label = null) {
  const button = $("upstox-status");
  if (!button) return;
  button.textContent =
    label || (window.upstoxConnected ? "Upstox connected" : "Connect Upstox");
  button.classList.toggle(
    "connected",
    Boolean(window.upstoxConnected) && !label,
  );
  button.setAttribute(
    "aria-label",
    window.upstoxConnected
      ? "Manage Upstox connection"
      : "Connect Upstox market data",
  );
}
function showUpstoxDialog() {
  const dialog = $("token-dialog");
  $("token-error").hidden = true;
  $("token-disconnect").hidden = !window.upstoxConnected;
  if (!dialog.open) dialog.showModal();
  if (!window.upstoxConnected) setTimeout(() => $("upstox-token").focus(), 0);
}
async function saveUpstoxToken(e) {
  e.preventDefault();
  const token = $("upstox-token").value.trim(),
    error = $("token-error"),
    previous = localStorage.getItem(UPSTOX_TOKEN_KEY);
  if (!token) {
    error.textContent = "Enter your Upstox API access token.";
    error.hidden = false;
    return;
  }
  const submit = $("token-submit");
  submit.disabled = true;
  submit.textContent = "Checking token…";
  error.hidden = true;
  try {
    localStorage.setItem(UPSTOX_TOKEN_KEY, token);
    const r = await fetch("/api/upstox/config", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accessToken: token }),
      }),
      j = await r.json();
    if (!r.ok) throw Error(j.error || "Could not connect to Upstox.");
    window.upstoxConnected = true;
    $("token-dialog").close();
    $("upstox-token").value = "";
    updateUpstoxStatus("Loading expiries…");
    const loaded = await loadExpiries();
    if (loaded) {
      updateUpstoxStatus();
      scheduleRefresh();
    } else {
      window.upstoxConnected = false;
      updateUpstoxStatus();
      showUpstoxDialog();
    }
  } catch (err) {
    if (previous) localStorage.setItem(UPSTOX_TOKEN_KEY, previous);
    else localStorage.removeItem(UPSTOX_TOKEN_KEY);
    window.upstoxConnected = false;
    updateUpstoxStatus();
    error.textContent = err.message;
    error.hidden = false;
    if (!$("token-dialog").open) $("token-dialog").showModal();
  } finally {
    submit.disabled = false;
    submit.textContent = "Connect";
  }
}
async function disconnectUpstox() {
  localStorage.removeItem(UPSTOX_TOKEN_KEY);
  try {
    await fetch("/api/upstox/config", { method: "DELETE" });
  } catch {}
  window.upstoxConnected = false;
  updateUpstoxStatus();
  $("token-dialog").close();
  $("expiry").disabled = true;
  $("expiry").replaceChildren(
    new Option("Connect Upstox to load expiries", ""),
  );
  setManualControlsEnabled(false);
}
async function checkUpstox() {
  const expiry = $("expiry");
  expiry.disabled = true;
  expiry.replaceChildren(new Option("Checking Upstox…", ""));
  updateUpstoxStatus("Checking Upstox…");
  try {
    const r = await fetch("/api/upstox/config"),
      j = await r.json();
    if (!j.connected) {
      window.upstoxConnected = false;
      updateUpstoxStatus();
      expiry.replaceChildren(new Option("Connect Upstox to load expiries", ""));
      showUpstoxDialog();
      return;
    }
    window.upstoxConnected = true;
    updateUpstoxStatus("Loading expiries…");
    const loaded = await loadExpiries();
    if (loaded) {
      updateUpstoxStatus();
      scheduleRefresh();
    }
    else {
      window.upstoxConnected = false;
      updateUpstoxStatus();
      showUpstoxDialog();
    }
  } catch {
    window.upstoxConnected = false;
    updateUpstoxStatus();
    expiry.replaceChildren(new Option("Could not load expiries", ""));
    showUpstoxDialog();
  }
}
async function loadExpiries() {
  const select = $("expiry");
  select.disabled = true;
  select.replaceChildren(new Option("Loading expiries…", ""));
  try {
    const r = await fetch("/api/upstox/nifty-expiries"),
      j = await r.json();
    if (!r.ok) throw Error(j.error || "Could not load expiries.");
    window.availableExpiries = j.expiries || [];
    if (!window.availableExpiries.length)
      throw Error(
        "Upstox returned no NIFTY 50 expiries. Check your token and try again.",
      );
    window.expiredOptionsAvailable = j.expiredAvailable;
    renderExpiries();
    if (select.value) await loadOptionContracts();
    scheduleSmartStrangle();
    return true;
  } catch (e) {
    select.replaceChildren(new Option("Could not load expiries", ""));
    select.disabled = true;
    setManualControlsEnabled(false);
    showError(e.message);
    return false;
  }
}
function renderExpiries() {
  const select = $("expiry"),
    previous = select.value,
    day = dateField.value,
    values = (window.availableExpiries || []).filter((d) => !day || d >= day);
  select.replaceChildren();
  if (!values.length) {
    select.add(
      new Option(
        window.availableExpiries?.length
          ? "No expiry on or after trading day"
          : "Option expiry unavailable",
        "",
      ),
    );
    select.disabled = true;
    setManualControlsEnabled(false);
    return;
  }
  values.forEach((d) =>
    select.add(
      new Option(
        new Intl.DateTimeFormat("en-IN", {
          day: "numeric",
          month: "short",
          year: "numeric",
          timeZone: "UTC",
        }).format(new Date(`${d}T00:00:00Z`)),
        d,
      ),
    ),
  );
  select.disabled = false;
  select.value = values.includes(previous) ? previous : values[0];
}
async function loadOptionContracts() {
  const expiry = $("expiry").value,
    day = dateField.value,
    requestId = ++optionContractsRequest;
  window.expiryOptions = [];
  setManualControlsEnabled(false);
  if (!expiry) {
    return;
  }
  try {
    const r = await fetch(
        `/api/upstox/nifty-options?${new URLSearchParams({ expiry, day })}`,
      ),
      j = await r.json();
    if (requestId !== optionContractsRequest) return;
    if (!r.ok) throw Error(j.error || "Could not load options.");
    window.expiryOptions = j.options || [];
    window.niftyReferenceClose = Number(j.referenceClose) || null;
    window.niftyReferenceCloseDay = day;
    window.niftyReferenceDate = j.referenceDate || null;
    $("strike-reference").textContent = window.niftyReferenceClose
      ? `NIFTY prior close ${formatSmartMoney(window.niftyReferenceClose)} · ${formatSmartDate(j.referenceDate)}`
      : "Prior close unavailable";
    setManualControlsEnabled(window.expiryOptions.length > 0);
    configureManualOptionFields(window.manualOptionSeed || null);
    window.manualOptionSeed = null;
    scheduleManualOptionPreview();
  } catch (e) {
    if (requestId !== optionContractsRequest) return;
    setManualControlsEnabled(false);
    showError(e.message);
  }
}
function setManualControlsEnabled(enabled) {
  $("option-type-select").disabled = !enabled;
  $("strike-input").disabled = !enabled;
}
function listedStrikes(type = $("option-type-select").value) {
  return [...new Set((window.expiryOptions || [])
    .filter((option) => option.type === type)
    .map((option) => Number(option.strike))
    .filter(Number.isFinite))].sort((a, b) => a - b);
}
function configureManualOptionFields(position = null) {
  const type = position?.optionType || $("option-type-select").value || "CE",
    referenceClose = window.niftyReferenceCloseDay === dateField.value
      ? window.niftyReferenceClose
      : null,
    target = position?.strike ?? (referenceClose === null
      ? null
      : Math.round(referenceClose / 50) * 50);
  $("option-type-select").value = type;
  $("lots").value = String(position?.lots || $("lots").value || 1);
  setManualStrike(target);
  scheduleManualOptionPreview();
}
function setManualStrike(target = null) {
  const strikes = listedStrikes();
  if (!strikes.length) {
    $("strike-input").value = "";
    return;
  }
  const desired = target !== null && target !== undefined && Number.isFinite(Number(target))
    ? Number(target)
    : (window.niftyReferenceCloseDay === dateField.value && window.niftyReferenceClose !== null
      ? Math.round(window.niftyReferenceClose / 50) * 50
      : strikes[0]);
  const strike = strikes.reduce((best, value) =>
    Math.abs(value - desired) < Math.abs(best - desired) ? value : best,
  );
  $("strike-input").value = String(strike);
}
function scheduleManualOptionPreview() {
  clearTimeout(manualOptionPreviewDebounce);
  const requestId = ++manualOptionPreviewRequest;
  $("manual-option-preview").hidden = true;
  if (
    window.optionEntryMode !== "manual" ||
    !$("option-dialog").open ||
    !$("expiry").value ||
    !window.expiryOptions?.length
  ) return;
  const type = $("option-type-select").value,
    strike = Number($("strike-input").value),
    lots = Number($("lots").value),
    reference = window.niftyReferenceCloseDay === dateField.value
      ? window.niftyReferenceClose
      : null,
    contract = window.expiryOptions.find((option) =>
      option.type === type && Number(option.strike) === strike,
    );
  if (!contract || !Number.isInteger(lots) || lots < 1 || !reference) return;
  manualOptionPreviewDebounce = setTimeout(
    () => loadManualOptionPreview({ requestId, type, strike, lots, reference }),
    250,
  );
}
async function loadManualOptionPreview({ requestId, type, strike, lots, reference }) {
  const preview = $("manual-option-preview");
  preview.hidden = false;
  $("manual-option-preview-title").textContent = `${strike} ${type} · ${lots} lot${lots === 1 ? "" : "s"}`;
  $("manual-option-preview-total").textContent = "Loading…";
  const loading = document.createElement("div");
  loading.className = "manual-option-preview-row";
  const loadingLabel = document.createElement("span");
  loadingLabel.textContent = "PRICE";
  const loadingText = document.createElement("span");
  loadingText.textContent = "Loading option price…";
  loading.append(loadingLabel, loadingText);
  $("manual-option-preview-details").replaceChildren(loading);
  try {
    const query = new URLSearchParams({
        expiry: $("expiry").value,
        day: dateField.value,
        type,
        strike: String(strike),
      }),
      response = await fetch(`/api/upstox/nifty-option-quote?${query}`),
      result = await response.json();
    if (requestId !== manualOptionPreviewRequest) return;
    if (!response.ok) throw Error(result.error || "Could not load this option price.");
    const lotSize = Number(result.lotSize) || 65,
      premium = Number(result.premiumPrice),
      perLot = premium * lotSize,
      total = perLot * lots,
      actualOffset = Math.round(type === "CE" ? strike - reference : reference - strike),
      rows = [
        ["DISTANCE", `${formatMoneyness(actualOffset)} from prior close`],
        ["NIFTY", window.niftyReferenceDate
          ? `${formatSmartMoney(reference)} · ${formatSmartDate(window.niftyReferenceDate)}`
          : formatSmartMoney(reference)],
        ["PREMIUM/LOT", Number.isFinite(premium) && premium > 0
          ? `${formatSmartMoney(premium)} × ${lotSize} = ${formatSmartMoney(perLot)} · ${formatSmartDate(result.premiumDate)} close`
          : "Previous-session close unavailable"],
        ...(Number(result.currentPrice) > 0
          ? [["TODAY’S LTP", formatSmartMoney(Number(result.currentPrice))]]
          : []),
      ];
    $("manual-option-preview-total").textContent =
      Number.isFinite(premium) && premium > 0
        ? formatSmartMoney(total)
        : "Unavailable";
    $("manual-option-preview-details").replaceChildren(...rows.map(([label, value]) => {
      const row = document.createElement("div");
      row.className = "manual-option-preview-row";
      const name = document.createElement("span");
      name.textContent = label;
      const detail = document.createElement("span");
      detail.textContent = value;
      row.append(name, detail);
      return row;
    }));
  } catch (error) {
    if (requestId !== manualOptionPreviewRequest) return;
    $("manual-option-preview-total").textContent = "Unavailable";
    const row = document.createElement("div");
    row.className = "manual-option-preview-row";
    const name = document.createElement("span");
    name.textContent = "PRICE";
    const detail = document.createElement("span");
    detail.textContent = error.message || "Option price unavailable";
    row.append(name, detail);
    $("manual-option-preview-details").replaceChildren(row);
  }
}
function formPosition() {
  const expiry = $("expiry").value,
    strike = Number($("strike-input").value),
    optionType = $("option-type-select").value,
    lots = Number($("lots").value);
  if (!expiry || expiry < dateField.value || !Number.isInteger(strike))
    return showError("Choose an expiry and select a NIFTY option.");
  if (!listedStrikes(optionType).includes(strike))
    return showError("Choose a listed strike for that option type.");
  if (!Number.isInteger(lots) || lots < 1)
    return showError("Enter a whole-number lot count of at least 1.");
  return { expiry, strike, optionType, lots };
}
function addPosition(position = null) {
  const p = position || formPosition(),
    basket = state.baskets.find((b) => b.id === window.targetBasketId);
  if (!p || !basket) return;
  invalidateResults();
  if (
    window.editPositionIndex === null ||
    window.editPositionIndex === undefined
  )
    basket.items.push(p);
  else basket.items[window.editPositionIndex] = p;
  window.editPositionIndex = null;
  saveState();
  renderBaskets();
  $("error").hidden = true;
  $("option-dialog").close();
}
async function upstoxHistory(
  instrumentKey,
  from,
  to,
  interval,
  expired,
  expiry,
) {
  const q = new URLSearchParams({
      instrumentKey,
      from,
      to,
      interval,
      expired: String(expired),
      ...(expiry ? { expiry } : {}),
    }),
    r = await fetch(`/api/upstox/history?${q}`),
    j = await r.json();
  if (!r.ok) throw Error(j.error || "Could not load option history.");
  return j;
}
async function loadNiftyIndex(day, interval) {
  const q = new URLSearchParams({ day, interval }),
    r = await fetch(`/api/upstox/nifty-index-history?${q}`),
    j = await r.json();
  if (!r.ok) throw Error(j.error || "Could not load NIFTY 50 prices.");
  let points = (j.candles || [])
    .map((c) => ({
      t: Math.floor(new Date(c[0]).getTime() / 1000),
      value: Number(c[4]),
    }))
    .filter((p) => istDay(p.t) === day && Number.isFinite(p.value))
    .sort((a, b) => a.t - b.t);
  if (!points.length) {
    const yahooInterval = {
        "1minute": "1m",
        "5minute": "5m",
        "15minute": "15m",
        "30minute": "30m",
      }[interval],
      yq = new URLSearchParams({
        symbol: "^NSEI",
        period1: String(epoch(day)),
        period2: String(epoch(addDays(day, 1))),
        interval: yahooInterval,
      }),
      yr = await fetch(`/api/chart?${yq}`),
      yj = await yr.json(),
      result = yj.chart?.result?.[0],
      timestamps = result?.timestamp || [],
      closes = result?.indicators?.quote?.[0]?.close || [];
    points = timestamps
      .map((t, i) => ({ t, value: Number(closes[i]) }))
      .filter((p) => istDay(p.t) === day && Number.isFinite(p.value))
      .sort((a, b) => a.t - b.t);
  }
  if (!points.length)
    throw Error(
      `No ${interval.replace("minute", "-minute ")}prices were returned for NIFTY 50.`,
    );
  points.previousClose = Number(j.previousClose) || points[0].value;
  return points;
}
async function resolveNiftyOption(expiry, strike, type) {
  const q = new URLSearchParams({ expiry, strike: String(strike), type }),
    r = await fetch(`/api/upstox/nifty-contract?${q}`),
    j = await r.json();
  if (!r.ok) throw Error(j.error || "Could not find that NIFTY option.");
  return j;
}
async function calculatePosition(p, day, interval) {
  const contract = await resolveNiftyOption(p.expiry, p.strike, p.optionType),
    expired = p.expiry < todayLocal,
    multiplier = p.lots * 65,
    [intra, daily] = await Promise.all([
      upstoxHistory(
        contract.instrumentKey,
        day,
        addDays(day, 1),
        interval,
        expired,
        p.expiry,
      ),
      upstoxHistory(
        contract.instrumentKey,
        addDays(day, -14),
        addDays(day, 1),
        "day",
        expired,
        p.expiry,
      ),
    ]);
  if (!daily.candles?.length)
    throw Error(`No daily prices found for ${positionName(p)}.`);
  const dailyCandles = daily.candles
      .map((c) => ({
        t: Math.floor(new Date(c[0]).getTime() / 1000),
        close: Number(c[4]),
      }))
      .filter((x) => Number.isFinite(x.t) && Number.isFinite(x.close))
      .sort((a, b) => a.t - b.t),
    prior = dailyCandles.filter((x) => istDay(x.t) < day);
  if (!prior.length)
    throw Error(`${positionName(p)} has no previous trading-session close.`);
  const priorClose = prior.at(-1),
    buy = priorClose.close,
    buyDate = istDay(priorClose.t),
    candles = (intra.candles || [])
      .map((c) => ({
        t: Math.floor(new Date(c[0]).getTime() / 1000),
        close: Number(c[4]),
      }))
      .filter((x) => istDay(x.t) === day && Number.isFinite(x.close))
      .sort((a, b) => a.t - b.t);
  if (!candles.length)
    throw Error(
      `No ${interval.replace("minute", "-minute ")}prices were returned for ${positionName(p)}.`,
    );
  const close = candles.at(-1).close,
    ending = (close - buy) * multiplier,
    points = candles.map((c) => ({
      t: c.t,
      pnl: (c.close - buy) * multiplier,
    }));
  return {
    name: positionName(p),
    buy,
    buyDate,
    close,
    multiplier,
    ending,
    points,
  };
}
const SCENARIO_RATE = 0.0573,
  SECONDS_PER_YEAR = 365.25 * 86400;
function normalCdf(x) {
  const z = Math.abs(x),
    t = 1 / (1 + 0.2316419 * z),
    d = 0.3989422804014327 * Math.exp((-z * z) / 2),
    p =
      1 -
      d *
        t *
        (0.31938153 +
          t *
            (-0.356563782 +
              t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? p : 1 - p;
}
function blackScholesPrice(
  spot,
  strike,
  T,
  sigma,
  type,
  rate = SCENARIO_RATE,
  dividend = 0,
) {
  const intrinsic = Math.max(0, type === "CE" ? spot - strike : strike - spot);
  if (T <= 0 || sigma <= 0) return intrinsic;
  const root = Math.sqrt(T),
    d1 =
      (Math.log(spot / strike) + (rate - dividend + (sigma * sigma) / 2) * T) /
      (sigma * root),
    d2 = d1 - sigma * root,
    price =
      type === "CE"
        ? spot * Math.exp(-dividend * T) * normalCdf(d1) -
          strike * Math.exp(-rate * T) * normalCdf(d2)
        : strike * Math.exp(-rate * T) * normalCdf(-d2) -
          spot * Math.exp(-dividend * T) * normalCdf(-d1);
  return Math.max(0, price);
}
function impliedVolatility(market, spot, strike, T, type) {
  if (T <= 0 || market <= 0 || spot <= 0) return null;
  const intrinsic = Math.max(0, type === "CE" ? spot - strike : strike - spot);
  if (market + 1e-5 < intrinsic) return null;
  let lo = 0.0001,
    hi = 5;
  if (blackScholesPrice(spot, strike, T, hi, type) < market) return null;
  for (let i = 0; i < 90; i++) {
    const mid = (lo + hi) / 2;
    if (blackScholesPrice(spot, strike, T, mid, type) < market) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
function inferScenarioVol(result, position, indexPoints, day) {
  const previousSpot = Number(indexPoints.previousClose),
    Tbuy = Math.max(
      0,
      (Date.parse(`${position.expiry}T10:00:00Z`) -
        Date.parse(`${result.buyDate}T10:00:00Z`)) /
        1000 /
        SECONDS_PER_YEAR,
    );
  if (previousSpot && Tbuy > 0) {
    const vol = impliedVolatility(
      result.buy,
      previousSpot,
      position.strike,
      Tbuy,
      position.optionType,
    );
    if (Number.isFinite(vol)) return vol;
  }
  const ts = indexPoints.map((p) => p.t),
    last = result.points.at(-1),
    spot = last ? indexPoints[nearestTimeIndex(ts, last.t)]?.value : null,
    T = Math.max(
      0,
      (Date.parse(`${position.expiry}T10:00:00Z`) -
        Date.parse(`${day}T10:00:00Z`)) /
        1000 /
        SECONDS_PER_YEAR,
    );
  if (spot && T > 0) {
    const vol = impliedVolatility(
      result.close,
      spot,
      position.strike,
      T,
      position.optionType,
    );
    if (Number.isFinite(vol)) return vol;
  }
  return null;
}
function scenarioPnlAt(legs, spot) {
  return legs.reduce(
    (sum, leg) =>
      sum +
      (Math.max(
        0,
        blackScholesPrice(spot, leg.strike, leg.T, leg.sigma, leg.type) +
          leg.anchorAdjustment,
      ) -
        leg.buy) *
        leg.multiplier,
    0,
  );
}
function buildScenario(basket, positions, indexPoints, day, fallbackVol = 0.2) {
  if (!indexPoints?.length) return { error: "NIFTY close is unavailable." };
  const actualSpot = indexPoints.at(-1).value,
    legs = [];
  let fallbackCount = 0;
  for (const result of positions) {
    const position = basket.items[result.index];
    if (!position) return { error: "Option close is unavailable." };
    const T = Math.max(
      0,
      (Date.parse(`${position.expiry}T10:00:00Z`) -
        Date.parse(`${day}T10:00:00Z`)) /
        1000 /
        SECONDS_PER_YEAR,
    );
    let sigma =
      T > 0 ? inferScenarioVol(result, position, indexPoints, day) : 0;
    if (T > 0 && !Number.isFinite(sigma)) {
      sigma = fallbackVol;
      fallbackCount++;
    }
    const modelAtClose = blackScholesPrice(
      actualSpot,
      position.strike,
      T,
      sigma,
      position.optionType,
    );
    legs.push({
      strike: position.strike,
      type: position.optionType,
      T,
      sigma,
      buy: result.buy,
      close: result.close,
      multiplier: result.multiplier,
      anchorAdjustment: result.close - modelAtClose,
    });
  }
  const strikes = legs.map((x) => x.strike),
    min = Math.max(
      1,
      Math.min(actualSpot * 0.9, ...strikes.map((x) => x * 0.92)),
    ),
    max = Math.max(actualSpot * 1.1, ...strikes.map((x) => x * 1.08)),
    spots = Array.from({ length: 121 }, (_, i) => min + ((max - min) * i) / 120)
      .concat(actualSpot)
      .sort((a, b) => a - b)
      .filter((spot, i, all) => i === 0 || spot - all[i - 1] > 1e-8),
    points = spots.map((spot) => ({ spot, pnl: scenarioPnlAt(legs, spot) }));
  return { actualSpot, points, legs, fallbackCount, fallbackVol };
}
function combineBasket(results) {
  const times = [
      ...new Set(results.flatMap((r) => r.points.map((p) => p.t))),
    ].sort((a, b) => a - b),
    values = results.map(() => 0),
    idx = results.map(() => 0);
  return times.map((t) => {
    results.forEach((r, i) => {
      while (idx[i] < r.points.length && r.points[idx[i]].t <= t) {
        values[i] = r.points[idx[i]].pnl;
        idx[i]++;
      }
    });
    return { t, pnl: values.reduce((a, b) => a + b, 0) };
  });
}
async function loadTrade(generation = ++requestGeneration) {
  const day = dateField.value,
    statBaskets = state.baskets.filter(
      (b) => b.enabled !== false && b.items.some((p) => p.enabled !== false),
    ),
    chartBaskets = statBaskets;
  if (!day) {
    $("output").hidden = true;
    window.chartData = null;
    window.miniChartData = null;
    window.basketPnlResults = {};
    renderBaskets();
    return;
  }
  if (!statBaskets.length) {
    await loadNiftyOnly(day, $("interval").value, generation);
    return;
  }
  $("pnl-plot").hidden = false;
  $("percent-plot").hidden = false;
  if (
    statBaskets.some((b) =>
      b.items.some((p) => p.enabled !== false && p.expiry < day),
    )
  ) {
    $("output").hidden = true;
    showError("An option expiry must be on or after the selected day.");
    return;
  }
  $("error").hidden = true;
  $("output").hidden = !chartBaskets.length;
  if (chartBaskets.length) $("output").classList.add("loading");
  $("empty").hidden = true;
  $("chart-tooltip").hidden = true;
  const ctx = chartCanvas.getContext("2d");
  ctx.clearRect(0, 0, chartCanvas.width, chartCanvas.height);
  try {
    const interval = $("interval").value,
      indexPromise = loadNiftyIndex(day, interval)
        .then((points) => ({ points }))
        .catch((error) => ({ error: error.message })),
      basketResults = await Promise.all(
        statBaskets.map(async (b) => {
          try {
            const selected = b.items
                .map((position, index) => ({ position, index }))
                .filter((x) => x.position.enabled !== false),
              positions = await Promise.all(
                selected.map(async (x) => ({
                  ...(await calculatePosition(x.position, day, interval)),
                  index: x.index,
                })),
              ),
              buyValue = positions.reduce(
                (sum, p) => sum + p.buy * p.multiplier,
                0,
              ),
              closeValue = positions.reduce(
                (sum, p) => sum + p.close * p.multiplier,
                0,
              ),
              ending = closeValue - buyValue;
            return {
              value: {
                id: b.id,
                name: basketDisplayName(b),
                enabled: b.enabled !== false,
                color: basketLineColor(
                  state.baskets.indexOf(b),
                  b.accentColor,
                ),
                positions,
                points: combineBasket(positions),
                buyValue,
                closeValue,
                ending,
                percent: buyValue ? (ending / buyValue) * 100 : 0,
              },
            };
          } catch (error) {
            return { error, basket: b };
          }
        }),
      ),
      data = basketResults.flatMap((result) =>
        result.value ? [result.value] : [],
      ),
      unavailableBaskets = basketResults.filter((result) => result.error);
    if (generation !== requestGeneration) return;
    const indexResult = await indexPromise;
    if (generation !== requestGeneration) return;
    if (unavailableBaskets.length) {
      const names = unavailableBaskets
        .map((result) => basketDisplayName(result.basket))
        .join(", ");
      showError(
        `${names} could not be priced at ${interval.replace("minute", "-minute ")}resolution and were left out of the P&L charts. ${unavailableBaskets[0].error.message}`,
      );
    }
    const basketVols = data
        .flatMap((b) => {
          const basket = state.baskets.find((x) => x.id === b.id);
          return basket
            ? b.positions
                .map((position) =>
                  inferScenarioVol(
                    position,
                    basket.items[position.index],
                    indexResult.points || [],
                    day,
                  ),
                )
                .filter(Number.isFinite)
            : [];
        })
        .sort((a, b) => a - b),
      portfolioVol = basketVols.length
        ? basketVols[Math.floor(basketVols.length / 2)]
        : 0.2;
    data.forEach((b) => {
      const basket = state.baskets.find((x) => x.id === b.id);
      b.scenario = basket
        ? buildScenario(
            basket,
            b.positions,
            indexResult.points,
            day,
            portfolioVol,
          )
        : null;
    });
    window.basketPnlResults = Object.fromEntries(
      data.map((b) => [
        b.id,
        {
          day,
          ending: b.ending,
          buyValue: b.buyValue,
          closeValue: b.closeValue,
          percent: b.percent,
          positions: b.positions,
          points: b.points,
          scenario: b.scenario,
        },
      ]),
    );
    renderBaskets();
    if (!data.length) {
      $("pnl-plot").hidden = true;
      $("percent-plot").hidden = true;
      const times = (indexResult.points || []).map((point) => point.t),
        xRange = times.length
          ? { start: times[0], end: times.at(-1) }
          : { start: 0, end: 0 };
      window.chartXRange = xRange;
      $("title").textContent = "Options P&L";
      $("dates").textContent = formatDate(day);
      $("chart-range").textContent = times.length
        ? `${time(times[0])} – ${time(times.at(-1))} IST · ${interval.replace("minute", "-minute")}`
        : "NIFTY 50 data unavailable";
      $("output").classList.remove("loading");
      window.chartData = null;
      window.miniChartData = {
        index: indexResult,
        percent: { times, series: [] },
        xRange,
      };
      drawMiniPlots(window.miniChartData);
      return;
    }
    if (!chartBaskets.length) {
      $("output").hidden = true;
      $("output").classList.remove("loading");
      window.chartData = null;
      return;
    }
    const compared = data.filter((b) => b.enabled),
      times = [
        ...new Set(compared.flatMap((b) => b.points.map((p) => p.t))),
      ].sort((a, b) => a - b),
      indices = compared.map(() => 0),
      current = compared.map(() => 0),
      series = times.map((t) => {
        compared.forEach((b, i) => {
          while (indices[i] < b.points.length && b.points[indices[i]].t <= t) {
            current[i] = b.points[indices[i]].pnl;
            indices[i]++;
          }
        });
        return { t, values: [...current] };
      });
    const percentSeries = compared.map((b, j) => ({
        id: b.id,
        name: b.name,
        color: b.color,
        values: series.map((point) =>
          b.buyValue ? (point.values[j] / b.buyValue) * 100 : 0,
        ),
      })),
      allTimes = [
        ...times,
        ...(indexResult.points || []).map((point) => point.t),
      ],
      xRange = { start: Math.min(...allTimes), end: Math.max(...allTimes) };
    window.chartXRange = xRange;
    $("title").textContent = "Options P&L";
    $("dates").textContent = formatDate(day);
    $("chart-range").textContent =
      `${time(times[0])} – ${time(times.at(-1))} IST · ${interval.replace("minute", "-minute")}`;
    renderLegend(compared);
    $("output").classList.remove("loading");
    window.chartData = { times, series, baskets: compared, xRange };
    window.miniChartData = {
      index: indexResult,
      percent: { times, series: percentSeries },
      xRange,
    };
    draw(window.chartData);
    drawMiniPlots(window.miniChartData);
  } catch (e) {
    if (generation === requestGeneration) {
      $("output").hidden = true;
      showError(e.message || "Could not load prices.");
    }
  }
}
async function loadNiftyOnly(day, interval, generation) {
  $("pnl-plot").hidden = true;
  $("percent-plot").hidden = true;
  $("error").hidden = true;
  $("output").hidden = false;
  $("output").classList.add("loading");
  $("chart-tooltip").hidden = true;
  $("percent-tooltip").hidden = true;
  $("empty").textContent = "Add a basket to see P&L comparisons.";
  $("empty").hidden = false;
  $("basket-legend").replaceChildren();
  $("percent-legend").replaceChildren();
  const chart = $("chart"),
    percentChart = $("percent-chart");
  chart.getContext("2d").clearRect(0, 0, chart.width, chart.height);
  percentChart.getContext("2d").clearRect(0, 0, percentChart.width, percentChart.height);
  window.chartData = null;
  window.miniChartData = null;
  window.basketPnlResults = {};
  renderBaskets();
  try {
    const index = await loadNiftyIndex(day, interval).then(
      (points) => ({ points }),
      (error) => ({ error: error.message }),
    );
    if (generation !== requestGeneration) return;
    const times = (index.points || []).map((point) => point.t),
      xRange = times.length
        ? { start: times[0], end: times.at(-1) }
        : { start: 0, end: 0 };
    window.chartXRange = xRange;
    $("title").textContent = "Options P&L";
    $("dates").textContent = formatDate(day);
    $("chart-range").textContent = times.length
      ? `${time(times[0])} – ${time(times.at(-1))} IST · ${interval.replace("minute", "-minute")}`
      : "NIFTY 50 data unavailable";
    $("output").classList.remove("loading");
    window.miniChartData = {
      index,
      percent: { times, series: [] },
      xRange,
    };
    drawMiniPlots(window.miniChartData);
  } finally {
    if (generation === requestGeneration)
      $("output").classList.remove("loading");
  }
}
function renderLegend(data) {
  const el = $("basket-legend");
  el.replaceChildren(
    ...data.map((b) => {
      const item = document.createElement("span"),
        dot = document.createElement("i"),
        name = document.createElement("span"),
        value = document.createElement("strong"),
        change = document.createElement("small");
      dot.style.background = b.color;
      name.textContent = b.name;
      value.textContent = signed(b.ending);
      value.className = b.ending >= 0 ? "green" : "red";
      change.className = `legend-change ${b.percent >= 0 ? "green" : "red"}`;
      change.textContent = `${b.percent >= 0 ? "+" : ""}${b.percent.toFixed(2)}%`;
      item.append(dot, name, value, change);
      return item;
    }),
  );
}
function niceAxis(lo, hi, target = 5) {
  if (lo === hi) {
    const pad = Math.abs(lo) * 0.01 || 1;
    lo -= pad;
    hi += pad;
  }
  const rough = (hi - lo) / target,
    power = 10 ** Math.floor(Math.log10(rough)),
    fraction = rough / power,
    step =
      (fraction < 1.5
        ? 1
        : fraction < 2.25
          ? 2
          : fraction < 3.75
            ? 2.5
            : fraction < 7.5
              ? 5
              : 10) * power,
    min = Math.floor(lo / step) * step,
    max = Math.ceil(hi / step) * step;
  return { min, max, step, count: Math.round((max - min) / step) };
}
function addScenarioControls(host, ref) {
  const add = (label, title, action, cls = "") => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `scenario-control ${cls}`;
    button.textContent = label;
    button.title = title;
    button.setAttribute("aria-label", title);
    button.addEventListener("click", action);
    host.append(button);
  };
  add("−", "Zoom out", () => zoomScenario(ref, 1.25));
  add("+", "Zoom in", () => zoomScenario(ref, 0.8));
  add("←", "Pan left", () => panScenario(ref, -0.2));
  add("→", "Pan right", () => panScenario(ref, 0.2));
  add("Reset", "Reset to ±1,000 NIFTY points", () => {
    const [lo, hi] = defaultScenarioView(ref.scenario);
    setScenarioView(ref, lo, hi);
  });
}
function defaultScenarioView(scenario) {
  const points = scenario.points,
    min = points[0].spot,
    max = points.at(-1).spot,
    center = scenario.actualSpot;
  return [Math.max(min, center - 1000), Math.min(max, center + 1000)];
}
function setScenarioView(ref, lo, hi) {
  const points = ref.scenario.points,
    min = points[0].spot,
    max = points.at(-1).spot,
    full = max - min;
  let span = Math.max(full / 120, Math.min(full, hi - lo));
  lo = Math.max(min, Math.min(max - span, lo));
  hi = lo + span;
  ref.view = [lo, hi];
  drawScenarioChart(
    ref.canvas,
    ref.scenario,
    ref.color,
    ref.actualSpot,
    ref.hoverPoint,
    ref.view,
  );
}
function zoomScenario(ref, factor, center) {
  const [lo, hi] = ref.view;
  center ??= ref.actualSpot;
  const next = (hi - lo) * factor;
  setScenarioView(
    ref,
    center - (center - lo) * factor,
    center + (hi - center) * factor,
  );
}
function panScenario(ref, fraction) {
  const [lo, hi] = ref.view,
    delta = (hi - lo) * fraction;
  setScenarioView(ref, lo + delta, hi + delta);
}
function drawScenarioChart(
  canvas,
  scenario,
  color,
  actualSpot,
  hoverPoint = null,
  view = null,
) {
  const box = canvas.getBoundingClientRect(),
    ratio = devicePixelRatio || 1;
  if (!box.width || !box.height || !scenario?.points?.length) return;
  canvas.width = box.width * ratio;
  canvas.height = box.height * ratio;
  const ctx = canvas.getContext("2d");
  ctx.scale(ratio, ratio);
  const w = box.width,
    h = box.height,
    p = { l: 80, r: 14, t: 14, b: 30 },
    all = scenario.points,
    fullMin = all[0].spot,
    fullMax = all.at(-1).spot,
    [lo, hi] = view || [fullMin, fullMax],
    visible = all.filter((point) => point.spot >= lo && point.spot <= hi),
    points = visible.length ? visible : [all[0], all.at(-1)],
    pnls = points.map((point) => point.pnl),
    xAxis = niceAxis(lo, hi, 5),
    yAxis = niceAxis(Math.min(0, ...pnls), Math.max(0, ...pnls), 5),
    Xspot = (spot) => p.l + ((w - p.l - p.r) * (spot - lo)) / (hi - lo),
    Y = (v) =>
      p.t + (h - p.t - p.b) * (1 - (v - yAxis.min) / (yAxis.max - yAxis.min)),
    X = (i) => Xspot(points[i].spot);
  ctx.font = "10px system-ui";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let k = 0; k <= yAxis.count; k++) {
    const value = yAxis.min + k * yAxis.step,
      y = Y(value);
    ctx.strokeStyle = "#22262b";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(p.l, y);
    ctx.lineTo(w - p.r, y);
    ctx.stroke();
    ctx.fillStyle = "#77818a";
    ctx.fillText(value < 0 ? `−${money(value)}` : money(value), p.l - 8, y);
  }
  if (yAxis.min < 0 && yAxis.max > 0) {
    ctx.strokeStyle = "#626a70";
    ctx.beginPath();
    ctx.moveTo(p.l, Y(0));
    ctx.lineTo(w - p.r, Y(0));
    ctx.stroke();
  }
  drawSignedLine(ctx, pnls, color, X, Y, 2.5);
  ctx.font = "10px system-ui";
  ctx.fillStyle = "#77818a";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (let k = 0; k <= xAxis.count; k++) {
    const spot = xAxis.min + k * xAxis.step;
    if (spot < lo || spot > hi) continue;
    ctx.fillText(
      Math.round(spot).toLocaleString("en-IN"),
      Xspot(spot),
      h - p.b + 8,
    );
  }
  ctx.strokeStyle = "#596168";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let spot = Math.ceil(lo / 10) * 10; spot <= hi; spot += 10) {
    const x = Xspot(spot),
      major = Math.abs(spot % 100) < 1e-8;
    ctx.moveTo(x, h - p.b);
    ctx.lineTo(x, h - p.b + (major ? 6 : 3));
  }
  ctx.stroke();
  if (actualSpot >= lo && actualSpot <= hi) {
    const actualX = Xspot(actualSpot);
    ctx.save();
    ctx.setLineDash([4, 5]);
    ctx.strokeStyle = "#8b949c99";
    ctx.beginPath();
    ctx.moveTo(actualX, p.t);
    ctx.lineTo(actualX, h - p.b);
    ctx.stroke();
    ctx.restore();
  }
  if (hoverPoint && hoverPoint.spot >= lo && hoverPoint.spot <= hi) {
    const point = hoverPoint,
      x = Xspot(point.spot),
      y = Y(point.pnl);
    ctx.save();
    ctx.setLineDash([4, 5]);
    ctx.strokeStyle = "#a3aea7aa";
    ctx.beginPath();
    ctx.moveTo(x, p.t);
    ctx.lineTo(x, h - p.b);
    ctx.stroke();
    ctx.restore();
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = point.pnl >= 0 ? color : darkerColor(color);
    ctx.fill();
    ctx.strokeStyle = "#f1f4f6";
    ctx.lineWidth = 1.3;
    ctx.stroke();
  }
}
function showScenarioHover(e, ref) {
  const rect = ref.canvas.getBoundingClientRect(),
    x = e.clientX - rect.left,
    pad = { l: 80, r: 14 },
    width = rect.width - pad.l - pad.r,
    [lo, hi] = ref.view;
  if (x < pad.l || x > rect.width - pad.r) return;
  const raw = lo + ((x - pad.l) / width) * (hi - lo),
    minTick = Math.ceil(lo / 10) * 10,
    maxTick = Math.floor(hi / 10) * 10,
    spot =
      minTick <= maxTick
        ? Math.max(minTick, Math.min(maxTick, Math.round(raw / 10) * 10))
        : raw,
    pnl = scenarioPnlAt(ref.scenario.legs, spot),
    point = { spot, pnl },
    tooltip = ref.tooltip;
  ref.hoverPoint = point;
  tooltip.textContent = `NIFTY ${Math.round(spot).toLocaleString("en-IN")}  ·  ${signed(pnl)}`;
  tooltip.hidden = false;
  tooltip.style.left = `${x > rect.width * 0.65 ? Math.max(8, x - tooltip.offsetWidth - 12) : Math.min(rect.width - tooltip.offsetWidth - 8, x + 12)}px`;
  tooltip.style.top = "8px";
  drawScenarioChart(
    ref.canvas,
    ref.scenario,
    ref.color,
    ref.actualSpot,
    point,
    ref.view,
  );
}
function nearestTimeIndex(times, t) {
  if (!times?.length) return 0;
  let lo = 0,
    hi = times.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  return lo > 0 && Math.abs(times[lo - 1] - t) <= Math.abs(times[lo] - t)
    ? lo - 1
    : lo;
}
function chartTimeTicks() {
  const { start, end } = window.chartXRange || {};
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
    return [];
  const span = end - start,
    target = span / 5,
    steps = [1800, 2700, 3600, 4500, 5400, 7200, 10800],
    step = steps.reduce(
      (best, x) => (Math.abs(x - target) < Math.abs(best - target) ? x : best),
      steps[0],
    ),
    ticks = [];
  for (let t = start; t <= end; t += step) ticks.push(t);
  return ticks;
}
function chartX(t, p, w) {
  const r = window.chartXRange;
  if (!r || r.end <= r.start) return p.l;
  return p.l + ((w - p.l - p.r) * (t - r.start)) / (r.end - r.start);
}
function darkerColor(color) {
  let h, s, l;
  const hsl = color.match(
    /^hsl\(\s*([\d.]+)(?:deg)?\s+([\d.]+)%\s+([\d.]+)%\s*\)$/i,
  );
  if (hsl) {
    h = Number(hsl[1]);
    s = Number(hsl[2]);
    l = Number(hsl[3]);
  } else {
    const hex = color.match(/^#([0-9a-f]{6})$/i);
    if (!hex) return color;
    const n = parseInt(hex[1], 16),
      r = ((n >> 16) & 255) / 255,
      g = ((n >> 8) & 255) / 255,
      b = (n & 255) / 255,
      max = Math.max(r, g, b),
      min = Math.min(r, g, b),
      d = max - min;
    l = (max + min) / 2;
    s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
    if (d === 0) h = 0;
    else if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
    if (h < 0) h += 360;
    s *= 100;
    l *= 100;
  }
  return `hsl(${(h + 18) % 360} ${s}% ${Math.max(20, l * 0.32)}%)`;
}
function minimalBasketName(name) {
  return name.replace(/^Long /, "").replace(/ · \d{1,2} [A-Za-z]{3}$/, "");
}
function drawSignedLine(ctx, values, color, X, Y, width = 2.5) {
  if (values.length < 2) return;
  const dark = darkerColor(color),
    stroke = (x1, y1, x2, y2, c) => {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = c;
      ctx.lineWidth = width;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.stroke();
    };
  for (let i = 1; i < values.length; i++) {
    const a = values[i - 1],
      b = values[i],
      x1 = X(i - 1),
      y1 = Y(a),
      x2 = X(i),
      y2 = Y(b);
    if (a * b < 0) {
      const t = a / (a - b),
        xc = x1 + (x2 - x1) * t,
        yc = y1 + (y2 - y1) * t;
      stroke(x1, y1, xc, yc, a < 0 ? dark : color);
      stroke(xc, yc, x2, y2, b < 0 ? dark : color);
    } else stroke(x1, y1, x2, y2, (a + b) / 2 < 0 ? dark : color);
  }
}
function drawMiniPlots(data) {
  const niftyCanvas = $("nifty-chart"),
    niftyStatus = $("nifty-empty");
  if (data.index.points?.length) {
    niftyStatus.hidden = true;
    drawNiftyPlot(
      niftyCanvas,
      data.index.points,
      data.index.points.previousClose,
    );
  } else {
    niftyStatus.textContent = data.index.error || "NIFTY 50 prices unavailable";
    niftyStatus.hidden = false;
    niftyCanvas
      .getContext("2d")
      .clearRect(0, 0, niftyCanvas.width, niftyCanvas.height);
  }
  const percent = data.percent,
    legend = $("percent-legend");
  legend.replaceChildren(
    ...percent.series.map((s) => {
      const item = document.createElement("span"),
        dot = document.createElement("i"),
        name = document.createElement("span"),
        change = document.createElement("small"),
        value = s.values.at(-1) || 0;
      dot.style.background = s.color;
      name.textContent = s.name;
      change.className = `legend-change ${value >= 0 ? "green" : "red"}`;
      change.textContent = `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
      item.append(dot, name, change);
      return item;
    }),
  );
  $("percent-empty").hidden = percent.series.length > 0;
  if (!percent.series.length) {
    $("percent-empty").textContent = "No baskets selected";
    return;
  }
  drawMiniPlot($("percent-chart"), percent.times, percent.series, "percent");
}
function drawNiftyPlot(canvas, points, previousClose) {
  const box = canvas.getBoundingClientRect(),
    ratio = devicePixelRatio || 1;
  if (!box.width || !box.height || !points?.length) return;
  canvas.width = box.width * ratio;
  canvas.height = box.height * ratio;
  const ctx = canvas.getContext("2d");
  ctx.scale(ratio, ratio);
  const w = box.width,
    h = box.height,
    p = { l: 58, r: 14, t: 12, b: 28 },
    values = points.map((point) => point.value),
    baseline = Number(previousClose) || values[0],
    lo = Math.min(baseline, ...values),
    hi = Math.max(baseline, ...values),
    span = hi - lo || 1,
    roughStep = span / 5,
    power = 10 ** Math.floor(Math.log10(roughStep)),
    fraction = roughStep / power,
    niceStep =
      (fraction < 1.5
        ? 1
        : fraction < 2.25
          ? 2
          : fraction < 3.75
            ? 2.5
            : fraction < 7.5
              ? 5
              : 10) * power,
    min = Math.floor(lo / niceStep) * niceStep,
    stepCount = Math.ceil((hi - min) / niceStep),
    max = min + stepCount * niceStep,
    X = (i) => chartX(points[i].t, p, w),
    Y = (value) => p.t + (h - p.t - p.b) * (1 - (value - min) / (max - min)),
    baseY = Y(baseline),
    green =
      getComputedStyle(document.documentElement)
        .getPropertyValue("--green")
        .trim() || "#37c997",
    red =
      getComputedStyle(document.documentElement)
        .getPropertyValue("--red")
        .trim() || "#f27668";
  ctx.font = "10px system-ui";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let k = 0; k <= stepCount; k++) {
    const value = min + niceStep * k,
      y = Y(value);
    ctx.strokeStyle = "#22262b";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(p.l, y);
    ctx.lineTo(w - p.r, y);
    ctx.stroke();
    ctx.fillStyle = "#77818a";
    ctx.fillText(Math.round(value).toLocaleString("en-IN"), p.l - 8, y);
  }
  ctx.save();
  ctx.setLineDash([5, 6]);
  ctx.strokeStyle = "#7f898f88";
  ctx.beginPath();
  ctx.moveTo(p.l, baseY);
  ctx.lineTo(w - p.r, baseY);
  ctx.stroke();
  ctx.restore();
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i],
      x0 = X(i - 1),
      y0 = Y(a.value),
      x1 = X(i),
      y1 = Y(b.value),
      da = a.value - baseline,
      db = b.value - baseline,
      stroke = (xa, ya, xb, yb, color) => {
        ctx.beginPath();
        ctx.moveTo(xa, ya);
        ctx.lineTo(xb, yb);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.stroke();
      };
    if (da * db < 0) {
      const crossRatio = (baseline - a.value) / (b.value - a.value),
        xc = x0 + (x1 - x0) * crossRatio;
      stroke(x0, y0, xc, baseY, da >= 0 ? green : red);
      stroke(xc, baseY, x1, y1, db >= 0 ? green : red);
    } else stroke(x0, y0, x1, y1, da >= 0 ? green : red);
  }
  ctx.fillStyle = "#77818a";
  ctx.font = "10px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (const t of chartTimeTicks())
    ctx.fillText(time(t), chartX(t, p, w), h - p.b + 8);
  const i =
    window.linkedHoverTime == null
      ? -1
      : nearestTimeIndex(
          points.map((point) => point.t),
          window.linkedHoverTime,
        );
  if (i >= 0) {
    const x = X(i),
      hoverX = chartX(window.linkedHoverTime, p, w),
      y = Y(points[i].value);
    ctx.save();
    ctx.setLineDash([4, 5]);
    ctx.strokeStyle = "#a3aea7aa";
    ctx.beginPath();
    ctx.moveTo(hoverX, p.t);
    ctx.lineTo(hoverX, h - p.b);
    ctx.stroke();
    ctx.restore();
    ctx.beginPath();
    ctx.arc(x, y, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = points[i].value >= baseline ? green : red;
    ctx.fill();
    ctx.strokeStyle = "#eaf3ee";
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
}
function drawMiniPlot(canvas, times, series, mode) {
  const box = canvas.getBoundingClientRect(),
    ratio = devicePixelRatio || 1;
  if (!box.width || !box.height || !times.length || !series.length) return;
  canvas.width = box.width * ratio;
  canvas.height = box.height * ratio;
  const ctx = canvas.getContext("2d");
  ctx.scale(ratio, ratio);
  const w = box.width,
    h = box.height,
    p = { l: 58, r: 14, t: 12, b: 28 },
    values = series.flatMap((s) => s.values),
    rawMin = Math.min(...values, ...(mode === "percent" ? [0] : [])),
    rawMax = Math.max(...values, ...(mode === "percent" ? [0] : [])),
    span = rawMax - rawMin || 1,
    axis = niceAxis(rawMin - span * 0.08, rawMax + span * 0.08),
    min = axis.min,
    max = axis.max,
    X = (i) => chartX(times[i], p, w),
    Y = (v) => p.t + (h - p.t - p.b) * (1 - (v - min) / (max - min));
  ctx.font = "10px system-ui";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let k = 0; k <= axis.count; k++) {
    const v = min + axis.step * k,
      y = Y(v);
    ctx.strokeStyle = "#22262b";
    ctx.beginPath();
    ctx.moveTo(p.l, y);
    ctx.lineTo(w - p.r, y);
    ctx.stroke();
    ctx.fillStyle = "#77818a";
    ctx.fillText(
      mode === "percent"
        ? `${v.toFixed(1)}%`
        : Math.round(v).toLocaleString("en-IN"),
      p.l - 8,
      y,
    );
  }
  if (mode === "percent" && min < 0 && max > 0) {
    ctx.strokeStyle = "#59616a";
    ctx.beginPath();
    ctx.moveTo(p.l, Y(0));
    ctx.lineTo(w - p.r, Y(0));
    ctx.stroke();
  }
  series.forEach((s) => drawSignedLine(ctx, s.values, s.color, X, Y, 2));
  ctx.fillStyle = "#77818a";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (const t of chartTimeTicks())
    ctx.fillText(time(t), chartX(t, p, w), h - p.b + 8);
  const i =
    window.linkedHoverTime == null
      ? -1
      : nearestTimeIndex(times, window.linkedHoverTime);
  if (i >= 0) {
    const px = X(i),
      hoverX = chartX(window.linkedHoverTime, p, w);
    ctx.save();
    ctx.setLineDash([4, 5]);
    ctx.strokeStyle = "#a3aea7aa";
    ctx.beginPath();
    ctx.moveTo(hoverX, p.t);
    ctx.lineTo(hoverX, h - p.b);
    ctx.stroke();
    ctx.restore();
    series.forEach((s) => {
      ctx.beginPath();
      ctx.arc(px, Y(s.values[i]), 3.5, 0, Math.PI * 2);
      ctx.fillStyle = s.color;
      ctx.fill();
      ctx.strokeStyle = "#eaf3ee";
      ctx.lineWidth = 1.2;
      ctx.stroke();
    });
  }
}
function showMiniHover(e) {
  const canvas = e.currentTarget,
    d = window.miniChartData,
    mode = canvas.id === "nifty-chart" ? "price" : "percent",
    series =
      mode === "price"
        ? d?.index.points?.length
          ? [
              {
                name: "NIFTY 50",
                color:
                  d.index.points.at(-1).value >= d.index.points.previousClose
                    ? "#37c997"
                    : "#f27668",
                values: d.index.points.map((p) => p.value),
              },
            ]
          : []
        : d?.percent.series || [],
    times =
      mode === "price"
        ? d?.index.points?.map((p) => p.t) || []
        : d?.percent.times || [];
  if (!times.length || !series.length) return;
  const rect = canvas.getBoundingClientRect(),
    x = e.clientX - rect.left,
    pad = { l: 58, r: 14 },
    pw = rect.width - pad.l - pad.r;
  if (x < pad.l || x > rect.width - pad.r) return clearMiniHover();
  const target =
      (window.chartXRange?.start || times[0]) +
      ((x - pad.l) / pw) *
        ((window.chartXRange?.end || times.at(-1)) -
          (window.chartXRange?.start || times[0])),
    i = nearestTimeIndex(times, target),
    t = times[i];
  window.linkedHoverTime = t;
  window.hoverIndex = window.chartData
    ? nearestTimeIndex(window.chartData.times, t)
    : null;
  const tip = $(mode === "price" ? "nifty-tooltip" : "percent-tooltip");
  $(
    mode === "price" ? "nifty-tooltip-time" : "percent-tooltip-time",
  ).textContent = time(t);
  const rows = $(
    mode === "price" ? "nifty-tooltip-rows" : "percent-tooltip-rows",
  );
  rows.replaceChildren(
    ...series.map((s) => {
      const row = document.createElement("div");
      row.className = "tooltip-row";
      const label = document.createElement("span");
      label.textContent = mode === "price" ? s.name : minimalBasketName(s.name);
      label.style.color = s.color;
      if (mode === "price") {
        const value = document.createElement("div");
        value.className = "tooltip-basket-value";
        const amount = document.createElement("b");
        amount.textContent = s.values[i].toLocaleString("en-IN", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
        const change = document.createElement("small");
        change.className = "tooltip-basket-change";
        const previous = d.index.points.previousClose;
        change.textContent = previous
          ? `${s.values[i] >= previous ? "+" : ""}${(((s.values[i] - previous) / previous) * 100).toFixed(2)}%`
          : "—";
        value.append(amount, change);
        row.append(label, value);
      } else {
        const value = document.createElement("b");
        value.textContent = `${s.values[i] >= 0 ? "+" : ""}${s.values[i].toFixed(2)}%`;
        value.className = s.values[i] >= 0 ? "green" : "red";
        row.append(label, value);
      }
      return row;
    }),
  );
  tip.hidden = false;
  tip.style.left = `${x > rect.width * 0.65 ? Math.max(8, x - tip.offsetWidth - 12) : Math.min(rect.width - tip.offsetWidth - 8, x + 12)}px`;
  tip.style.top = "10px";
  $("chart-tooltip").hidden = true;
  $("nifty-tooltip").hidden = mode !== "price";
  $("percent-tooltip").hidden = mode !== "percent";
  if (window.chartData) draw(window.chartData);
  drawMiniPlots(d);
}
function clearMiniHover() {
  window.linkedHoverTime = null;
  window.hoverIndex = null;
  $("nifty-tooltip").hidden = true;
  $("percent-tooltip").hidden = true;
  $("chart-tooltip").hidden = true;
  if (window.chartData) draw(window.chartData);
  if (window.miniChartData) drawMiniPlots(window.miniChartData);
}
function showError(s) {
  $("error").textContent = s;
  $("error").hidden = false;
  if ($("option-dialog").open) {
    $("option-error").textContent = s;
    $("option-error").hidden = false;
  }
}
function showChartHover(e) {
  const d = window.chartData;
  if (!d?.series.length) return;
  const rect = chartCanvas.getBoundingClientRect(),
    x = e.clientX - rect.left,
    y = e.clientY - rect.top,
    pad = { l: 58, r: 14, t: 18, b: 32 },
    pw = rect.width - pad.l - pad.r;
  if (
    x < pad.l ||
    x > rect.width - pad.r ||
    y < pad.t ||
    y > rect.height - pad.b
  )
    return clearChartHover();
  const target =
      (window.chartXRange?.start || d.times[0]) +
      ((x - pad.l) / pw) *
        ((window.chartXRange?.end || d.times.at(-1)) -
          (window.chartXRange?.start || d.times[0])),
    i = nearestTimeIndex(d.times, target);
  window.linkedHoverTime = d.times[i];
  window.hoverIndex = i;
  $("tooltip-time").textContent = time(d.times[i]);
  const rows = $("tooltip-rows");
  rows.replaceChildren(
    ...d.baskets.map((b, j) => {
      const row = document.createElement("div");
      row.className = "tooltip-row";
      const label = document.createElement("span");
      label.className = "tooltip-basket-name";
      label.textContent = minimalBasketName(b.name);
      label.style.color = b.color;
      const value = document.createElement("div");
      value.className = "tooltip-basket-value";
      const amount = document.createElement("b");
      amount.textContent = signed(d.series[i].values[j]);
      amount.className = d.series[i].values[j] >= 0 ? "green" : "red";
      const change = document.createElement("small");
      change.className = "tooltip-basket-change";
      change.textContent = b.buyValue
        ? `${d.series[i].values[j] >= 0 ? "+" : ""}${((d.series[i].values[j] / b.buyValue) * 100).toFixed(2)}%`
        : "—";
      value.append(amount, change);
      row.append(label, value);
      return row;
    }),
  );
  const tip = $("chart-tooltip");
  tip.hidden = false;
  tip.style.left = `${x > rect.width * 0.65 ? Math.max(8, x - tip.offsetWidth - 14) : Math.min(rect.width - tip.offsetWidth - 8, x + 14)}px`;
  tip.style.top = `${Math.max(8, Math.min(rect.height - tip.offsetHeight - 8, y + 12))}px`;
  $("nifty-tooltip").hidden = true;
  $("percent-tooltip").hidden = true;
  draw(d);
  if (window.miniChartData) drawMiniPlots(window.miniChartData);
}
function clearChartHover() {
  window.linkedHoverTime = null;
  window.hoverIndex = null;
  $("chart-tooltip").hidden = true;
  if (window.chartData) draw(window.chartData);
  if (window.miniChartData) drawMiniPlots(window.miniChartData);
}
function draw(d) {
  const c = chartCanvas,
    box = c.getBoundingClientRect(),
    ratio = devicePixelRatio || 1;
  if (!box.width || !box.height || !d.series.length) return;
  c.width = box.width * ratio;
  c.height = box.height * ratio;
  const ctx = c.getContext("2d");
  ctx.scale(ratio, ratio);
  const w = box.width,
    h = box.height,
    p = { l: 58, r: 14, t: 18, b: 32 },
    vals = d.series.flatMap((s) => s.values),
    lo = Math.min(0, ...vals),
    hi = Math.max(0, ...vals),
    axis = niceAxis(lo - (hi - lo || 1) * 0.08, hi + (hi - lo || 1) * 0.08),
    min = axis.min,
    max = axis.max,
    X = (i) => chartX(d.times[i], p, w),
    Y = (v) => p.t + (h - p.t - p.b) * (1 - (v - min) / (max - min));
  ctx.font = "11px system-ui";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let k = 0; k <= axis.count; k++) {
    const v = min + axis.step * k,
      y = Y(v);
    ctx.strokeStyle = "#29312c";
    ctx.beginPath();
    ctx.moveTo(p.l, y);
    ctx.lineTo(w - p.r, y);
    ctx.stroke();
    ctx.fillStyle = "#829087";
    ctx.fillText(Math.round(v).toLocaleString("en-IN"), p.l - 8, y);
  }
  if (min < 0 && max > 0) {
    ctx.strokeStyle = "#778078";
    ctx.beginPath();
    ctx.moveTo(p.l, Y(0));
    ctx.lineTo(w - p.r, Y(0));
    ctx.stroke();
  }
  d.baskets.forEach((b, j) =>
    drawSignedLine(
      ctx,
      d.series.map((s) => s.values[j]),
      b.color,
      X,
      Y,
      2.7,
    ),
  );
  ctx.fillStyle = "#829087";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (const t of chartTimeTicks())
    ctx.fillText(time(t), chartX(t, p, w), h - p.b + 10);
  if (window.hoverIndex != null) {
    const i = window.hoverIndex,
      px = X(i),
      hoverX = chartX(window.linkedHoverTime, p, w);
    ctx.save();
    ctx.setLineDash([5, 6]);
    ctx.strokeStyle = "#a3aea7aa";
    ctx.beginPath();
    ctx.moveTo(hoverX, p.t);
    ctx.lineTo(hoverX, h - p.b);
    ctx.stroke();
    ctx.restore();
    d.baskets.forEach((b, j) => {
      ctx.beginPath();
      ctx.arc(px, Y(d.series[i].values[j]), 4, 0, Math.PI * 2);
      ctx.fillStyle = b.color;
      ctx.fill();
      ctx.strokeStyle = "#eaf3ee";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });
  }
}
$("upstox-status").addEventListener("click", showUpstoxDialog);
$("token-form").addEventListener("submit", saveUpstoxToken);
$("token-cancel").addEventListener("click", () => $("token-dialog").close());
$("token-disconnect").addEventListener("click", disconnectUpstox);
renderBaskets();
checkUpstox();
