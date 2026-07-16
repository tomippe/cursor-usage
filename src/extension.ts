import * as vscode from "vscode";
import {
  configure,
  fetchDailySpendByCategory,
  fetchUsageData,
  fetchUsageEvents,
  isTeamMemberCached,
  type DailySpendRow,
  type UsagePayload,
  type UsageEvent,
} from "./cursor-api";
import { DashboardPanel, OPEN_DASHBOARD_COMMAND } from "./dashboard-panel";
import { buildDashboardState, type DashboardState } from "./dashboard-state";
import {
  resolveConfiguredUsageDuration,
} from "./duration-options";
import { formatResetDate, Msg, t, uiLocale } from "./i18n";
import { formatTokens } from "./format";
import {
  aggregateByModel,
  filterZeroTokenModels,
  formatDollarsFromCents,
  type ModelBreakdownSortBy,
  type SortOrder,
  type UsageDuration,
} from "./model-breakdown";
import {
  buildUsageByModelHeadingMarkdown,
  buildUsageOverviewMarkdown,
  OPEN_DURATION_SETTING_COMMAND,
} from "./tooltip";

let statusBarItem: vscode.StatusBarItem;
let outputChannel: vscode.OutputChannel;
let debounceTimer: ReturnType<typeof setTimeout> | undefined;
let lastData: UsagePayload | null = null;
let lastError: string | null = null;
let lastFetchTime = 0;
let isFetching = false;
let lastEvents: UsageEvent[] | null = null;
let lastDailySpend: DailySpendRow[] | null = null;

const DEBOUNCE_MS = 30_000;

function log(msg: string) {
  const ts = new Date().toISOString().slice(11, 19);
  outputChannel.appendLine(`[${ts}] ${msg}`);
}

function getConfig() {
  const cfg = vscode.workspace.getConfiguration("cursorUsage");
  const modelBreakdownSortBy = cfg.get<ModelBreakdownSortBy>("modelBreakdownSortBy", "tokens");
  const modelBreakdownSortOrder = cfg.get<SortOrder>("modelBreakdownSortOrder", "desc");
  return {
    pollInterval: cfg.get<number>("pollInterval", 5),
    minimalMode: cfg.get<boolean>("minimalMode", false),
    usageDuration: cfg.get<string>("usageDuration", "billingCycle"),
    modelBreakdownSortBy,
    modelBreakdownSortOrder,
    excludeZeroTokenModels: cfg.get<boolean>("excludeZeroTokenModels", false),
    quotaAwareEventDisplay: cfg.get<boolean>("quotaAwareEventDisplay", true),
  };
}

function getCooldownMs(): number {
  return getConfig().pollInterval * 60_000;
}

function scheduleRefresh() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = undefined;
    if (Date.now() - lastFetchTime >= getCooldownMs()) {
      updateUsage();
    }
  }, DEBOUNCE_MS);
}

function refreshOnFocus(state: vscode.WindowState) {
  if (state.focused && Date.now() - lastFetchTime >= getCooldownMs()) {
    updateUsage();
  }
}

function isLightTheme(): boolean {
  const kind = vscode.window.activeColorTheme.kind;
  return kind === vscode.ColorThemeKind.Light || kind === vscode.ColorThemeKind.HighContrastLight;
}

