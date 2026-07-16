import { describe, expect, it } from "bun:test";
import { readFileSync } from "fs";
import packageJson from "../package.json";
import packageNls from "../package.nls.json";

describe("package configuration", () => {
  it("shows a friendly label for billing cycle in the usage duration setting", () => {
    const usageDurationConfig = packageJson.contributes.configuration.properties["cursorUsage.usageDuration"];

    expect(usageDurationConfig.enum).toContain("billingCycle");
    expect(usageDurationConfig.enumItemLabels).toEqual([
      "%config.usageDuration.enum.1d%",
      "%config.usageDuration.enum.7d%",
      "%config.usageDuration.enum.30d%",
      "%config.usageDuration.enum.billingCycle%",
    ]);
    expect(packageNls["config.usageDuration.enum.billingCycle"]).toBe("Current Billing Cycle");
  });

  it("publishes under the tomippe fork identity", () => {
    expect(packageJson.displayName).toBe("%extension.displayName%");
    expect(packageNls["extension.displayName"]).toBe("Cursor Usage by tomippe");
    expect(packageJson.publisher).toBe("tomippe");
    expect(packageJson.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(packageJson.scripts["package:vsm"]).toContain("cursor-usage-tomippe");
    expect(packageJson.scripts["publish:vsm"]).toContain("cursor-usage-tomippe");
  });

  it("ships runtime localization bundles", () => {
    expect(packageJson.l10n).toBe("./l10n");
  });

  it("keeps a unique VS Marketplace package id distinct from Open VSX name", () => {
    expect(packageJson.name).toBe("cursor-usage");
  });

  it("exposes model table sorting settings with token-desc defaults", () => {
    const sortByConfig = packageJson.contributes.configuration.properties["cursorUsage.modelBreakdownSortBy"];
    const sortOrderConfig = packageJson.contributes.configuration.properties["cursorUsage.modelBreakdownSortOrder"];

    expect(sortByConfig.default).toBe("tokens");
    expect(sortByConfig.enum).toEqual(["model", "requests", "tokens", "spend"]);
    expect(sortByConfig.enumItemLabels).toEqual([
      "%config.modelBreakdownSortBy.enum.model%",
      "%config.modelBreakdownSortBy.enum.requests%",
      "%config.modelBreakdownSortBy.enum.tokens%",
      "%config.modelBreakdownSortBy.enum.spend%",
    ]);

    expect(sortOrderConfig.default).toBe("desc");
    expect(sortOrderConfig.enum).toEqual(["asc", "desc"]);
    expect(sortOrderConfig.enumItemLabels).toEqual([
      "%config.modelBreakdownSortOrder.enum.asc%",
      "%config.modelBreakdownSortOrder.enum.desc%",
    ]);
  });

  it("exposes a setting to hide zero-token models in the breakdown", () => {
    const hideZeroTokenConfig = packageJson.contributes.configuration.properties["cursorUsage.excludeZeroTokenModels"];

    expect(hideZeroTokenConfig.default).toBe(false);
    expect(hideZeroTokenConfig.type).toBe("boolean");
  });

  it("exposes a setting for quota-aware event display", () => {
    const quotaAwareConfig = packageJson.contributes.configuration.properties["cursorUsage.quotaAwareEventDisplay"];

    expect(quotaAwareConfig.default).toBe(true);
    expect(quotaAwareConfig.type).toBe("boolean");
  });

  it("does not depend on external sqlite binaries or native bindings", () => {
    const vscodeIgnore = readFileSync(".vscodeignore", "utf-8").split(/\r?\n/);
    const esbuildConfig = readFileSync("esbuild.config.mjs", "utf-8");

    expect(packageJson.dependencies).toBeUndefined();
    expect(packageJson.scripts.package).not.toContain("--no-dependencies");
    expect(packageJson.scripts["package:vsm"]).not.toContain("--no-dependencies");
    expect(vscodeIgnore).toContain("node_modules/");
    expect(vscodeIgnore).toContain("node-compile-cache/");
    expect(esbuildConfig).toContain('external: ["vscode"]');
  });
});
