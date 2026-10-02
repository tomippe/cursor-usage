import type { UsagePayload } from "./cursor-api";
import { formatMenuBarOnDemandSuffix, type MoneyDisplay } from "./currency";
import { Msg, t } from "./i18n";
import { formatPlanPercent } from "./tooltip";

type OnDemandUsage = UsagePayload["onDemand"];

export function formatAutoApiPercent(percent: number | null | undefined): string {
  if (percent === null || percent === undefined) return "—";
  return formatPlanPercent(percent);
}

/** App-style status bar body: First-party / API [/ on-demand spend]. Uses **used** %, not remaining. */
export function formatModernStatusBarBody(
  autoPercentUsed: number | null | undefined,
  apiPercentUsed: number | null | undefined,
  onDemand: OnDemandUsage,
  onDemandVisible: boolean,
  money: MoneyDisplay,
): string {
  const auto = formatAutoApiPercent(autoPercentUsed);
  const api = formatAutoApiPercent(apiPercentUsed);
  let text = t(Msg.statusBarAutoApi, auto, api);
  if (onDemandVisible && onDemand.state !== "disabled") {
    text += formatMenuBarOnDemandSuffix(onDemand.spendDollars, money);
  }
  return text;
}

/** App menu line without the product prefix: `Ultra 85.6% (純正 … / API … / ¥…)` — used % throughout. */
export function formatModernStatusBarText(
  planName: string | null | undefined,
  totalPercentUsed: number,
  autoPercentUsed: number | null | undefined,
  apiPercentUsed: number | null | undefined,
  onDemand: OnDemandUsage,
  onDemandVisible: boolean,
  money: MoneyDisplay,
): string {
  const detail = formatModernStatusBarBody(
    autoPercentUsed,
    apiPercentUsed,
    onDemand,
    onDemandVisible,
    money,
  );
  const total = formatPlanPercent(totalPercentUsed);
  const plan = planName?.trim();
  if (plan) {
    return t(Msg.statusBarModernLine, plan, total, detail);
  }
  return t(Msg.statusBarModernLineNoPlan, total, detail);
}

export function hasModernPlanUsage(
  data: Pick<UsagePayload, "totalPercentUsed">,
): boolean {
  return data.totalPercentUsed !== null && data.totalPercentUsed !== undefined;
}