function progressBarDataUri(ratio: number, barWidth = 220): string {
  const clamped = Math.min(Math.max(ratio, 0), 1);
  const width = barWidth;
  const height = 10;
  const r = height / 2;
  const fillWidth = Math.round(clamped * width);

  const light = isLightTheme();
  const trackColor = light ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.18)";
  const fillColor = light ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.82)";

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`;
  svg += `<rect width="${width}" height="${height}" rx="${r}" ry="${r}" fill="${trackColor}"/>`;
  if (fillWidth > 0) {
    svg += `<rect width="${fillWidth}" height="${height}" rx="${r}" ry="${r}" fill="${fillColor}"/>`;
  }
  svg += `</svg>`;

  const encoded = Buffer.from(svg).toString("base64");
  return `data:image/svg+xml;base64,${encoded}`;
}

function progressBarMarkdown(ratio: number, barWidth = 220): string {
  return `![](${progressBarDataUri(ratio, barWidth)})`;
}

function progressBarHtml(ratio: number, barWidth = 220): string {
  return `<img src="${progressBarDataUri(ratio, barWidth)}" width="${barWidth}" height="10" />`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;",
    };
    return entities[char] ?? char;
  });
}

function summaryDividerHtml(height = 52): string {
  const light = isLightTheme();
  const strokeColor = light ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.14)";
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="2" height="${height}" viewBox="0 0 2 ${height}">`,
    `<rect x="0.5" y="0" width="1" height="${height}" fill="${strokeColor}"/>`,
    `</svg>`,
  ].join("");
  const encoded = Buffer.from(svg).toString("base64");
  return `<img src="data:image/svg+xml;base64,${encoded}" width="2" height="${height}" />`;
}

type OnDemandUsage = UsagePayload["onDemand"];

/** Half-width only in Japanese tooltips so the column header does not wrap. */
function tooltipRequestsHeader(): string {
  if (uiLocale().startsWith("ja")) return "ﾘｸｴｽﾄ";
  return t(Msg.requests);
}

function buildModelBreakdownTableMarkdown(
  rows: Array<{ model: string; totalTokens: number; requests: number; spendCents: number }>,
  tableWidth: number,
): string {
  if (rows.length === 0) {
    return `*${t(Msg.noUsageInPeriod)}*\n\n`;
  }

  const lines = [
    `<table width="${tableWidth}" cellspacing="0" cellpadding="0">`,
    `  <tr>`,
    `    <th align="left" width="45%" style="white-space:nowrap">${t(Msg.model)}</th>`,
    `    <th align="right" width="15%" style="white-space:nowrap">${tooltipRequestsHeader()}</th>`,
    `    <th align="right" width="20%" style="white-space:nowrap">${t(Msg.tokens)}</th>`,
    `    <th align="right" width="20%" style="white-space:nowrap">${t(Msg.spend)}</th>`,
    `  </tr>`,
  ];

  for (const row of rows) {
    lines.push(
      `  <tr>` +
      `<td align="left">${escapeHtml(row.model)}</td>` +
      `<td align="right">${Math.round(row.requests)}</td>` +
      `<td align="right">${formatTokens(row.totalTokens)}</td>` +
      `<td align="right">${formatDollarsFromCents(row.spendCents)}</td>` +
      `</tr>`,
    );
  }

  lines.push(`</table>`, ``);
  return lines.join("\n");
}

function isOnDemandVisible(onDemand: OnDemandUsage): boolean {
  return onDemand.state !== "disabled";
}

function getOnDemandRatio(onDemand: OnDemandUsage): number | null {
  if (onDemand.state !== "limited") return null;
  if (onDemand.limitDollars === null || onDemand.limitDollars <= 0) return null;
  return onDemand.spendDollars / onDemand.limitDollars;
}

function formatOnDemandStatus(onDemand: OnDemandUsage): string {
  if (onDemand.state === "unlimited") {
    return `$${onDemand.spendDollars.toFixed(2)}`;
  }
  return `$${onDemand.spendDollars.toFixed(2)}/$${(onDemand.limitDollars ?? 0).toFixed(2)}`;
}

function formatPlanPercent(totalPercentUsed: number): string {
  const rounded = Math.round(totalPercentUsed);
  if (Math.abs(totalPercentUsed - rounded) < 0.05) {
    return `${rounded}%`;
  }
  return `${totalPercentUsed.toFixed(1)}%`;
}

