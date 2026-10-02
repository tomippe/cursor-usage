import type { UsagePayload } from "./cursor-api";
import { formatAmountWithUsd, type MoneyDisplay } from "./currency";
import { getDurationLabel } from "./duration-options";
import { Msg, t } from "./i18n";
import type { UsageDuration } from "./model-breakdown";

type OnDemandUsage = UsagePayload["onDemand"];

export function formatPlanPercent(percent: number): string {
  const rounded = Math.round(percent);
  if (Math.abs(percent - rounded) < 0.05) {
    return `${rounded}%`;
  }
  return `${percent.toFixed(1)}%`;
}

type ProgressBarRenderer = {
  markdown: (ratio: number) => string;
  html: (ratio: number) => string;
  divider: () => string;
};

export const OPEN_DURATION_SETTING_COMMAND = "cursor-usage.openDurationSetting";

function getOnDemandRatio(onDemand: OnDemandUsage): number | null {
  if (onDemand.state !== "limited") return null;
  if (onDemand.limitDollars === null || onDemand.limitDollars <= 0) return null;
  return onDemand.spendDollars / onDemand.limitDollars;
}

function formatOnDemandValue(onDemand: OnDemandUsage, money?: MoneyDisplay): string {
  const display = money ?? { currency: "usd" as const, rate: 1 };
  const limit = onDemand.state === "limited" ? onDemand.limitDollars : null;
  return formatAmountWithUsd(onDemand.spendDollars, limit, display);
}

function percentRatio(percent: number | null | undefined): number {
  if (percent === null || percent === undefined) return 0;
  return Math.min(1, Math.max(0, percent / 100));
}

function hasModernPlanUsage(
  data: Pick<UsagePayload, "totalPercentUsed" | "autoPercentUsed" | "apiPercentUsed">,
): boolean {
  return data.totalPercentUsed !== null && data.totalPercentUsed !== undefined;
}

type OverviewMetric = { label: string; value: string; footer: string };

function appendOverviewPair(
  lines: string[],
  left: OverviewMetric,
  right: OverviewMetric | undefined,
  renderProgressBar: ProgressBarRenderer,
): void {
  if (!right) {
    lines.push(`  <tr><td width="100%"><sub>${left.label}</sub></td></tr>`);
    lines.push(`  <tr><td><strong>${left.value}</strong></td></tr>`);
    lines.push(`  <tr><td>${left.footer}</td></tr>`);
    return;
  }

  lines.push(
    `  <tr><td><sub>${left.label}</sub></td><td width="2%" rowspan="3" valign="top">${renderProgressBar.divider()}</td><td><sub>${right.label}</sub></td></tr>`,
  );
  lines.push(
    `  <tr><td><strong>${left.value}</strong></td><td><strong>${right.value}</strong></td></tr>`,
  );
  lines.push(`  <tr><td>${left.footer}</td><td>${right.footer}</td></tr>`);
}

