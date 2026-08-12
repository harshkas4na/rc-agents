"use strict";
/**
 * landing.ts — the human-facing "/" page.
 *
 * This is not a product frontend. rc-agents' customers are AI agents, not
 * people clicking buttons — the actual interface is /openapi.yaml and
 * /skills.md. What a human needs here is not a place to *use* the product but
 * a place to *verify* it: is the automation funded, is it still running, what
 * has it actually executed on-chain, and at what addresses can I check that
 * claim myself.
 *
 * So this is a read-only monitoring surface. Every number on it is an on-chain
 * read, every address links to a block explorer, and there is no control on the
 * page that changes any state. It's a trust surface for the people behind the
 * agents, not a dashboard for driving the thing.
 *
 * Live data is fetched client-side from /api/dashboard rather than rendered
 * server-side: on a serverless cold start, six RPC round-trips would otherwise
 * sit between the visitor and their first byte.
 *
 * The client script is served separately (DASHBOARD_SCRIPT, mounted at
 * /dashboard.js) rather than inlined into this HTML. helmet() sets a default
 * Content-Security-Policy of `script-src 'self'`, which silently refuses inline
 * <script> blocks — an inlined version renders a page permanently stuck on
 * "Loading on-chain state…". Serving it as its own same-origin file satisfies
 * the policy without weakening it.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DASHBOARD_SCRIPT = void 0;
exports.renderLandingPage = renderLandingPage;
function renderLandingPage(baseUrl) {
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>rc-agents — automation marketplace for AI agents</title>
<meta name="description" content="An x402-gated automation marketplace: AI agents pay in USDC for autonomous on-chain DeFi execution. This page is a read-only monitoring surface — the product interface is /openapi.yaml." />
<style>
  :root {
    color-scheme: light dark;
    --bg: #0b0d10;
    --fg: #e8ecef;
    --muted: #8b95a1;
    --accent: #7ee787;
    --warn: #e3b341;
    --dim: #f85149;
    --border: #22262b;
    --card: #12151a;
  }
  @media (prefers-color-scheme: light) {
    :root { --bg: #fafafa; --fg: #14171a; --muted: #5c6570; --accent: #0a7c3f; --warn: #9a6700; --dim: #cf222e; --border: #e2e5e9; --card: #ffffff; }
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    background: var(--bg);
    color: var(--fg);
    font-family: ui-monospace, "SF Mono", "Cascadia Code", Menlo, Consolas, monospace;
    line-height: 1.55;
    padding: 3rem 1.25rem 5rem;
  }
  main { max-width: 860px; margin: 0 auto; }
  .tag {
    display: inline-block;
    font-size: 0.72rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--accent);
    border: 1px solid var(--accent);
    border-radius: 999px;
    padding: 0.15rem 0.65rem;
    margin-bottom: 1.25rem;
  }
  h1 { font-size: 1.5rem; margin: 0 0 0.4rem; line-height: 1.3; }
  .sub { color: var(--muted); margin: 0 0 2rem; font-size: 0.95rem; }
  .agent-callout {
    background: var(--card);
    border: 1px solid var(--border);
    border-left: 3px solid var(--accent);
    border-radius: 8px;
    padding: 1.1rem 1.25rem;
    margin-bottom: 2.5rem;
  }
  .agent-callout p { margin: 0 0 0.6rem; }
  .agent-callout p:last-child { margin-bottom: 0; }
  /* Inline code stays in the sentence; only .block breaks out onto its own line. */
  code {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 0.05rem 0.3rem;
    font-size: 0.85em;
  }
  code.block {
    display: block;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.6rem 0.8rem;
    margin: 0.5rem 0;
    font-size: 0.85rem;
    overflow-x: auto;
    color: var(--accent);
  }
  section { margin-bottom: 2.5rem; }
  h2 { font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); margin: 0 0 0.9rem; }
  ul { padding-left: 0; list-style: none; margin: 0; }
  li { padding: 0.55rem 0; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
  li:last-child { border-bottom: none; }
  li a { color: var(--fg); text-decoration: none; }
  li a:hover { color: var(--accent); }
  .desc { color: var(--muted); font-size: 0.85rem; }
  a { color: var(--accent); }

  /* ── monitoring surface ── */
  .card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 1rem 1.15rem;
    margin-bottom: 1rem;
  }
  .card-head { display: flex; justify-content: space-between; align-items: baseline; gap: 1rem; flex-wrap: wrap; margin-bottom: 0.7rem; }
  .card-title { font-size: 0.95rem; font-weight: 600; }
  .chain { color: var(--muted); font-size: 0.78rem; }
  .dot { display: inline-block; width: 0.55rem; height: 0.55rem; border-radius: 50%; margin-right: 0.4rem; vertical-align: middle; background: var(--muted); }
  .dot.ok { background: var(--accent); }
  .dot.warn { background: var(--warn); }
  .dot.down { background: var(--dim); }
  .kv { display: grid; grid-template-columns: minmax(9rem, auto) 1fr; gap: 0.3rem 1rem; font-size: 0.83rem; }
  .kv dt { color: var(--muted); }
  .kv dd { margin: 0; word-break: break-all; }
  .kv dd a { color: var(--fg); text-decoration: none; border-bottom: 1px dotted var(--border); }
  .kv dd a:hover { color: var(--accent); }
  table { width: 100%; border-collapse: collapse; font-size: 0.8rem; margin-top: 0.8rem; }
  th, td { text-align: left; padding: 0.4rem 0.5rem 0.4rem 0; border-bottom: 1px solid var(--border); white-space: nowrap; }
  th { color: var(--muted); font-weight: 400; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; }
  .scroll { overflow-x: auto; }
  .note { color: var(--muted); font-size: 0.78rem; margin-top: 0.7rem; }
  .empty { color: var(--muted); font-size: 0.83rem; padding: 0.6rem 0; }
  footer { color: var(--muted); font-size: 0.8rem; margin-top: 3rem; border-top: 1px solid var(--border); padding-top: 1.25rem; }
  footer a { color: var(--muted); }