function formatIncludedStatus(data: UsagePayload): string {
  if (data.totalPercentUsed !== null) {
    return formatPlanPercent(data.totalPercentUsed);
  }
  return `${data.includedRequests.used}/${data.includedRequests.limit}`;
}

function formatOnDemandTooltipCell(onDemand: OnDemandUsage): string {
  if (onDemand.state === "unlimited") {
    return `$${onDemand.spendDollars.toFixed(2)}`;
  }
  const ratio = getOnDemandRatio(onDemand);
  const pct = ratio === null ? 0 : Math.round(ratio * 100);
  return `$${onDemand.spendDollars.toFixed(2)} / $${(onDemand.limitDollars ?? 0).toFixed(2)} (${pct}%)`;
}

function updateStatusBar(data: UsagePayload) {
  const { includedRequests, onDemand, planName } = data;
  const { minimalMode } = getConfig();

  const premiumExhausted =
    data.totalPercentUsed !== null
      ? data.totalPercentUsed >= 100
      : includedRequests.limit > 0 && includedRequests.used >= includedRequests.limit;
  const onDemandVisible = isOnDemandVisible(onDemand);
  const includedText = formatIncludedStatus(data);
  const planPrefix = planName ? `${planName} | ` : "";

  if (minimalMode) {
    if (premiumExhausted && onDemandVisible && data.totalPercentUsed === null) {
      statusBarItem.text = `$(pulse) ${planPrefix}${formatOnDemandStatus(onDemand)}`;
    } else {
      statusBarItem.text = `$(pulse) ${planPrefix}${includedText}`;
    }
  } else {
    statusBarItem.text = onDemandVisible
      ? `$(pulse) ${planPrefix}${includedText} | ${formatOnDemandStatus(onDemand)}`
      : `$(pulse) ${planPrefix}${includedText}`;
  }

  const tooltip = new vscode.MarkdownString();
  tooltip.isTrusted = {
    enabledCommands: [OPEN_DASHBOARD_COMMAND, "cursor-usage.refresh", OPEN_DURATION_SETTING_COMMAND],
  };
  tooltip.supportThemeIcons = true;
  tooltip.supportHtml = true;

  const barW = 150;
  let md = `### $(pulse) ${t(Msg.cursorUsage)}\n\n`;
  if (planName) {
    md += `**${t(Msg.plan)}:** ${planName}\n\n`;
  }
  md += buildUsageOverviewMarkdown(
    {
      includedRequests,
      onDemand,
      totalPercentUsed: data.totalPercentUsed,
      autoPercentUsed: data.autoPercentUsed,
      apiPercentUsed: data.apiPercentUsed,
    },
    {
      markdown: (ratio) => progressBarMarkdown(ratio, barW),
      html: (ratio) => progressBarHtml(ratio, barW),
      divider: () => summaryDividerHtml(),
    },
  );
  md += `\n`;

  if (lastEvents && lastEvents.length > 0) {
    const config = getConfig();
    const usageDuration: UsageDuration = resolveConfiguredUsageDuration(config.usageDuration, Boolean(data.resetsAt));
    const models = aggregateByModel(
      lastEvents,
      lastDailySpend ?? [],
      usageDuration,
      data.resetsAt,
      Date.now(),
      config.modelBreakdownSortBy,
      config.modelBreakdownSortOrder,
    );
    const filteredModels = filterZeroTokenModels(models, config.excludeZeroTokenModels);
    md += `<hr>\n\n`;
    md += buildUsageByModelHeadingMarkdown(usageDuration);
    const modelTableWidth = barW * 2 + 2;
    md += buildModelBreakdownTableMarkdown(filteredModels, modelTableWidth);
  }

  if (data.resetsAt) {
    md += `<hr>\n\n`;
    md += `*${formatResetDate(data.resetsAt)}*\n\n`;
  }

  md += `<hr>\n\n`;
  md += `[${t(Msg.openDashboard)}](command:${OPEN_DASHBOARD_COMMAND}) | [${t(Msg.refresh)}](command:cursor-usage.refresh)`;

  tooltip.appendMarkdown(md);
  statusBarItem.tooltip = tooltip;
}