/** Spending-style 2×2 grid: Total / First-party / On-demand / API */
function buildModernPlanOverview(
  data: Pick<
    UsagePayload,
    "totalPercentUsed" | "autoPercentUsed" | "apiPercentUsed" | "onDemand"
  >,
  renderProgressBar: ProgressBarRenderer,
  money?: MoneyDisplay,
): string {
  const rows: OverviewMetric[] = [
    {
      label: t(Msg.total),
      value: formatPlanPercent(data.totalPercentUsed ?? 0),
      footer: renderProgressBar.html(percentRatio(data.totalPercentUsed)),
    },
  ];

  if (data.autoPercentUsed !== null && data.autoPercentUsed !== undefined) {
    rows.push({
      label: t(Msg.firstPartyModels),
      value: formatPlanPercent(data.autoPercentUsed),
      footer: renderProgressBar.html(percentRatio(data.autoPercentUsed)),
    });
  }

  if (data.onDemand.state !== "disabled") {
    if (data.onDemand.state === "unlimited") {
      rows.push({
        label: t(Msg.onDemand),
        value: formatOnDemandValue(data.onDemand, money),
        footer: `<sub>${t(Msg.unlimited)}</sub>`,
      });
    } else {
      const spendRatio = getOnDemandRatio(data.onDemand);
      rows.push({
        label: t(Msg.onDemand),
        value: formatOnDemandValue(data.onDemand, money),
        footer:
          spendRatio === null
            ? `<sub>${t(Msg.spendUnavailable)}</sub>`
            : renderProgressBar.html(spendRatio),
      });
    }
  }

  if (data.apiPercentUsed !== null && data.apiPercentUsed !== undefined) {
    rows.push({
      label: t(Msg.api),
      value: formatPlanPercent(data.apiPercentUsed),
      footer: renderProgressBar.html(percentRatio(data.apiPercentUsed)),
    });
  }

  const lines = [`<table width="100%" cellspacing="0" cellpadding="0">`];
  for (let i = 0; i < rows.length; i += 2) {
    appendOverviewPair(lines, rows[i]!, rows[i + 1], renderProgressBar);
  }
  lines.push(`</table>`, ``);
  return lines.join("\n");
}

/** Legacy request-quota plans (Enterprise / old Pro request pools). */
function buildLegacyRequestOverview(
  data: Pick<UsagePayload, "includedRequests" | "onDemand">,
  renderProgressBar: ProgressBarRenderer,
  money?: MoneyDisplay,
): string {
  const { includedRequests, onDemand } = data;
  const reqRatio = includedRequests.limit > 0 ? includedRequests.used / includedRequests.limit : 0;

  if (onDemand.state === "disabled") {
    return [
      `<table width="100%" cellspacing="0" cellpadding="0">`,
      `  <tr><td width="100%"><sub>${t(Msg.includedRequests)}</sub></td></tr>`,
      `  <tr><td><strong>${includedRequests.used} / ${includedRequests.limit}</strong></td></tr>`,
      `  <tr><td>${renderProgressBar.html(reqRatio)}</td></tr>`,
      `</table>`,
      ``,
    ].join("\n");
  }

  const onDemandValue = formatOnDemandValue(onDemand, money);
  const onDemandFooter =
    onDemand.state === "unlimited"
      ? `<sub>${t(Msg.unlimited)}</sub>`
      : (() => {
          const spendRatio = getOnDemandRatio(onDemand);
          return spendRatio === null
            ? `<sub>${t(Msg.spendUnavailable)}</sub>`
            : renderProgressBar.html(spendRatio);
        })();

  return [
    `<table width="100%" cellspacing="0" cellpadding="0">`,
    `  <tr><td><sub>${t(Msg.includedRequests)}</sub></td><td width="2%" rowspan="3" valign="top">${renderProgressBar.divider()}</td><td><sub>${t(Msg.onDemand)}</sub></td></tr>`,
    `  <tr><td><strong>${includedRequests.used} / ${includedRequests.limit}</strong></td><td><strong>${onDemandValue}</strong></td></tr>`,
    `  <tr><td>${renderProgressBar.html(reqRatio)}</td><td>${onDemandFooter}</td></tr>`,
    `</table>`,
    ``,
  ].join("\n");
}

export function buildUsageOverviewMarkdown(
  data: Pick<
    UsagePayload,
    "includedRequests" | "onDemand" | "totalPercentUsed" | "autoPercentUsed" | "apiPercentUsed"
  >,
  renderProgressBar: ProgressBarRenderer,
  money?: MoneyDisplay,
): string {
  if (hasModernPlanUsage(data)) {
    return buildModernPlanOverview(data, renderProgressBar, money);
  }
  return buildLegacyRequestOverview(data, renderProgressBar, money);
}

export function buildUsageByModelHeadingMarkdown(duration: UsageDuration): string {
  return `**${t(Msg.usageByModel)}** *(${getDurationLabel(duration)})* &nbsp;[${t(Msg.change)}](command:${OPEN_DURATION_SETTING_COMMAND})\n\n`;
}
