import { randomBytes } from "crypto";
import * as vscode from "vscode";
import type { DashboardState } from "./dashboard-state";
import { getDashboardL10n, Msg, t } from "./i18n";
import { dashboardLocaleFormatScript, uiLocale } from "./locale";

export const OPEN_DASHBOARD_COMMAND = "cursor-usage.openDashboard";

type RefreshFn = () => Promise<void>;
type StateProvider = () => DashboardState | null;

function makeNonce(): string {
  return randomBytes(16).toString("base64url");
}

export class DashboardPanel {
  static currentPanel: DashboardPanel | undefined;

  static createOrShow(
    context: vscode.ExtensionContext,
    onRefresh: RefreshFn,
    getState: StateProvider,
  ): DashboardPanel {
    if (DashboardPanel.currentPanel) {
      DashboardPanel.currentPanel.panel.reveal(vscode.ViewColumn.Active);
      return DashboardPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      "cursorUsageDashboard",
      t(Msg.cursorUsage),
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "media")],
      },
    );

    DashboardPanel.currentPanel = new DashboardPanel(panel, context, onRefresh, getState);
    return DashboardPanel.currentPanel;
  }

  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];

  private constructor(
    panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext,
    onRefresh: RefreshFn,
    getState: StateProvider,
  ) {
    this.panel = panel;
    this.panel.webview.html = this.renderHtml(panel.webview, context.extensionUri);

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    this.panel.webview.onDidReceiveMessage(
      async (msg) => {
        if (!msg || typeof msg !== "object") return;
        if (msg.type === "ready") {
          const state = getState();
          if (state) this.postState(state);
        } else if (msg.type === "refresh") {
          this.postLoading(true);
          try {
            await onRefresh();
          } finally {
            this.postLoading(false);
          }
        }
      },
      null,
      this.disposables,
    );
  }

  postState(state: DashboardState): void {
    this.panel.webview.postMessage({ type: "state", state });
  }

  postLoading(on: boolean): void {
    this.panel.webview.postMessage({ type: "loading", on });
  }

  private dispose(): void {
    DashboardPanel.currentPanel = undefined;
    this.panel.dispose();
    while (this.disposables.length) {
      const d = this.disposables.pop();
      if (d) d.dispose();
    }
  }

  private renderHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
    const mediaUri = (file: string) =>
      webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "media", "dashboard", file));

    const cssUri = mediaUri("dashboard.css");
    const jsUri = mediaUri("dashboard.js");
    const chartUri = mediaUri("chart.umd.js");
    const nonce = makeNonce();
    const csp = [
      `default-src 'none'`,
      `img-src ${webview.cspSource} data:`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src 'nonce-${nonce}' ${webview.cspSource}`,
      `font-src ${webview.cspSource}`,
    ].join("; ");

    const lang = uiLocale().slice(0, 2);
    const l10nJson = JSON.stringify(getDashboardL10n());
    const localeJson = JSON.stringify(uiLocale());

    return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${t(Msg.cursorUsage)}</title>
  <link rel="stylesheet" href="${cssUri}" />
</head>
<body>
  <header class="dashboard-header">
    <h1>${t(Msg.cursorUsage)}</h1>
    <div class="header-actions">
      <span id="last-updated" class="muted"></span>
      <button id="refresh-btn" type="button">${t(Msg.refresh)}</button>
    </div>
  </header>

  <section class="summary-cards" id="summary-cards"></section>

  <section class="controls">
    <div class="range-selector" id="range-selector" role="tablist">
      <button data-range="1d" type="button">${t(Msg.last24Hours)}</button>
      <button data-range="7d" type="button">${t(Msg.last7Days)}</button>
      <button data-range="30d" type="button">${t(Msg.last30Days)}</button>
      <button data-range="billingCycle" type="button">${t(Msg.currentBillingCycle)}</button>
    </div>
  </section>

  <section class="chart-section collapsible-section" data-section="usage">
    <div class="chart-header">
      <div class="section-title-row" data-toggle-section="usage">
        <button
          type="button"
          class="section-toggle"
          data-toggle-section="usage"
          aria-expanded="true"
          aria-controls="section-body-usage"
          aria-label="${t(Msg.toggleYourUsageSection)}"
        >
          <svg class="section-arrow" aria-hidden="true" viewBox="0 0 16 16" width="16" height="16"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <div>
          <h2>${t(Msg.yourUsage)}</h2>
          <p class="muted">${t(Msg.perDayUsageHint)}</p>
        </div>
      </div>
      <div class="chart-filters">
        <label>${t(Msg.usageFilterLabel)}
          <select id="usage-filter">
            <option value="all">${t(Msg.all)}</option>
            <option value="included">${t(Msg.included)}</option>
            <option value="ondemand">${t(Msg.onDemandFilter)}</option>
          </select>
        </label>
        <label>${t(Msg.metricFilterLabel)}
          <select id="metric-filter">
            <option value="spend">${t(Msg.spend)}</option>
            <option value="tokens" selected>${t(Msg.tokens)}</option>
            <option value="requests">${t(Msg.requests)}</option>
          </select>
        </label>
      </div>
    </div>
    <div id="section-body-usage" class="section-body">
      <div class="chart-wrapper">
        <canvas id="usage-chart"></canvas>
      </div>
      <p id="chart-note" class="muted small"></p>
    </div>
  </section>

  <section class="model-breakdown-section collapsible-section" data-section="breakdown">
    <div class="events-header">
      <div class="section-title-row" data-toggle-section="breakdown">
        <button
          type="button"
          class="section-toggle"
          data-toggle-section="breakdown"
          aria-expanded="true"
          aria-controls="section-body-breakdown"
          aria-label="${t(Msg.toggleUsageByModelSection)}"
        >
          <svg class="section-arrow" aria-hidden="true" viewBox="0 0 16 16" width="16" height="16"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <h2>${t(Msg.usageByModel)}</h2>
      </div>
      <span class="muted small" id="breakdown-range-label"></span>
    </div>
    <div id="section-body-breakdown" class="section-body">
      <div class="table-scroll">
        <table id="breakdown-table">
          <thead>
            <tr>
              <th data-sort="model" class="sortable">${t(Msg.model)}</th>
              <th data-sort="requests" class="sortable num">${t(Msg.requests)}</th>
              <th data-sort="totalTokens" class="sortable num">${t(Msg.tokens)}</th>
              <th data-sort="spendCents" class="sortable num">${t(Msg.spend)}</th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
    </div>
  </section>

  <section class="events-section collapsible-section" data-section="events">
    <div class="events-header">
      <div class="section-title-row" data-toggle-section="events">
        <button
          type="button"
          class="section-toggle"
          data-toggle-section="events"
          aria-expanded="true"
          aria-controls="section-body-events"
          aria-label="${t(Msg.toggleEventsSection)}"
        >
          <svg class="section-arrow" aria-hidden="true" viewBox="0 0 16 16" width="16" height="16"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <h2>${t(Msg.events)}</h2>
      </div>
      <button id="export-csv" type="button">${t(Msg.exportCsv)}</button>
    </div>
    <div id="section-body-events" class="section-body">
      <div class="table-scroll">
        <table id="events-table">
          <thead>
            <tr>
              <th data-sort="timestamp" class="sortable">${t(Msg.date)}</th>
              <th data-sort="kind" class="sortable">${t(Msg.type)}</th>
              <th data-sort="model" class="sortable">${t(Msg.model)}</th>
              <th data-sort="totalTokens" class="sortable num">${t(Msg.tokens)}</th>
              <th data-sort="requests" class="sortable num">${t(Msg.requests)}</th>
              <th data-sort="spendCents" class="sortable num">${t(Msg.spend)}</th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
      <div class="pagination" id="pagination"></div>
    </div>
  </section>

  <div id="error-banner" class="error-banner hidden"></div>

  <script nonce="${nonce}">
    window.__L10N__ = ${l10nJson};
    window.__LOCALE__ = ${localeJson};
  </script>
  <script nonce="${nonce}">${dashboardLocaleFormatScript()}</script>
  <script nonce="${nonce}" src="${chartUri}"></script>
  <script nonce="${nonce}" src="${jsUri}"></script>
</body>
</html>`;
  }
}
