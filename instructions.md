# RC Agents — End-to-End Testing Instructions

Complete guide to deploy, fund, test, and verify both DCA Strategy and Aave Liquidation Protection services.

---

## Prerequisites

| Tool | Purpose |
|------|---------|
| Foundry (`forge`) | Deploy Solidity contracts |
| Node.js + npm | Run server + test agent |
| Two wallets | Server wallet (owns contracts) + Agent wallet (pays for services) |
| Base Sepolia ETH | Gas for both wallets |
| USDC on Base Sepolia | Agent pays for services via x402 |
| REACT on Lasna | Fund Reactive Contracts (or use bridge) |

### Get testnet assets

- **Base Sepolia ETH**: https://www.alchemy.com/faucets/base-sepolia or https://faucet.quicknode.com/base/sepolia
- **USDC on Base Sepolia**: https://faucet.circle.com (select Base Sepolia)
- **REACT on Lasna**: Bridge ETH from Base Sepolia → Lasna (1 ETH = 100 lREACT) by sending ETH to `0x2afaFD298b23b62760711756088F75B7409f5967` via `request(rcAddress)`, or use the Reactive Network faucet if available

---

## Phase 1: Deploy All Contracts

You need 4 contracts total: 2 Callback Contracts (Base Sepolia) + 2 Reactive Contracts (Lasna).

### 1A. Deploy DCAStrategyCallback (Base Sepolia)

```bash
forge create src/contracts/DCAStrategyCallback.sol:DCAStrategyCallback \
  --rpc-url https://sepolia.base.org --broadcast \
  --private-key $SERVER_PRIVATE_KEY --value 0.0001ether \
  --constructor-args \
    $SERVER_WALLET_ADDRESS \
    0xa6eA49Ed671B8a4dfCDd34E36b7a75Ac79B8A5a6 \
    0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4
```

**Constructor args:**
| Arg | Value | Description |
|-----|-------|-------------|
| `_owner` | `$SERVER_WALLET_ADDRESS` | Server wallet — only it can create configs |
| `_callbackSender` | `0xa6eA49Ed671B8a4dfCDd34E36b7a75Ac79B8A5a6` | Base Sepolia callback proxy |
| `_swapRouter` | `0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4` | Uniswap V3 SwapRouter on Base Sepolia |

Save the deployed address as `DCA_STRATEGY_CALLBACK_ADDRESS`.

### 1B. Deploy AaveProtectionCallback (Base Sepolia)

```bash
forge create src/contracts/AaveProtectionCallback.sol:AaveProtectionCallback \
  --rpc-url https://sepolia.base.org --broadcast \
  --private-key $SERVER_PRIVATE_KEY --value 0.0001ether \
  --constructor-args \
    $SERVER_WALLET_ADDRESS \
    0xa6eA49Ed671B8a4dfCDd34E36b7a75Ac79B8A5a6 \
    0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951 \
    0x2d8A3C5677189723C4cB8873CfC9C8976FDF38Ac \
    0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D
```

**Constructor args:**
| Arg | Value | Description |
|-----|-------|-------------|
| `_owner` | `$SERVER_WALLET_ADDRESS` | Server wallet |
| `_callbackSender` | `0xa6eA49Ed671B8a4dfCDd34E36b7a75Ac79B8A5a6` | Base Sepolia callback proxy |
| `_lendingPool` | `0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951` | Aave Pool on Base Sepolia |
| `_protocolDataProvider` | `0x2d8A3C5677189723C4cB8873CfC9C8976FDF38Ac` | Aave ProtocolDataProvider |
| `_addressesProvider` | `0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D` | Aave PoolAddressesProvider |

Save the deployed address as `AAVE_PROTECTION_CALLBACK_ADDRESS`.

### 1C. Deploy DCAStrategyReactive (Lasna / Reactive Network)

```bash
forge create src/contracts/DCAStrategyReactive.sol:DCAStrategyReactive \
  --rpc-url https://lasna-rpc.rnk.dev/ --broadcast \
  --private-key $SERVER_PRIVATE_KEY \
  --value 1ether \
  --constructor-args \
    $SERVER_WALLET_ADDRESS \
    $DCA_STRATEGY_CALLBACK_ADDRESS \
    0xb49937fb8970e19fd46d48f7e3fb00d659deac0347f79cd7cb542f0fc1503c70 \
    84532
```

**Constructor args:**
| Arg | Value | Description |
|-----|-------|-------------|
| `_owner` | `$SERVER_WALLET_ADDRESS` | Server wallet |
| `_dcaCallback` | `$DCA_STRATEGY_CALLBACK_ADDRESS` | The CC you just deployed on Base Sepolia |
| `_cronTopic` | `0xb499...c70` (CRON_100) | Fires every ~12 min (100 blocks) |
| `_destinationChainId` | `84532` | Base Sepolia chain ID |

