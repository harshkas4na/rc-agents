// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Harsh Kasana
pragma solidity ^0.8.20;

import "../../../lib/openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import "../../../lib/openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";
import "../../../lib/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "../../../lib/v3-core/contracts/interfaces/callback/IUniswapV3MintCallback.sol";

/**
 * @title LiquidityHelper
 * @notice One-shot deployer tool for seeding initial liquidity into a
 *         Uniswap V3 Core pool, without pulling in the official
 *         NonfungiblePositionManager (v3-periphery) and its NFT-rendering
 *         dependencies that this project has no use for. Only the deployer
 *         needs this — DCAStrategyCallbackGoat never touches it.
 */
contract LiquidityHelper is IUniswapV3MintCallback {
    using SafeERC20 for IERC20;

    address public immutable owner;

    error NotOwner();

    constructor() {
        owner = msg.sender;
    }

    /// @param pool The Uniswap V3 Core pool to seed
    /// @param tickLower / tickUpper Position range (use full-range ticks for a demo pool)
    /// @param amount Liquidity amount (see UniswapV3Pool for units — not a token amount)
    function seedLiquidity(
        address pool,
        int24 tickLower,
        int24 tickUpper,
        uint128 amount
    ) external returns (uint256 amount0, uint256 amount1) {
        if (msg.sender != owner) revert NotOwner();
        (amount0, amount1) = IUniswapV3Pool(pool).mint(
            owner,
            tickLower,
            tickUpper,
            amount,
            abi.encode(pool)
        );
    }

    function uniswapV3MintCallback(
        uint256 amount0Owed,
        uint256 amount1Owed,
        bytes calldata data
    ) external override {
        address pool = abi.decode(data, (address));
        require(msg.sender == pool, "Unauthorized callback");

        address token0 = IUniswapV3Pool(pool).token0();
        address token1 = IUniswapV3Pool(pool).token1();

        if (amount0Owed > 0) IERC20(token0).safeTransferFrom(owner, msg.sender, amount0Owed);
        if (amount1Owed > 0) IERC20(token1).safeTransferFrom(owner, msg.sender, amount1Owed);
    }
}