async function updateUsage() {
  if (isFetching) return;
  isFetching = true;

  statusBarItem.text = statusBarItem.text.replace("$(pulse)", "$(loading~spin)");
  await new Promise((r) => setTimeout(r, 0));

  try {
    const [dataResult, eventsResult, spendResult] = await Promise.allSettled([
      fetchUsageData(),
      fetchUsageEvents(),
      fetchDailySpendByCategory(),
    ]);

    if (eventsResult.status === "fulfilled") {
      lastEvents = eventsResult.value;
    } else if (eventsResult.status === "rejected") {
      log(`Usage events fetch failed: ${eventsResult.reason}`);
    }

    if (spendResult.status === "fulfilled") {
      lastDailySpend = spendResult.value;
    } else if (spendResult.status === "rejected") {
      log(`Daily spend fetch failed: ${spendResult.reason}`);
    }

    const data = dataResult.status === "fulfilled" ? dataResult.value : null;
    if (dataResult.status === "rejected") {
      log(`Usage data fetch failed: ${dataResult.reason}`);
    }

    if (data) {
      lastData = data;
      lastError = null;
      updateStatusBar(data);
    } else {
      lastError = t(Msg.couldNotFetchUsage);
      if (!lastData) {
        statusBarItem.text = `$(warning) ${t(Msg.usageUnavailable)}`;
        statusBarItem.tooltip = t(Msg.couldNotFetchUsageClick);
      } else {
        statusBarItem.text = statusBarItem.text.replace("$(loading~spin)", "$(pulse)");
      }
    }

    DashboardPanel.currentPanel?.postState(getDashboardState());
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`Error in updateUsage: ${msg}`);
    lastError = msg;
    if (!lastData) {
      statusBarItem.text = `$(warning) ${t(Msg.usageUnavailable)}`;
      statusBarItem.tooltip = t(Msg.errorPrefix, msg);
    } else {
      statusBarItem.text = statusBarItem.text.replace("$(loading~spin)", "$(pulse)");
    }
  } finally {
    isFetching = false;
    lastFetchTime = Date.now();
  }
}

async function showDetails() {
  if (!lastData) {
    const refreshLabel = t(Msg.refresh);
    const openDashboardLabel = t(Msg.openDashboard);
    const showLogsLabel = t(Msg.showLogs);
    const action = await vscode.window.showWarningMessage(
      lastError
        ? t(Msg.usageUnavailableWithError, lastError)
        : t(Msg.usageNotAvailableYet),
      refreshLabel,
      openDashboardLabel,
      showLogsLabel,
    );
    if (action === refreshLabel) await updateUsage();
    else if (action === openDashboardLabel) await vscode.commands.executeCommand(OPEN_DASHBOARD_COMMAND);
    else if (action === showLogsLabel) outputChannel.show();
    return;
  }

  const { includedRequests, onDemand, resetsAt, totalPercentUsed, autoPercentUsed, apiPercentUsed } =
    lastData;
  const spendRatio = getOnDemandRatio(onDemand);
  const spendPct = spendRatio === null ? null : Math.round(spendRatio * 100);
  const onDemandVisible = isOnDemandVisible(onDemand);

  let message: string;
  if (totalPercentUsed !== null) {
    const parts = [t(Msg.totalSummary, formatPlanPercent(totalPercentUsed))];
    if (autoPercentUsed !== null) parts.push(t(Msg.firstPartySummary, formatPlanPercent(autoPercentUsed)));
    if (apiPercentUsed !== null) parts.push(t(Msg.apiSummary, formatPlanPercent(apiPercentUsed)));
    message = parts.join(" · ");
  } else {
    const reqPct =
      includedRequests.limit > 0
        ? Math.round((includedRequests.used / includedRequests.limit) * 100)
        : 0;
    message = t(Msg.requestsSummary, includedRequests.used, includedRequests.limit, reqPct);
  }
  if (onDemandVisible) {
    const spendText = onDemand.state === "unlimited"
      ? `$${onDemand.spendDollars.toFixed(2)}`
      : `$${onDemand.spendDollars.toFixed(2)}/$${(onDemand.limitDollars ?? 0).toFixed(2)} (${spendPct ?? 0}%)`;
    message += ` | ${t(Msg.onDemandSummary, spendText)}`;
  }
  if (resetsAt) message += ` | ${formatResetDate(resetsAt)}`;

  const openDashboardLabel = t(Msg.openDashboard);
  const refreshLabel = t(Msg.refresh);
  const action = await vscode.window.showInformationMessage(
    message,
    openDashboardLabel,
    refreshLabel,
  );

  if (action === openDashboardLabel) {
    await vscode.commands.executeCommand(OPEN_DASHBOARD_COMMAND);
  } else if (action === refreshLabel) {
    await updateUsage();
  }
}

