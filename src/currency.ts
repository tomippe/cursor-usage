export const DISPLAY_CURRENCIES = ["usd", "eur", "jpy", "gbp", "cny"] as const;
export type DisplayCurrency = (typeof DISPLAY_CURRENCIES)[number];
export type DisplayCurrencySetting = DisplayCurrency | "auto";

export type MoneyDisplay = {
  currency: DisplayCurrency;
  rate: number | null;
};

export function isDisplayCurrency(value: unknown): value is DisplayCurrency {
  return DISPLAY_CURRENCIES.includes(value as DisplayCurrency);
}

export function isDisplayCurrencySetting(value: unknown): value is DisplayCurrencySetting {
  return value === "auto" || isDisplayCurrency(value);
}

export function resolveDisplayCurrency(setting: unknown, locale: string): DisplayCurrency {
  if (isDisplayCurrency(setting)) return setting;
  const lang = locale.toLowerCase();
  if (lang.startsWith("ja")) return "jpy";
  if (lang.startsWith("zh")) return "cny";
  return "usd";
}

export function frankfurterCode(currency: DisplayCurrency): string | null {
  if (currency === "usd") return null;
  return currency.toUpperCase();
}

export function formatUsd(dollars: number): string {
  return `$${(dollars || 0).toFixed(2)}`;
}

export function formatPrimaryAmount(
  dollars: number,
  currency: DisplayCurrency,
  rate: number | null,
): string {
  if (currency === "usd" || rate === null) return formatUsd(dollars);
  const local = dollars * rate;
  if (currency === "eur") return `€${local.toFixed(2)}`;
  if (currency === "gbp") return `£${local.toFixed(2)}`;
  if (currency === "jpy") return `¥${Math.round(local)}`;
  return `${Math.round(local)}元`;
}

export function formatAmountWithUsd(
  spendDollars: number,
  limitDollars: number | null,
  money: MoneyDisplay,
): string {
  const primary = formatAmountPair(spendDollars, limitDollars, money.currency, money.rate);
  if (money.currency === "usd" || money.rate === null) return primary;
  const usd = formatAmountPair(spendDollars, limitDollars, "usd", 1);
  return `${primary} (${usd})`;
}

export function formatAmountPair(
  spendDollars: number,
  limitDollars: number | null,
  currency: DisplayCurrency,
  rate: number | null,
): string {
  const spend = formatPrimaryAmount(spendDollars, currency, rate);
  if (limitDollars === null) return spend;
  return `${spend} / ${formatPrimaryAmount(limitDollars, currency, rate)}`;
}

export function formatCents(cents: number, money: MoneyDisplay): string {
  return formatPrimaryAmount(cents / 100, money.currency, money.rate);
}

/** Menu-bar suffix: spend only (no limit), e.g. ` / ¥134` — matches AI Usage app. */
export function formatMenuBarOnDemandSuffix(spendDollars: number, money: MoneyDisplay): string {
  return ` / ${formatPrimaryAmount(spendDollars, money.currency, money.rate)}`;
}

export async function fetchUsdRate(
  currency: DisplayCurrency,
  fetchImpl: typeof fetch = fetch,
): Promise<number | null> {
  const code = frankfurterCode(currency);
  if (!code) return 1;
  try {
    const res = await fetchImpl(`https://api.frankfurter.app/latest?from=USD&to=${code}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const data = asRecord(await res.json());
    const rates = data ? asRecord(data.rates) : null;
    const rate = rates ? toFiniteNumber(rates[code]) : null;
    return rate !== null && rate > 0 ? rate : null;
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function toFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