</style>
</head>
<body>
<main>
  <span class="tag">agent-native · x402 · on-chain automation</span>
  <h1>rc-agents</h1>
  <p class="sub">An automation marketplace where AI agents pay in USDC and get autonomous DeFi execution — no accounts, no signup, no human in the loop.</p>

  <div class="agent-callout">
    <p><strong>If you're a human:</strong> this page isn't the product, it's the receipt. There's nothing to click — everything below is a live on-chain read you can independently verify on a block explorer. If you have an AI agent or MCP-capable tool, hand it one of these:</p>
    <code class="block">${baseUrl}/skills.md</code>
    <code class="block">${baseUrl}/openapi.yaml</code>
    <p><strong>If you're an agent reading this:</strong> the skill card above says when to use these services and how the x402 payment loop behaves; the OpenAPI 3.1 spec has the full request and response schemas. Start with <code>GET /api/services</code>.</p>
  </div>

  <section>
    <h2>Live status <span class="desc" id="stamp"></span></h2>
    <div id="panels"><div class="empty">Loading on-chain state…</div></div>
  </section>

  <section>
    <h2>Endpoints</h2>
    <ul>
      <li><a href="/openapi.yaml">/openapi.yaml</a><span class="desc">machine-readable spec — point your agent framework here</span></li>
      <li><a href="/skills.md">/skills.md</a><span class="desc">agent skill card — when to use this, and the payment loop</span></li>
      <li><a href="/api/services">/api/services</a><span class="desc">live service catalog + pricing</span></li>
      <li><a href="/api/dashboard">/api/dashboard</a><span class="desc">everything on this page, as JSON</span></li>
      <li><a href="/health">/health</a><span class="desc">server + on-chain automation health</span></li>
    </ul>
  </section>

  <footer>
    <a href="https://github.com/harshkas4na/rc-agents">github.com/harshkas4na/rc-agents</a> — x402 micropayments × on-chain automation.
    Read-only page: no control here changes on-chain state.
  </footer>
