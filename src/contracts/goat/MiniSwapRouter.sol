// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Harsh Kasana
pragma solidity ^0.8.20;

import "../../../lib/openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import "../../../lib/openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";
import "../../../lib/v3-core/contracts/interfaces/IUniswapV3Factory.sol";
import "../../../lib/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "../../../lib/v3-core/contracts/interfaces/callback/IUniswapV3SwapCallback.sol";

/**
 * @title MiniSwapRouter
 * @notice A minimal `exactInputSingle` router against unmodified Uniswap V3
 *         Core pools (lib/v3-core, audited, deployed as-is — the AMM math
 *         this router leans on is real Uniswap V3, not reimplemented here).
 * @dev Exists because Uniswap's own official SwapRouter lives in the
 *      v3-periphery repo, which pulls in NFT-descriptor/Base64 tooling this
 *      project has no use for (DCAStrategyCallback only ever calls
 *      `exactInputSingle`, never touches LP-position NFTs). This contract
 *      implements exactly that one call plus the swap callback Uniswap V3
 *      Core requires of any caller — same interface shape as the official
 *      router, none of the unused surface area.
 *
 *      Matches the `ISwapRouter.exactInputSingle` interface that
 *      DCAStrategyCallback(Goat).sol already calls, so no changes are
 *      needed on that side to point it at a GOAT-native pool.
 */
contract MiniSwapRouter is IUniswapV3SwapCallback {
    using SafeERC20 for IERC20;

    IUniswapV3Factory public immutable factory;

    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    // Set for the duration of a swap so the callback knows which token/payer to charge.
    struct SwapCallbackData {
        address tokenIn;
        address payer;
    }

    error PoolNotFound();
    error InsufficientOutput(uint256 amountOut, uint256 amountOutMinimum);
    error UnauthorizedCallback();

    // Uniswap V3 Core's TickMath.MIN_SQRT_RATIO / MAX_SQRT_RATIO, offset by 1 —
    // same "no explicit limit" convention the official SwapRouter uses. Inlined
    // as constants (not imported from TickMath.sol) because that library is
    // pinned to solc <0.8.0 and this contract is 0.8.20; the values are
    // immutable protocol constants, not something that can drift.
    uint160 private constant MIN_SQRT_RATIO_PLUS_ONE = 4295128740;
    uint160 private constant MAX_SQRT_RATIO_MINUS_ONE = 1461446703485210103287273052203988822378723970341;

    constructor(address _factory) {
        factory = IUniswapV3Factory(_factory);
    }

    function exactInputSingle(
        ExactInputSingleParams calldata params
    ) external returns (uint256 amountOut) {
        address poolAddr = factory.getPool(params.tokenIn, params.tokenOut, params.fee);
        if (poolAddr == address(0)) revert PoolNotFound();
        IUniswapV3Pool pool = IUniswapV3Pool(poolAddr);

        bool zeroForOne = params.tokenIn < params.tokenOut;

        (int256 amount0, int256 amount1) = pool.swap(
            params.recipient,
            zeroForOne,
            int256(params.amountIn),
            params.sqrtPriceLimitX96 == 0
                ? (zeroForOne ? MIN_SQRT_RATIO_PLUS_ONE : MAX_SQRT_RATIO_MINUS_ONE)
                : params.sqrtPriceLimitX96,
            abi.encode(SwapCallbackData({tokenIn: params.tokenIn, payer: msg.sender}))
        );

        amountOut = uint256(-(zeroForOne ? amount1 : amount0));
        if (amountOut < params.amountOutMinimum) {
            revert InsufficientOutput(amountOut, params.amountOutMinimum);
        }
    }

    function uniswapV3SwapCallback(
        int256 amount0Delta,
        int256 amount1Delta,
        bytes calldata data
    ) external override {
        SwapCallbackData memory cbData = abi.decode(data, (SwapCallbackData));

        // Only a genuine pool the canonical factory deployed may call back —
        // this is the check that makes trusting msg.sender in the callback safe.
        (address token0, address token1, uint24 fee) = _poolTokensAndFee(msg.sender, cbData.tokenIn);
        if (factory.getPool(token0, token1, fee) != msg.sender) revert UnauthorizedCallback();

        uint256 amountOwed = amount0Delta > 0 ? uint256(amount0Delta) : uint256(amount1Delta);
        IERC20(cbData.tokenIn).safeTransferFrom(cbData.payer, msg.sender, amountOwed);
    }

    function _poolTokensAndFee(
        address pool,
        address tokenInHint
    ) private view returns (address token0, address token1, uint24 fee) {
        IUniswapV3Pool p = IUniswapV3Pool(pool);
        token0 = p.token0();
        token1 = p.token1();
        fee = p.fee();
        // tokenInHint is unused beyond documenting intent; token0/token1/fee come
        // straight from the contract that called back, then get re-derived
        // through the canonical factory below to verify authenticity.
        tokenInHint;
    }
}
