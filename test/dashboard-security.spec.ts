import { describe, expect, it } from "bun:test";
import { readFileSync } from "fs";

describe("dashboard security hardening", () => {
  it("guards CSV exports against spreadsheet formula injection", () => {
    const dashboardScript = readFileSync("media/dashboard/dashboard.js", "utf-8");

    expect(dashboardScript).toContain("/^\\s*[=+\\-@]/");
    expect(dashboardScript).toContain("\"'\" + s");
  });

  it("keeps CSV spend in USD", () => {
    const dashboardScript = readFileSync("media/dashboard/dashboard.js", "utf-8");
    expect(dashboardScript).toContain("SpendUSD");
    expect(dashboardScript).toContain("eventSpendDollars(e).toFixed(4)");
  });

  it("places the currency control after the refresh button", () => {
    const panel = readFileSync("src/dashboard-panel.ts", "utf-8");
    const refresh = panel.indexOf('id="refresh-btn"');
    const currency = panel.indexOf('id="currency-select"');
    expect(refresh).toBeGreaterThan(-1);
    expect(currency).toBeGreaterThan(refresh);
    expect(panel).toContain("currency-select-text");
  });
});