**Important:** Send `--value 0.01ether` to fund initial REACT for callbacks.

Save the deployed address as `DCA_STRATEGY_REACTIVE_ADDRESS`.

### 1D. Deploy AaveProtectionReactive (Lasna / Reactive Network)

```bash
forge create src/contracts/AaveProtectionReactive.sol:AaveProtectionReactive \
  --rpc-url https://lasna-rpc.rnk.dev/ --broadcast\
  --private-key $SERVER_PRIVATE_KEY \
  --value 1ether \
  --constructor-args \
    $SERVER_WALLET_ADDRESS \
    $AAVE_PROTECTION_CALLBACK_ADDRESS \
    0xb49937fb8970e19fd46d48f7e3fb00d659deac0347f79cd7cb542f0fc1503c70 \
    84532
```

**Constructor args:**
| Arg | Value | Description |
|-----|-------|-------------|
| `_owner` | `$SERVER_WALLET_ADDRESS` | Server wallet |
| `_protectionCallback` | `$AAVE_PROTECTION_CALLBACK_ADDRESS` | The CC deployed on Base Sepolia |
| `_cronTopic` | `0xb499...c70` (CRON_100) | Fires every ~12 min |
| `_destinationChainId` | `84532` | Base Sepolia chain ID |

Save the deployed address as `AAVE_PROTECTION_REACTIVE_ADDRESS`.

---

## Phase 2: Configure Environment

Update your `.env` file with all deployed addresses:

```bash
# Server wallet (must match the _owner used in deploys)
SERVER_PRIVATE_KEY=0x...your_server_private_key...
SERVER_WALLET_ADDRESS=0x...your_server_address...

# Deployed contract addresses (fill in after Phase 1)
AAVE_PROTECTION_CALLBACK_ADDRESS=0xdcCA2E0E38BD9a059566F72063fAbAA0deF63cE1
AAVE_PROTECTION_REACTIVE_ADDRESS=0xdcCA2E0E38BD9a059566F72063fAbAA0deF63cE1
DCA_STRATEGY_CALLBACK_ADDRESS=0x9e05d50B343BC4b718158EC1dAAf4d7a2a71e3C9
DCA_STRATEGY_REACTIVE_ADDRESS=0x9e05d50B343BC4b718158EC1dAAf4d7a2a71e3C9

# x402
X402_FACILITATOR_URL=https://x402.org/facilitator

# RPCs
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
LASNA_RPC_URL=https://lasna-rpc.rnk.dev/

# Server
PORT=3000

# Bridge (keep dry for initial testing)
BRIDGE_MODE=dry
```

---

## Phase 3: Fund Reactive Contracts on Lasna

The RC contracts need REACT to pay for callback gas. If you used `--value 0.01ether` during deploy, they already have 0.01 REACT each. For longer-running tests, add more:

### Option A: Direct transfer on Lasna (if you have REACT)

```bash
cast send $DCA_STRATEGY_REACTIVE_ADDRESS \
  --value 0.1ether \
  --rpc-url https://lasna-rpc.rnk.dev/ \
  --private-key $SERVER_PRIVATE_KEY

cast send $AAVE_PROTECTION_REACTIVE_ADDRESS \
  --value 0.1ether \
  --rpc-url https://lasna-rpc.rnk.dev/ \
  --private-key $SERVER_PRIVATE_KEY
```

### Option B: Bridge from Base Sepolia

Send ETH to the bridge contract with the RC address as recipient:

```bash
# Bridge for DCA RC
cast send 0x2afaFD298b23b62760711756088F75B7409f5967 \
  "request(address)" $DCA_STRATEGY_REACTIVE_ADDRESS \
  --value 0.01ether \
  --rpc-url https://sepolia.base.org \
  --private-key $SERVER_PRIVATE_KEY

# Bridge for Aave RC
cast send 0x2afaFD298b23b62760711756088F75B7409f5967 \
  "request(address)" $AAVE_PROTECTION_REACTIVE_ADDRESS \
  --value 0.01ether \
  --rpc-url https://sepolia.base.org \
  --private-key $SERVER_PRIVATE_KEY
```

Rate: 1 ETH = 100 lREACT. Max 5 ETH per transaction.

### Verify funding

```bash
# Check DCA RC balance
cast balance $DCA_STRATEGY_REACTIVE_ADDRESS --rpc-url https://lasna-rpc.rnk.dev/

# Check Aave RC balance
cast balance $AAVE_PROTECTION_REACTIVE_ADDRESS --rpc-url https://lasna-rpc.rnk.dev/
```

Both should show >= 0.01 REACT (10000000000000000 wei).

---

## Phase 4: Wallet Asset Requirements