async function openDurationSetting() {
  await vscode.commands.executeCommand("workbench.action.openSettings", "cursorUsage.usageDuration");
}

function getDashboardState(): DashboardState {
  return buildDashboardState(
    lastData,
    lastEvents ?? [],
    lastDailySpend ?? [],
    isTeamMemberCached(),
    lastError,
    Date.now(),
    getConfig().quotaAwareEventDisplay,
  );
}

export function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel(t(Msg.cursorUsage));
  log("Extension activating...");

  configure({ logger: log });

  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = OPEN_DASHBOARD_COMMAND;
  statusBarItem.text = `$(loading~spin) ${t(Msg.usage)}`;
  statusBarItem.show();

  const showDetailsCmd = vscode.commands.registerCommand("cursor-usage.showDetails", showDetails);
  const refreshCmd = vscode.commands.registerCommand("cursor-usage.refresh", updateUsage);
  const openDurationSettingCmd = vscode.commands.registerCommand(OPEN_DURATION_SETTING_COMMAND, openDurationSetting);
  const openDashboardCmd = vscode.commands.registerCommand(OPEN_DASHBOARD_COMMAND, () => {
    DashboardPanel.createOrShow(context, updateUsage, getDashboardState);
    DashboardPanel.currentPanel?.postState(getDashboardState());
  });

  const configListener = vscode.workspace.onDidChangeConfiguration((e) => {
    if (
      lastData
      && (e.affectsConfiguration("cursorUsage.minimalMode")
        || e.affectsConfiguration("cursorUsage.usageDuration")
        || e.affectsConfiguration("cursorUsage.modelBreakdownSortBy")
        || e.affectsConfiguration("cursorUsage.modelBreakdownSortOrder")
        || e.affectsConfiguration("cursorUsage.excludeZeroTokenModels")
        || e.affectsConfiguration("cursorUsage.quotaAwareEventDisplay"))
    ) {
      updateStatusBar(lastData);
      DashboardPanel.currentPanel?.postState(getDashboardState());
    }
  });

  const docChangeListener = vscode.workspace.onDidChangeTextDocument((e) => {
    if (e.document.uri.scheme === "file") {
      scheduleRefresh();
    }
  });

  const focusListener = vscode.window.onDidChangeWindowState(refreshOnFocus);

  const themeListener = vscode.window.onDidChangeActiveColorTheme(() => {
    if (lastData) updateStatusBar(lastData);
  });

  context.subscriptions.push(
    statusBarItem, showDetailsCmd, refreshCmd, openDurationSettingCmd, openDashboardCmd,
    configListener, docChangeListener, focusListener, themeListener,
    outputChannel,
  );

  log("Extension activated, fetching initial usage...");
  updateUsage();
}

export function deactivate() {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = undefined;
  }
}
