# Deployment Reference

## Architecture

Each service is a specialized contract pair. Phase 1 ships only the Aave HF Guard.

```
Per service:
  AaveHFReactive (Kopli)  ──── CRON tick / new-sub event ────► AaveHFCallback (Base Sepolia)
                                                                 ├── checks Aave HF
                                                                 └── supplies collateral

Future services:
  StopLossReactive (Kopli) ──── price events ────► StopLossCallback (Base Sepolia)
  TakeProfitReactive (Kopli) ──── price events ────► TakeProfitCallback (Base Sepolia)
```

Each pair is independently deployed, upgraded, and funded.

---

## Chain IDs

| Network | Chain ID | CAIP-2 |
|---|---|---|
| Base Sepolia | 84532 | `eip155:84532` |
| Base Mainnet | 8453 | `eip155:8453` |
| Kopli (Reactive testnet) | 5318008 | `eip155:5318008` |

---

## Known Addresses (Base Sepolia)

| Contract | Address |
|---|---|
| Aave V3 Pool | `0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951` |
| USDC | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| WETH | `0x4200000000000000000000000000000000000006` |
| Uniswap V3 SwapRouter02 | `0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4` |

---

## Reactive Network (Kopli)

| Item | Value |
|---|---|
| RPC | `https://kopli-rpc.rkt.ink` |
| Explorer | `https://kopli.reactscan.net` |
| Faucet | `https://kopli.reactscan.net/faucet` |
| Subscription Service | `0x9b9BB25f1A81078C544C829c5EB7822d747Cf434` |

### Values you must look up before deploying

| What | Where to find | .env variable |
|---|---|---|
| CRON ticker address (Kopli) | https://dev.reactive.network/docs/cron | `CRON_TICKER_ADDRESS` |
| Callback relayer on Base Sepolia | https://dev.reactive.network/docs/callback-contracts | `REACTIVE_NETWORK_SENDER` |

---

## Deployment Steps

### 1. Set up .env

```bash
cp .env.example .env
# Fill in: SERVER_WALLET_ADDRESS, SERVER_PRIVATE_KEY, DEPLOYER_PRIVATE_KEY
# Fill in: REACTIVE_NETWORK_SENDER, CRON_TICKER_ADDRESS (from RN docs)
```

### 2. Deploy AaveHFCallback → Base Sepolia

```bash
npm run deploy:callback
```

Copy the printed address into `AAVE_HF_CALLBACK_ADDRESS` in `.env`.

### 3. Deploy AaveHFReactive → Kopli

```bash
npm run deploy:reactive
```

Copy the printed address into `AAVE_HF_REACTIVE_ADDRESS` in `.env`.

### 4. Start server

```bash
npm run dev
```

### 5. Agent workflow

```
Agent → GET /api/services              (free, discover services)
Agent → GET /api/protect/liquidation    (402, pay USDC, get subscriptionId)
Agent → approve AaveHFCallback to spend collateral (separate tx)
        ↓
RC fires runCycle() every ~12 min → CC checks HF → supplies collateral if needed
```

---

## Adding a new service

1. Write `contracts/new-service/NewServiceCallback.sol` + `NewServiceReactive.sol`
2. Add deploy scripts: `scripts/deploy-new-service-callback.ts`, etc.
3. Add to `src/config/services.ts` with its own `callbackAddressEnv` / `reactiveAddressEnv`
4. Add a route in `src/server/index.ts`
5. Deploy both contracts
6. Done — existing services are untouched

---

## Gas Estimates

| Operation | Gas | Cost @ 0.01 gwei |
|---|---|---|
| `register()` | ~100,000 | ~$0.0001 |
| `runCycle()` / 100 active subs | ~1,500,000 | ~$0.0015 |
| RC callback delivery | ~50,000 REACT | Varies |

---

## x402 Facilitator

| Environment | URL |
|---|---|
| Testnet | `https://x402.org/facilitator` |
| Mainnet | `https://api.cdp.coinbase.com/platform/v2/x402` |
