import { describe, expect, it } from "bun:test";
import {
  fetchUsdRate,
  formatAmountPair,
  formatAmountWithUsd,
  formatCents,
  formatPrimaryAmount,
  resolveDisplayCurrency,
} from "../src/currency";

describe("resolveDisplayCurrency", () => {
  it("uses an explicit currency", () => {
    expect(resolveDisplayCurrency("eur", "ja-JP")).toBe("eur");
  });

  it("maps auto from the UI locale", () => {
    expect(resolveDisplayCurrency("auto", "ja")).toBe("jpy");
    expect(resolveDisplayCurrency("auto", "zh-CN")).toBe("cny");
    expect(resolveDisplayCurrency("auto", "en-US")).toBe("usd");
  });
});

describe("money formatting", () => {
  it("keeps dollars when the rate is missing", () => {
    expect(formatPrimaryAmount(12.5, "jpy", null)).toBe("$12.50");
  });

  it("rounds yen and yuan", () => {
    expect(formatPrimaryAmount(12.5, "jpy", 150)).toBe("¥1875");
    expect(formatPrimaryAmount(12.5, "cny", 7.2)).toBe("90元");
  });

  it("keeps two decimals for euro and pound", () => {
    expect(formatAmountPair(12.5, 40, "eur", 0.92)).toBe("€11.50 / €36.80");
    expect(formatAmountPair(12.5, null, "gbp", 0.8)).toBe("£10.00");
  });

  it("appends the USD pair when showing a local currency", () => {
    expect(formatAmountWithUsd(12.5, 40, { currency: "jpy", rate: 150 })).toBe(
      "¥1875 / ¥6000 ($12.50 / $40.00)",
    );
    expect(formatAmountWithUsd(12.5, null, { currency: "usd", rate: 1 })).toBe("$12.50");
    expect(formatCents(1250, { currency: "jpy", rate: 150 })).toBe("¥1875");
  });
});

describe("fetchUsdRate", () => {
  it("returns 1 for USD without calling the network", async () => {
    let called = false;
    const rate = await fetchUsdRate("usd", async () => {
      called = true;
      throw new Error("should not fetch");
    });
    expect(rate).toBe(1);
    expect(called).toBeFalse();
  });

  it("reads the Frankfurter cross rate", async () => {
    const rate = await fetchUsdRate("jpy", async () =>
      new Response(JSON.stringify({ rates: { JPY: 150.2 } }), { status: 200 }),
    );
    expect(rate).toBe(150.2);
  });
});
