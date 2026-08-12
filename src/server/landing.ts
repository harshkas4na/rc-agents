/**
 * landing.ts — the human-facing "/" page.
 *
 * This is not a product frontend. rc-agents' customers are AI agents, not
 * people clicking buttons — the actual interface is /openapi.yaml. This page
 * exists so a human who lands here (from a link, a README, a search) knows
 * in five seconds what this is and what to do with it: hand the link to
 * their agent.
 */

export function renderLandingPage(baseUrl: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>rc-agents — automation marketplace for AI agents</title>
<meta name="description" content="An x402-gated automation marketplace: AI agents pay in USDC for autonomous on-chain DeFi protection and execution. No accounts, no dashboard for humans to click through — this link is for your agent." />
<style>
  :root {
    color-scheme: light dark;
    --bg: #0b0d10;
    --fg: #e8ecef;
    --muted: #8b95a1;
    --accent: #7ee787;
    --border: #22262b;
    --card: #12151a;
  }
  @media (prefers-color-scheme: light) {
    :root { --bg: #fafafa; --fg: #14171a; --muted: #5c6570; --accent: #0a7c3f; --border: #e2e5e9; --card: #ffffff; }
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
  main { max-width: 720px; margin: 0 auto; }
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
    margin-bottom: 2rem;
  }
  .agent-callout p { margin: 0 0 0.6rem; }
  .agent-callout p:last-child { margin-bottom: 0; }
  .agent-callout code {
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
  section { margin-bottom: 2rem; }
  h2 { font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); margin: 0 0 0.8rem; }
  ul { padding-left: 0; list-style: none; margin: 0; }
  li { padding: 0.55rem 0; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
  li:last-child { border-bottom: none; }
  li a { color: var(--fg); text-decoration: none; }
  li a:hover { color: var(--accent); }
  .desc { color: var(--muted); font-size: 0.85rem; }
  footer { color: var(--muted); font-size: 0.8rem; margin-top: 3rem; border-top: 1px solid var(--border); padding-top: 1.25rem; }
  footer a { color: var(--muted); }
  a { color: var(--accent); }
</style>
</head>
<body>
<main>
  <span class="tag">agent-native · x402 · on-chain automation</span>
  <h1>rc-agents</h1>
  <p class="sub">An automation marketplace where AI agents pay $0.30 USDC and get autonomous DeFi execution — no accounts, no signup, no human in the loop.</p>

  <div class="agent-callout">
    <p><strong>If you're a human:</strong> this page isn't the product. There's no dashboard to click through. If you have an AI agent, coding assistant, or MCP-capable tool, give it this URL — it will understand what to do:</p>
    <code>${baseUrl}/openapi.yaml</code>
    <p><strong>If you're an agent reading this:</strong> fetch <code>${baseUrl}/openapi.yaml</code> for the full OpenAPI 3.1 spec — service discovery, pricing, request/response schemas, and the x402 payment flow are all documented there. Start with <code>GET ${baseUrl}/api/services</code>.</p>
  </div>

  <section>
    <h2>Endpoints</h2>
    <ul>
      <li><a href="/openapi.yaml">/openapi.yaml</a><span class="desc">machine-readable spec — point your agent framework here</span></li>
      <li><a href="/api/services">/api/services</a><span class="desc">live service catalog + pricing</span></li>
      <li><a href="/health">/health</a><span class="desc">server + on-chain automation health</span></li>
    </ul>
  </section>

  <section>
    <h2>What it does</h2>
    <ul>
      <li>Aave Liquidation Protection<span class="desc">$0.25/day — Base Sepolia, monitors health factor, auto-protects via Reactive Network</span></li>
      <li>DCA Strategy (Uniswap V3)<span class="desc">$0.20/day — Base Sepolia, periodic swaps via Reactive Network</span></li>
      <li>DCA Strategy (GOAT Testnet3)<span class="desc">$0.20/day — real Uniswap V3 Core pool, permissionless execution, no Reactive Network</span></li>
    </ul>
  </section>

  <section>
    <h2>On GOAT Network</h2>
    <ul>
      <li>No privileged relay<span class="desc">execution is a genuinely permissionless on-chain call — anyone can trigger it, not just this server</span></li>
      <li>Real Uniswap V3 Core<span class="desc">unmodified, audited AMM — deployed directly since GoatSwap has no Testnet3 presence</span></li>
    </ul>
  </section>

  <footer>
    <a href="https://github.com/harshkas4na/rc-agents">github.com/harshkas4na/rc-agents</a> — x402 micropayments × on-chain automation.
  </footer>
</main>
</body>
</html>`;
}
