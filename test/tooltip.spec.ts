import { describe, expect, it } from "bun:test";
import { buildUsageByModelHeadingMarkdown, buildUsageOverviewMarkdown } from "../src/tooltip";

const progressBar = {
  markdown: (ratio: number) => `[bar:${ratio.toFixed(2)}]`,
  html: (ratio: number) => `<bar:${ratio.toFixed(2)}>`,
  divider: () => "<divider />",
};

describe("buildUsageOverviewMarkdown", () => {
  it("renders Spending-style Total / First-party / API / On-demand for modern plans", () => {
    const markdown = buildUsageOverviewMarkdown(
      {
        planName: "Ultra",
        includedRequests: { used: 0, limit: 0 },
        onDemand: { state: "limited", spendDollars: 0, limitDollars: 400 },
        totalPercentUsed: 16,
        autoPercentUsed: 20,
        apiPercentUsed: 1,
      },
      progressBar,
    );

    expect(markdown).toContain("<sub>Total</sub>");
    expect(markdown).toContain("<strong>16%</strong>");
    expect(markdown).toContain("<sub>First-party models</sub>");
    expect(markdown).toContain("<strong>20%</strong>");
    expect(markdown).toContain("<sub>API</sub>");
    expect(markdown).toContain("<strong>1%</strong>");
    expect(markdown).toContain("<sub>On-demand</sub>");
    expect(markdown).toContain("<strong>$0.00 / $400.00</strong>");
    expect(markdown).toContain("<bar:0.16>");
    expect(markdown).toContain("<bar:0.20>");
    expect(markdown).toContain("<bar:0.01>");
    // 2×2 grid: Total | First-party, then API | On-demand
    expect(markdown).toContain("<td><sub>Total</sub></td><td width=\"2%\" rowspan=\"3\" valign=\"top\"><divider /></td><td><sub>First-party models</sub></td>");
    expect(markdown).toContain("<td><sub>API</sub></td><td width=\"2%\" rowspan=\"3\" valign=\"top\"><divider /></td><td><sub>On-demand</sub></td>");
    expect(markdown).not.toContain("Included");
    expect(markdown).not.toContain("0 / 0");
  });

  it("renders legacy two-column summary for request-quota plans", () => {
    const markdown = buildUsageOverviewMarkdown(
      {
        includedRequests: { used: 500, limit: 500 },
        onDemand: { state: "limited", spendDollars: 66.89, limitDollars: 200 },
        totalPercentUsed: null,
        autoPercentUsed: null,
        apiPercentUsed: null,
      },
      progressBar,
    );

    expect(markdown).toContain("<td><sub>Included requests</sub></td>");
    expect(markdown).toContain("<td><sub>On-demand</sub></td>");
    expect(markdown).toContain("<td width=\"2%\" rowspan=\"3\" valign=\"top\"><divider /></td>");
    expect(markdown).toContain("<strong>500 / 500</strong>");
    expect(markdown).toContain("<strong>$66.89 / $200.00</strong>");
    expect(markdown).toContain("<bar:1.00>");
    expect(markdown).toContain("<bar:0.33>");
  });

  it("renders unlimited copy for legacy plans", () => {
    const markdown = buildUsageOverviewMarkdown(
      {
        includedRequests: { used: 500, limit: 500 },
        onDemand: { state: "unlimited", spendDollars: 66.89, limitDollars: null },
        totalPercentUsed: null,
        autoPercentUsed: null,
        apiPercentUsed: null,
      },
      progressBar,
    );

    expect(markdown).toContain("<strong>500 / 500</strong>");
    expect(markdown).toContain("<strong>$66.89</strong>");
    expect(markdown).toContain("<sub>Unlimited</sub>");
  });

  it("renders a single-column legacy summary when on-demand is hidden", () => {
    const markdown = buildUsageOverviewMarkdown(
      {
        includedRequests: { used: 42, limit: 500 },
        onDemand: { state: "disabled", spendDollars: 0, limitDollars: null },
        totalPercentUsed: null,
        autoPercentUsed: null,
        apiPercentUsed: null,
      },
      progressBar,
    );

    expect(markdown).toContain("<td width=\"100%\"><sub>Included requests</sub></td>");
    expect(markdown).toContain("<strong>42 / 500</strong>");
    expect(markdown).toContain("<bar:0.08>");
    expect(markdown).not.toContain("On-demand");
  });
});

describe("buildUsageByModelHeadingMarkdown", () => {
  it("includes a Change link that routes to the duration setting", () => {
    const markdown = buildUsageByModelHeadingMarkdown("billingCycle");
    expect(markdown).toContain("command:cursor-usage.openDurationSetting");
  });
});
