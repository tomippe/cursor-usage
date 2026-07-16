/** Lazy access so unit tests can import locale helpers without the vscode module. */
function vscodeApi(): typeof import("vscode") | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("vscode");
  } catch {
    return null;
  }
}

export function uiLocale(): string {
  const lang = (vscodeApi()?.env.language ?? "en").toLowerCase();
  if (lang.startsWith("ja")) return "ja-JP";
  if (lang.startsWith("zh-cn") || lang.startsWith("zh-hans") || lang === "zh") return "zh-CN";
  if (lang.startsWith("zh")) return "zh-CN";
  const raw = vscodeApi()?.env.language;
  if (raw && raw.includes("-")) return raw;
  return lang.startsWith("en") ? "en-US" : (raw ?? "en-US");
}

function isCjkLocale(locale: string): boolean {
  const l = locale.toLowerCase();
  return l.startsWith("ja") || l.startsWith("zh");
}

/** Tooltip / reset line — e.g. Jul 20, 2026 (en) or 2026年7月20日 (ja/zh). */
export function formatShortDate(date: Date, opts?: { utc?: boolean }): string {
  const locale = uiLocale();
  const timeZone = opts?.utc ? "UTC" : undefined;
  if (isCjkLocale(locale)) {
    return date.toLocaleDateString(locale, {
      year: "numeric",
      month: "long",
      day: "numeric",
      ...(timeZone ? { timeZone } : {}),
    });
  }
  return date.toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(timeZone ? { timeZone } : {}),
  });
}

/** Chart x-axis day label (UTC). */
export function formatChartDayLabel(dayMs: number): string {
  const locale = uiLocale();
  const d = new Date(dayMs);
  if (isCjkLocale(locale)) {
    return d.toLocaleDateString(locale, { month: "numeric", day: "numeric", timeZone: "UTC" });
  }
  return d.toLocaleDateString(locale, { month: "short", day: "numeric", timeZone: "UTC" });
}

export function formatDateTime(date: Date): string {
  const locale = uiLocale();
  if (isCjkLocale(locale)) {
    return date.toLocaleString(locale, {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }
  return date.toLocaleString(locale, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString(uiLocale(), { hour: "numeric", minute: "2-digit" });
}

/** JS snippet injected into the dashboard webview (mirrors the functions above). */
export function dashboardLocaleFormatScript(): string {
  return `(function () {
  function isCjkLocale(locale) {
    var l = (locale || "").toLowerCase();
    return l.indexOf("ja") === 0 || l.indexOf("zh") === 0;
  }
  window.__formatShortDate = function (date) {
    var locale = window.__LOCALE__ || "en-US";
    if (isCjkLocale(locale)) {
      return date.toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric" });
    }
    return date.toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" });
  };
  window.__formatChartDayLabel = function (dayMs) {
    var locale = window.__LOCALE__ || "en-US";
    var d = new Date(dayMs);
    if (isCjkLocale(locale)) {
      return d.toLocaleDateString(locale, { month: "numeric", day: "numeric", timeZone: "UTC" });
    }
    return d.toLocaleDateString(locale, { month: "short", day: "numeric", timeZone: "UTC" });
  };
  window.__formatDateTime = function (ts) {
    var d = new Date(ts);
    var locale = window.__LOCALE__ || "en-US";
    if (isCjkLocale(locale)) {
      return d.toLocaleString(locale, {
        year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit",
      });
    }
    return d.toLocaleString(locale, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  };
  window.__formatTime = function (ts) {
    return new Date(ts).toLocaleTimeString(window.__LOCALE__ || "en-US", { hour: "numeric", minute: "2-digit" });
  };
})();`;
}