### Server Wallet needs:
| Asset | Chain | Amount | Purpose |
|-------|-------|--------|---------|
| ETH | Base Sepolia | ~0.05 ETH | Gas for `createProtectionConfig`, `createDCAConfig`, approvals |
| REACT | Lasna | ~0.01+ | Only if deploying RCs (sent via `--value`) |

The server does NOT need USDC — it receives USDC from agent x402 payments.

### Agent Wallet needs:
| Asset | Chain | Amount | Purpose |
|-------|-------|--------|---------|
| ETH | Base Sepolia | ~0.01 ETH | Gas for ERC20 approve transactions |
| USDC | Base Sepolia | ~$1+ | x402 payment for services ($0.30/day for Aave, $0.24/day for DCA) |
| USDC (for DCA) | Base Sepolia | 30+ USDC | Token to be swapped (10 USDC × 3 swaps = 30 USDC) |

**For DCA**: The agent must approve the DCAStrategyCallback contract to spend their tokenIn (USDC):
```bash
# Approve DCA callback to spend 30 USDC (30000000 = 30 × 10^6)
cast send 0x036CbD53842c5426634e7929541eC2318f3dCF7e \
  "approve(address,uint256)" $DCA_STRATEGY_CALLBACK_ADDRESS 30000000 \
  --rpc-url https://sepolia.base.org \
  --private-key $AGENT_PRIVATE_KEY
```

**For Aave Protection**: The agent must approve the AaveProtectionCallback contract to spend their collateral/debt tokens. This only matters if the health factor actually drops and protection triggers.

---

## Phase 5: Start the Server

```bash
npm install
npm run dev
```

Verify:
```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "ok",
  "aaveProtection": {
    "reactiveContractBalance": "10000000000000000",
    "reactiveContractFunded": true
  },
  "dcaStrategy": {
    "reactiveContractBalance": "10000000000000000",
    "reactiveContractFunded": true
  }
}
```

---

## Phase 6: Run the Test Agent

### Full test (both services):

```bash
AGENT_PRIVATE_KEY=0x...your_agent_key... npx tsx test-agent.ts --both
```

### DCA only:

```bash
AGENT_PRIVATE_KEY=0x...your_agent_key... npx tsx test-agent.ts --dca
```

### Aave only:

```bash
AGENT_PRIVATE_KEY=0x...your_agent_key... npx tsx test-agent.ts --aave
```

### What the test agent does:

1. **Health check** — verifies server is up and RCs are funded
2. **Service catalog** — lists available services with pricing
3. **Quote** — gets exact price for 1-day subscription
4. **Pay + Subscribe** — makes x402 USDC payment, server creates on-chain config
5. **Verify on-chain** — reads config back from the callback contract
6. **Check status** — health factor (Aave) or swap progress (DCA)
7. **Monitor** — polls config status every 2 minutes for ~15 min waiting for first CRON tick
8. **Deactivate** — cancels both subscriptions after monitoring window
9. **Verify cancellation** — confirms configs are cancelled on-chain

---

## Phase 7: What Happens After Subscription

### DCA Flow (after `test-agent.ts --dca`):

```
0:00  — Agent pays USDC via x402, server creates DCA config on CC
        CC emits DCAConfigCreated event
0:01  — RC on Lasna picks up DCAConfigCreated, subscribes to CRON_100
~12m  — First CRON_100 fires on RC
        RC calls executeDCAOrders() on CC (Base Sepolia)
        CC checks: swapInterval elapsed? If yes → swap USDC→WETH via Uniswap
        CC emits DCASwapExecuted
~24m  — Second CRON tick → second swap
~36m  — Third CRON tick → third swap → totalSwaps reached
        CC emits DCAConfigCompleted → RC unsubscribes from CRON
```

**To see swaps happening:**
```bash
# Check DCA config status
curl http://localhost:3000/api/dca/config/0

# Check how many swaps executed
curl http://localhost:3000/api/dca/config/0 | jq '.swapsExecuted, .totalSwaps, .status'
```

### Aave Protection Flow (after `test-agent.ts --aave`):

```
0:00  — Agent pays USDC, server creates protection config
        CC emits ProtectionConfigured
0:01  — RC picks up event, subscribes to CRON_100
~12m  — CRON_100 fires → RC calls checkAndProtectPositions()
        CC checks health factor for each active config
        If HF < threshold → execute protection (deposit collateral / repay debt)
        If HF >= threshold → do nothing (log only)
```

**Note:** Protection only triggers if the agent has an active Aave position with HF below threshold. Without an Aave borrow position, the health factor returns MAX and nothing happens.

---

## Phase 8: Manual Verification Commands

### Check on-chain state directly with `cast`:

