import { Msg, t } from "./i18n";
import type { UsageDuration } from "./model-breakdown";

export function isUsageDuration(value: unknown): value is UsageDuration {
  return value === "1d" || value === "7d" || value === "30d" || value === "billingCycle";
}

export function getDurationLabel(duration: UsageDuration): string {
  if (duration === "1d") return t(Msg.hours24);
  if (duration === "7d") return t(Msg.days7);
  if (duration === "30d") return t(Msg.days30);
  return t(Msg.currentBillingCycle);
}

export function normalizeUsageDuration(duration: UsageDuration, hasBillingCycle: boolean): UsageDuration {
  if (duration === "billingCycle" && !hasBillingCycle) {
    return "30d";
  }
  return duration;
}

export function resolveConfiguredUsageDuration(value: unknown, hasBillingCycle: boolean): UsageDuration {
  const configuredDuration = isUsageDuration(value) ? value : "billingCycle";
  return normalizeUsageDuration(configuredDuration, hasBillingCycle);
}
