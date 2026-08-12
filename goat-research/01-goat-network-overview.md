# GOAT Network — Technical Overview

*Researched 2026-08-01. All facts sourced live; URLs inline. Anything unverified is flagged explicitly rather than assumed.*

## What it is

GOAT Network is a **Bitcoin-native Layer 2** built around **BitVM2** — not a generic "EVM chain that also has a bridge," but a chain whose specific pitch is inheriting Bitcoin's security for an EVM execution environment.

- **Architecture**: Type-1 zkEVM execution environment + decentralized sequencer + **Ziren**, GOAT's own zkVM proving engine (zkMIPS-based) + BitVM2 for Bitcoin-enforced dispute resolution.
- **Challenge period**: GOAT's BitVM2 implementation cuts the standard 14-day BitVM2 challenge window down to **under 1 day** — their headline technical claim.
- **Testnet V3** (launched ~Jan 2026) is the first public environment running the full BitVM2 stack in production, not just the zkEVM in isolation.
- Sources: [GOAT BitVM2 Testnet launch (Chainwire)](https://chainwire.org/2026/01/28/goat-network-launches-its-goat-bitvm2-testnet-v3-enabling-bitcoin-native-security-for-the-first-time/), [BitVM2 Whitepaper](https://www.goat.network/bitvm2-whitepaper), [The Defiant coverage](https://thedefiant.io/news/blockchains/goat-network-launches-bitvm2-testnet-marking-huge-step-toward-native-bitcoin-security)

## Network parameters

| | Alpha Mainnet | Testnet3 |
|---|---|---|
| Chain ID | `2345` (`0x929`) | `48816` (`0xBEB0`) |
| Native currency | **BTC** (18 decimals) | BTC |
| RPC | `https://rpc.goat.network` (backup: `rpc.ankr.com/goat_mainnet`) | `https://rpc.testnet3.goat.network` (backup: `rpc.ankr.com/goat_testnet`) |
| Archive node | `https://archive.goat.network` | — |
| Explorer | `https://explorer.goat.network` | `https://explorer.testnet3.goat.network` |
| Bridge | `https://bridge.goat.network` | `https://bridge.testnet3.goat.network` |
| Faucet | — | `https://bridge.testnet3.goat.network/faucet` |

Source: [docs.goat.network/docs/build/networks-rpc](https://docs.goat.network/docs/build/networks-rpc)

**Gas token is BTC, not ETH.** Every gas cost, every `--value` flag in a deploy script, every "send X to fund the contract" step in rc-agents' current playbook needs re-denomination. This is a bigger practical change than the chain ID swap.

## Dev tooling — standard EVM, no surprises

- Foundry works unmodified: `forge init`, deploy via `forge create`/`forge script` pointed at the RPC above.
- Hardhat works unmodified: configure `hardhat.config.js` with the RPC + chain ID.
- Standard `viem`/`ethers` clients work — it's JSON-RPC EVM, same as Base Sepolia.
- Source: [docs.goat.network/docs/build/quick-start](https://docs.goat.network/docs/build/quick-start)

**Practical read:** the *contract* layer (Solidity, Foundry, viem clients) ports with near-zero friction. The two things that don't port are covered below and matter far more.

## Related
[[02-ai-builder-grants-program]] · [[03-agentkit-and-technical-fit]] · [[04-migration-plan]]
