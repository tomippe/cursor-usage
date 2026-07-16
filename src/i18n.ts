import { formatShortDate, uiLocale } from "./locale";

/** Lazy access so unit tests can import i18n without the vscode module. */
function vscodeApi(): typeof import("vscode") | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("vscode");
  } catch {
    return null;
  }
}

/** Message keys — English source strings (also used as l10n bundle keys). */
export const Msg = {
  cursorUsage: "Cursor Usage",
  cursorUsageByTomippe: "Cursor Usage by tomippe",
  usage: "Usage",
  usageUnavailable: "Usage unavailable",
  refresh: "Refresh",
  refreshing: "Refreshing…",
  openDashboard: "Open Dashboard",
  showLogs: "Show Logs",
  change: "Change",
  plan: "Plan",
  total: "Total",
  firstPartyModels: "First-party models",
  api: "API",
  onDemand: "On-demand",
  onDemandUsage: "On-Demand Usage",
  includedRequests: "Included requests",
  includedRequestUsage: "Included-Request Usage",
  unlimited: "Unlimited",
  spendUnavailable: "Spend unavailable",
  payForExtraUsage: "Pay for extra usage beyond your plan limits",
  usageByModel: "Usage by Model",
  model: "Model",
  requests: "Requests",
  tokens: "Tokens",
  spend: "Spend",
  noUsageInPeriod: "No usage in this period",
  resetsInDaysOn: "Resets in {0} day(s) on {1}",
  resetsInDaysOnSingular: "Resets in {0} day on {1}",
  last24Hours: "Last 24 hours",
  last7Days: "Last 7 days",
  last30Days: "Last 30 days",
  currentBillingCycle: "Current Billing Cycle",
  hours24: "24 hours",
  days7: "7 days",
  days30: "30 days",
  yourUsage: "Your Usage",
  perDayUsageHint: "Per-day usage over the selected range",
  usageFilterLabel: "Usage:",
  metricFilterLabel: "Metric:",
  all: "All",
  included: "Included",
  onDemandFilter: "On-Demand",
  events: "Events",
  date: "Date",
  type: "Type",
  exportCsv: "Export CSV",
  noDataYet: "No data yet",
  noEventsInRange: "No events in this range",
  noUsageInRange: "No usage in this range",
  updatedAt: "Updated {0}",
  eventCount: "{0} event(s)",
  eventCountSingular: "{0} event",
  couldNotFetchUsage: "Could not fetch usage data",
  couldNotFetchUsageClick: "Could not fetch Cursor usage data. Click to see options.",
  usageNotAvailableYet: "Cursor usage data is not available yet.",
  usageUnavailableWithError: "Cursor usage unavailable: {0}",
  errorPrefix: "Error: {0}",
  requestsSummary: "Requests: {0}/{1} ({2}%)",
  onDemandSummary: "On-demand {0}",
  firstPartySummary: "First-party {0}",
  apiSummary: "API {0}",
  totalSummary: "Total {0}",
  toggleYourUsageSection: "Toggle Your Usage section",
  toggleUsageByModelSection: "Toggle Usage by Model section",
  toggleEventsSection: "Toggle Events section",
  kindIncluded: "Included",
  kindOnDemand: "On-Demand",
  kindErrored: "Errored",
  kindAborted: "Aborted",
} as const;

export type MessageKey = (typeof Msg)[keyof typeof Msg];

export { uiLocale } from "./locale";

export function t(message: string, ...args: Array<string | number>): string {
  let text: string;
  const l10n = vscodeApi()?.l10n;
  if (l10n?.t) {
    try {
      text = l10n.t(message, ...args.map(String));
    } catch {
      text = message;
    }
  } else {
    text = message;
  }
  args.forEach((arg, i) => {
    text = text.replace(`{${i}}`, String(arg));
  });
  return text;
}

export function formatResetDate(iso: string): string {
  const resetDate = new Date(iso);
  const now = new Date();
  const daysLeft = Math.max(0, Math.ceil((resetDate.getTime() - now.getTime()) / 86_400_000));
  const formatted = formatShortDate(resetDate);
  const template = daysLeft === 1 ? Msg.resetsInDaysOnSingular : Msg.resetsInDaysOn;
  return t(template, daysLeft, formatted);
}

/** Strings injected into the dashboard webview (`window.__L10N__`). */
export function getDashboardL10n(): Record<string, string> {
  const m = Msg;
  return {
    cursorUsage: t(m.cursorUsage),
    refresh: t(m.refresh),
    refreshing: t(m.refreshing),
    last24Hours: t(m.last24Hours),
    last7Days: t(m.last7Days),
    last30Days: t(m.last30Days),
    currentBillingCycle: t(m.currentBillingCycle),
    yourUsage: t(m.yourUsage),
    perDayUsageHint: t(m.perDayUsageHint),
    usageFilterLabel: t(m.usageFilterLabel),
    metricFilterLabel: t(m.metricFilterLabel),
    all: t(m.all),
    included: t(m.included),
    onDemandFilter: t(m.onDemandFilter),
    usageByModel: t(m.usageByModel),
    model: t(m.model),
    requests: t(m.requests),
    tokens: t(m.tokens),
    spend: t(m.spend),
    events: t(m.events),
    date: t(m.date),
    type: t(m.type),
    exportCsv: t(m.exportCsv),
    noDataYet: t(m.noDataYet),
    total: t(m.total),
    firstPartyModels: t(m.firstPartyModels),
    api: t(m.api),
    onDemandUsage: t(m.onDemandUsage),
    includedRequestUsage: t(m.includedRequestUsage),
    unlimited: t(m.unlimited),
    payForExtraUsage: t(m.payForExtraUsage),
    noEventsInRange: t(m.noEventsInRange),
    noUsageInRange: t(m.noUsageInRange),
    updatedAt: t(m.updatedAt, "{0}"),
    eventCount: t(m.eventCount, "{0}"),
    eventCountSingular: t(m.eventCountSingular, "{0}"),
    toggleYourUsageSection: t(m.toggleYourUsageSection),
    toggleUsageByModelSection: t(m.toggleUsageByModelSection),
    toggleEventsSection: t(m.toggleEventsSection),
    kindIncluded: t(m.kindIncluded),
    kindOnDemand: t(m.kindOnDemand),
    kindErrored: t(m.kindErrored),
    kindAborted: t(m.kindAborted),
    resetsInDaysOn: t(m.resetsInDaysOn, "{0}", "{1}"),
    resetsInDaysOnSingular: t(m.resetsInDaysOnSingular, "{0}", "{1}"),
  };
}

export function translateEventKind(kind: string): string {
  switch (kind) {
    case "Included": return t(Msg.kindIncluded);
    case "On-Demand": return t(Msg.kindOnDemand);
    case "Errored": return t(Msg.kindErrored);
    case "Aborted": return t(Msg.kindAborted);
    default: return kind;
  }
}
