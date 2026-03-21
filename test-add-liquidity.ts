/**
 * test-add-liquidity.ts — Add USDC/WETH liquidity to Uniswap V3 0.3% pool on Base Sepolia,
 * then run a live USDC → WETH swap to validate the bridge flow.
 *
 * Addresses (Base Sepolia):
 *   USDC:    0x036CbD53842c5426634e7929541eC2318f3dCF7e  (token0)
 *   WETH:    0x4200000000000000000000000000000000000006  (token1)
 *   Pool:    0x46880b404CD35c165EDdefF7421019F8dD25F4Ad  (USDC/WETH 0.3%)
 *   Factory: 0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24
 *   Router:  0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4
 *   NPM:     0x27F971cb582BF9E50F397e4d29a5C7A34f11faA2
 */

import "dotenv/config";
import {
  createPublicClient,
  createWalletClient,
  formatEther,
  formatUnits,
  http,
  parseAbi,
  parseEther,
  parseUnits,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

// ── Addresses ─────────────────────────────────────────────────────────────────

const USDC    = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as Address;
const WETH    = "0x4200000000000000000000000000000000000006" as Address;
const POOL    = "0x46880b404CD35c165EDdefF7421019F8dD25F4Ad" as Address;
const NPM     = "0x27F971cb582BF9E50F397e4d29a5C7A34f11faA2" as Address;
const ROUTER  = "0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4" as Address;
const RPC     = process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org";

// ── Liquidity params ──────────────────────────────────────────────────────────

// Full-range position for 0.3% pool (tick spacing = 60)
// Full-range ticks for tick spacing 60 (0.3% pool): floor(887272/60)*60 = 887220
const TICK_LOWER = -887220;
const TICK_UPPER =  887220;

// Desired amounts: 0.02 WETH + 20 USDC
// At current pool price ~368 USDC/ETH, only ~7.36 USDC will actually be consumed.
// Excess USDC is returned to wallet.
const WETH_DESIRED = parseEther("0.02");
const USDC_DESIRED = parseUnits("20", 6);

// Swap test: 2 USDC → WETH
const SWAP_USDC = parseUnits("2", 6);

// ── ABIs ──────────────────────────────────────────────────────────────────────

const ERC20_ABI = parseAbi([
  "function balanceOf(address) external view returns (uint256)",
  "function approve(address,uint256) external returns (bool)",
  "function allowance(address,address) external view returns (uint256)",
]);

const WETH_ABI = parseAbi([
  "function deposit() external payable",
  "function balanceOf(address) external view returns (uint256)",
  "function approve(address,uint256) external returns (bool)",
]);

const POOL_ABI = parseAbi([
  "function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16, uint16, uint16, uint8, bool)",
  "function liquidity() external view returns (uint128)",
  "function token0() external view returns (address)",
  "function token1() external view returns (address)",
]);

const NPM_ABI = parseAbi([
  "function mint((address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address recipient, uint256 deadline)) external payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)",
  "function positions(uint256 tokenId) external view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)",
]);

const ROUTER_ABI = parseAbi([
  "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut)",
]);

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const pk = process.env.SERVER_PRIVATE_KEY;
  if (!pk) throw new Error("SERVER_PRIVATE_KEY not set");
  const hex = pk.startsWith("0x") ? pk : `0x${pk}`;
  const account = privateKeyToAccount(hex as `0x${string}`);
  const pub = createPublicClient({ chain: baseSepolia, transport: http(RPC) });
  const wal = createWalletClient({ account, chain: baseSepolia, transport: http(RPC) });

  const read = async (address: Address, abi: any, fn: string, args: any[] = []) =>
    pub.readContract({ address, abi, functionName: fn, args });

  console.log("=== Add Liquidity + Swap Test (Base Sepolia) ===\n");
  console.log("Addresses:");
  console.log(`  Wallet:  ${account.address}`);
  console.log(`  Pool:    ${POOL}  (USDC/WETH 0.3%)`);
  console.log(`  NPM:     ${NPM}`);
  console.log(`  Router:  ${ROUTER}`);
  console.log(`  USDC:    ${USDC}`);
  console.log(`  WETH:    ${WETH}`);

  // ── Pool state ────────────────────────────────────────────────────────────
  const slot0 = await read(POOL, POOL_ABI, "slot0") as any;
  const poolLiqBefore = await read(POOL, POOL_ABI, "liquidity") as bigint;
  console.log(`\nPool state before:`);
  console.log(`  sqrtPriceX96: ${slot0[0]}`);
  console.log(`  tick:         ${slot0[1]}`);
  console.log(`  liquidity:    ${poolLiqBefore}`);
  const sqrtP = Number(slot0[0]);
  const priceRaw = (sqrtP / (2 ** 96)) ** 2;
  const wethPriceUsdc = 1 / (priceRaw * 1e-12);
  console.log(`  WETH price:   ~${wethPriceUsdc.toFixed(2)} USDC/ETH`);

  // ── Balances before ───────────────────────────────────────────────────────
  const ethBefore  = await pub.getBalance({ address: account.address });
  const usdcBefore = await read(USDC, ERC20_ABI, "balanceOf", [account.address]) as bigint;
  const wethBefore = await read(WETH, WETH_ABI, "balanceOf", [account.address]) as bigint;

  console.log(`\nBalances before:`);
  console.log(`  ETH:   ${formatEther(ethBefore)}`);
  console.log(`  USDC:  ${formatUnits(usdcBefore, 6)}`);
  console.log(`  WETH:  ${formatEther(wethBefore)}`);

  // ── Step 1: Wrap ETH if needed ────────────────────────────────────────────
  const wethNeeded = WETH_DESIRED > wethBefore ? WETH_DESIRED - wethBefore : 0n;
  if (wethNeeded > 0n) {
    console.log(`\n── Step 1: Wrapping ${formatEther(wethNeeded)} ETH → WETH ──────────────`);
    const tx = await wal.writeContract({
      address: WETH, abi: WETH_ABI, functionName: "deposit", value: wethNeeded,
    });
    await pub.waitForTransactionReceipt({ hash: tx });
    await new Promise(r => setTimeout(r, 2000));
    console.log(`  tx: ${tx}  ✓`);
  } else {
    console.log(`\n── Step 1: Have ${formatEther(wethBefore)} WETH already — skip wrap ──`);
  }

  const wethNow = await read(WETH, WETH_ABI, "balanceOf", [account.address]) as bigint;
  console.log(`  WETH balance: ${formatEther(wethNow)}`);

  // ── Step 2: Approve NPM for both tokens ───────────────────────────────────
  console.log(`\n── Step 2: Approving NPM ─────────────────────────────────────────`);

  const usdcAllowance = await read(USDC, ERC20_ABI, "allowance", [account.address, NPM]) as bigint;
  if (usdcAllowance < USDC_DESIRED) {
    const tx = await wal.writeContract({
      address: USDC, abi: ERC20_ABI, functionName: "approve",
      args: [NPM, USDC_DESIRED + SWAP_USDC],
    });
    await pub.waitForTransactionReceipt({ hash: tx });
    console.log(`  USDC approved  tx: ${tx}  ✓`);
  } else {
    console.log(`  USDC already approved (${formatUnits(usdcAllowance, 6)})`);
  }

  const wethAllowance = await read(WETH, ERC20_ABI, "allowance", [account.address, NPM]) as bigint;
  if (wethAllowance < WETH_DESIRED) {
    const tx = await wal.writeContract({
      address: WETH, abi: WETH_ABI, functionName: "approve",
      args: [NPM, WETH_DESIRED],
    });
    await pub.waitForTransactionReceipt({ hash: tx });
    console.log(`  WETH approved  tx: ${tx}  ✓`);
  } else {
    console.log(`  WETH already approved (${formatEther(wethAllowance)})`);
  }

  // ── Step 3: Mint liquidity position ───────────────────────────────────────
  console.log(`\n── Step 3: Minting full-range liquidity position ────────────────`);
  console.log(`  token0 (USDC):  ${formatUnits(USDC_DESIRED, 6)} USDC desired`);
  console.log(`  token1 (WETH):  ${formatEther(WETH_DESIRED)} WETH desired`);
  console.log(`  tickLower: ${TICK_LOWER},  tickUpper: ${TICK_UPPER}`);

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);

  const mintTx = await wal.writeContract({
    address: NPM,
    abi: NPM_ABI,
    functionName: "mint",
    args: [{
      token0:          USDC,
      token1:          WETH,
      fee:             3000,
      tickLower:       TICK_LOWER,
      tickUpper:       TICK_UPPER,
      amount0Desired:  USDC_DESIRED,
      amount1Desired:  WETH_DESIRED,
      amount0Min:      0n,
      amount1Min:      0n,
      recipient:       account.address,
      deadline,
    }],
  });

  const mintReceipt = await pub.waitForTransactionReceipt({ hash: mintTx });
  console.log(`  tx:     ${mintTx}`);
  console.log(`  block:  ${mintReceipt.blockNumber}`);
  console.log(`  status: ${mintReceipt.status}`);

  if (mintReceipt.status !== "success") throw new Error("Mint tx reverted");

  // Parse tokenId and amounts from the mint log
  // Event: IncreaseLiquidity(uint256 indexed tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)
  await new Promise(r => setTimeout(r, 2000));
  const poolLiqAfterMint = await read(POOL, POOL_ABI, "liquidity") as bigint;
  const usdcAfterMint = await read(USDC, ERC20_ABI, "balanceOf", [account.address]) as bigint;
  const wethAfterMint = await read(WETH, WETH_ABI, "balanceOf", [account.address]) as bigint;

  const usdcUsed = usdcBefore - usdcAfterMint;
  const wethUsed = wethNow - wethAfterMint;

  console.log(`\n  Pool liquidity: ${poolLiqBefore} → ${poolLiqAfterMint}  (+${poolLiqAfterMint - poolLiqBefore})`);
  console.log(`  USDC used:  ${formatUnits(usdcUsed, 6)} USDC`);
  console.log(`  WETH used:  ${formatEther(wethUsed)} WETH`);
  console.log(`  USDC left:  ${formatUnits(usdcAfterMint, 6)}`);

  // ── Step 4: Test swap — 2 USDC → WETH ────────────────────────────────────
  console.log(`\n── Step 4: Test swap — ${formatUnits(SWAP_USDC, 6)} USDC → WETH ──────────────────`);

  // Approve router for USDC
  const routerAllowance = await read(USDC, ERC20_ABI, "allowance", [account.address, ROUTER]) as bigint;
  if (routerAllowance < SWAP_USDC) {
    const approveTx = await wal.writeContract({
      address: USDC, abi: ERC20_ABI, functionName: "approve", args: [ROUTER, SWAP_USDC],
    });
    await pub.waitForTransactionReceipt({ hash: approveTx });
    console.log(`  USDC approved for router  tx: ${approveTx}  ✓`);
  }

  const wethBeforeSwap = await read(WETH, WETH_ABI, "balanceOf", [account.address]) as bigint;
  const swapDeadline = BigInt(Math.floor(Date.now() / 1000) + 300);

  const swapTx = await wal.writeContract({
    address: ROUTER,
    abi: ROUTER_ABI,
    functionName: "exactInputSingle",
    args: [{
      tokenIn:            USDC,
      tokenOut:           WETH,
      fee:                3000,
      recipient:          account.address,
      amountIn:           SWAP_USDC,
      amountOutMinimum:   0n,
      sqrtPriceLimitX96:  0n,
    }],
  });

  const swapReceipt = await pub.waitForTransactionReceipt({ hash: swapTx });
  console.log(`  tx:     ${swapTx}`);
  console.log(`  block:  ${swapReceipt.blockNumber}`);
  console.log(`  status: ${swapReceipt.status}`);

  if (swapReceipt.status !== "success") throw new Error("Swap tx reverted");

  await new Promise(r => setTimeout(r, 2000));
  const wethAfterSwap = await read(WETH, WETH_ABI, "balanceOf", [account.address]) as bigint;
  const wethReceived = wethAfterSwap - wethBeforeSwap;

  console.log(`  WETH received: ${formatEther(wethReceived)} WETH`);
  console.log(`  Effective price: ${(Number(SWAP_USDC) / Number(wethReceived) * 1e12).toFixed(2)} USDC/ETH`);

  // ── Final balances ────────────────────────────────────────────────────────
  const ethFinal  = await pub.getBalance({ address: account.address });
  const usdcFinal = await read(USDC, ERC20_ABI, "balanceOf", [account.address]) as bigint;
  const wethFinal = await read(WETH, WETH_ABI, "balanceOf", [account.address]) as bigint;
  const poolLiqFinal = await read(POOL, POOL_ABI, "liquidity") as bigint;

  console.log(`\n── Final balances ───────────────────────────────────────────────`);
  console.log(`  ETH:        ${formatEther(ethFinal)}  (Δ ${formatEther(ethFinal - ethBefore)})`);
  console.log(`  USDC:       ${formatUnits(usdcFinal, 6)}  (Δ ${formatUnits(usdcFinal - usdcBefore, 6)})`);
  console.log(`  WETH:       ${formatEther(wethFinal)}  (Δ ${formatEther(wethFinal - wethBefore)})`);
  console.log(`  Pool liq:   ${poolLiqFinal}  (Δ +${poolLiqFinal - poolLiqBefore})`);

  console.log(`\n── Summary ──────────────────────────────────────────────────────`);
  console.log(`✓ Liquidity added to pool`);
  console.log(`✓ Swap executed: ${formatUnits(SWAP_USDC, 6)} USDC → ${formatEther(wethReceived)} WETH`);
  console.log(`\nKey addresses (Base Sepolia):`);
  console.log(`  Pool (USDC/WETH 0.3%): ${POOL}`);
  console.log(`  NPM:                   ${NPM}`);
  console.log(`  Factory:               0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24`);
  console.log(`  Router (SwapRouter02): ${ROUTER}`);

  console.log(`\nExplorer:`);
  console.log(`  Mint:  https://sepolia.basescan.org/tx/${mintTx}`);
  console.log(`  Swap:  https://sepolia.basescan.org/tx/${swapTx}`);
  console.log(`  Pool:  https://sepolia.basescan.org/address/${POOL}`);
}

main().catch(err => {
  console.error("\n✗ Error:", err?.shortMessage ?? err?.message ?? err);
  process.exit(1);
});
