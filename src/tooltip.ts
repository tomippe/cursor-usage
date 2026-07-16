import type { UsagePayload } from "./cursor-api";
import { getDurationLabel } from "./duration-options";
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

function formatOnDemandValue(onDemand: OnDemandUsage): string {
  if (onDemand.state === "unlimited") {
    return `$${onDemand.spendDollars.toFixed(2)}`;
  }
  return `$${onDemand.spendDollars.toFixed(2)} / $${(onDemand.limitDollars ?? 0).toFixed(2)}`;
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

/** Spending-style 2×2 grid: Total / First-party / API / On-demand */
function buildModernPlanOverview(
  data: Pick<
    UsagePayload,
    "totalPercentUsed" | "autoPercentUsed" | "apiPercentUsed" | "onDemand"
  >,
  renderProgressBar: ProgressBarRenderer,
): string {
  const rows: OverviewMetric[] = [
    {
      label: "Total",
      value: formatPlanPercent(data.totalPercentUsed ?? 0),
      footer: renderProgressBar.html(percentRatio(data.totalPercentUsed)),
    },
  ];

  if (data.autoPercentUsed !== null && data.autoPercentUsed !== undefined) {
    rows.push({
      label: "First-party models",
      value: formatPlanPercent(data.autoPercentUsed),
      footer: renderProgressBar.html(percentRatio(data.autoPercentUsed)),
    });
  }

  if (data.apiPercentUsed !== null && data.apiPercentUsed !== undefined) {
    rows.push({
      label: "API",
      value: formatPlanPercent(data.apiPercentUsed),
      footer: renderProgressBar.html(percentRatio(data.apiPercentUsed)),
    });
  }

  if (data.onDemand.state !== "disabled") {
    if (data.onDemand.state === "unlimited") {
      rows.push({
        label: "On-demand",
        value: formatOnDemandValue(data.onDemand),
        footer: "<sub>Unlimited</sub>",
      });
    } else {
      const spendRatio = getOnDemandRatio(data.onDemand);
      rows.push({
        label: "On-demand",
        value: formatOnDemandValue(data.onDemand),
        footer:
          spendRatio === null ? "<sub>Spend unavailable</sub>" : renderProgressBar.html(spendRatio),
      });
    }
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
): string {
  const { includedRequests, onDemand } = data;
  const reqRatio = includedRequests.limit > 0 ? includedRequests.used / includedRequests.limit : 0;

  if (onDemand.state === "disabled") {
    return [
      `<table width="100%" cellspacing="0" cellpadding="0">`,
      `  <tr><td width="100%"><sub>Included requests</sub></td></tr>`,
      `  <tr><td><strong>${includedRequests.used} / ${includedRequests.limit}</strong></td></tr>`,
      `  <tr><td>${renderProgressBar.html(reqRatio)}</td></tr>`,
      `</table>`,
      ``,
    ].join("\n");
  }

  const onDemandValue = formatOnDemandValue(onDemand);
  const onDemandFooter =
    onDemand.state === "unlimited"
      ? "<sub>Unlimited</sub>"
      : (() => {
          const spendRatio = getOnDemandRatio(onDemand);
          return spendRatio === null
            ? "<sub>Spend unavailable</sub>"
            : renderProgressBar.html(spendRatio);
        })();

  return [
    `<table width="100%" cellspacing="0" cellpadding="0">`,
    `  <tr><td><sub>Included requests</sub></td><td width="2%" rowspan="3" valign="top">${renderProgressBar.divider()}</td><td><sub>On-demand</sub></td></tr>`,
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
): string {
  if (hasModernPlanUsage(data)) {
    return buildModernPlanOverview(data, renderProgressBar);
  }
  return buildLegacyRequestOverview(data, renderProgressBar);
}

export function buildUsageByModelHeadingMarkdown(duration: UsageDuration): string {
  return `**Usage by Model** *(${getDurationLabel(duration)})* &nbsp;[Change](command:${OPEN_DURATION_SETTING_COMMAND})\n\n`;
}
