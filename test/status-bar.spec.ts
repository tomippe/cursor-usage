import { describe, expect, it } from "bun:test";
import { formatMenuBarOnDemandSuffix } from "../src/currency";
import {
  formatAutoApiPercent,
  formatModernStatusBarBody,
  formatModernStatusBarText,
} from "../src/status-bar";

describe("formatModernStatusBarBody", () => {
  it("uses used percent for first-party and API like the app layout", () => {
    const text = formatModernStatusBarBody(
      83.2,
      100,
      { state: "limited", spendDollars: 0.85, limitDollars: 1 },
      true,
      { currency: "jpy", rate: 150 },
    );
    expect(text).toContain("83.2%");
    expect(text).toContain("100%");
    expect(text).toContain("First-party");
    expect(text).toContain("/ API");
    expect(text).toContain(formatMenuBarOnDemandSuffix(0.85, { currency: "jpy", rate: 150 }));
    expect(text).not.toContain("16.8%");
  });

  it("omits on-demand suffix when hidden", () => {
    const text = formatModernStatusBarBody(
      10,
      1,
      { state: "disabled", spendDollars: 0, limitDollars: null },
      false,
      { currency: "usd", rate: 1 },
    );
    expect(text).not.toContain(" / $");
  });
});

describe("formatModernStatusBarText", () => {
  it("matches the app menu line layout with plan, total used %, and detail in parentheses", () => {
    const text = formatModernStatusBarText(
      "Ultra",
      85.6,
      83.2,
      100,
      { state: "limited", spendDollars: 0.85, limitDollars: 1 },
      true,
      { currency: "usd", rate: 1 },
    );
    expect(text).toBe("Ultra 85.6% (First-party 83.2% / API 100% / $0.85)");
    expect(text).not.toContain("|");
  });
});

describe("formatAutoApiPercent", () => {
  it("shows a dash when API data is missing", () => {
    expect(formatAutoApiPercent(null)).toBe("—");
  });
});