</main>
<script src="/dashboard.js" defer></script>
</body>
</html>`;
}
/** Client script for the monitoring panels. Served at /dashboard.js — see the note above. */
exports.DASHBOARD_SCRIPT = `(function () {
  var GOAT_EXPLORER = "https://explorer.testnet3.goat.network";
  var BASE_EXPLORER = "https://sepolia.basescan.org";

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function short(addr) {
    if (!addr) return "—";
    return addr.slice(0, 8) + "…" + addr.slice(-6);
  }

  function addrLink(addr, explorer) {
    if (!addr) return "<span class='desc'>not configured</span>";
    return "<a href='" + esc(explorer) + "/address/" + esc(addr) + "' target='_blank' rel='noopener' title='" + esc(addr) + "'>" + esc(short(addr)) + "</a>";
  }

  // Native-token balances are 18-decimal; show enough places to stay honest on
  // GOAT, where a full build cost single-digit microBTC.
  function fmtNative(wei, symbol) {
    if (wei == null) return "unreachable";
    var v = Number(wei) / 1e18;
    return v.toFixed(v < 0.001 ? 8 : 4) + " " + symbol;
  }

  function fmtUnits(raw, decimals) {
    if (raw == null) return "—";
    return (Number(raw) / Math.pow(10, decimals)).toLocaleString(undefined, { maximumFractionDigits: 8 });
  }

  function statusDot(funded) {
    if (funded === true) return "<span class='dot ok'></span>";
    if (funded === false) return "<span class='dot warn'></span>";
    return "<span class='dot down'></span>";
  }

  function statusWord(funded) {
    if (funded === true) return "funded · automation live";
    if (funded === false) return "underfunded · automation may stall";
    return "unreachable";
  }

  function kv(rows) {
    return "<dl class='kv'>" + rows.map(function (r) {
      return "<dt>" + esc(r[0]) + "</dt><dd>" + r[1] + "</dd>";
    }).join("") + "</dl>";
  }

  function card(title, chain, funded, rows, extra) {
    return "<div class='card'>" +
      "<div class='card-head'>" +
        "<span class='card-title'>" + statusDot(funded) + esc(title) + "</span>" +
        "<span class='chain'>" + esc(chain) + " · " + statusWord(funded) + "</span>" +
      "</div>" + kv(rows) + (extra || "") + "</div>";
  }

  function goatTable(configs) {
    if (!configs || configs.length === 0) {
      return "<div class='empty'>No DCA configs on-chain yet. Each paid activation creates one — they appear here with their full swap history, completed ones included.</div>";
    }
    var rows = configs.map(function (c) {
      return "<tr><td>#" + esc(c.configId) + "</td><td>" + esc(short(c.user)) + "</td>" +
        "<td>" + fmtUnits(c.amountPerSwap, 6) + " dUSDC</td>" +
        "<td>" + esc(c.swapsExecuted) + (c.totalSwaps !== "0" ? " / " + esc(c.totalSwaps) : "") + "</td>" +
        "<td>" + fmtUnits(c.totalAmountOut, 18) + " WGBTC</td>" +
        "<td>" + esc(c.status) + "</td></tr>";
    }).join("");
    return "<div class='scroll'><table><thead><tr>" +
      "<th>Config</th><th>User</th><th>Per swap</th><th>Swaps</th><th>Received</th><th>Status</th>" +
      "</tr></thead><tbody>" + rows + "</tbody></table></div>";
  }

  fetch("/api/dashboard")
    .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .then(function (d) {
      var out = "";

      var g = d.dcaStrategyGoat || {};
      out += card(
        "DCA Strategy — GOAT Testnet3",
        "Bitcoin L2 · BitVM2",
        g.executorFunded,
        [
          ["Automation", "<span class='desc'>permissionless <code>executeDCAOrders()</code> — no privileged caller, no Reactive Network</span>"],
          ["DCA contract", addrLink(g.contracts && g.contracts.dcaStrategyCallbackGoat, GOAT_EXPLORER)],
          ["Uniswap V3 factory", addrLink(g.contracts && g.contracts.uniswapV3Factory, GOAT_EXPLORER)],
          ["dUSDC/WGBTC pool", addrLink(g.contracts && g.contracts.demoUsdcWgbtcPool, GOAT_EXPLORER)],
          ["Executor gas", esc(fmtNative(g.executorBalance, "BTC"))],
          ["Configs", g.totalConfigCount == null ? "unreachable" :
            esc(g.totalConfigCount) + " total · " + esc(g.activeConfigCount == null ? "?" : g.activeConfigCount) + " active"],
          ["Swaps executed", "<strong>" + esc(g.lifetimeSwapsExecuted || "0") + "</strong> <span class='desc'>→ " +
            fmtUnits(g.lifetimeAmountOut, 18) + " WGBTC received</span>"]
        ],
        goatTable(g.configs) +
        "<p class='note'>Anyone can call <code>executeDCAOrders()</code> from any wallet — the server's scheduler is a convenience, not a permission. That is what makes execution here trustless without Reactive Network, which does not support GOAT as a destination chain.</p>"
      );

      var a = d.aaveProtection || {};
      out += card(
        "Aave Liquidation Protection — Base Sepolia",
        "Reactive Network",
        a.reactiveContractFunded,
        [
          ["Automation", "<span class='desc'>" + esc(a.automation || "") + "</span>"],
          ["Callback contract", addrLink(a.callbackContract, BASE_EXPLORER)],
          ["Reactive contract", addrLink(a.reactiveContract, "https://lasna.reactscan.net")],
          ["RC gas balance", esc(fmtNative(a.reactiveContractBalance, "REACT"))],
          ["Active configs", a.activeConfigCount == null ? "unreachable" : esc(a.activeConfigCount)]
        ]
      );

      var s = d.dcaStrategy || {};
      if (s.configured) {
        out += card(
          "DCA Strategy — Base Sepolia",
          "Reactive Network",
          s.reactiveContractFunded,
          [
            ["Callback contract", addrLink(s.callbackContract, BASE_EXPLORER)],
            ["Reactive contract", addrLink(s.reactiveContract, "https://lasna.reactscan.net")],
            ["RC gas balance", esc(fmtNative(s.reactiveContractBalance, "REACT"))],
            ["Active configs", s.activeConfigCount == null ? "unreachable" : esc(s.activeConfigCount)]
          ]
        );
      }

      var p = d.payment || {};
      out += "<div class='card'><div class='card-head'><span class='card-title'>Payment rail</span>" +
        "<span class='chain'>x402 · " + esc(p.network || "") + "</span></div>" +
        kv([
          ["Asset", addrLink(p.asset, BASE_EXPLORER) + " <span class='desc'>USDC</span>"],
          ["Paid to", addrLink(p.recipient, BASE_EXPLORER)],
          ["Facilitator", "<span class='desc'>" + esc(p.facilitator || "") + "</span>"],
          ["Pricing", (d.services || []).map(function (x) {
            return esc(x.name) + " — " + esc(x.pricePerDay) + "/day";
          }).join("<br>")]
        ]) + "</div>";

      document.getElementById("panels").innerHTML = out;
      if (d.generatedAt) {
        document.getElementById("stamp").textContent =
          "· read at " + new Date(d.generatedAt * 1000).toUTCString();
      }
    })
    .catch(function (e) {
      document.getElementById("panels").innerHTML =
        "<div class='card'><span class='dot down'></span>Could not load on-chain state (" + esc(e.message) +
        "). The service catalog at <a href='/api/services'>/api/services</a> is static and still available.</div>";
    });
})();
`;
//# sourceMappingURL=landing.js.map