```bash
# DCA config details
cast call $DCA_STRATEGY_CALLBACK_ADDRESS \
  "dcaConfigs(uint256)(uint256,address,address,address,uint256,uint24,uint256,uint256,uint256,uint256,uint256,uint8,uint256,uint256,uint256,uint8,uint256)" 0 \
  --rpc-url https://sepolia.base.org

# Active DCA configs
cast call $DCA_STRATEGY_CALLBACK_ADDRESS \
  "getActiveConfigs()(uint256[])" \
  --rpc-url https://sepolia.base.org

# Aave protection config
cast call $AAVE_PROTECTION_CALLBACK_ADDRESS \
  "protectionConfigs(uint256)" 0 \
  --rpc-url https://sepolia.base.org

# RC balances on Lasna
cast balance $DCA_STRATEGY_REACTIVE_ADDRESS --rpc-url https://lasna-rpc.rnk.dev/
cast balance $AAVE_PROTECTION_REACTIVE_ADDRESS --rpc-url https://lasna-rpc.rnk.dev/

# Agent USDC balance
cast call 0x036CbD53842c5426634e7929541eC2318f3dCF7e \
  "balanceOf(address)(uint256)" $AGENT_WALLET_ADDRESS \
  --rpc-url https://sepolia.base.org
```

---

## Phase 9: Deactivation / Cancellation

### Via API (what the test agent does):

```bash
# Cancel DCA config #0
curl -X POST http://localhost:3000/api/dca/cancel \
  -H "Content-Type: application/json" \
  -d '{"configId": 0}'

# Cancel Aave protection config #0
curl -X POST http://localhost:3000/api/protect/liquidation/cancel \
  -H "Content-Type: application/json" \
  -d '{"configId": 0}'
```

### What happens on cancel:
1. Server calls `cancelDCAConfig(configId)` / `cancelProtectionConfig(configId)` on CC
2. CC sets config status to Cancelled, emits `DCAConfigCancelled` / `ProtectionCancelled`
3. RC picks up the event, calls `persistConfigCancelled`
4. RC decrements `activeConfigCount`; if 0, unsubscribes from CRON_100
5. No more callbacks fire for this config

### Auto-expiry:
Configs with a duration automatically expire after `createdAt + duration`. The RC checks this on each CRON tick and auto-cancels expired configs. So even if the test agent doesn't cancel, a 1-day config expires after 24 hours.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `Server health: degraded` | RC contracts underfunded — bridge more REACT to them on Lasna |
| x402 payment fails | Agent needs more USDC on Base Sepolia (get from faucet.circle.com) |
| `createDCAConfig` reverts | Verify server wallet is the CC owner; check SERVER_PRIVATE_KEY matches deploy wallet |
| DCA swaps not executing | 1) Wait ~12 min for first CRON tick. 2) Agent must approve CC to spend tokenIn. 3) Check RC balance on Lasna |
| `ProtectionConfigured event not found` | ABI mismatch — rebuild contracts with `forge build` and regenerate ABIs |
| Health factor returns MAX | Agent has no Aave borrow position — protection won't trigger |
| Bridge not working | Set `BRIDGE_MODE=live` in .env (default is `dry` = log only) |
| `DCA_STRATEGY_CALLBACK_ADDRESS not set` | Fill in all 4 contract addresses in .env after deployment |

---

## Quick Reference: Addresses

| Contract | Chain | Constructor Deps |
|----------|-------|-----------------|
| DCAStrategyCallback | Base Sepolia (84532) | owner, callbackProxy(`0xa6eA...`), uniRouter(`0x94cC...`) |
| DCAStrategyReactive | Lasna (5318007) | owner, dcaCallbackAddr, CRON_100 topic, 84532 |
| AaveProtectionCallback | Base Sepolia (84532) | owner, callbackProxy(`0xa6eA...`), aavePool, dataProvider, addrProvider |
| AaveProtectionReactive | Lasna (5318007) | owner, aaveCallbackAddr, CRON_100 topic, 84532 |

| Fixed Address | Value |
|---------------|-------|
| Base Sepolia Callback Proxy | `0xa6eA49Ed671B8a4dfCDd34E36b7a75Ac79B8A5a6` |
| Uniswap V3 Router | `0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4` |
| USDC (Base Sepolia) | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| WETH (Base Sepolia) | `0x4200000000000000000000000000000000000006` |
| Aave Pool | `0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951` |
| Aave DataProvider | `0x2d8A3C5677189723C4cB8873CfC9C8976FDF38Ac` |
| Aave AddressesProvider | `0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D` |
| Lasna Bridge (from Base Sep) | `0x2afaFD298b23b62760711756088F75B7409f5967` |
| CRON_100 Topic | `0xb49937fb8970e19fd46d48f7e3fb00d659deac0347f79cd7cb542f0fc1503c70` |
